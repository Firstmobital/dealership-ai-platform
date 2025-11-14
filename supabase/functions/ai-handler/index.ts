// supabase/functions/ai-handler/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.2.0";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

console.log("AI Handler function loaded.");

serve(async (req) => {
  try {
    const { conversation_id, user_message } = await req.json();

    if (!conversation_id || !user_message) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
      });
    }

    // Generate AI response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant for a car dealership. Be helpful, friendly, and concise.",
        },
        {
          role: "user",
          content: user_message,
        },
      ],
    });

    const aiResponse = completion.choices[0]?.message?.content || "I'm here to help!";

    return new Response(
      JSON.stringify({
        conversation_id,
        user_message,
        ai_response: aiResponse,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("ERROR:", err);
    return new Response(JSON.stringify({ error: err.toString() }), {
      status: 500,
    });
  }
});
