// supabase/functions/ai-generate-kb/index.ts

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

import { logAuditEvent } from "../_shared/audit.ts";
/* =====================================================================================
   ENV
===================================================================================== */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[ai-generate-kb] Missing required environment variables", {
    hasProjectUrl: !!PROJECT_URL,
    hasServiceRoleKey: !!SERVICE_ROLE_KEY,
  });
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* =====================================================================================
   CORS
===================================================================================== */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cors = (res: Response) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
};

/* =====================================================================================
   LOGGING
===================================================================================== */
function createLogger(request_id: string, org_id?: string | null) {
  return {
    info(msg: string, extra: any = {}) {
      console.log(JSON.stringify({ level: "info", request_id, org_id, msg, ...extra }));
    },
    warn(msg: string, extra: any = {}) {
      console.warn(JSON.stringify({ level: "warn", request_id, org_id, msg, ...extra }));
    },
    error(msg: string, extra: any = {}) {
      console.error(JSON.stringify({ level: "error", request_id, org_id, msg, ...extra }));
    },
    debug(msg: string, extra: any = {}) {
      console.log(JSON.stringify({ level: "debug", request_id, org_id, msg, ...extra }));
    },
  };
}

/* =====================================================================================
   PHASE 6 — KEYWORDS (STRICT KB MATCHING SUPPORT)
===================================================================================== */
function normalizeKeywords(input: any): string[] {
  // Accept either an array (preferred) or a comma-separated string
  const arr: any[] = Array.isArray(input)
    ? input
    : typeof input === "string"
    ? input.split(",")
    : [];

  return arr
    .map((k) => String(k ?? "").trim())
    .filter((k) => k.length >= 2)
    .slice(0, 50);
}

/* =====================================================================================
   SAFE HELPERS
===================================================================================== */
async function safeSupabase<T>(
  logger: ReturnType<typeof createLogger>,
  label: string,
  fn: () => Promise<{ data: T | null; error: any }>
): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      logger.error(`[supabase] ${label} error`, { error });
      return null;
    }
    return data;
  } catch (err) {
    logger.error(`[supabase] ${label} fatal`, { error: String(err) });
    return null;
  }
}

async function safeFileDownload(
  logger: ReturnType<typeof createLogger>,
  bucket: string,
  path: string
): Promise<Blob | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) {
      logger.error("FILE_DOWNLOAD_ERROR", { bucket, path, error });
      return null;
    }
    return data as Blob;
  } catch (err) {
    logger.error("FILE_DOWNLOAD_FATAL", { error: String(err) });
    return null;
  }
}

async function setProcessingError(
  logger: ReturnType<typeof createLogger>,
  article_id: string | null,
  message: string
) {
  if (!article_id) return;
  try {
    await supabase
      .from("knowledge_articles")
      .update({
        processing_status: "error",
        processing_error: message,
        last_processed_at: new Date().toISOString(),
      })
      .eq("id", article_id);
  } catch (err) {
    logger.error("FAILED_TO_SET_PROCESSING_ERROR", { error: String(err) });
  }
}

/* =====================================================================================
   TEXT CHUNKING
===================================================================================== */
function chunkText(text: string, maxChars = 1200, maxChunks = 200): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  // Prefer paragraph-ish chunking first
  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;

    const candidate = current ? `${current}\n\n${p}` : p;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    current = "";

    // If paragraph itself is too big, hard-split
    if (p.length > maxChars) {
      for (let i = 0; i < p.length; i += maxChars) {
        chunks.push(p.slice(i, i + maxChars));
        if (chunks.length >= maxChunks) break;
      }
    } else {
      current = p;
    }

    if (chunks.length >= maxChunks) break;
  }

  if (current && chunks.length < maxChunks) chunks.push(current);

  return chunks;
}

/* =====================================================================================
   FILE → TEXT EXTRACTION
===================================================================================== */
function isExcelMime(mimeType: string) {
  const m = (mimeType || "").toLowerCase();
  return (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m.includes("application/vnd.ms-excel") ||
    m.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  );
}

function extractExcelText(logger: ReturnType<typeof createLogger>, uint8: Uint8Array): string {
  try {
    const wb = XLSX.read(uint8, { type: "array" });
    let out = "";

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, any>>;

      out += `\n\nSheet: ${sheetName}\n`;
      rows.forEach((row, idx) => {
        const line = Object.entries(row)
          .map(([k, v]) => `${k}: ${String(v).trim()}`)
          .filter((s) => s !== ":")
          .join(", ");
        if (line.trim()) out += `Row ${idx + 1}: ${line}\n`;
      });
    }

    return out.trim();
  } catch (err) {
    logger.error("EXCEL_PARSE_ERROR", { error: String(err) });
    return "";
  }
}/* =====================================================================================
   PHASE 6B — EXCEL PRICING SHEET → MODEL-WISE KB ARTICLES
   Goal:
   - Prevent gigantic single-article Excel dumps
   - Create one published/draft KB article per Model
   - Add scheme-aware keywords (consumer / intervention / exchange / corporate)
===================================================================================== */

function slugifyModel(model: string): string {
  return (model || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function pickModelColumn(rows: Array<Record<string, any>>): string | null {
  if (!rows?.length) return null;
  const sample = rows[0];
  const keys = Object.keys(sample || {});
  const lower = keys.map((k) => ({ k, n: String(k).toLowerCase().trim() }));

  // Prefer exact "model"
  const exact = lower.find((x) => x.n === "model");
  if (exact) return exact.k;

  // Fallback: any column containing "model"
  const partial = lower.find((x) => x.n.includes("model"));
  return partial?.k ?? null;
}

function rupee(n: any): string {
  const num = Number(n);
  if (!isFinite(num)) return "—";
  // Keep it readable; no locale dependencies in edge runtime.
  return `₹${Math.round(num).toString()}`;
}

function buildModelPricingContent(params: {
  model: string;
  rows: Array<Record<string, any>>;
  sourceFilename: string | null;
}): string {
  const { model, rows, sourceFilename } = params;

  // Detect key columns (best-effort)
  const cols = rows?.length ? Object.keys(rows[0]) : [];
  const col = (name: string) =>
    cols.find((c) => String(c).toLowerCase().trim() === name.toLowerCase().trim()) ?? null;

  const variantCol = col("Variant") ?? col("variant") ?? null;
  const fuelCol = col("Fuel") ?? col("fuel") ?? null;

  const exShowroomCol =
    cols.find((c) => String(c).toLowerCase().includes("ex-showroom")) ??
    cols.find((c) => String(c).toLowerCase().includes("ex showroom")) ??
    null;

  // Scheme-related columns (consumer / intervention etc.)
  const schemeCols = cols.filter((c) => {
    const n = String(c).toLowerCase();
    return (
      n.includes("consumer") ||
      n.includes("intervention") ||
      n.includes("exchange") ||
      n.includes("scrap") ||
      n.includes("corporate") ||
      n.includes("msme") ||
      n.includes("green") ||
      n.includes("solar") ||
      n.includes("loyalty") ||
      n.includes("bonus")
    );
  });

  const lines: string[] = [];

  lines.push(`# ${model} — Pricing, Offers & Schemes`);
  if (sourceFilename) lines.push(`_Source: ${sourceFilename}_`);
  lines.push("");
  lines.push("## How to read offers / discounts");
  lines.push("- **Consumer / Exchange / Corporate / Intervention** columns represent active schemes (amounts in ₹).");
  lines.push("- Final discount depends on eligibility, stock, and dealership approval.");
  lines.push("- If customer asks for **discount / offers / schemes**, use the scheme fields below.");
  lines.push("");

  if (schemeCols.length) {
    lines.push("## Scheme fields available in this sheet");
    for (const c of schemeCols) lines.push(`- ${c}`);
    lines.push("");
  }

  lines.push("## Variant-wise lines (use these for exact price / offer replies)");
  const maxRows = Math.min(rows.length, 400);

  for (let i = 0; i < maxRows; i++) {
    const r = rows[i] ?? {};
    const variant = variantCol ? String(r[variantCol] ?? "").trim() : "";
    const fuel = fuelCol ? String(r[fuelCol] ?? "").trim() : "";
    const exShowroom = exShowroomCol ? rupee(r[exShowroomCol]) : "—";

    const parts: string[] = [];
    if (variant) parts.push(variant);
    else parts.push(`Row ${i + 1}`);

    if (fuel) parts.push(`Fuel: ${fuel}`);
    if (exShowroomCol) parts.push(`Ex-Showroom: ${exShowroom}`);

    // Key schemes first (best effort)
    const keyOrder = ["consumer", "exchange", "scrap", "corporate", "intervention", "msme", "green", "solar"];
    const schemeParts: string[] = [];

    for (const key of keyOrder) {
      const match = schemeCols.find((c) => String(c).toLowerCase().includes(key));
      if (match) schemeParts.push(`${match}: ${rupee(r[match])}`);
    }

    // add remaining scheme cols not already added
    for (const c of schemeCols) {
      if (schemeParts.some((p) => p.toLowerCase().startsWith(String(c).toLowerCase() + ":"))) continue;
      if (keyOrder.some((k) => String(c).toLowerCase().includes(k))) continue;
      const v = r[c];
      if (v === "" || v === null || v === undefined) continue;
      schemeParts.push(`${c}: ${rupee(v)}`);
    }

    const line =
      schemeParts.length > 0
        ? `- ${parts.join(" | ")} | ${schemeParts.join(" | ")}`
        : `- ${parts.join(" | ")}`;

    lines.push(line);
  }

  if (rows.length > maxRows) {
    lines.push("");
    lines.push(`_Note: Only the first ${maxRows} rows are included for performance._`);
  }

  return lines.join("\n");
}

function buildModelKeywords(model: string, base: string[]): string[] {
  const m = slugifyModel(model);
  const out = new Set<string>();
  for (const k of base || []) out.add(String(k));
  if (model) out.add(model);
  if (m) out.add(m);

  // Intent tags (so discount/offers queries can resolve deterministically)
  [
    "pricing",
    "price",
    "offers",
    "offer",
    "scheme",
    "schemes",
    "discount",
    "consumer",
    "intervention",
    "exchange",
    "scrap",
    "corporate",
    "msme",
    "loyalty",
    "bonus",
  ].forEach((k) => out.add(k));

  return Array.from(out)
    .map((k) => String(k).trim())
    .filter((k) => k.length >= 2)
    .slice(0, 50);
}

function splitExcelRowsByModel(
  logger: ReturnType<typeof createLogger>,
  rows: Array<Record<string, any>>
): Array<{ model: string; rows: Array<Record<string, any>> }> {
  const modelCol = pickModelColumn(rows);
  if (!modelCol) {
    logger.warn("EXCEL_SPLIT_NO_MODEL_COLUMN");
    return [{ model: "Unknown Model", rows }];
  }

  const map = new Map<string, Array<Record<string, any>>>();

  for (const r of rows) {
    const modelRaw = String(r?.[modelCol] ?? "").trim();
    const model = modelRaw || "Unknown Model";
    if (!map.has(model)) map.set(model, []);
    map.get(model)!.push(r);
  }

  return Array.from(map.entries())
    .map(([model, rs]) => ({ model, rows: rs }))
    .sort((a, b) => a.model.localeCompare(b.model));
}



// Robustly get text from OpenAI Responses output
function getResponseText(resp: any): string {
  if (resp?.output_text && typeof resp.output_text === "string") {
    return resp.output_text;
  }

  // Fallback: walk output blocks
  let extracted = "";
  const output = resp?.output ?? [];
  for (const item of output) {
    const content = item?.content ?? [];
    for (const c of content) {
      if (c?.type === "output_text") {
        // different SDK shapes exist; support both
        if (typeof c?.text === "string") extracted += c.text;
        else if (typeof c?.text?.value === "string") extracted += c.text.value;
      }
    }
  }
  return extracted;
}

async function extractTextWithOpenAI(
  logger: ReturnType<typeof createLogger>,
  blob: Blob,
  mimeType: string,
  filename: string
): Promise<string | null> {
  if (!openai) {
    logger.error("OPENAI_REQUIRED_FOR_FILE_EXTRACTION");
    return null;
  }

  const sizeMB = (blob.size ?? 0) / (1024 * 1024);
  if (sizeMB > 20) {
    logger.warn("FILE_TOO_LARGE", { sizeMB });
    return null;
  }

  const uint8 = new Uint8Array(await blob.arrayBuffer());

  try {
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract readable text only from this document. " +
                "Preserve tables as readable lines (row-wise). " +
                "No commentary, no headings added by you. " +
                "Return up to 20000 characters.",
            },
            // Use direct bytes (more reliable than file upload flows)
            { type: "input_file", file: uint8, filename, mime_type: mimeType },
          ],
        },
      ],
    });

    const text = getResponseText(resp).trim().slice(0, 20000);
    return text || null;
  } catch (err) {
    logger.error("OPENAI_EXTRACTION_ERROR", { error: String(err) });
    return null;
  }
}

async function extractTextFromFile(
  logger: ReturnType<typeof createLogger>,
  bucket: string,
  path: string,
  mime: string | null
): Promise<{ text: string | null; mimeType: string; excelRows?: Array<Record<string, any>> | null }> {
  const blob = await safeFileDownload(logger, bucket, path);
  if (!blob) return { text: null, mimeType: mime || "application/octet-stream" };

  const mimeType = mime || (blob as any).type || "application/octet-stream";

  // Plain text (includes CSV)
  if (mimeType.startsWith("text/")) {
    const t = await blob.text();
    return { text: t?.trim() || null, mimeType };
  }

  const filename = path.split("/").pop() || "document";

  // ✅ Excel: parse locally (NO OpenAI) → return structured rows for smart splitting
  if (isExcelMime(mimeType)) {
    try {
      const uint8 = new Uint8Array(await blob.arrayBuffer());
      const wb = XLSX.read(uint8, { type: "array" });

      // Prefer first sheet; if multiple sheets exist, we still only import the first
      // because pricing sheets are typically normalized there.
      const first = wb.SheetNames?.[0];
      if (!first) return { text: null, mimeType, excelRows: [] };

      const sheet = wb.Sheets[first];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, any>>;

      return {
        text: null, // we will build model-wise articles instead of one giant text blob
        mimeType,
        excelRows: rows.slice(0, 5000),
      };
    } catch (err) {
      logger.error("EXCEL_PARSE_ERROR", { error: String(err) });
      // Fallback to previous behavior (best effort)
      const uint8 = new Uint8Array(await blob.arrayBuffer());
      const parsed = extractExcelText(logger, uint8);
      return { text: parsed || null, mimeType };
    }
  }

  // ✅ PDFs / other binaries: OpenAI extraction
  const extracted = await extractTextWithOpenAI(logger, blob, mimeType, filename);
  return { text: extracted, mimeType };
}

/* =====================================================================================
   EMBEDDINGS
===================================================================================== */
async function embedChunks(
  logger: ReturnType<typeof createLogger>,
  chunks: string[]
): Promise<number[][] | null> {
  if (!openai) {
    logger.error("OPENAI_MISSING_EMBEDDINGS");
    return null;
  }

  try {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks,
    });

    return resp.data.map((row: any) => row.embedding as number[]);
  } catch (err) {
    logger.error("EMBEDDING_ERROR", { error: String(err) });
    return null;
  }
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return cors(new Response("ok", { status: 200 }));

  const request_id = crypto.randomUUID();
  const logger = createLogger(request_id);

  if (req.method !== "POST") {
    return cors(
      new Response(JSON.stringify({ error: "Method not allowed", request_id }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  let articleIdForError: string | null = null;
  let orgIdForError: string | null = null;

  // Track old file in replace mode (for auto-delete)
  let oldFileBucket: string | null = null;
  let oldFilePath: string | null = null;

  try {
    const body = await req.json().catch(() => null);

    if (!body?.organization_id) {
      return cors(
        new Response(JSON.stringify({ error: "Missing organization_id", request_id }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    const orgId = String(body.organization_id).trim();
    orgIdForError = orgId;


    await logAuditEvent(supabase, {
      organization_id: orgId,
      action: "kb_generate_started",
      entity_type: "knowledge_article",
      entity_id: body.article_id ? String(body.article_id).trim() : null,
      metadata: { request_id, sourceType: body.source_type ?? "text" },
    });

    const sourceType = (body.source_type ?? "text") as string;
    const incomingTitle = body.title?.trim?.() || "Untitled article";

const incomingStatus = (body.status ?? "draft") as string;
const status =
  incomingStatus === "published" || incomingStatus === "archived"
    ? incomingStatus
    : "draft";

const published_at =
  status === "published"
    ? (body.published_at ? String(body.published_at) : new Date().toISOString())
    : null;

    // Phase 6: optional keywords array for strict keyword matching in ai-handler
    const keywords = normalizeKeywords(body.keywords);

    // Replace mode (update existing article)
    const replaceArticleId = body.article_id ? String(body.article_id).trim() : null;

    // File metadata (only for file sources)
    const file_bucket = body.file_bucket ?? null;
    const file_path = body.file_path ?? null;
    const mime_type = body.mime_type ?? null;
    const original_filename = body.original_filename ?? null;

    logger.info("Start KB generation", {
      orgId,
      sourceType,
      replace: !!replaceArticleId,
      keywords_count: keywords.length,
      status,
      published_at,
    });

    // Phase 1: mark processing started for the placeholder article (best-effort)
    if (replaceArticleId) {
      try {
        await supabase
          .from("knowledge_articles")
          .update({ processing_status: "processing", processing_error: null })
          .eq("id", replaceArticleId)
          .eq("organization_id", orgId);
      } catch (_) {
        // ignore
      }
    }


    /* ============================================
       REPLACE MODE: validate article belongs to org
    ============================================ */
    let existingTitle: string | null = null;
    if (replaceArticleId) {
      const existing = await safeSupabase<any>(
        logger,
        "knowledge_articles.select(existing)",
        () =>
          supabase
            .from("knowledge_articles")
            // IMPORTANT: assumes these columns exist after your migration
            .select("id, organization_id, title, file_bucket, file_path")
            .eq("id", replaceArticleId)
            .single()
      );

      if (!existing || existing.organization_id !== orgId) {
        return cors(
          new Response(
            JSON.stringify(
              { error: "Invalid article_id for this organization", request_id }
            ),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      articleIdForError = existing.id;
      existingTitle = existing.title ?? null;

      // capture old file refs for deletion AFTER success
      oldFileBucket = existing.file_bucket ?? null;
      oldFilePath = existing.file_path ?? null;

      // Clear previous error state early
      await supabase
        .from("knowledge_articles")
        .update({ processing_status: "processing", processing_error: null })
        .eq("id", replaceArticleId);
    }

    /* ============================================
       Build fullText from source
    ============================================ */
    let fullText = "";
    let resolvedMime = mime_type || "application/octet-stream";

    if (sourceType === "text") {
      if (!body.content?.trim?.()) {
        return cors(
          new Response(JSON.stringify({ error: "Missing text content", request_id }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      fullText = body.content.trim();
    } else if (sourceType === "file") {
      if (!file_bucket || !file_path) {
        return cors(
          new Response(
            JSON.stringify({ error: "Missing file_bucket or file_path", request_id }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      
const { text, mimeType, excelRows } = await extractTextFromFile(
  logger,
  file_bucket,
  file_path,
  mime_type
);
resolvedMime = mimeType;

// ✅ Excel pricing sheet: auto-split into model-wise KB articles (prevents huge context blobs)
if (Array.isArray(excelRows) && excelRows.length > 0) {
  const nowIso = new Date().toISOString();
  const groups = splitExcelRowsByModel(logger, excelRows);

  logger.info("EXCEL_SPLIT_START", { models: groups.length, rows: excelRows.length });

  const created_article_ids: string[] = [];

  for (const g of groups) {
    const model = String(g.model || "Unknown Model").trim() || "Unknown Model";
    const title = `${model} — Pricing, Offers & Schemes`;

    const content = buildModelPricingContent({
      model,
      rows: g.rows,
      sourceFilename: original_filename || (file_path ? file_path.split("/").pop() : null),
    });

    const modelKeywords = buildModelKeywords(model, keywords);
    const chunks = chunkText(content);

    if (!chunks.length) continue;

    const vectors = await embedChunks(logger, chunks);
    if (!vectors || vectors.length !== chunks.length) {
      const msg = `Embedding generation failed for model: ${model}`;
      await setProcessingError(logger, articleIdForError, msg);

    try {
      if (body?.organization_id) {
        await logAuditEvent(supabase, {
          organization_id: String(body.organization_id).trim(),
          action: "kb_generate_failed",
          entity_type: "knowledge_article",
          entity_id: articleIdForError,
          metadata: { request_id, error: msg },
        });
      }
    } catch (_) {
      // ignore
    }
      return cors(
        new Response(JSON.stringify({ error: msg, request_id }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    const insertPayload: any = {
      organization_id: orgId,
      title,
      description: null,
      content,
      keywords: modelKeywords,

      status,
      published_at,

      source_type: "file",
      file_bucket,
      file_path,
      mime_type: resolvedMime,
      original_filename,

      raw_content: content,
      last_processed_at: nowIso,
      processing_status: "completed",
      processing_error: null,
    };

    const created = await safeSupabase<{ id: string }>(
      logger,
      "knowledge_articles.insert(model)",
      () =>
        supabase
          .from("knowledge_articles")
          .insert(insertPayload)
          .select("id")
          .single()
    );

    if (!created) continue;

    const articleId = created.id;
    created_article_ids.push(articleId);

    const records = chunks.map((chunk, i) => ({
      organization_id: orgId,
      article_id: articleId,
      chunk_index: i,
      chunk,
      embedding: vectors[i],
    }));

    const { error: chunkError } = await supabase.from("knowledge_chunks").insert(records);
    if (chunkError) {
      logger.error("KB_CHUNKS_INSERT_ERROR(model)", {
        error: chunkError,
        article_id: articleId,
        model,
      });
    }
  }

  // Container article (keeps a visible reference to the uploaded Excel)
  const containerNote =
    `This Excel file was automatically split into **${groups.length} model-wise** knowledge articles for better AI recall.

` +
    `Tip: Ask like “Discount on Nexon?” or “Offers for Altroz?” and the bot will pull the correct model article.`;

  if (replaceArticleId) {
    // Replace mode: update the existing article as a container and clear old chunks
    await supabase.from("knowledge_chunks").delete().eq("article_id", replaceArticleId);

    await supabase
      .from("knowledge_articles")
      .update({
        title: incomingTitle || existingTitle || "Pricing Excel (Split)",
        content: containerNote,
        keywords,
        status: "archived",
        published_at: null,
        source_type: "file",
        file_bucket,
        file_path,
        mime_type: resolvedMime,
        original_filename,
        raw_content: containerNote,
        last_processed_at: nowIso,
        processing_status: "completed",
      processing_error: null,
      })
      .eq("id", replaceArticleId);

    // Insert minimal chunk so container isn't empty for embeddings
    const containerChunks = chunkText(containerNote);
    const containerVectors = await embedChunks(logger, containerChunks);
    if (containerVectors && containerVectors.length === containerChunks.length) {
      const containerRecords = containerChunks.map((chunk, i) => ({
        organization_id: orgId,
        article_id: replaceArticleId,
        chunk_index: i,
        chunk,
        embedding: containerVectors[i],
      }));
      await supabase.from("knowledge_chunks").insert(containerRecords);
    }
  } else {
    // Create mode: create a container (archived) for traceability
    const container = await safeSupabase<{ id: string }>(
      logger,
      "knowledge_articles.insert(container)",
      () =>
        supabase
          .from("knowledge_articles")
          .insert({
            organization_id: orgId,
            title: incomingTitle,
            description: null,
            content: containerNote,
            keywords,
            status: "archived",
            published_at: null,
            source_type: "file",
            file_bucket,
            file_path,
            mime_type: resolvedMime,
            original_filename,
            raw_content: containerNote,
            last_processed_at: nowIso,
            processing_status: "completed",
      processing_error: null,
          })
          .select("id")
          .single()
    );

    if (container?.id) {
      const containerChunks = chunkText(containerNote);
      const containerVectors = await embedChunks(logger, containerChunks);
      if (containerVectors && containerVectors.length === containerChunks.length) {
        const containerRecords = containerChunks.map((chunk, i) => ({
          organization_id: orgId,
          article_id: container.id,
          chunk_index: i,
          chunk,
          embedding: containerVectors[i],
        }));
        await supabase.from("knowledge_chunks").insert(containerRecords);
      }
    }
  }

  
// Best-effort delete old file (replace mode) — we short-circuit before the shared auto-delete block
if (replaceArticleId && oldFileBucket && oldFilePath && file_bucket && file_path) {
  const isSame = oldFileBucket === file_bucket && oldFilePath === file_path;
  if (!isSame) {
    try {
      const { error: rmErr } = await supabase.storage
        .from(oldFileBucket)
        .remove([oldFilePath]);
      if (rmErr) {
        logger.warn("OLD_FILE_DELETE_FAILED(excel_split)", {
          bucket: oldFileBucket,
          path: oldFilePath,
          error: rmErr,
        });
      } else {
        logger.info("OLD_FILE_DELETED(excel_split)", {
          bucket: oldFileBucket,
          path: oldFilePath,
        });
      }
    } catch (err) {
      logger.warn("OLD_FILE_DELETE_FATAL(excel_split)", {
        bucket: oldFileBucket,
        path: oldFilePath,
        error: String(err),
      });
    }
  }
}

logger.info("EXCEL_SPLIT_DONE", {
    created_models: created_article_ids.length,
    container: replaceArticleId ? "updated" : "created",
  });

  // Best-effort: delete old storage file if this was a replace operation
  // (handled later by the existing auto-delete block, so just short-circuit the handler)
  return cors(
    new Response(
      JSON.stringify({
        ok: true,
        request_id,
        mode: "excel_split",
        models: groups.length,
        created_articles: created_article_ids.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
}

if (!text) {
        const msg = "Text extraction failed";
        await setProcessingError(logger, articleIdForError, msg);

    try {
      if (body?.organization_id) {
        await logAuditEvent(supabase, {
          organization_id: String(body.organization_id).trim(),
          action: "kb_generate_failed",
          entity_type: "knowledge_article",
          entity_id: articleIdForError,
          metadata: { request_id, error: msg },
        });
      }
    } catch (_) {
      // ignore
    }
        return cors(
          new Response(JSON.stringify({ error: msg, request_id }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
      }

      fullText = text;
    } else {
      return cors(
        new Response(JSON.stringify({ error: "Invalid source_type", request_id }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    if (!fullText.trim()) {
      const msg = "Empty content";
      await setProcessingError(logger, articleIdForError, msg);

    try {
      if (body?.organization_id) {
        await logAuditEvent(supabase, {
          organization_id: String(body.organization_id).trim(),
          action: "kb_generate_failed",
          entity_type: "knowledge_article",
          entity_id: articleIdForError,
          metadata: { request_id, error: msg },
        });
      }
    } catch (_) {
      // ignore
    }
      return cors(
        new Response(JSON.stringify({ error: msg, request_id }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    /* ============================================
       CHUNKING
    ============================================ */
    const chunks = chunkText(fullText);
    if (chunks.length === 0) {
      const msg = "Chunking failed";
      await setProcessingError(logger, articleIdForError, msg);

    try {
      if (body?.organization_id) {
        await logAuditEvent(supabase, {
          organization_id: String(body.organization_id).trim(),
          action: "kb_generate_failed",
          entity_type: "knowledge_article",
          entity_id: articleIdForError,
          metadata: { request_id, error: msg },
        });
      }
    } catch (_) {
      // ignore
    }
      return cors(
        new Response(JSON.stringify({ error: msg, request_id }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    /* ============================================
       EMBEDDINGS
    ============================================ */
    const vectors = await embedChunks(logger, chunks);
    if (!vectors || vectors.length !== chunks.length) {
      const msg = "Embedding generation failed";
      await setProcessingError(logger, articleIdForError, msg);

    try {
      if (body?.organization_id) {
        await logAuditEvent(supabase, {
          organization_id: String(body.organization_id).trim(),
          action: "kb_generate_failed",
          entity_type: "knowledge_article",
          entity_id: articleIdForError,
          metadata: { request_id, error: msg },
        });
      }
    } catch (_) {
      // ignore
    }
      return cors(
        new Response(JSON.stringify({ error: msg, request_id }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    /* ============================================
       INSERT / UPDATE ARTICLE
    ============================================ */
    const nowIso = new Date().toISOString();
    let articleId: string;

    if (replaceArticleId) {
      // 1) Delete old chunks
      const { error: delErr } = await supabase
        .from("knowledge_chunks")
        .delete()
        .eq("article_id", replaceArticleId);

      if (delErr) {
        const msg = `Failed to delete old chunks: ${delErr.message ?? "unknown"}`;
        await setProcessingError(logger, replaceArticleId, msg);
        return cors(
          new Response(JSON.stringify({ error: msg, request_id }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
      }

      // 2) Update article
      const updatePayload: any = {
        title: incomingTitle || existingTitle || "Untitled article",
        content: fullText,

        // Phase 6 — optional keywords for strict keyword matching
        keywords,

        status,
        published_at,

        // file metadata columns (post-migration)
        source_type: sourceType,
        file_bucket: sourceType === "file" ? file_bucket : null,
        file_path: sourceType === "file" ? file_path : null,
        mime_type: sourceType === "file" ? resolvedMime : null,
        original_filename: sourceType === "file" ? original_filename : null,

        raw_content: fullText,
        last_processed_at: nowIso,
        processing_status: "completed",
      processing_error: null,
      };

      const updated = await safeSupabase<{ id: string }>(
        logger,
        "knowledge_articles.update(replace)",
        () =>
          supabase
            .from("knowledge_articles")
            .update(updatePayload)
            .eq("id", replaceArticleId)
            .select("id")
            .single()
      );

      if (!updated) {
        const msg = "Failed to update article (replace mode)";
        await setProcessingError(logger, replaceArticleId, msg);
        return cors(
          new Response(JSON.stringify({ error: msg, request_id }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
      }

      articleId = updated.id;
      articleIdForError = articleId;
    } else {
      // CREATE MODE
      const insertPayload: any = {
        organization_id: orgId,
        title: incomingTitle,
        description: null,
        content: fullText,

        // Phase 6 — optional keywords for strict keyword matching
        keywords,

        status,
        published_at,

        // file metadata columns (post-migration)
        source_type: sourceType,
        file_bucket: sourceType === "file" ? file_bucket : null,
        file_path: sourceType === "file" ? file_path : null,
        mime_type: sourceType === "file" ? resolvedMime : null,
        original_filename: sourceType === "file" ? original_filename : null,

        raw_content: fullText,
        last_processed_at: nowIso,
        processing_status: "completed",
      processing_error: null,
      };

      const created = await safeSupabase<{ id: string }>(
        logger,
        "knowledge_articles.insert",
        () =>
          supabase
            .from("knowledge_articles")
            .insert(insertPayload)
            .select("id")
            .single()
      );

      if (!created) {
        const msg = "Failed to create article";
        return cors(
          new Response(JSON.stringify({ error: msg, request_id }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
      }

      articleId = created.id;
      articleIdForError = articleId;
    }

    /* ============================================
       INSERT CHUNKS + EMBEDDINGS
    ============================================ */
    const records = chunks.map((chunk, i) => ({
      organization_id: orgId,
      article_id: articleId,
      chunk_index: i,
      chunk,
      embedding: vectors[i],
    }));

    const { error: chunkError } = await supabase.from("knowledge_chunks").insert(records);

    if (chunkError) {
      logger.error("KB_CHUNKS_INSERT_ERROR", { error: chunkError, article_id: articleId });

      const msg = `Failed to insert chunks: ${chunkError.message ?? "unknown"}`;
      await setProcessingError(logger, articleId, msg);

      return cors(
        new Response(
          JSON.stringify({
            error: "Failed to insert chunks",
            details: chunkError,
            request_id,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    /* ============================================
       AUTO-DELETE OLD STORAGE FILE (best-effort)
       Only after successful replace + successful chunk insert
    ============================================ */
    if (replaceArticleId && oldFileBucket && oldFilePath && sourceType === "file") {
      const newBucket = file_bucket ?? null;
      const newPath = file_path ?? null;

      const isSame = oldFileBucket === newBucket && oldFilePath === newPath;

      if (!isSame) {
        try {
          const { error: rmErr } = await supabase.storage.from(oldFileBucket).remove([oldFilePath]);
          if (rmErr) {
            logger.warn("OLD_FILE_DELETE_FAILED", {
              bucket: oldFileBucket,
              path: oldFilePath,
              error: rmErr,
            });
          } else {
            logger.info("OLD_FILE_DELETED", { bucket: oldFileBucket, path: oldFilePath });
          }
        } catch (err) {
          logger.warn("OLD_FILE_DELETE_FATAL", {
            bucket: oldFileBucket,
            path: oldFilePath,
            error: String(err),
          });
        }
      }
    }

    // Phase 1: finalize processing status (best effort)
    try {
      await supabase
        .from("knowledge_articles")
        .update({ processing_status: "completed", processing_error: null, last_processed_at: new Date().toISOString() })
        .eq("id", articleId);
    } catch (_) {
      // ignore
    }

    logger.info("KB article processed", {
      article_id: articleId,
      chunks: records.length,
      sourceType,
      replace: !!replaceArticleId,
    });

    await logAuditEvent(supabase, {
      organization_id: orgId,
      action: "kb_generate_completed",
      entity_type: "knowledge_article",
      entity_id: articleId,
      metadata: { request_id, chunks: records.length, replaced: !!replaceArticleId },
    });

    return cors(
      new Response(
        JSON.stringify({
          success: true,
          article_id: articleId,
          keywords,
          chunks: records.length,
          replaced: !!replaceArticleId,
          request_id,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
  } catch (err) {
    const msg = String(err);
    logger.error("FATAL", { error: msg });
    await setProcessingError(logger, articleIdForError, msg);

    try {
      if (orgIdForError) {
        await logAuditEvent(supabase, {
          organization_id: orgIdForError,
          action: "kb_generate_failed",
          entity_type: "knowledge_article",
          entity_id: articleIdForError,
          metadata: { request_id, error: msg },
        });
      }
    } catch (_) {
      // ignore
    }

    return cors(
      new Response(JSON.stringify({ error: "Internal Server Error", request_id }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
});
