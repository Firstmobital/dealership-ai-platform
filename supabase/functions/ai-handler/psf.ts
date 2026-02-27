import { supabase } from "./clients.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   PSF HELPERS
============================================================================ */

export type TenancyFilter = { col: string; op: "eq"; value: unknown };

export function buildOpenPsfCaseFilters(params: {
  conversationId: string;
  organizationId: string;
}): TenancyFilter[] {
  return [
    { col: "conversation_id", op: "eq", value: params.conversationId },
    { col: "organization_id", op: "eq", value: params.organizationId },
    { col: "resolution_status", op: "eq", value: "open" },
  ];
}

export async function loadOpenPsfCaseByConversation(
  conversationId: string,
  organizationId: string
) {
  const filters = buildOpenPsfCaseFilters({ conversationId, organizationId });

  let q = supabase
    .from("psf_cases")
    .select("id, campaign_id, sentiment, first_customer_reply_at");

  for (const f of filters) q = q.eq(f.col, f.value);

  const { data } = await q.maybeSingle();

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

  // Lazy-load OpenAI client so importing psf.ts doesn't require OPENAI_API_KEY
  // (tests and non-AI codepaths can still import tenancy helpers safely).
  const { openai } = await import("./clients.ts");

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
