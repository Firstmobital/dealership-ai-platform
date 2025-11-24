import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

serve(async (req: Request) => {
  try {
    const body = await req.json();
    const question = body.question?.trim() ?? "";

    if (!question) {
      return new Response(JSON.stringify({ error: "Missing question" }), {
        status: 400,
      });
    }

    const prompt = `
You are an automotive dealership knowledge base writer.
Given the following customer question, generate a detailed, correct KB article answer.

Question:
"${question}"

Write:
- Title
- Summary
- Detailed answer
- Bullet points where useful
`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const content = resp.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ content }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ai-generate-kb] error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
    });
  }
});
