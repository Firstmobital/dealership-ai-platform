// supabase/functions/ai-generate-kb/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

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
    logger.error(`[supabase] ${label} fatal`, { error: err });
    return null;
  }
}

async function safeOpenAI(
  logger: ReturnType<typeof createLogger>,
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
    logger.error("FILE_DOWNLOAD_FATAL", { error: err });
    return null;
  }
}

/* =====================================================================================
   TEXT CHUNKING
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

    if (chunks.length > maxChunks) break;
  }

  if (current && chunks.length < maxChunks) chunks.push(current);

  return chunks;
}

/* =====================================================================================
   FILE → TEXT EXTRACTION
===================================================================================== */
async function extractTextFromFile(
  logger: ReturnType<typeof createLogger>,
  bucket: string,
  path: string,
  mime: string | null
): Promise<string | null> {
  const blob = await safeFileDownload(logger, bucket, path);
  if (!blob) return null;

  const mimeType = mime || (blob as any).type || "application/octet-stream";

  // Plain text
  if (mimeType.startsWith("text/")) {
    return await blob.text();
  }

  // Requires OpenAI
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
  const filename = path.split("/").pop() || "document";

  const fileForOpenAI = new File([uint8], filename, { type: mimeType });

  let uploaded;
  try {
    uploaded = await openai.files.create({
      file: fileForOpenAI,
      purpose: "assistants",
    });
  } catch (err) {
    logger.error("OPENAI_FILE_UPLOAD_ERROR", { error: err });
    return null;
  }

  try {
    const resp = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract readable text only. No comments. Return up to 20000 characters.",
            },
            { type: "input_file", file_id: uploaded.id },
          ],
        },
      ],
    });

    let extracted = "";
    const output = (resp as any).output ?? [];
    for (const item of output) {
      for (const c of item.content ?? []) {
        if (c.type === "output_text") extracted += c.text.value ?? "";
      }
    }

    return extracted.trim().slice(0, 20000);
  } catch (err) {
    logger.error("OPENAI_EXTRACTION_ERROR", { error: err });
    return null;
  }
}

/* =====================================================================================
   EMBEDDINGS
===================================================================================== */
async function embedChunks(
  logger: ReturnType<typeof createLogger>,
  chunks: string[]
): Promise<number[][] | null> {
  if (!openai) {
    logger.warn("OPENAI_MISSING_EMBEDDINGS");
    return chunks.map(() => Array(1536).fill(0));
  }

  try {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
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
      })
    );
  }

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

    const orgId = body.organization_id.trim();
    const subOrgId = body.sub_organization_id ?? null;
    const sourceType = body.source_type;
    const title = body.title?.trim() || "Untitled article";

    logger.info("Start KB generation", { orgId, subOrgId, sourceType });

    let fullText = "";

    /* ============================================
       SOURCE TYPE = TEXT
    ============================================ */
    if (sourceType === "text") {
      if (!body.content?.trim()) {
        return cors(
          new Response(JSON.stringify({ error: "Missing text content", request_id }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      fullText = body.content.trim();
    }

    /* ============================================
       SOURCE TYPE = FILE
    ============================================ */
    if (sourceType === "file") {
      const { file_bucket, file_path, mime_type } =
        body || {};

      if (!file_bucket || !file_path) {
        return cors(
          new Response(
            JSON.stringify({ error: "Missing file_bucket or file_path", request_id }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      const text = await extractTextFromFile(logger, file_bucket, file_path, mime_type);
      if (!text) {
        return cors(
          new Response(JSON.stringify({ error: "Text extraction failed", request_id }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      fullText = text;
    }

    /* ============================================
       VALIDATE
    ============================================ */
    if (!fullText.trim()) {
      return cors(
        new Response(JSON.stringify({ error: "Empty content", request_id }), {
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
      return cors(
        new Response(JSON.stringify({ error: "Chunking failed", request_id }), {
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
      return cors(
        new Response(
          JSON.stringify({ error: "Embedding generation failed", request_id }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }

    /* ============================================
       INSERT ARTICLE — STORE FULL CONTENT
    ============================================ */
    const article = await safeSupabase<{ id: string }>(
      logger,
      "knowledge_articles.insert",
      () =>
        supabase
          .from("knowledge_articles")
          .insert({
            organization_id: orgId,
            sub_organization_id: subOrgId,
            title,
            description: null,

            // ⭐ IMPORTANT: store EXACT full content
            content: fullText,
          })
          .select("id")
          .single()
    );

    if (!article) {
      return cors(
        new Response(JSON.stringify({ error: "Failed to create article", request_id }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    /* ============================================
       INSERT CHUNKS + EMBEDDINGS
    ============================================ */
    const records = chunks.map((chunk, i) => ({
      article_id: article.id,
      chunk,
      embedding: vectors[i],
    }));

    const { error: chunkError } = await supabase
      .from("knowledge_chunks")
      .insert(records);

    if (chunkError) {
      logger.error("KB_CHUNKS_INSERT_ERROR", {
        error: chunkError,
        article_id: article.id,
      });

      return cors(
        new Response(
          JSON.stringify({
            error: "Failed to insert chunks",
            details: chunkError,
            request_id,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }

    logger.info("KB article created", {
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
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
  } catch (err) {
    logger.error("FATAL", { error: String(err) });

    return cors(
      new Response(JSON.stringify({ error: "Internal Server Error", request_id }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
});