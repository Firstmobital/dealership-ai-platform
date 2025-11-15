// --- IMPORTS ---
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// --- ENV VARS ---
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- CLIENTS ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// --- MAIN HANDLER ---
Deno.serve(async (req) => {
  try {
    const { conversation_id, user_message } = await req.json();
    if (!conversation_id || !user_message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // --- 1) Embed user query ---
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: user_message,
    });
    const queryEmbedding = embedRes.data[0].embedding;

    // --- 2) Query Supabase similarity search ---
    const { data: matches, error: matchError } = await supabaseClient.rpc(
      "match_knowledge_chunks",
      {
        query_embedding: queryEmbedding,
        match_count: 20,
        match_threshold: 0.3
      }
    );

    if (matchError) {
      console.error("RAG Match Error:", matchError);
    }

    // Build context block
    let contextText = "";
    if (matches && matches.length > 0) {
      contextText = matches.map((m) => `- ${m.chunk}`).join("\n");
    } else {
      contextText = "No matching dealership knowledge found.";
    }

    // --- 3) Structured, RAG-aware system prompt ---
    const systemPrompt = `
You are Techwheels Motors AI Showroom Assistant.

You must answer ONLY using the information in the CONTEXT below.
If the answer is not clearly present in the context, you MUST reply exactly with:
"I'm sorry, I do not have enough dealership information to answer that."

CONTEXT:
${contextText}

RESPONSE RULES (VERY IMPORTANT):
- Always respond in clear, customer-friendly language.
- Keep answers concise but complete.
- Use the structured format below whenever possible.

### DEFAULT ANSWER FORMAT

1) A short heading line:
- Example: "Punch EV Smart – On-Road Price Summary"

2) If the question is about price / on-road price / breakup, use:

- **Ex-showroom Price**: ₹X,XX,XXX
- **RTO**: ₹X,XX,XXX
- **Insurance**: ₹X,XX,XXX
- **On-Road Price**: ₹X,XX,XXX

Only include fields that appear in CONTEXT.  
If a component is missing from context, either:
- skip that line, OR
- write: "Not specified in the available information."

3) If discounts / schemes / offers are mentioned in CONTEXT, add a section:

**Available Offers / Discounts**
- Cash discount: …
- Exchange bonus: …
- Corporate discount: …
- Other scheme details: …

Do NOT invent any amounts or schemes; only use what is present in CONTEXT.

4) If there are important notes (e.g., prices may vary, limited-period offer), add:

**Notes**
- Mention that prices are approximate and can change.
- Mention if offers are limited-time, city-specific, or dealer-specific (only if present in CONTEXT).

5) If the user asks a general feature/spec question (not price), give:
- A short heading
- 3–6 crisp bullet points from CONTEXT
- Optional closing line like:
  "If you tell me your usage or budget, I can suggest the most suitable variant."

NEVER:
- Mix in information that is not present in CONTEXT.
- Guess discounts, insurance amounts, RTO, or exact on-road prices.
- Refer to "context" or "chunks" in the answer. Talk like a normal showroom advisor.
`.trim();

    // --- 4) OpenAI Chat Completion ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: user_message }
      ],
      temperature: 0.2, // more deterministic + consistent structure
    });

    const aiResponse =
      completion.choices?.[0]?.message?.content ||
      "I'm sorry, I do not have enough dealership information to answer that.";

    // --- 5) Return result for frontend to save ---
    return new Response(
      JSON.stringify({
        conversation_id,
        user_message,
        ai_response: aiResponse
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (err) {
    console.error("AI Handler Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500
    });
  }
});
