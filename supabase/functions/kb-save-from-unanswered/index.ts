// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import OpenAI from "https://esm.sh/openai@4.47.0";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

type SaveBody = {
  organization_id: string;
  sub_organization_id?: string | null;
  question: string;
  content: string;
};

function chunkText(input: string, maxLen = 800): string[] {
  const normalized = input.replace(/\r\n/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);

  const chunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;

    if ((buffer + "\n\n" + p).length > maxLen) {
      if (buffer) chunks.push(buffer.trim());
      if (p.length > maxLen) {
        for (let i = 0; i < p.length; i += maxLen) {
          chunks.push(p.slice(i, i + maxLen));
        }
        buffer = "";
      } else {
        buffer = p;
      }
    } else {
      buffer = buffer ? buffer + "\n\n" + p : p;
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = (await req.json()) as SaveBody;

    const organization_id = body.organization_id;
    const sub_organization_id = body.sub_organization_id ?? null;
    const question = (body.question ?? "").trim();
    const content = (body.content ?? "").trim();

    if (!organization_id || !question || !content) {
      return new Response(
        JSON.stringify({
          error: "organization_id, question and content are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const nowIso = new Date().toISOString();
    const title =
      question.length > 120 ? question.slice(0, 117) + "..." : question;

    // 1) Insert knowledge_articles row
    const { data: article, error: articleErr } = await supabase
      .from("knowledge_articles")
      .insert({
        organization_id,
        sub_organization_id,
        title,
        description: question,
        content,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (articleErr || !article) {
      console.error("[kb-save-from-unanswered] article insert error:", articleErr);
      return new Response(
        JSON.stringify({ error: "Failed to create knowledge article" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const articleId = article.id as string;

    // 2) Chunk content and embed
    const chunks = chunkText(content, 800);

    if (chunks.length > 0) {
      const embeddingResp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunks,
      });

      const rows = chunks.map((chunk, idx) => {
        const emb = embeddingResp.data[idx]?.embedding;
        return {
          article_id: articleId,
          chunk,
          embedding: emb,
        };
      });

      const filteredRows = rows.filter((r) => Array.isArray(r.embedding));

      if (filteredRows.length > 0) {
        const { error: chunkErr } = await supabase
          .from("knowledge_chunks")
          .insert(filteredRows);

        if (chunkErr) {
          console.error(
            "[kb-save-from-unanswered] chunks insert error:",
            chunkErr,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        article_id: articleId,
        created: true,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[kb-save-from-unanswered] fatal error:", err);
    return new Response(
      JSON.stringify({
        error: err?.message ?? "Internal Server Error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
