// deno-lint-ignore-file no-explicit-any
// --- IMPORTS ---
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// --- ENV VARS ---
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- CLIENTS ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Helper: build compact context
function buildContext(matches: any[], maxChars = 7000) {
  if (!matches?.length) return "No matching dealership knowledge found.";

  const sorted = [...matches].sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)
  );

  const lines: string[] = [];
  let used = 0;

  for (const m of sorted) {
    const line = `• ${m.chunk}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }

  return lines.join("\n");
}

// Detect follow-up pricing questions
function isPricingIntent(text: string) {
  const lower = text.toLowerCase();
  return ["discount", "offer", "scheme", "price", "cashback"].some((k) =>
    lower.includes(k)
  );
}

// --- MAIN ---
Deno.serve(async (req) => {
  try {
    const { conversation_id, user_message } = await req.json();

    if (!conversation_id || !user_message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // --- 1) FETCH LAST 10 MESSAGES (Conversation Memory) ---
    const { data: history } = await supabase
      .from("messages")
      .select("sender,text")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(10);

    // Convert DB messages → OpenAI format
    const memoryMessages = (history ?? []).map((m) => ({
      role: m.sender === "bot" ? "assistant" : "user",
      content: m.text
    }));

    // --- 2) EMBED USER QUERY ---
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: user_message
    });

    const queryEmbedding = embedRes.data[0].embedding;

    // --- 3) VECTOR SEARCH ---
    const { data: matches } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      match_count: 50,
      match_threshold: 0.15
    });

    let effectiveMatches = matches ?? [];

    // Booster for pricing questions
    if (isPricingIntent(user_message) && effectiveMatches.length < 2) {
      const { data: priceChunks } = await supabase
        .from("knowledge_chunks")
        .select("chunk")
        .ilike("chunk", "%discount%")
        .limit(20);

      if (priceChunks?.length) {
        effectiveMatches.push(
          ...priceChunks.map((c) => ({
            chunk: c.chunk,
            similarity: 0.5
          }))
        );
      }
    }

    // --- 4) BUILD CONTEXT ---
    const contextText = buildContext(effectiveMatches);

    // --- 5) SYSTEM PROMPT (smart) ---
    const systemPrompt = `
You are the official AI Sales Assistant for Techwheels Tata Motors.

Your goals:
- Help customers with variants, discounts, features, specs, and queries.
- Always answer using ONLY the dealership knowledge in CONTEXT.
- You *can* use chat history to know what the conversation is about.

RULES:
- If user asks a follow-up like “what about variants?”, infer subject from memory.
- Never invent any pricing or discount not present in the context.
- If context is missing exact info, answer safely: 
  "I'm sorry, I do not have enough dealership information to answer that."

CONTEXT:
${contextText}
`.trim();

    // --- 6) FINAL MESSAGES SENT TO OPENAI ---
    const messages = [
      { role: "system", content: systemPrompt },
      ...memoryMessages,
      { role: "user", content: user_message }
    ];

    // --- 7) OPENAI CALL ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3
    });

    const ai_response =
      completion.choices?.[0]?.message?.content ??
      "I'm sorry, I couldn't generate a response.";

    // --- 8) RETURN ---
    return new Response(
      JSON.stringify({
        conversation_id,
        user_message,
        ai_response
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("AI Handler Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500
    });
  }
});
