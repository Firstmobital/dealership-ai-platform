// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
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
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/* =====================================================================================
   HELPERS
===================================================================================== */

// Chunk text for embeddings
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

// Generate a short abstract to store in knowledge_articles.content
async function summarize(text: string, title: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn("[kb-save-from-unanswered] Missing OPENAI_API_KEY – using truncated fallback summary.");
    return text.slice(0, 600);
  }

  const prompt = `
You are helping build a knowledge base for a dealership AI.
Create a short 4–6 sentence summary suitable for KB display.

Title: ${title}

Content:
${text.slice(0, 3000)}

Return ONLY the summary.
  `.trim();

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  return resp.choices?.[0]?.message?.content?.trim() || text.slice(0, 600);
}

// Generate embeddings for chunks
async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    console.warn("[kb-save-from-unanswered] No OPENAI_API_KEY – returning zero vectors.");
    return chunks.map(() => Array(1536).fill(0));
  }

  const resp = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: chunks,
  });

  return resp.data.map((row: any) => row.embedding as number[]);
}

/* =====================================================================================
   MAIN FUNCTION
===================================================================================== */

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405 }
      );
    }

    const {
      organization_id,
      sub_organization_id,
      question_id,
      title,
      summary,
    } = await req.json();

    if (!organization_id || !question_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    /* =====================================================================================
       STEP 1 — Load the unanswered question
    ===================================================================================== */

    const { data: q, error: qErr } = await supabase
      .from("unanswered_questions")
      .select("*")
      .eq("id", question_id)
      .eq("organization_id", organization_id)
      .single();

    if (qErr || !q) {
      console.error("[kb-save-from-unanswered] Load question error:", qErr);
      return new Response(
        JSON.stringify({ error: "Unanswered question not found" }),
        { status: 404 }
      );
    }

    const questionText = q.question.trim();
    const articleTitle = title || questionText.slice(0, 80);
    const articleSummary =
      summary ||
      (await summarize(questionText, articleTitle));

    /* =====================================================================================
       STEP 2 — Insert knowledge_articles
    ===================================================================================== */

    const { data: aInsert, error: aErr } = await supabase
      .from("knowledge_articles")
      .insert({
        organization_id,
        sub_organization_id: sub_organization_id ?? null,
        title: articleTitle,
        content: articleSummary, // short KB abstract
      })
      .select("id")
      .single();

    if (aErr || !aInsert) {
      console.error("[kb-save-from-unanswered] Failed to insert article:", aErr);
      return new Response(
        JSON.stringify({ error: "Failed to create KB article" }),
        { status: 500 }
      );
    }

    const articleId = aInsert.id;

    /* =====================================================================================
       STEP 3 — Chunk + Embed full question text
    ===================================================================================== */

    const chunks = chunkText(questionText);
    const vectors = await embedChunks(chunks);

    if (vectors.length !== chunks.length) {
      console.error("[kb-save-from-unanswered] Chunk mismatch", {
        chunks: chunks.length,
        vectors: vectors.length,
      });
      return new Response(
        JSON.stringify({ error: "Embedding generation failed" }),
        { status: 500 }
      );
    }

    const chunkRecords = chunks.map((chunk, i) => ({
      article_id: articleId,
      chunk,
      embedding: vectors[i],
    }));

    const { error: chunkErr } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRecords);

    if (chunkErr) {
      console.error("[kb-save-from-unanswered] Failed to save chunks:", chunkErr);
      return new Response(
        JSON.stringify({ error: "Failed to save KB chunks" }),
        { status: 500 }
      );
    }

    /* =====================================================================================
       STEP 4 — Delete unanswered question
    ===================================================================================== */

    const { error: delErr } = await supabase
      .from("unanswered_questions")
      .delete()
      .eq("id", question_id);

    if (delErr) {
      console.error("[kb-save-from-unanswered] Failed to delete unanswered q:", delErr);
      // Not fatal — article is created anyway
    }

    /* =====================================================================================
       DONE
    ===================================================================================== */

    return new Response(
      JSON.stringify({
        success: true,
        article_id: articleId,
        chunks: chunkRecords.length,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[kb-save-from-unanswered] Fatal:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500 }
    );
  }
});
