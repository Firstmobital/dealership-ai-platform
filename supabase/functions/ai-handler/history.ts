import {
  GEMINI_MODEL_FAST,
  GEMINI_MODEL_MAIN,
  OPENAI_MODEL_FAST,
  OPENAI_MODEL_MAIN,
} from "./env.ts";
import { openai } from "./clients.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   PHASE P3 — TOKEN BUDGET + MODEL ROUTING
============================================================================ */
// NOTE: Token estimation is approximate (chars/4). We use it for:
// - dynamic context packing
// - cost control
// - rate limiting estimates
export function estimateTokensFromText(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  // A conservative heuristic for mixed English + numbers.
  return Math.max(1, Math.ceil(t.length / 4));
}

export function estimateTokensFromMessages(msgs: ChatMsg[]): number {
  return (msgs || []).reduce(
    (sum, m) => sum + estimateTokensFromText(m.content) + 4,
    0
  );
}

export function truncateTextToTokenLimit(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const approxMaxChars = maxTokens * 4;
  if ((text || "").length <= approxMaxChars) return text;
  // Trim with a small safety margin to avoid overshooting.
  return (text || "").slice(0, Math.max(0, approxMaxChars - 80)).trim();
}

export function extractPricingFocusedContext(text: string, maxChars: number): string {
  const src = (text || "").trim();
  if (!src) return "";

  // Keep lines that likely contain pricing + a little neighborhood context.
  const lines = src.split("\n");
  const keep = new Set<number>();

  const isPricingLine = (l: string) => {
    const t = l.toLowerCase();
    return (
      t.includes("₹") ||
      t.includes("rs") ||
      t.includes("inr") ||
      t.includes("price") ||
      t.includes("pricing") ||
      t.includes("on-road") ||
      t.includes("on road") ||
      t.includes("emi") ||
      t.includes("discount") ||
      /\d/.test(l) // any numeric signal
    );
  };

  for (let i = 0; i < lines.length; i++) {
    if (isPricingLine(lines[i])) {
      // keep this line + 2 lines before/after for context
      for (
        let j = Math.max(0, i - 2);
        j <= Math.min(lines.length - 1, i + 2);
        j++
      ) {
        keep.add(j);
      }
    }
  }

  const picked = [...keep]
    .sort((a, b) => a - b)
    .map((i) => lines[i])
    .join("\n")
    .trim();

  if (!picked) {
    // fallback: don’t return empty if we failed to detect pricing lines
    return src.slice(0, Math.min(maxChars, src.length));
  }

  return picked.length > maxChars ? picked.slice(0, maxChars) : picked;
}

export function packHistoryByTokenBudget(params: {
  history: ChatMsg[];
  maxTokens: number;
}): { packed: ChatMsg[]; usedTokens: number } {
  const { history, maxTokens } = params;
  const msgs = Array.isArray(history) ? history : [];
  if (!msgs.length) return { packed: [], usedTokens: 0 };

  // Always keep the last user message.
  const last = msgs[msgs.length - 1];
  let used = estimateTokensFromText(last.content) + 4;
  const packed: ChatMsg[] = [last];

  // Walk backwards and prepend while we have budget.
  for (let i = msgs.length - 2; i >= 0; i--) {
    const m = msgs[i];
    const t = estimateTokensFromText(m.content) + 4;
    if (used + t > maxTokens) break;
    packed.unshift(m);
    used += t;
  }

  return { packed, usedTokens: used };
}

export function modelTokenLimits(model: string): {
  maxContext: number;
  reserveOutput: number;
} {
  // Safe defaults. You can tune per model later.
  // We keep a decent output reserve to avoid truncation mid-answer.
  const lower = (model || "").toLowerCase();
  if (lower.includes("4o")) return { maxContext: 16000, reserveOutput: 900 };
  if (lower.includes("1.5-pro"))
    return { maxContext: 12000, reserveOutput: 900 };
  if (lower.includes("1.5-flash"))
    return { maxContext: 8000, reserveOutput: 700 };
  return { maxContext: 8000, reserveOutput: 700 };
}

export function chooseRoutedModel(params: {
  provider: "openai" | "gemini";
  configuredModel: string;
  channel: string;
  kbConfidence: "strong" | "weak" | "none";
  aiMode: string | null;
  userMessage: string;
  hasWorkflow: boolean;
}): string {
  const {
    provider,
    configuredModel,
    channel,
    kbConfidence,
    aiMode,
    userMessage,
    hasWorkflow,
  } = params;

  // If org explicitly set a model (not "auto"), respect it.
  const explicit = (configuredModel || "").trim();
  const isAuto = !explicit || explicit.toLowerCase() === "auto";
  if (!isAuto) return explicit;

  const msg = (userMessage || "").trim();
  const len = msg.length;
  const lower = msg.toLowerCase();

  // WhatsApp: default to fast unless the turn is clearly complex.
  const isComplex =
    len > 240 ||
    /\b(compare|explain|why|how|difference|pros|cons|finance|loan|emi|features|spec|variant)\b/.test(
      lower
    );

  // kb_only: no need for big model — we should answer strictly from context.
  const preferFast =
    channel === "whatsapp" ||
    aiMode === "kb_only" ||
    (kbConfidence === "strong" && !isComplex && !hasWorkflow);

  if (provider === "gemini") {
    return preferFast ? GEMINI_MODEL_FAST : GEMINI_MODEL_MAIN;
  }

  return preferFast ? OPENAI_MODEL_FAST : OPENAI_MODEL_MAIN;
}

export function getRequestId(req: Request): string {
  return (
    req.headers.get("x-request-id") ??
    req.headers.get("x-correlation-id") ??
    crypto.randomUUID()
  );
}

/* ============================================================================
   CHAT HISTORY → LLM MESSAGES (STATEFUL FIX)
============================================================================ */
export type ChatMsg = { role: "user" | "assistant"; content: string };

function toChatRole(sender: string): "user" | "assistant" {
  const s = (sender || "").toLowerCase();
  if (s === "bot" || s === "assistant" || s === "agent") return "assistant";
  return "user"; // customer
}

export function buildChatMessagesFromHistory(
  rows: { sender: string; text: string | null }[],
  latestUserMessage: string
): ChatMsg[] {
  const msgs: ChatMsg[] = [];

  for (const r of rows) {
    const content = (r.text ?? "").trim();
    if (!content) continue;
    msgs.push({ role: toChatRole(r.sender), content });
  }

  // If inbound user message was already inserted before ai-handler runs,
  // it will already be the last "user" message. Avoid duplicate.
  const last = msgs[msgs.length - 1];
  if (!last || !(last.role === "user" && last.content === latestUserMessage)) {
    msgs.push({ role: "user", content: latestUserMessage });
  }

  // Keep a stable window
  return msgs.slice(-20);
}

export async function validateGroundedness(params: {
  answer: string;
  userMessage: string;
  kbContext: string;
  campaignContext: string;
  logger: ReturnType<typeof createLogger>;
  failClosed?: boolean;
}): Promise<{ grounded: boolean; revised_answer?: string; issues?: string[] }> {
  const { answer, userMessage, kbContext, campaignContext, logger } = params;

  // Nothing to validate against
  const sources = `${(kbContext || "").trim()}\n\n${(
    campaignContext || ""
  ).trim()}`.trim();
  if (!sources) return { grounded: true };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" } as any,
      messages: [
        {
          role: "system",
          content:
            "You are a groundedness validator. Only allow answers that are supported by the provided SOURCES. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Check whether the ANSWER contains any factual claims (prices, offers, timelines, specs, availability) that are NOT supported by SOURCES. Treat ₹ formatting and comma separators as equivalent (e.g., ₹10,19,990 == 1019990). If the ANSWER is purely a clarification question or a safe handoff (and makes no factual claims), mark it grounded=true. If not grounded, rewrite it to be fully grounded by removing unsupported specifics while staying helpful.",
            userMessage,
            sources,
            answer,
            output_schema: {
              grounded: "boolean",
              issues: "string[] (brief)",
              revised_answer:
                "string (only if grounded=false; a grounded rewrite)",
            },
          }),
        },
      ],
    });

    const text = resp.choices?.[0]?.message?.content ?? "{}";
    const json = JSON.parse(text);

    const grounded = Boolean(json.grounded);
    const revised =
      typeof json.revised_answer === "string"
        ? json.revised_answer.trim()
        : undefined;
    const issues = Array.isArray(json.issues)
      ? json.issues.map(String).slice(0, 6)
      : undefined;

    if (!grounded) {
      logger.warn("[groundedness] ungrounded answer detected", { issues });
    }

    return { grounded, revised_answer: revised, issues };
  } catch (e) {
    logger.warn("[groundedness] validator error", {
      error: String(e),
      failClosed: Boolean(params.failClosed),
    });

    if (params.failClosed) {
      return {
        grounded: false,
        revised_answer:
          "I can help — please confirm the exact variant (fuel + transmission), and I’ll share the correct details. If you want, I can connect you to a sales advisor to confirm the latest info.",
        issues: ["validator_error_fail_closed"],
      };
    }

    // Fail open only for low-risk queries
    return { grounded: true };
  }
}
