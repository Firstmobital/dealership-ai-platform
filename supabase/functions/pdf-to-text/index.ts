// supabase/functions/pdf-to-text/index.ts
// FINAL — P0 SAFE: ORG + STORAGE PATH DERIVED FROM DB (article_id is source of truth)
//        EDGE SAFE: DIGITAL TEXT FIRST + OCR FALLBACK (same file, different instruction)
//        BACKWARD COMPAT: if bucket/path/organization_id provided, they must match DB
//
// Expected request body (recommended):
//   { "article_id": "uuid" }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { logAuditEvent } from "../_shared/audit.ts";
import {
  getRequestId,
  isInternalRequest,
  requireOrgMembership,
  requireUser,
} from "../_shared/auth.ts";

/* --------------------------------------------------
   CORS
-------------------------------------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-api-key",
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
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") ?? "";

if (!OPENAI_API_KEY || !PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[pdf-to-text] Missing env: OPENAI_API_KEY / PROJECT_URL / SERVICE_ROLE_KEY");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getFunctionUrl(fnName: string) {
  const base = PROJECT_URL.replace(/\/$/, "");
  return `${base}/functions/v1/${fnName}`;
}

async function invokeInternal(fnName: string, body: Record<string, unknown>) {
  if (!INTERNAL_API_KEY) {
    throw new Error("INTERNAL_API_KEY not set");
  }

  const url = getFunctionUrl(fnName);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data: parsed };
}

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

function bytesToFile(bytes: Uint8Array, filename: string, mime: string) {
  return new File([bytes], filename, { type: mime });
}

async function safeMarkProcessing(
  articleId: string,
  organizationId: string,
  patch: Record<string, unknown>,
) {
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

    // Load article FIRST (authoritative org_id + storage path)
    const { data: article, error: articleErr } = await supabaseAdmin
      .from("knowledge_articles")
      .select("id, organization_id, title, status, source_type, file_bucket, file_path, file_mime_type")
      .eq("id", article_id)
      .maybeSingle();

    if (articleErr) throw new Error(`Failed to load knowledge_article: ${articleErr.message}`);
    if (!article) return json(404, { error: "knowledge_article not found", request_id });

    const a = article as KnowledgeArticleRow;
    organization_id = a.organization_id;
    bucket = a.file_bucket;
    path = a.file_path;

    if (!organization_id) throw new Error("knowledge_article.organization_id is missing");
    if (!bucket || !path) {
      throw new Error("knowledge_article.file_bucket / file_path missing (cannot extract PDF)");
    }

    // AUTHZ:
    // - normal user request: require user + org membership
    // - internal worker request: bypass user auth (isInternalRequest handles internal key gating)
    if (!isInternalRequest(req as Request)) {
      const user = await requireUser(req as Request);
      await requireOrgMembership({
        supabaseAdmin,
        userId: user.id,
        organizationId: organization_id,
      });
    }

    // Backward-compat validation: if request passed org/bucket/path, they MUST match DB.
    if (req_org_id && req_org_id !== organization_id) {
      return json(403, {
        error: "organization_id mismatch (request body does not match article org)",
        request_id,
      });
    }
    if (req_bucket && req_bucket !== bucket) {
      return json(400, { error: "bucket mismatch (request body does not match article bucket)", request_id });
    }
    if (req_path && req_path !== path) {
      return json(400, { error: "path mismatch (request body does not match article path)", request_id });
    }

    // Mark processing started
    await safeMarkProcessing(article_id, organization_id, {
      processing_status: "processing",
      processing_error: null,
      last_processed_at: new Date().toISOString(),
    });

    // audit: started (awaited)
    try {
      await logAuditEvent(supabaseAdmin, {
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
    } catch (e) {
      console.warn("[pdf-to-text] audit failed: kb_extract_started", String(e));
    }

    // Download PDF
    const { data: fileData, error: dlErr } = await supabaseAdmin.storage
      .from(bucket)
      .download(path);

    if (dlErr || !fileData) {
      throw new Error(`Failed to download PDF from storage: ${dlErr?.message ?? "unknown"}`);
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());

    const MAX_BYTES = 20 * 1024 * 1024; // 20MB
    if (pdfBytes.byteLength === 0) throw new Error("Downloaded file is empty");
    if (pdfBytes.byteLength > MAX_BYTES) {
      throw new Error(`PDF too large (${pdfBytes.byteLength} bytes). Max allowed: ${MAX_BYTES} bytes.`);
    }

    const pdfFile = bytesToFile(
      pdfBytes,
      "source.pdf",
      a.file_mime_type ?? "application/pdf",
    );

    // 1) digital text extraction
    const extractResp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file: pdfFile },
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

    // 2) OCR fallback
    if (text.length < 200) {
      used_ocr = true;

      const ocrResp = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file: pdfFile },
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

    if (!text) throw new Error("No text could be extracted from this PDF");

    // Save extracted text
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

    if (updateErr) throw new Error(`Failed to update article content: ${updateErr.message}`);

    // P0: Embed immediately AFTER extraction completes.
    // This avoids frontend race-conditions and removes reliance on an external cron.
    try {
      const res = await invokeInternal("embed-article", { article_id });
      if (!res.ok) {
        console.warn(
          "[pdf-to-text] embed-article internal invoke failed",
          res.status,
          JSON.stringify(res.data).slice(0, 500),
        );
      }
    } catch (e) {
      console.warn("[pdf-to-text] embed-article internal invoke error", String(e));
    }

    // enqueue embed job (best-effort fallback)
    try {
      await supabaseAdmin.from("background_jobs").insert({
        organization_id,
        job_type: "embed_article",
        payload: { article_id },
        status: "queued",
        run_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[pdf-to-text] failed to enqueue embed_article job", String(e));
    }

    // audit: completed (awaited)
    try {
      await logAuditEvent(supabaseAdmin, {
        organization_id,
        action: "kb_extract_completed",
        entity_type: "knowledge_article",
        entity_id: article_id,
        metadata: { request_id, extracted_chars: text.length, used_ocr },
      });
    } catch (e) {
      console.warn("[pdf-to-text] audit failed: kb_extract_completed", String(e));
    }

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

    if (organization_id && article_id) {
      await safeMarkProcessing(article_id, organization_id, {
        processing_status: "error",
        processing_error: msg,
        last_processed_at: new Date().toISOString(),
      });
    }

    try {
      await logAuditEvent(supabaseAdmin, {
        organization_id: organization_id ?? "unknown",
        action: "kb_extract_failed",
        entity_type: "knowledge_article",
        entity_id: article_id ?? "unknown",
        metadata: { request_id, error: msg },
      });
    } catch {
      // ignore
    }

    console.error("[pdf-to-text] fatal", msg);

    return json(500, {
      error: "PDF extraction failed",
      details: msg,
      request_id,
    });
  }
});
