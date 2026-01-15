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
  console.error(
    "[embed-article] Missing PROJECT_URL or SERVICE_ROLE_KEY",
    { hasProjectUrl: !!PROJECT_URL, hasServiceRoleKey: !!SERVICE_ROLE_KEY },
  );
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

const cors = (res: Response) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
};

/* =====================================================================================
   LOGGING
===================================================================================== */
function createLogger(request_id: string, org_id?: string | null) {
  return {
    info(msg: string, extra = {}) {
      console.log(JSON.stringify({ level: "info", request_id, org_id, msg, ...extra }));
    },
    warn(msg: string, extra = {}) {
      console.warn(JSON.stringify({ level: "warn", request_id, org_id, msg, ...extra }));
    },
    error(msg: string, extra = {}) {
      console.error(JSON.stringify({ level: "error", request_id, org_id, msg, ...extra }));
    },
    debug(msg: string, extra = {}) {
      console.log(JSON.stringify({ level: "debug", request_id, org_id, msg, ...extra }));
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
    logger.error(`[supabase] ${label} fatal`, { error: err });
    return null;
  }
}

async function safeEmbeddingsBatch(
  logger: ReturnType<typeof createLogger>,
  inputs: string[],
): Promise<number[][] | null> {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("OPENAI_API_KEY missing");
    return null;
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: inputs,
      }),
    });

    const json = await resp.json().catch(() => null);

    if (!resp.ok || !json?.data?.length) {
      logger.error("OPENAI_EMBEDDINGS_ERROR", { status: resp.status, body: json });
      return null;
    }

    const vectors = json.data.map((d: any) => d?.embedding).filter(Boolean);

    if (vectors.length !== inputs.length) {
      logger.error("EMBEDDINGS_COUNT_MISMATCH", {
        expected: inputs.length,
        got: vectors.length,
      });
      return null;
    }

    return vectors;
  } catch (err) {
    logger.error("OPENAI_EMBEDDINGS_FATAL", { error: err });
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

    // overlap
    start = end - overlapWords;
    if (start < 0) start = 0;

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
      new Response(JSON.stringify({ error: "Method not allowed", request_id }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body?.article_id) {
      return cors(
        new Response(JSON.stringify({ error: "article_id required", request_id }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    const articleId = body.article_id;

    logger.info("Embed article request", { articleId });

    /* ------------------------------------------------------------------
       FETCH ARTICLE
    ------------------------------------------------------------------ */
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

    if (!article) {
      return cors(
        new Response(JSON.stringify({ error: "Article not found", request_id }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    const orgLogger = createLogger(request_id, article.organization_id);

    if (!article.content?.trim()) {
      return cors(
        new Response(JSON.stringify({ error: "Article content empty", request_id }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    /* ------------------------------------------------------------------
       CREATE CHUNKS
    ------------------------------------------------------------------ */
    const chunks = chunkText(article.content);

    if (!chunks.length) {
      return cors(
        new Response(JSON.stringify({ error: "Chunking failed", request_id }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    orgLogger.info("Chunking completed", { chunks: chunks.length });

    /* ------------------------------------------------------------------
       EMBEDDINGS
    ------------------------------------------------------------------ */
    const vectors = await safeEmbeddingsBatch(orgLogger, chunks);

if (!vectors) {
  return cors(
    new Response(
      JSON.stringify({ error: "Embedding generation failed", request_id }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    ),
  );
}

const records = vectors.map((vector, i) => ({
  organization_id: article.organization_id,
  article_id: articleId,
  chunk_index: i,
  embedding: vector,
}));


// Delete old chunks for this article first
await supabase
  .from("knowledge_chunks")
  .delete()
  .eq("article_id", articleId)
  .eq("organization_id", article.organization_id);


    /* ------------------------------------------------------------------
       INSERT CHUNKS
    ------------------------------------------------------------------ */
    const inserted = await safeSupabase<any>(
      orgLogger,
      "knowledge_chunks.insert",
      () => supabase.from("knowledge_chunks").insert(records),
    );

    if (!inserted) {
      return cors(
        new Response(JSON.stringify({ error: "Failed to insert chunks", request_id }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    orgLogger.info("Embedding completed", { chunks: records.length });

    /* ------------------------------------------------------------------
       SUCCESS
    ------------------------------------------------------------------ */
    return cors(
      new Response(
        JSON.stringify({
          success: true,
          chunks: records.length,
          request_id,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  } catch (err) {
    logger.error("FATAL", { error: String(err) });

    return cors(
      new Response(JSON.stringify({ error: "Internal Server Error", request_id }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
});

