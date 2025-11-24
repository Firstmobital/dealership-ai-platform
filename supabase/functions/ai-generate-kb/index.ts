// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* =====================================================================================
   ENV
===================================================================================== */

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!OPENAI_API_KEY) {
  console.warn("[ai-generate-kb] Missing OPENAI_API_KEY – embeddings will fail.");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* =====================================================================================
   TYPES
===================================================================================== */

type SourceType = "text" | "file";

interface BaseBody {
  organization_id?: string;
  sub_organization_id?: string | null;
  source_type?: SourceType;
  title?: string;
}

interface TextBody extends BaseBody {
  source_type: "text";
  content: string;
}

interface FileBody extends BaseBody {
  source_type: "file";
  file_bucket: string;
  file_path: string;
  mime_type?: string | null;
}

/* =====================================================================================
   HELPERS
===================================================================================== */

// Simple chunker: splits text into roughly `maxChars` chunks without breaking words too badly.
function chunkText(text: string, maxChars = 1200): string[] {
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
        // Hard split very long paragraphs
        for (let i = 0; i < p.length; i += maxChars) {
          chunks.push(p.slice(i, i + maxChars));
        }
        current = "";
      } else {
        current = p;
      }
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

async function generateAbstract(fullText: string, title: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn("[ai-generate-kb] No OPENAI_API_KEY, returning truncated text as abstract.");
    return fullText.slice(0, 800);
  }

  const prompt = [
    `You are helping build a knowledge base for a car dealership AI assistant.`,
    `Title: ${title || "(no title)"}`,
    ``,
    `Content:`,
    fullText.slice(0, 6000), // avoid huge prompts
    ``,
    `Task: Produce a concise, human-readable abstract (5–8 sentences) summarizing the key information.`,
    `Write in simple language suitable for sales and support agents.`,
  ].join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  const content = resp.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return fullText.slice(0, 800);
  }

  return content;
}

async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    console.warn("[ai-generate-kb] No OPENAI_API_KEY – returning zero vectors.");
    return chunks.map(() => Array(1536).fill(0));
  }

  const resp = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: chunks,
  });

  // The OpenAI client returns data as [{ embedding: number[] }, ...]
  return resp.data.map((row: any) => row.embedding as number[]);
}

/**
 * Download a file from Supabase Storage and return its text content.
 * For now we only support text/* files (e.g. .txt).
 */
async function downloadFileAsText(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.error("[ai-generate-kb] Failed to download file:", error);
    throw new Error("Failed to download knowledge file");
  }

  // In the Edge runtime, `data` is a Blob
  const text = await (data as Blob).text();
  return text;
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      );
    }

    const raw = (await req.json()) as TextBody | FileBody;
    const organizationId = raw.organization_id?.trim();
    const subOrgId = raw.sub_organization_id ?? null;
    const sourceType = raw.source_type;
    const title = raw.title?.trim() || "Untitled article";

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!sourceType || (sourceType !== "text" && sourceType !== "file")) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing source_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let fullText = "";

    if (sourceType === "text") {
      const body = raw as TextBody;
      const content = body.content?.trim();
      if (!content) {
        return new Response(
          JSON.stringify({ error: "Missing content for text source_type" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      fullText = content;
    } else if (sourceType === "file") {
      const body = raw as FileBody;
      if (!body.file_bucket || !body.file_path) {
        return new Response(
          JSON.stringify({ error: "Missing file_bucket or file_path for file source_type" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // We only support text-like files for now
      const mime = body.mime_type || "text/plain";
      if (!mime.startsWith("text/")) {
        return new Response(
          JSON.stringify({
            error:
              `Unsupported mime_type "${mime}". For now, only text/* files are supported. Convert your file to .txt and try again.`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      fullText = await downloadFileAsText(body.file_bucket, body.file_path);
    }

    if (!fullText.trim()) {
      return new Response(
        JSON.stringify({ error: "Empty content after processing" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 1) Generate abstract for knowledge_articles.content
    const abstract = await generateAbstract(fullText, title);

    // 2) Chunk the full text
    const chunks = chunkText(fullText);
    if (!chunks.length) {
      return new Response(
        JSON.stringify({ error: "Failed to chunk content" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3) Generate embeddings
    const vectors = await embedChunks(chunks);
    if (vectors.length !== chunks.length) {
      console.error("[ai-generate-kb] Embedding count mismatch", {
        chunks: chunks.length,
        vectors: vectors.length,
      });
      return new Response(
        JSON.stringify({ error: "Embedding generation failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4) Insert into knowledge_articles
    const { data: articleInsert, error: articleError } = await supabase
      .from("knowledge_articles")
      .insert({
        organization_id: organizationId,
        // sub_organization_id column is expected to exist from Phase 2 migrations; if not, this will error.
        sub_organization_id: subOrgId,
        title,
        description: null,
        content: abstract,
      })
      .select("id")
      .single();

    if (articleError || !articleInsert) {
      console.error("[ai-generate-kb] Failed to insert article:", articleError);
      return new Response(
        JSON.stringify({ error: "Failed to create knowledge article" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const articleId = articleInsert.id as string;

    // 5) Insert chunks
    const records = chunks.map((chunk, idx) => ({
      article_id: articleId,
      chunk,
      embedding: vectors[idx],
    }));

    const { error: chunkError } = await supabase
      .from("knowledge_chunks")
      .insert(records);

    if (chunkError) {
      console.error("[ai-generate-kb] Failed to insert chunks:", chunkError);
      return new Response(
        JSON.stringify({ error: "Failed to save knowledge chunks" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        article_id: articleId,
        chunks: records.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ai-generate-kb] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
