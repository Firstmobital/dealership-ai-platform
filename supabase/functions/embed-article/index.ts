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

async function safeEmbedding(
  logger: ReturnType<typeof createLogger>,
  text: string,
): Promise<number[] | null> {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("OPENAI_API_KEY missing — returning zero vector");
    return Array(1536).fill(0);
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
        input: text,
      }),
    });

    const json = await resp.json().catch(() => null);

    if (!resp.ok || !json?.data?.[0]?.embedding) {
      logger.error("OPENAI_EMBEDDING_ERROR", {
        status: resp.status,
        body: json,
      });
      return null;
    }

    const vector = json.data[0].embedding;
    if (!Array.isArray(vector) || vector.length !== 1536) {
      logger.error("BAD_EMBEDDING_DIMENSION", { length: vector.length });
      return null;
    }

    return vector;
  } catch (err) {
    logger.error("OPENAI_EMBEDDING_FATAL", { error: err });
    return null;
  }
}

/* =====================================================================================
   CHUNKING
===================================================================================== */

function chunkText(text: string, maxWords = 120): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    if (current.join(" ").length > maxWords) {
      chunks.push(current.join(" "));
      current = [];
    }
  }

  if (current.length) chunks.push(current.join(" "));

  // prevent runaway memory if article is huge
  return chunks.slice(0, 200);
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
    const chunks = chunkText(article.content, 120);

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
    const records: any[] = [];

    for (const chunk of chunks) {
      const vector = await safeEmbedding(orgLogger, chunk);
      if (!vector) {
        return cors(
          new Response(
            JSON.stringify({ error: "Embedding generation failed", request_id }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      records.push({
        article_id: articleId,
        chunk,
        embedding: vector,
      });
    }

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

