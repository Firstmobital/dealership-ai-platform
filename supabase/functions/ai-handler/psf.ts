import { openai, supabase } from "./clients.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   PSF HELPERS
============================================================================ */

export async function loadOpenPsfCaseByConversation(conversationId: string) {
  const { data } = await supabase
    .from("psf_cases")
    .select("id, campaign_id, sentiment, first_customer_reply_at")
    .eq("conversation_id", conversationId)
    .eq("resolution_status", "open")
    .maybeSingle();

  return data;
}

export async function classifyPsfSentiment(
  logger: ReturnType<typeof createLogger>,
  message: string
): Promise<{
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
}> {
  const prompt = `
You are classifying customer service feedback.

Rules:
- Positive = satisfied, happy, good, excellent
- Negative = complaint, delay, rude, billing issue, unhappy
- Neutral = unclear, mixed, very short

Return STRICT JSON:
{
  "sentiment": "positive | negative | neutral",
  "summary": "1 short line summary"
}
`.trim();

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: message },
    ],
  });

  const text = resp.choices?.[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(text);
  } catch {
    logger.warn("[psf] sentiment parse failed", { text });
    return { sentiment: "neutral", summary: "Feedback received" };
  }
}
