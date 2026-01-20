// supabase/functions/pdf-to-text/index.ts
// FINAL — P0 SAFE: ORG + STORAGE PATH DERIVED FROM DB (article_id is source of truth)
//        EDGE SAFE: DIGITAL TEXT FIRST + OCR FALLBACK (same file, different instruction)
//        BACKWARD COMPAT: if bucket/path/organization_id provided, they must match DB
//
// Expected request body (recommended):
//   { "article_id": "uuid" }
//
// Optional (legacy, validated against DB):
//   { "organization_id": "uuid", "bucket": "kb", "path": "orgs/.../file.pdf" }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { logAuditEvent } from "../_shared/audit.ts";
import { getRequestId, requireOrgMembership, requireUser } from "../_shared/auth.ts";

/* --------------------------------------------------
   CORS
-------------------------------------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* --------------------------------------------------
   ENV
-------------------------------------------------- */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

if (!OPENAI_API_KEY || !PROJECT_URL || !SERVICE_ROLE_KEY) {
  // Fail fast on deploy misconfig, but still return JSON in handler too.
  console.error(
    "[pdf-to-text] Missing env: OPENAI_API_KEY / PROJECT_URL / SERVICE_ROLE_KEY",
  );
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* --------------------------------------------------
   TYPES
-------------------------------------------------- */
type ReqBody = {
  article_id?: string;
  // legacy / optional (validated against DB)
  organization_id?: string;
  bucket?: string;
  path?: string;
};

type KnowledgeArticleRow = {
  id: string;
  organization_id: string;
  title: string | null;
  status: string | null;
  source_type: string | null;
  file_bucket: string | null;
  file_path: string | null;
  file_mime_type: string | null;
};

/* --------------------------------------------------
   HELPERS
-------------------------------------------------- */
function normalizeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

async function safeMarkProcessing(
  articleId: string,
  organizationId: string,
  patch: Record<string, unknown>,
) {
  // Best-effort; never throw from this helper.
  try {
    await supabaseAdmin
      .from("knowledge_articles")
      .update(patch)
      .eq("id", articleId)
      .eq("organization_id", organizationId);
  } catch {
    // ignore
  }
}

/* --------------------------------------------------
   HANDLER
-------------------------------------------------- */
serve(async (req) => {
  const request_id = getRequestId(req as Request);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed", request_id });
  }

  let body: ReqBody = {};
  let article_id: string | null = null;

  // legacy inputs (validated)
  let req_bucket: string | null = null;
  let req_path: string | null = null;
  let req_org_id: string | null = null;

  // derived authoritative values (DB truth)
  let organization_id: string | null = null;
  let bucket: string | null = null;
  let path: string | null = null;

  // used for audit
  let used_ocr = false;

  try {
    // Parse JSON safely
    try {
      body = (await req.json()) as ReqBody;
    } catch {
      return json(400, { error: "Invalid JSON body", request_id });
    }

    article_id = normalizeStr(body.article_id);

    req_org_id = normalizeStr(body.organization_id);
    req_bucket = normalizeStr(body.bucket);
    req_path = normalizeStr(body.path);

    if (!article_id) {
      return json(400, { error: "article_id is required", request_id });
    }

    /* --------------------------------------------------
       PHASE 0 / P0: AUTH + ORG DERIVATION FROM DB (NOT REQUEST BODY)
    -------------------------------------------------- */
    const user = await requireUser(req as Request);

    // Load article FIRST (authoritative org_id + storage path)
    const { data: article, error: articleErr } = await supabaseAdmin
      .from("knowledge_articles")
      .select(
        "id, organization_id, title, status, source_type, file_bucket, file_path, file_mime_type",
      )
      .eq("id", article_id)
      .maybeSingle();

    if (articleErr) {
      throw new Error(`Failed to load knowledge_article: ${articleErr.message}`);
    }
    if (!article) {
      return json(404, { error: "knowledge_article not found", request_id });
    }

    const a = article as KnowledgeArticleRow;
    organization_id = a.organization_id;
    bucket = a.file_bucket;
    path = a.file_path;

    if (!organization_id) {
      throw new Error("knowledge_article.organization_id is missing");
    }
    if (!bucket || !path) {
      throw new Error(
        "knowledge_article.file_bucket / file_path missing (cannot extract PDF)",
      );
    }

    // Validate membership against the derived org_id (tenant boundary)
    await requireOrgMembership({
      supabaseAdmin,
      userId: user.id,
      organizationId: organization_id,
    });

    // Backward-compat validation: if request passed org/bucket/path, they MUST match DB.
    if (req_org_id && req_org_id !== organization_id) {
      return json(403, {
        error:
          "organization_id mismatch (request body does not match article org)",
        request_id,
      });
    }
    if (req_bucket && req_bucket !== bucket) {
      return json(400, {
        error: "bucket mismatch (request body does not match article bucket)",
        request_id,
      });
    }
    if (req_path && req_path !== path) {
      return json(400, {
        error: "path mismatch (request body does not match article path)",
        request_id,
      });
    }

    /* --------------------------------------------------
       MARK PROCESSING STARTED (BEST PRACTICE)
    -------------------------------------------------- */
    await safeMarkProcessing(article_id, organization_id, {
      processing_status: "processing",
      processing_error: null,
      last_processed_at: new Date().toISOString(),
    });

    logAuditEvent(supabaseAdmin, {
      organization_id,
      action: "kb_extract_started",
      entity_type: "knowledge_article",
      entity_id: article_id,
      metadata: {
        request_id,
        bucket,
        path,
        mime_type: a.file_mime_type ?? "application/pdf",
      },
    });

    /* --------------------------------------------------
       1) Download PDF from Supabase Storage (SERVICE ROLE)
       - But tenant safety is enforced by article-derived org + membership above.
    -------------------------------------------------- */
    const { data: fileData, error: dlErr } = await supabaseAdmin.storage
      .from(bucket)
      .download(path);

    if (dlErr || !fileData) {
      throw new Error(
        `Failed to download PDF from storage: ${dlErr?.message ?? "unknown"}`,
      );
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());

    // Basic sanity: avoid accidental huge files blowing memory / costs (tune as needed)
    const MAX_BYTES = 20 * 1024 * 1024; // 20MB
    if (pdfBytes.byteLength === 0) {
      throw new Error("Downloaded file is empty");
    }
    if (pdfBytes.byteLength > MAX_BYTES) {
      throw new Error(
        `PDF too large (${pdfBytes.byteLength} bytes). Max allowed: ${MAX_BYTES} bytes.`,
      );
    }

    /* --------------------------------------------------
       2) Upload PDF to OpenAI Files (used by Responses input_file)
    -------------------------------------------------- */
    const uploadedFile = await openai.files.create({
      file: new Blob([pdfBytes], { type: "application/pdf" }),
      purpose: "assistants",
    });

    /* --------------------------------------------------
       3) DIGITAL TEXT EXTRACTION (fast path)
    -------------------------------------------------- */
    const extractResp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: uploadedFile.id },
            {
              type: "input_text",
              text:
                "Extract all readable text from this PDF. Preserve headings and tables. " +
                "Return plain text only (no markdown fences). If a table exists, keep rows/columns readable.",
            },
          ],
        },
      ],
    });

    let text = extractResp.output_text?.trim() ?? "";

    /* --------------------------------------------------
       4) OCR FALLBACK (scanned PDFs)
       - Important: still pass the same file_id, just a different instruction.
    -------------------------------------------------- */
    if (text.length < 200) {
      used_ocr = true;

      const ocrResp = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: uploadedFile.id },
              {
                type: "input_text",
                text:
                  "The PDF contains little or no extractable digital text. " +
                  "Assume it is scanned images. Perform OCR and extract all readable text from all pages. " +
                  "Preserve headings and tables as best as possible. Return plain text only.",
              },
            ],
          },
        ],
      });

      text = ocrResp.output_text?.trim() ?? "";
    }

    if (!text) {
      throw new Error("No text could be extracted from this PDF");
    }

    /* --------------------------------------------------
       5) Save extracted text to knowledge_articles
    -------------------------------------------------- */
    const { error: updateErr } = await supabaseAdmin
      .from("knowledge_articles")
      .update({
        content: text,
        source_type: a.source_type ?? "file",
        processing_status: "completed",
        processing_error: null,
        last_processed_at: new Date().toISOString(),
      })
      .eq("id", article_id)
      .eq("organization_id", organization_id);

    if (updateErr) {
      throw new Error(`Failed to update article content: ${updateErr.message}`);
    }

    logAuditEvent(supabaseAdmin, {
      organization_id,
      action: "kb_extract_completed",
      entity_type: "knowledge_article",
      entity_id: article_id,
      metadata: {
        request_id,
        extracted_chars: text.length,
        used_ocr,
      },
    });

    return json(200, {
      success: true,
      article_id,
      organization_id,
      extracted_chars: text.length,
      used_ocr,
      request_id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Persist processing failure (best-effort)
    if (organization_id && article_id) {
      await safeMarkProcessing(article_id, organization_id, {
        processing_status: "error",
        processing_error: msg,
        last_processed_at: new Date().toISOString(),
      });
    }

    try {
      logAuditEvent(supabaseAdmin, {
        organization_id: organization_id ?? "unknown",
        action: "kb_extract_failed",
        entity_type: "knowledge_article",
        entity_id: article_id ?? "unknown",
        metadata: { request_id, error: msg },
      });
    } catch {
      // ignore audit failures
    }

    console.error("[pdf-to-text] fatal", msg);

    return json(500, {
      error: "PDF extraction failed",
      details: msg,
      request_id,
    });
  }
});
