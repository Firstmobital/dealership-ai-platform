import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.2.0";

const apiKey = Deno.env.get("OPENAI_API_KEY");

if (!apiKey) {
  console.error(
    "OPENAI_API_KEY is not set. Provide it via `supabase/functions/.env.local` or your deployment environment.",
  );
  throw new Error("OPENAI_API_KEY is missing");
}

const openai = new OpenAI({
  apiKey,
});

console.log("ai-test function loaded.");

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const conversation_id = body.conversation_id ?? "test";
    const user_message = body.user_message ?? "Hello from ai-test";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant for a car dealership. Be helpful, friendly and concise.",
        },
        {
          role: "user",
          content: user_message,
        },
      ],
    });

    const aiResponse =
      completion.choices?.[0]?.message?.content ??
      "I'm here to help with dealership questions!";

    return new Response(
      JSON.stringify({
        ok: true,
        conversation_id,
        user_message,
        ai_response: aiResponse,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-test ERROR:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

