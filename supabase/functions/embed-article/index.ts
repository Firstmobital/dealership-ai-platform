// supabase/functions/embed-article/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

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

/* =====================================================================================
   LOGGING
===================================================================================== */
function createLogger(request_id: string, org_id?: string | null) {
  return {
    info(msg: string, extra: Record<string, any> = {}) {
      console.log(
        JSON.stringify({ level: "info", request_id, org_id, msg, ...extra }),
      );
    },
    warn(msg: string, extra: Record<string, any> = {}) {
      console.warn(
        JSON.stringify({ level: "warn", request_id, org_id, msg, ...extra }),
      );
    },
    error(msg: string, extra: Record<string, any> = {}) {
      console.error(
        JSON.stringify({ level: "error", request_id, org_id, msg, ...extra }),
      );
    },
  };
}

/* =====================================================================================
   SAFE HELPERS
===================================================================================== */
async function safeSupabase<T>(
  logger: ReturnType<typeof createLogger>,
  label: string,
  fn: () => Promise<{ data: T | null; error: any }>,
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

    const vectors: any[] = json.data.map((d: any) => d?.embedding);

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

    return vectors as number[][];
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

    // ✅ Prevent repeating last chunk forever
    if (end === words.length) break;

    start = Math.max(0, end - overlapWords);

    // hard safety cap
    if (chunks.length >= 200) break;
  }

  return chunks;
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return cors(new Response("ok", { status: 200 }));
  }

  const request_id = crypto.randomUUID();
  const logger = createLogger(request_id);

  if (req.method !== "POST") {
    return cors(
      new Response(
        JSON.stringify({ error: "Method not allowed", request_id }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  try {
    // Safe body parsing (handles empty/invalid JSON)
    let body: any = null;
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.error("INVALID_JSON_BODY", { error: String(err) });
      return cors(
        new Response(
          JSON.stringify({ error: "Invalid JSON body", request_id }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    const articleId = body?.article_id;
    if (!articleId) {
      return cors(
        new Response(
          JSON.stringify({ error: "article_id required", request_id }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    logger.info("Embed article request", { articleId });

    // Fetch article
    const article = await safeSupabase<any>(
      logger,
      "knowledge_articles.by_id",
      () =>
        supabase
          .from("knowledge_articles")
          .select("id, organization_id, content")
          .eq("id", articleId)
          .maybeSingle(),
    );

    if (!article || !article.content?.trim()) {
      return cors(
        new Response(
          JSON.stringify({ error: "Article not found or empty", request_id }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    const orgId = article.organization_id as string;
    const orgLogger = createLogger(request_id, orgId);

    // Chunk
    const chunks = chunkText(article.content, 180, 30);
    if (!chunks.length) {
      return cors(
        new Response(
          JSON.stringify({ error: "Chunking failed", request_id }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    orgLogger.info("Chunking completed", { chunks: chunks.length });

    // Embed
    const vectors = await safeEmbeddingsBatch(orgLogger, chunks);
    if (!vectors) {
      return cors(
        new Response(
          JSON.stringify({ error: "Embedding failed", request_id }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    // Delete old chunks (scoped)
    const deleted = await safeSupabase<any>(
      orgLogger,
      "knowledge_chunks.delete_old",
      () =>
        supabase
          .from("knowledge_chunks")
          .delete()
          .eq("article_id", articleId)
          .eq("organization_id", orgId),
    );

    // (deleted can be null if RLS blocks; service role should pass)
    orgLogger.info("Old chunks deleted", {
      articleId,
      deleted_ok: deleted !== null,
    });

    // Insert new
    const records = chunks.map((chunk, i) => ({
      organization_id: orgId,
      article_id: articleId,
      chunk_index: i, // keep if your table has it; if not, remove this line
      chunk,          // ✅ required for deterministic + debug + audit
      embedding: vectors[i],
    }));

    const inserted = await safeSupabase<any>(
      orgLogger,
      "knowledge_chunks.insert",
      () => supabase.from("knowledge_chunks").insert(records),
    );

    if (!inserted) {
      return cors(
        new Response(
          JSON.stringify({ error: "Insert failed", request_id }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    orgLogger.info("Embedding completed", { chunks: records.length });

    return cors(
      new Response(
        JSON.stringify({ success: true, chunks: records.length, request_id }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  } catch (err) {
    logger.error("FATAL", { error: String(err) });
    return cors(
      new Response(
        JSON.stringify({ error: "Internal Server Error", request_id }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
});
