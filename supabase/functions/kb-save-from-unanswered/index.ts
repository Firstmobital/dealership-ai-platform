// supabase/functions/kb-save-from-unanswered/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import OpenAI from "https://esm.sh/openai@4.47.0";

/* =====================================================================================
   ENV
===================================================================================== */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* =====================================================================================
   CORS
===================================================================================== */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const cors = (r: Response) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => r.headers.set(k, v));
  return r;
};

/* =====================================================================================
   LOGGING
===================================================================================== */
function createLogger(request_id: string, org_id?: string) {
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
  };
}

/* =====================================================================================
   SAFE HELPERS
===================================================================================== */
async function safeSupabase<T>(
  logger: any,
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
    logger.error(`[supabase] ${label} fatal`, { error: err });
    return null;
  }
}

async function safeOpenAI(
  logger: any,
  params: any
): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!openai) {
    logger.error("OpenAI unavailable");
    return { ok: false, error: "OPENAI_NOT_AVAILABLE" };
  }

  try {
    const resp = await openai.chat.completions.create(params);
    const text = resp.choices?.[0]?.message?.content?.trim() ?? "";
    return { ok: true, text };
  } catch (err) {
    logger.error("OpenAI fatal", { error: err });
    return { ok: false, error: "OPENAI_REQUEST_FAILED" };
  }
}

/* =====================================================================================
   CHUNK + ABSTRACT HELPERS
===================================================================================== */
function chunkText(text: string, maxChars = 1200, maxChunks = 200): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;

    if ((current + "\n\n" + p).length <= maxChars) {
      current = current ? `${current}\n\n${p}` : p;
    } else {
      if (current) chunks.push(current);
      if (p.length > maxChars) {
        for (let i = 0; i < p.length; i += maxChars) {
          chunks.push(p.slice(i, i + maxChars));
        }
        current = "";
      } else {
        current = p;
      }
    }
    if (chunks.length >= maxChunks) break;
  }

  if (current && chunks.length < maxChunks) chunks.push(current);
  return chunks;
}

async function generateSummary(
  logger: any,
  text: string,
  title: string
): Promise<string> {
  if (!openai) {
    logger.warn("No OpenAI – fallback summary used");
    return text.slice(0, 600);
  }

  const prompt = `
Create a 4–6 sentence clean summary for a dealership knowledge base.
Title: ${title}

Content:
${text.slice(0, 3000)}

Return ONLY the summary.
`.trim();

  const result = await safeOpenAI(logger, {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  if (!result.ok) return text.slice(0, 600);
  return result.text || text.slice(0, 600);
}

async function embedChunks(logger: any, chunks: string[]): Promise<number[][] | null> {
  if (!openai) {
    logger.warn("No OpenAI – zero vectors used");
    return chunks.map(() => Array(1536).fill(0));
  }

  try {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small", // MUST be 1536 dims
      input: chunks,
    });

    return resp.data.map((row: any) => row.embedding as number[]);
  } catch (err) {
    logger.error("EMBEDDING_ERROR", { error: err });
    return null;
  }
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

    const {
      organization_id,
      sub_organization_id,
      question_id,
      title,
      summary,
    } = body || {};

    if (!organization_id || !question_id) {
      return cors(
        new Response(
          JSON.stringify({ error: "Missing required fields", request_id }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    logger.info("Processing KB save for unanswered question", { question_id });

    /* ------------------------------------------------------------------
       STEP 1 — Load unanswered question
    ------------------------------------------------------------------ */
    const question = await safeSupabase<any>(
      logger,
      "unanswered_questions.by_id",
      () =>
        supabase
          .from("unanswered_questions")
          .select("*")
          .eq("id", question_id)
          .eq("organization_id", organization_id)
          .single(),
    );

    if (!question) {
      return cors(
        new Response(
          JSON.stringify({ error: "Question not found", request_id }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    const questionText = question.question.trim();
    const articleTitle = title || questionText.slice(0, 80).trim();
    const articleSummary = summary || (await generateSummary(logger, questionText, articleTitle));

    /* ------------------------------------------------------------------
       STEP 2 — Create article
    ------------------------------------------------------------------ */
    const article = await safeSupabase<{ id: string }>(
      logger,
      "knowledge_articles.insert",
      () =>
        supabase
          .from("knowledge_articles")
          .insert({
            organization_id,
            sub_organization_id: sub_organization_id ?? null,
            title: articleTitle,
            content: articleSummary,
          })
          .select("id")
          .single(),
    );

    if (!article) {
      return cors(
        new Response(
          JSON.stringify({ error: "Failed to create article", request_id }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    /* ------------------------------------------------------------------
       STEP 3 — Chunk + Embed
    ------------------------------------------------------------------ */
    const chunks = chunkText(questionText);

    const vectors = await embedChunks(logger, chunks);
    if (!vectors || vectors.length !== chunks.length) {
      return cors(
        new Response(JSON.stringify({ error: "Embedding failed", request_id }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    const records = chunks.map((c, i) => ({
      article_id: article.id,
      chunk: c,
      embedding: vectors[i],
    }));

    const insertedChunks = await safeSupabase<any>(
      logger,
      "knowledge_chunks.insert",
      () => supabase.from("knowledge_chunks").insert(records),
    );

    if (!insertedChunks) {
      return cors(
        new Response(JSON.stringify({ error: "Failed to save chunks", request_id }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    /* ------------------------------------------------------------------
       STEP 4 — Delete original unanswered question
    ------------------------------------------------------------------ */
    await safeSupabase<any>(
      logger,
      "unanswered_questions.delete",
      () => supabase.from("unanswered_questions").delete().eq("id", question_id),
    );

    logger.info("KB article created from unanswered question", {
      article_id: article.id,
      chunks: records.length,
    });

    return cors(
      new Response(
        JSON.stringify({
          success: true,
          article_id: article.id,
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

