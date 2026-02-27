import { openai, supabase } from "./clients.ts";
import { safeSupabase } from "./safe_helpers.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   PHASE 1 — AI MODE + HUMAN OVERRIDE + ENTITY LOCK + SUMMARY CACHE
============================================================================ */
// AI mode is stored on conversations.ai_mode (text). Keep this union broad so
// older rows remain valid and newer stricter modes can be introduced safely.
export type AiMode = "auto" | "off" | "kb_only";

export function mergeEntities(
  prev: Record<string, any> | null,
  next: Record<string, any> | null
) {
  const out: Record<string, any> = { ...(prev ?? {}) };
  for (const [k, v] of Object.entries(next ?? {})) {
    // Phase 2: do not allow weak/empty extraction to wipe existing locks
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

function _buildRollingSummary(params: {
  prevSummary: string | null;
  userMessage: string;
  aiReply: string;
  maxChars?: number;
}) {
  const maxChars = params.maxChars ?? 1400;

  const u = (params.userMessage || "").replace(/\s+/g, " ").trim();
  const a = (params.aiReply || "").replace(/\s+/g, " ").trim();

  const newLine = `U: ${u}\nA: ${a}`.trim();

  const prev = (params.prevSummary || "").trim();
  const combined = prev ? `${prev}\n---\n${newLine}` : newLine;

  // Hard cap (keep most recent)
  if (combined.length <= maxChars) return combined;

  // Keep last chunk
  return combined.slice(combined.length - maxChars);
}

export async function wasHumanActiveRecently(params: {
  conversationId: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
  seconds?: number;
}): Promise<boolean> {
  const seconds = params.seconds ?? 60;

  // P1-A: load the most recent *agent* message, not the most recent message overall.
  const lastAgent = await safeSupabase<{ created_at: string }>(
    "load_last_agent_message",
    params.logger,
    () =>
      supabase
        .from("messages")
        .select("created_at")
        .eq("organization_id", params.organizationId)
        .eq("conversation_id", params.conversationId)
        .eq("sender", "agent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
  );

  if (!lastAgent) return false;

  const ts = Date.parse(lastAgent.created_at);
  if (!Number.isFinite(ts)) return false;

  const ageMs = Date.now() - ts;
  return ageMs >= 0 && ageMs <= seconds * 1000;
}

/* ============================================================================
   AI ENTITY EXTRACTION (SMART UNDERSTANDING, NO RULES)
============================================================================ */

export type AiExtractedIntent = {
  vehicle_model: string | null;
  vehicle_variant: string | null;
  fuel_type: string | null;
  transmission: "Manual" | "Automatic" | "DCA" | "AMT" | null;
  manufacturing_year: string | null;
  intent: "pricing" | "features" | "service" | "offer" | "other";
};

export async function extractUserIntentWithAI(params: {
  userMessage: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<AiExtractedIntent> {
  const { userMessage, logger } = params;

  // Keep prompts split as system + user for better JSON compliance.
  const systemPrompt = `
You are a strict JSON generator.

Task: Extract structured entities from a customer message for a car dealership chatbot.

Output requirements:
- Return ONLY a single JSON object (no markdown, no prose, no code fences).
- All keys must be present.
- Use null when unknown.
- Types must match exactly.

Schema (all keys required):
{
  "vehicle_model": string | null,
  "vehicle_variant": string | null,
  "fuel_type": string | null,
  "transmission": "Manual" | "Automatic" | "DCA" | "AMT" | null,
  "manufacturing_year": string | null,
  "intent": "pricing" | "features" | "service" | "offer" | "other"
}

Rules:
- Insurance, on-road price, RTO, EMI all fall under "pricing".
- Fix spelling mistakes silently.
- manufacturing_year must be a 4-digit year as a string (e.g., "2026") or null.
`.trim();

  // Provide the user message separately to avoid prompt injection and to keep it out of logs.
  const userPayload = {
    customer_message: userMessage,
  };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" } as any,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
    });

    const text = resp.choices?.[0]?.message?.content ?? "{}";

    try {
      return JSON.parse(text);
    } catch (parseErr) {
      // Log raw model output once for debugging, but do not leak PII.
      logger.warn("[ai-extract] JSON.parse failed (response_format=json_object)", {
        error: String(parseErr),
        model: "gpt-4o-mini",
        output_preview: String(text).slice(0, 600),
        output_length: String(text).length,
      });

      return {
        vehicle_model: null,
        vehicle_variant: null,
        fuel_type: null,
        transmission: null,
        manufacturing_year: null,
        intent: "other",
      };
    }
  } catch (err) {
    logger.warn("[ai-extract] failed, falling back to nulls", { error: err });
    return {
      vehicle_model: null,
      vehicle_variant: null,
      fuel_type: null,
      transmission: null,
      manufacturing_year: null,
      intent: "other",
    };
  }
}
