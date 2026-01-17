// supabase/functions/embed-article/index.ts
// FINAL — FK-RACE SAFE + REAL ERROR LOGS (NO MORE RANDOM 500S)
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

import { logAuditEvent } from "../_shared/audit.ts";
import { getRequestId, requireOrgMembership, requireUser } from "../_shared/auth.ts";
/* =====================================================================================
   ENV
===================================================================================== */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[embed-article] Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* =====================================================================================
   CORS
===================================================================================== */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function cors(res: Response) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

function json(status: number, payload: Record<string, unknown>) {
  return cors(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/* =====================================================================================
   LOGGING
===================================================================================== */
function createLogger(request_id: string, org_id?: string | null) {
  return {
    info(msg: string, extra: Record<string, any> = {}) {
      console.log(JSON.stringify({ level: "info", request_id, org_id, msg, ...extra }));
    },
    warn(msg: string, extra: Record<string, any> = {}) {
      console.warn(JSON.stringify({ level: "warn", request_id, org_id, msg, ...extra }));
    },
    error(msg: string, extra: Record<string, any> = {}) {
      console.error(JSON.stringify({ level: "error", request_id, org_id, msg, ...extra }));
    },
  };
}

function logSbError(logger: ReturnType<typeof createLogger>, label: string, error: any) {
  logger.error(label, {
    message: error?.message ?? String(error),
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    code: error?.code ?? null,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* =====================================================================================
   EMBEDDINGS
===================================================================================== */
function isValidVector(v: any): v is number[] {
  return Array.isArray(v) && v.length === 1536 && v.every((x) => typeof x === "number");
}

async function safeEmbeddingsBatch(
  logger: ReturnType<typeof createLogger>,
  inputs: string[],
): Promise<number[][] | null> {
  if (!OPENAI_API_KEY) {
    logger.error("OPENAI_API_KEY missing");
    return null;
  }
  if (!inputs.length) return [];

  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: inputs,
      }),
    });

    const rawText = await resp.text();

    let json: any;
    try {
      json = JSON.parse(rawText);
    } catch {
      logger.error("OPENAI_NON_JSON_RESPONSE", {
        status: resp.status,
        body: rawText.slice(0, 500),
      });
      return null;
    }

    if (!resp.ok || !json?.data?.length) {
      logger.error("OPENAI_EMBEDDINGS_ERROR", {
        status: resp.status,
        body: json,
      });
      return null;
    }

    const vectors = json.data.map((d: any) => d?.embedding);

    if (vectors.length !== inputs.length) {
      logger.error("EMBEDDINGS_COUNT_MISMATCH", {
        expected: inputs.length,
        got: vectors.length,
      });
      return null;
    }

    for (const v of vectors) {
      if (!isValidVector(v)) {
        logger.error("BAD_EMBEDDING_DIMENSION", {
          length: Array.isArray(v) ? v.length : null,
        });
        return null;
      }
    }

    return vectors;
  } catch (err) {
    logger.error("OPENAI_EMBEDDINGS_FATAL", { error: String(err) });
    return null;
  }
}

/* =====================================================================================
   CHUNKING
===================================================================================== */
function chunkText(text: string, maxWords = 180, overlapWords = 30): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const chunk = words.slice(start, end).join(" ").trim();
    if (chunk) chunks.push(chunk);

    if (end === words.length) break;
    start = Math.max(0, end - overlapWords);

    if (chunks.length >= 200) break;
  }

  return chunks;
}

/* =====================================================================================
   MAIN
===================================================================================== */
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return cors(new Response("ok", { status: 200 }));
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const request_id = getRequestId(req);
  const logger = createLogger(request_id);

  // ---- Safe JSON parse
  let body: any = null;
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return json(200, { skipped: true, reason: "Invalid JSON", request_id });
  }

  const articleId = body?.article_id;
  if (!articleId) return json(200, { skipped: true, reason: "article_id missing", request_id });

  logger.info("Embed article request", { articleId });

  // ---- FK/commit race guard: wait a bit for article row to exist
  // This solves: knowledge_chunks_article_id_fkey violations during fast saves.
  let article: any = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const { data, error } = await supabase
      .from("knowledge_articles")
      .select("id, organization_id, content")
      .eq("id", articleId)
      .maybeSingle();

    if (error) {
      logSbError(logger, "SB_FETCH_ARTICLE_ERROR", error);
      // If fetch itself errors, don't keep retrying blindly
      break;
    }

    if (data?.id) {
      article = data;
      break;
    }

    // not found yet → retry
    await sleep(200 * attempt);
  }

  if (!article?.id) {
    logger.warn("Article not committed yet — skipping embed", { articleId });
    return json(200, { skipped: true, reason: "Article not committed yet", request_id });
  }

  const orgId = article.organization_id as string;

  // PHASE 1 AUTHZ: user must belong to org to embed KB
  try {
    const u = await requireUser(req);
    await requireOrgMembership({ supabaseAdmin: supabase, userId: u.id, organizationId: orgId });
  } catch {
    return json(403, { error: "Forbidden", request_id });
  }

  await logAuditEvent(supabase, {
    organization_id: orgId,
    action: "kb_embed_started",
    entity_type: "knowledge_article",
    entity_id: articleId,
    metadata: { request_id },
  });
  const orgLogger = createLogger(request_id, orgId);

  const content = (article.content || "").trim();

  // Don't embed while typing / tiny content
  if (content.length < 50) {
    orgLogger.info("Skipping embed (content too short)", { length: content.length });
    return json(200, { skipped: true, reason: "Content too short", request_id });
  }

  const chunks = chunkText(content, 180, 30);
  if (!chunks.length) return json(200, { skipped: true, reason: "Chunking failed", request_id });

  orgLogger.info("Chunking completed", { chunks: chunks.length });

  const vectors = await safeEmbeddingsBatch(orgLogger, chunks);
  if (!vectors) return json(500, { error: "Embedding failed", request_id });

  // ---- Delete old chunks (log real error details)
  {
    const { error } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("article_id", articleId);

    if (error) {
      logSbError(orgLogger, "SB_DELETE_OLD_CHUNKS_ERROR", error);
      return json(500, { error: "Failed to clear old chunks", request_id });
    }
  }

  const records = chunks.map((chunk, i) => ({
    organization_id: orgId,
    article_id: articleId,
    chunk_index: i,
    chunk,
    embedding: vectors[i],
  }));

  // ---- Insert new chunks (log real error details)
  {
    const { error } = await supabase
      .from("knowledge_chunks")
      .insert(records, { returning: "minimal" });

    if (error) {
      logSbError(orgLogger, "SB_INSERT_CHUNKS_ERROR", error);
      try {
        await logAuditEvent(supabase, {
          organization_id: orgId,
          action: "kb_embed_failed",
          entity_type: "knowledge_article",
          entity_id: articleId,
          metadata: { request_id, error: "Failed to insert chunks" },
        });
      } catch (_) {
        // ignore
      }
      return json(500, { error: "Failed to insert chunks", request_id });
    }
  }

  orgLogger.info("Embedding completed", { chunks: records.length });

  await logAuditEvent(supabase, {
    organization_id: orgId,
    action: "kb_embed_completed",
    entity_type: "knowledge_article",
    entity_id: articleId,
    metadata: { request_id, chunks: records.length },
  });

  return json(200, { success: true, chunks: records.length, request_id });
});
