// supabase/functions/ai-handler/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { logAuditEvent } from "../_shared/audit.ts";
import {
  requireUser,
  requireOrgMembership,
  isInternalRequest,
} from "../_shared/auth.ts";

/* ============================================================================
   ENV
============================================================================ */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";
const OPENAI_MODEL_FAST = Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";
const OPENAI_MODEL_MAIN = Deno.env.get("OPENAI_MODEL_MAIN") || "gpt-4o";
const GEMINI_MODEL_FAST =
  Deno.env.get("GEMINI_MODEL_FAST") || "gemini-1.5-flash";
const GEMINI_MODEL_MAIN = Deno.env.get("GEMINI_MODEL_MAIN") || "gemini-1.5-pro";

const AI_NO_REPLY_TOKEN = "<NO_REPLY>";

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[ai-handler] Missing env vars", {
    hasProjectUrl: !!PROJECT_URL,
    hasServiceRoleKey: !!SERVICE_ROLE_KEY,
    hasOpenAI: !!OPENAI_API_KEY,
    hasGemini: !!GEMINI_API_KEY,
  });
}

const KB_DISABLE_LEXICAL =
  (Deno.env.get("KB_DISABLE_LEXICAL") || "").toLowerCase() === "true";

/* ============================================================================
   CLIENTS
============================================================================ */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const gemini = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============================================================================
   LOGGING
============================================================================ */
type LogContext = {
  request_id: string;
  conversation_id?: string;
  organization_id?: string;
  channel?: string;
};

function createLogger(ctx: LogContext) {
  const base = {
    request_id: ctx.request_id,
    conversation_id: ctx.conversation_id,
    organization_id: ctx.organization_id,
    channel: ctx.channel,
  };

  return {
    info(message: string, extra: Record<string, any> = {}) {
      console.log(
        JSON.stringify({ level: "info", message, ...base, ...extra })
      );
    },
    warn(message: string, extra: Record<string, any> = {}) {
      console.warn(
        JSON.stringify({ level: "warn", message, ...base, ...extra })
      );
    },
    error(message: string, extra: Record<string, any> = {}) {
      console.error(
        JSON.stringify({ level: "error", message, ...base, ...extra })
      );
    },
    debug(message: string, extra: Record<string, any> = {}) {
      console.log(
        JSON.stringify({ level: "debug", message, ...base, ...extra })
      );
    },
  };
}

type KBScoredRow = {
  id: string;
  article_id: string;
  title: string;
  chunk: string;
  similarity?: number; // undefined for lexical-only
  rank?: number; // keep lexical signal for debugging / confidence
  score: number;
};

type KBCandidate = {
  id: string;
  article_id: string;
  title: string;
  chunk: string;
  similarity?: number; // vector similarity 0..1
  rank?: number; // lexical rank (ts_rank_cd), > 0
  score: number; // combined score
};

function normalizeLexicalRank(r?: number): number {
  if (!r || r <= 0) return 0;
  // ts_rank_cd varies; clamp to 0..1 with a soft divisor you can tune later
  return Math.min(1, r / 2.5);
}

function combinedScore(
  sim?: number,
  rank?: number,
  intent: "pricing" | "offer" | "features" | "service" | "other" = "other"
): number {
  const v = sim ?? 0;
  const l = normalizeLexicalRank(rank);

  // Intent-aware weights:
  // Pricing/offer needs lexical + exact matches more than embeddings.
  if (intent === "pricing" || intent === "offer") {
    return 0.6 * (sim ?? 0) + 0.4 * normalizeLexicalRank(rank);
  }

  // Features/specs usually fine with embeddings
  return 0.65 * v + 0.35 * l;
}

/* ============================================================================
   SAFE HELPERS
============================================================================ */
async function safeSupabase<T>(
  opName: string,
  logger: ReturnType<typeof createLogger>,
  fn: () => Promise<{ data: T | null; error: any }>
): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      logger.error(`[supabase] ${opName} error`, { error });
      return null;
    }
    return data;
  } catch (err) {
    logger.error(`[supabase] ${opName} fatal`, { error: err });
    return null;
  }
}

async function safeWhatsAppSend(
  logger: ReturnType<typeof createLogger>,
  payload: any
): Promise<boolean> {
  try {
    const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        ...(INTERNAL_API_KEY ? { "x-internal-api-key": INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "<body read error>");
      logger.error("[whatsapp-send] non-OK response", {
        status: res.status,
        body: text,
        payload,
      });
      return false;
    }

    return true;
  } catch (err) {
    logger.error("[whatsapp-send] fetch failed", { error: err, payload });
    return false;
  }
}

function safeText(v: any): string {
  return typeof v === "string" ? v : "";
}

/* ============================================================================
   INTENT HEURISTICS (FAILSAFE)
============================================================================ */
// Lightweight keyword heuristics used ONLY when AI extraction is missing/weak.
// This prevents "intent: other" from breaking pricing/offer flows.
function inferIntentHeuristic(userMessage: string): {
  intent: "pricing" | "offer" | "features" | "service" | "other";
  signals: string[];
} {
  const msg = (userMessage || "").toLowerCase();
  const signals: string[] = [];

  const hasAny = (arr: string[]) => arr.some((k) => msg.includes(k));

  const pricingKeys = [
    "price",
    "pricing",
    "prize",
    "onroad",
    "exshowroom",
    "on road",
    "on-road",
    "ex showroom",
    "ex-showroom",
    "emi",
    "down payment",
    "dp",
    "insurance",
    "rto",
    "registration",
    "tcs",
    "quotation",
    "quote",
    "breakup",
    "cost",
    // Hindi / Hinglish
    "कीमत",
    "क़ीमत",
    "दाम",
    "प्राइस",
    "price kya",
    "price kya hai",
    "on road price",
    "ऑन रोड",
    "ऑन-रोड",
    "एक्स शोरूम",
    "एक्स-शोरूम",
  ];
  const offerKeys = [
    "discount",
    "offer",
    "deal",
    "scheme",
    "exchange bonus",
    "exchange",
    "corporate",
    "loyalty",
    // Hindi / Hinglish
    "डिस्काउंट",
    "ऑफर",
    "स्कीम",
    "scheme kya",
    "koi offer",
    "best offer",
  ];
  const featuresKeys = [
    "feature",
    "features",
    "spec",
    "specs",
    "mileage",
    "range",
    "bhp",
    "torque",
    "safety",
    "sunroof",
    "variants",
  ];
  const serviceKeys = [
    "service",
    "servicing",
    "maintenance",
    "workshop",
    "pickup",
    "drop",
    "appointment",
    "schedule",
    "cost of service",
  ];

  if (hasAny(pricingKeys)) signals.push("pricing_keywords");
  if (hasAny(offerKeys)) signals.push("offer_keywords");
  if (hasAny(featuresKeys)) signals.push("features_keywords");
  if (hasAny(serviceKeys)) signals.push("service_keywords");

  // Precedence: offer > pricing (when both present, assume offer question)
  if (hasAny(offerKeys)) return { intent: "offer", signals };
  if (hasAny(pricingKeys)) return { intent: "pricing", signals };
  if (hasAny(featuresKeys)) return { intent: "features", signals };
  if (hasAny(serviceKeys)) return { intent: "service", signals };

  return { intent: "other", signals };
}
/* ============================================================================
   PHASE P3 — TOKEN BUDGET + MODEL ROUTING
============================================================================ */
// NOTE: Token estimation is approximate (chars/4). We use it for:
// - dynamic context packing
// - cost control
// - rate limiting estimates
function estimateTokensFromText(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  // A conservative heuristic for mixed English + numbers.
  return Math.max(1, Math.ceil(t.length / 4));
}

function estimateTokensFromMessages(msgs: ChatMsg[]): number {
  return (msgs || []).reduce(
    (sum, m) => sum + estimateTokensFromText(m.content) + 4,
    0
  );
}

function truncateTextToTokenLimit(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const approxMaxChars = maxTokens * 4;
  if ((text || "").length <= approxMaxChars) return text;
  // Trim with a small safety margin to avoid overshooting.
  return (text || "").slice(0, Math.max(0, approxMaxChars - 80)).trim();
}

function extractPricingFocusedContext(text: string, maxChars: number): string {
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
      t.includes("ex-showroom") ||
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

function packHistoryByTokenBudget(params: {
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

function modelTokenLimits(model: string): {
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

function chooseRoutedModel(params: {
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

function getRequestId(req: Request): string {
  return (
    req.headers.get("x-request-id") ??
    req.headers.get("x-correlation-id") ??
    crypto.randomUUID()
  );
}

/* ============================================================================
   PHASE 4 — TRACE HELPERS (OBSERVABILITY)
============================================================================ */
async function traceInsertStart(params: {
  trace_id: string;
  organization_id: string;
  conversation_id: string;
  request_id: string;
  channel: string;
  caller_type: "internal" | "user";
  user_text: string;
}) {
  try {
    await supabase.from("ai_turn_traces").insert({
      id: params.trace_id,
      organization_id: params.organization_id,
      conversation_id: params.conversation_id,
      request_id: params.request_id,
      channel: params.channel,
      caller_type: params.caller_type,
      user_text: params.user_text,
      status: "started",
      started_at: new Date().toISOString(),
    });
  } catch {
    // never break ai-handler because of tracing
  }
}

async function traceUpdate(trace_id: string, patch: Record<string, any>) {
  try {
    await supabase.from("ai_turn_traces").update(patch).eq("id", trace_id);
  } catch {
    // never break ai-handler because of tracing
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ============================================================================
   PHASE 0 — PRICING SAFETY HELPERS (HARD BLOCKS)
============================================================================ */

function answerLooksLikePricingOrOffer(text: string): boolean {
  return looksLikePricingOrOfferContext(text);
}

function looksLikePricingOrOfferContext(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return false;

  const keywords = [
    "₹",
    " rs",
    "inr",
    "price",
    "pricing",
    "on-road",
    "on road",
    "ex-showroom",
    "ex showroom",
    "discount",
    "offer",
    "emi",
    "down payment",
    "rto",
    "insurance",
    "booking",
    "finance",
  ];

  if (keywords.some((k) => t.includes(k))) return true;

  // Numeric patterns that often indicate price/discount (₹ 12,34,567 / 123456 / 40k etc.)
  const hasLargeNumber = /\b\d{5,}\b/.test(t) || /\b\d{1,2}\s?%\b/.test(t);
  const hasKNotation = /\b\d{1,3}\s?(k|lac|lakh|cr|crore)\b/.test(t);
  return hasLargeNumber || hasKNotation;
}

function redactUserProvidedPricing(text: string): string {
  // PHASE 4 — Unverified facts firewall:
  // For pricing/offers intents, user-provided numbers are never authoritative.
  // We keep conversational structure but prevent the model from "learning" or repeating numeric claims.
  const original = text || "";
  let t = original;

  // Redact currency-like fragments
  t = t.replace(/₹\s*[0-9][0-9,\.\s]*/gi, "₹[REDACTED]");
  t = t.replace(/\b(rs\.?|inr)\s*[0-9][0-9,\.\s]*/gi, "$1 [REDACTED]");

  t = t.replace(/\b\d{2,}(?:[\d,\.]*\d)?\b/g, "[REDACTED_NUMBER]");
  t = t.replace(/\b\d{1,3}\s?(k|lac|lakh|cr|crore)\b/gi, "[REDACTED_AMOUNT]");

  t = t.replace(/\b\d+\b/g, "[REDACTED_NUMBER]");

  // If the message looks like a pricing/offer claim, explicitly tag it as unverified.
  const needsTag = looksLikePricingOrOfferContext(original) || t !== original;
  if (needsTag) {
    t = `[USER_UNVERIFIED_PRICING_CLAIM] ${t}`;
  }

  return t;
}

/* ============================================================================
   PHASE 1 — AI MODE + HUMAN OVERRIDE + ENTITY LOCK + SUMMARY CACHE
============================================================================ */
// AI mode is stored on conversations.ai_mode (text). Keep this union broad so
// older rows remain valid and newer stricter modes can be introduced safely.
type AiMode = "auto" | "off" | "kb_only";

function mergeEntities(
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

function buildRollingSummary(params: {
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

async function wasHumanActiveRecently(params: {
  conversationId: string;
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
   CHAT HISTORY → LLM MESSAGES (STATEFUL FIX)
============================================================================ */
type ChatMsg = { role: "user" | "assistant"; content: string };

function toChatRole(sender: string): "user" | "assistant" {
  const s = (sender || "").toLowerCase();
  if (s === "bot" || s === "assistant" || s === "agent") return "assistant";
  return "user"; // customer
}

function buildChatMessagesFromHistory(
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

async function validateGroundedness(params: {
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
            task: "Check whether the ANSWER contains any factual claims (prices, offers, timelines, specs, availability) that are NOT supported by SOURCES. If the ANSWER is purely a clarification question or a safe handoff (and makes no factual claims), mark it grounded=true. If not grounded, rewrite it to be fully grounded by removing unsupported specifics while staying helpful.",
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

/* ============================================================================
   PSF HELPERS
============================================================================ */

async function loadOpenPsfCaseByConversation(conversationId: string) {
  const { data } = await supabase
    .from("psf_cases")
    .select("id, campaign_id, sentiment, first_customer_reply_at")
    .eq("conversation_id", conversationId)
    .eq("resolution_status", "open")
    .maybeSingle();

  return data;
}

async function classifyPsfSentiment(
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

/* ============================================================================
   WALLET HELPERS — PHASE 5
============================================================================ */
async function loadWalletForOrg(organizationId: string) {
  const { data, error } = await supabase
    .from("wallets")
    .select("id, balance, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.status !== "active") return null;

  return data;
}

async function createWalletDebit(params: {
  walletId: string;
  organizationId: string;
  amount: number;
  aiUsageId: string;
}) {
  if (!params.organizationId) {
    console.error(
      "[wallet] missing organizationId in createWalletDebit",
      params
    );
    return null;
  }

  const { data, error } = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: params.walletId,
      organization_id: params.organizationId, // ✅ ADD THIS LINE
      type: "debit",
      direction: "out",
      amount: params.amount,
      reference_type: "ai_usage",
      reference_id: params.aiUsageId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[wallet] debit insert error", error);
    return null;
  }

  return data.id;
}

/* ============================================================================
   GREETING DETECTOR (HARD RULE)
============================================================================ */
function isGreetingMessage(input: string): boolean {
  const t = (input || "").trim().toLowerCase();

  const greetings = new Set([
    "hi",
    "hey",
    "hello",
    "hii",
    "heyy",
    "hlo",
    "helo",
    "yo",
    "namaste",
    "namaskar",
    "good morning",
    "good afternoon",
    "good evening",
    "gm",
    "ga",
    "ge",
  ]);

  if (greetings.has(t)) return true;
  if (t.startsWith("hi ")) return true;
  if (t.startsWith("hey ")) return true;
  if (t.startsWith("hello ")) return true;
  if (t.startsWith("namaste ")) return true;
  if (t.startsWith("good morning")) return true;
  if (t.startsWith("good afternoon")) return true;
  if (t.startsWith("good evening")) return true;

  return false;
}

function isShortFollowupMessage(msg: string): boolean {
  const t = (msg || "").trim().toLowerCase();
  if (!t) return false;
  // Keep conservative: only short generic follow-ups
  const phrases = [
    "tell me more",
    "more",
    "details",
    "detail",
    "ok",
    "okay",
    "yes",
    "y",
    "haan",
    "ha",
    "sure",
    "continue",
    "next",
    "k",
    "pls",
    "please",
  ];
  if (phrases.includes(t)) return true;
  if (t.length <= 12 && /^[a-z\s]+$/.test(t)) return true;
  return false;
}

function isExplicitTopicChange(msg: string): boolean {
  const t = (msg || "").toLowerCase();
  // Explicit switches only. If present, do NOT force continuity.
  const patterns = [
    /\bdifferent\b/,
    /\banother\b/,
    /\bchange\b/,
    /\bother\b/,
    /\bvariant\b/,
    /\bmodel\b/,
    /\bharrier\b/,
    /\bnexon\b/,
    /\bsafari\b/,
    /\btiago\b/,
    /\btigor\b/,
    /\baltroz\b/,
    /\bpunch\b/,
    /\bservice\b/,
    /\bbooking\b/,
    /\btest drive\b/,
  ];
  return patterns.some((p) => p.test(t));
}

/* ============================================================================
   SEMANTIC QUERY REWRITE (FOLLOW-UP AWARE)
============================================================================ */
function buildSemanticQueryText(params: {
  userMessage: string;
  isFollowUp: boolean;
  lockedEntities: Record<string, any> | null;
  extracted: {
    vehicle_model: string | null;
    intent: string;
    fuel_type: string | null;
  };
  campaignContextText: string;
}): string {
  const raw = (params.userMessage || "").trim().replace(/\s+/g, " ");
  if (!raw) return raw;
  if (!params.isFollowUp) return raw;

  const locked = params.lockedEntities || {};
  const model = String(
    params.extracted.vehicle_model || locked.model || ""
  ).trim();
  const intent = String(params.extracted.intent || locked.intent || "other");

  const topic = model ? "about " + model : "about the discussed vehicle/offer";

  // Make follow-ups searchable by including intent-specific keywords
  let focus = "details, features, variants, availability and next steps";
  if (intent === "pricing" || intent === "offer") {
    focus =
      "pricing, offers, discounts, variants, on-road breakup, availability and next steps";
  } else if (intent === "service") {
    focus =
      "service details, schedule, required info, cost estimate and next steps";
  }

  const hasCampaign = Boolean((params.campaignContextText || "").trim());
  const campaignHint = hasCampaign
    ? "Align with any campaign/offer context if present."
    : "";

  // IMPORTANT: do not embed generic follow-up text alone (e.g., "tell me more")
  return (
    "Provide more information " +
    topic +
    ". Focus on " +
    focus +
    ". " +
    campaignHint
  ).trim();
}

/* ============================================================================
   AI ENTITY EXTRACTION (SMART UNDERSTANDING, NO RULES)
============================================================================ */

type AiExtractedIntent = {
  vehicle_model: string | null;
  fuel_type: string | null;
  intent: "pricing" | "features" | "service" | "offer" | "other";
};

async function extractUserIntentWithAI(params: {
  userMessage: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<AiExtractedIntent> {
  const { userMessage, logger } = params;

  const prompt = `
You are helping a car dealership chatbot.

From the customer message below, extract:
- vehicle_model (example: Tigor, Nexon, Tiago) or null
- fuel_type (Petrol, Diesel, CNG, EV) or null
- intent: pricing | features | service | offer | other

Rules:
- Insurance, on-road price, RTO, EMI all fall under "pricing"

Rules:
- Fix spelling mistakes silently
- If unsure, return null for that field
- Return STRICT JSON only

Customer message:
"${userMessage}"
`.trim();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "system", content: prompt }],
    });

    const text = resp.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(text);
  } catch (err) {
    logger.warn("[ai-extract] failed, falling back to nulls", { error: err });
    return {
      vehicle_model: null,
      fuel_type: null,
      intent: "other",
    };
  }
}

/* ============================================================================
   PHASE 4 — PRICING (CUSTOMER) + COST (PLATFORM)
============================================================================ */
const MODEL_CHARGED_PRICE: Record<string, number> = {
  "gpt-4o-mini": 2.5,
  "gemini-2.5-pro": 3.0,
  "gemini-1.5-flash": 2.0,
};

function getChargedAmountForModel(model: string): number {
  return MODEL_CHARGED_PRICE[model] ?? 2.5;
}

function estimateActualCost(params: {
  provider: "openai" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const { provider, model, inputTokens, outputTokens } = params;

  // Approx internal cost estimation for analytics (not customer billing).
  if (provider === "openai") {
    if (model === "gpt-4o-mini") {
      const cost =
        (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.6;
      return Number(cost.toFixed(4));
    }
  }

  if (provider === "gemini") {
    if (model === "gemini-2.5-pro") {
      const cost =
        (inputTokens / 1_000_000) * 1.25 + (outputTokens / 1_000_000) * 3.75;
      return Number(cost.toFixed(4));
    }

    if (model === "gemini-1.5-flash") {
      const cost =
        (inputTokens / 1_000_000) * 0.35 + (outputTokens / 1_000_000) * 1.05;
      return Number(cost.toFixed(4));
    }
  }

  return 0;
}

async function resolveAISettings(params: {
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<{ provider: "openai" | "gemini"; model: string }> {
  const { organizationId, logger } = params;

  const { data } = await supabase
    .from("ai_settings")
    .select("provider, model")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (data?.provider && data?.model) {
    return { provider: data.provider, model: data.model };
  }

  logger.warn("[ai-settings] fallback to default");
  return { provider: "openai", model: "gpt-4o-mini" };
}

/* ============================================================================
   PHASE 4 — PROVIDER ROUTING COMPLETION
============================================================================ */
type AICompletionResult = {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
  provider: "openai" | "gemini";
  model: string;
};

async function runOpenAICompletion(params: {
  model: string;
  systemPrompt: string;
  historyMessages: ChatMsg[];
  logger: ReturnType<typeof createLogger>;
}): Promise<AICompletionResult | null> {
  const { model, systemPrompt, historyMessages, logger } = params;

  try {
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [{ role: "system", content: systemPrompt }, ...historyMessages],
    });

    const text = resp.choices?.[0]?.message?.content?.trim() ?? null;

    return {
      text,
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
      provider: "openai",
      model,
    };
  } catch (err) {
    logger.error("[openai] completion error", { error: err, model });
    return null;
  }
}

async function runGeminiCompletion(params: {
  model: string;
  systemPrompt: string;
  historyMessages: ChatMsg[];
  logger: ReturnType<typeof createLogger>;
}): Promise<AICompletionResult | null> {
  const { model, systemPrompt, historyMessages, logger } = params;

  if (!gemini) {
    logger.warn("[gemini] missing GEMINI_API_KEY; fallback to OpenAI");
    return null;
  }

  try {
    const genModel = gemini.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    });

    // Gemini format: role "user" / "model"
    const history = historyMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastUser = historyMessages[historyMessages.length - 1]?.content ?? "";

    const chat = genModel.startChat({ history });
    const resp = await chat.sendMessage(lastUser);
    const text = resp.response.text()?.trim() ?? null;

    const usage = resp.response.usageMetadata ?? {};

    return {
      text,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      provider: "gemini",
      model,
    };
  } catch (err) {
    logger.error("[gemini] completion error", { error: err, model });
    return null;
  }
}

async function runAICompletion(params: {
  provider: "openai" | "gemini";
  model: string;
  systemPrompt: string;
  historyMessages: ChatMsg[];
  logger: ReturnType<typeof createLogger>;
}): Promise<AICompletionResult | null> {
  if (params.provider === "gemini") {
    const gem = await runGeminiCompletion(params);
    if (gem) return gem;
    return runOpenAICompletion(params as any);
  }
  return runOpenAICompletion(params as any);
}

/* ============================================================================
   PHASE 7A — CAMPAIGN CONTEXT HELPERS (FIXED: NO last_delivered_at)
============================================================================ */
async function fetchCampaignContextForContact(
  organizationId: string,
  contactId: string,
  logger: ReturnType<typeof createLogger>
) {
  const contact = await safeSupabase<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    model: string | null;
    phone: string | null;
  }>("load_contact_for_campaign_context", logger, () =>
    supabase
      .from("contacts")
      .select("id, first_name, last_name, model, phone")
      .eq("id", contactId)
      .maybeSingle()
  );

  if (!contact || !contact.phone) return null;

  const summary = await safeSupabase<{
    delivered_campaigns: string[] | null;
    failed_campaigns: string[] | null;
  }>("load_contact_campaign_summary", logger, () =>
    supabase
      .from("contact_campaign_summary")
      .select("delivered_campaigns, failed_campaigns")
      .eq("organization_id", organizationId)
      .eq("phone", contact.phone)
      .maybeSingle()
  );

  return {
    contact,
    delivered: summary?.delivered_campaigns ?? [],
    failed: summary?.failed_campaigns ?? [],
  };
}

function buildCampaignContextText(ctx: any): string {
  if (!ctx) return "";

  const { contact, delivered, failed } = ctx;

  return `
CAMPAIGN HISTORY CONTEXT (IMPORTANT):

Customer:
- Name: ${contact.first_name ?? "Customer"}
- Vehicle model: ${contact.model ?? "Unknown"}

Campaign delivery history:
- Delivered templates: ${delivered.length ? delivered.join(", ") : "None"}
- Failed templates: ${failed.length ? failed.join(", ") : "None"}

Rules you MUST follow:
- Do NOT repeat offers/templates already delivered.
- If multiple failures exist, acknowledge difficulty reaching the customer.
`.trim();
}

function buildCampaignFactsBlock(
  campaignContext: Record<string, any> | null
): string {
  if (!campaignContext) return "";

  return `
KNOWN FROM CAMPAIGN (DO NOT ASK AGAIN):
${Object.entries(campaignContext)
  .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
  .join("\n")}
`.trim();
}

/* ============================================================================
   BOT PERSONALITY (ORG → SUB-ORG OVERRIDE)
============================================================================ */
async function loadBotPersonality(params: { organizationId: string }) {
  const { organizationId } = params;

  const { data } = await supabase
    .from("bot_personality")
    .select(
      "tone, language, short_responses, emoji_usage, gender_voice, greeting_message, fallback_message, business_context, dos, donts"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  return (
    data ?? {
      tone: "Professional",
      language: "English",
      short_responses: true,
      emoji_usage: false,
      gender_voice: "Neutral",
      greeting_message: "",
      fallback_message:
        "I’m sorry, I don’t have enough information to answer that.",
      business_context: "",
      dos: "",
      donts: "",
    }
  );
}

function normalizeForMatch(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle || needle.length < 3) return false;

  // Enforce word-boundary matching to avoid partial hits
  // e.g. "punch" should NOT match "puncher"
  const h = ` ${haystack} `;
  const n = ` ${needle} `;
  return h.includes(n);
}

function packKbContext(params: {
  rows: KBScoredRow[];
  maxChars: number; // total KB budget
  maxChunks: number; // hard cap
  maxChunkChars: number; // per-chunk cap
  maxPerArticle?: number; // diversity cap per article
}): {
  context: string;
  used: {
    id: string;
    article_id: string;
    title: string;
    similarity?: number;
    score: number;
  }[];
} {
  const {
    rows,
    maxChars,
    maxChunks,
    maxChunkChars,
    maxPerArticle = 4,
  } = params;

  // Diversify by article: prevent 8 chunks from the same doc.
  // Strategy:
  // 1) Group rows by article_id
  // 2) Sort chunks within each article by score desc
  // 3) Sort articles by best score desc
  // 4) Round-robin pick chunks across top articles with per-article cap
  const groups = new Map<string, KBScoredRow[]>();
  const articleTitle = new Map<string, string>();

  for (const r of rows) {
    if (!groups.has(r.article_id)) groups.set(r.article_id, []);
    groups.get(r.article_id)!.push(r);
    if (!articleTitle.has(r.article_id))
      articleTitle.set(r.article_id, r.title);
  }

  const articleOrder = [...groups.entries()]
    .map(([article_id, rs]) => {
      rs.sort((a, b) => b.score - a.score);
      return {
        article_id,
        bestScore: rs[0]?.score ?? 0,
      };
    })
    .sort((a, b) => b.bestScore - a.bestScore);

  const used: {
    id: string;
    article_id: string;
    title: string;
    similarity?: number;
    score: number;
  }[] = [];
  const parts: string[] = [];
  const seen = new Set<string>();
  const usedCountByArticle = new Map<string, number>();
  const nextIndexByArticle = new Map<string, number>();

  let remaining = maxChars;

  // Round-robin across articles until we hit caps/budget
  outer: while (parts.length < maxChunks && remaining > 200) {
    let progressed = false;

    for (const a of articleOrder) {
      if (parts.length >= maxChunks || remaining <= 200) break;

      const already = usedCountByArticle.get(a.article_id) ?? 0;
      if (already >= maxPerArticle) continue;

      const idx = nextIndexByArticle.get(a.article_id) ?? 0;
      const rs = groups.get(a.article_id) ?? [];
      if (idx >= rs.length) continue;

      const r = rs[idx];
      nextIndexByArticle.set(a.article_id, idx + 1);

      const raw = (r.chunk || "").trim();
      if (!raw) continue;

      // Dedup by normalized prefix
      const key = normalizeForMatch(raw).slice(0, 280);
      if (seen.has(key)) continue;
      seen.add(key);

      // Trim chunk to reduce token waste
      const chunk =
        raw.length > maxChunkChars ? raw.slice(0, maxChunkChars) : raw;

      const title = r.title || articleTitle.get(a.article_id) || "KB";
      const block = `### ${title}\n${chunk}`;
      if (block.length > remaining) continue;

      parts.push(block);
      remaining -= block.length + 2;

      used.push({
        id: r.id,
        article_id: r.article_id,
        title,
        similarity: r.similarity,
        score: r.score,
      });

      usedCountByArticle.set(a.article_id, already + 1);
      progressed = true;
    }

    if (!progressed) break outer;
  }

  return { context: parts.join("\n\n").trim(), used };
}

function articleMatchesIntent(
  title: string,
  intent: "pricing" | "offer" | "features" | "service" | "other"
): boolean {
  const t = title.toLowerCase();

  if (intent === "pricing" || intent === "offer") {
    return (
      t.includes("price") ||
      t.includes("pricing") ||
      t.includes("on-road") ||
      t.includes("ex-showroom") ||
      t.includes("offer")
    );
  }

  if (intent === "features") {
    return t.includes("feature") || t.includes("spec") || t.includes("variant");
  }

  return true;
}

/* ============================================================================
   SEMANTIC KB RESOLVER (EMBEDDINGS-BASED)
============================================================================ */
async function rerankCandidates(params: {
  query: string;
  candidates: KBCandidate[];
  logger: ReturnType<typeof createLogger>;
}) {
  const { query, candidates, logger } = params;

  const scoreAt = (i: number) =>
    candidates[Math.min(i, candidates.length - 1)]?.score ?? 0;
  const gap = scoreAt(0) - scoreAt(5); // compare #1 vs #6
  const looksHighRisk = looksLikePricingOrOfferContext(query);

  // Rerank only when:
  // - high-risk query (pricing/offer/spec/policy-ish), OR
  // - the scores are “close” (ambiguous retrieval)
  const shouldRerank = candidates.length > 6 && (looksHighRisk || gap < 0.08);

  if (!shouldRerank) return candidates;

  const items = candidates.slice(0, 12).map((c, idx) => ({
    idx,
    id: c.id,
    title: c.title,
    chunk: c.chunk.slice(0, 700),
  }));

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are a retrieval reranker. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            query,
            instruction:
              "Rank chunks by how directly they help answer the query. Prefer chunks with exact policy/price/specs when asked. Output JSON: { ranked: [{ idx, reason }] }",
            items,
          }),
        },
      ],
      response_format: { type: "json_object" } as any,
    });

    const text = resp.choices?.[0]?.message?.content ?? "{}";
    const json = JSON.parse(text);

    const rankedIdx: number[] = (json.ranked ?? [])
      .map((r: any) => Number(r.idx))
      .filter((n: any) => Number.isFinite(n));

    if (!rankedIdx.length) return candidates;

    const reordered: KBCandidate[] = [];
    const used = new Set<number>();

    for (const i of rankedIdx) {
      if (i >= 0 && i < candidates.length && !used.has(i)) {
        reordered.push(candidates[i]);
        used.add(i);
      }
    }

    // append leftovers
    for (let i = 0; i < candidates.length; i++) {
      if (!used.has(i)) reordered.push(candidates[i]);
    }

    return reordered;
  } catch (e) {
    logger.warn("[kb] rerank failed; fallback to scored order", {
      error: String(e),
    });
    return candidates;
  }
}

async function resolveKnowledgeContextSemantic(params: {
  userMessage: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
  vehicleModel?: string | null;
  intent?: "pricing" | "offer" | "features" | "service" | "other";
  fuelType?: string | null;
}): Promise<{
  context: string;
  article_ids: string[];
  confidence: "strong" | "weak";
  best_similarity: number;
  best_score: number;
  option_titles: string[];
  debug: {
    used: {
      id: string;
      article_id: string;
      similarity: number;
      title: string;
    }[];
    rejected: {
      id: string;
      article_id: string;
      similarity: number;
      title: string;
      reason: string;
    }[];
    thresholds: {
      hardMin: number;
      softMin: number;
      initial: number;
      fallback: number;
    };
  };
} | null> {
  const { userMessage, organizationId, logger } = params;

  const intent = params.intent || "other";

  // Phase 2: Keep KB *strict* to reduce hallucinations.
  // - First pass: higher threshold.
  // - Fallback: slightly lower, but still requires a hard minimum similarity.
  // NOTE: Offer/pricing queries are often phrased generically ("offers running?"),
  // so we allow a bit more recall and let reranking + scoring handle precision.
  const INITIAL_THRESHOLD =
    intent === "offer" ? 0.50 : intent === "pricing" ? 0.55 : 0.58;
  const FALLBACK_THRESHOLD =
    intent === "offer" ? 0.40 : intent === "pricing" ? 0.45 : 0.50;
  const HARD_MIN_SIMILARITY =
    intent === "offer" ? 0.30 : intent === "pricing" ? 0.36 : 0.48;
  const SOFT_MIN_SIMILARITY =
    intent === "offer" ? 0.48 : intent === "pricing" ? 0.52 : 0.55;

  try {
    // 1) Create embedding for user query (Phase 5: cache by org+model+text_hash)
    const EMBED_MODEL = "text-embedding-3-small";
    const raw = (userMessage || "").trim().replace(/\s+/g, " ");

    const normalized = raw
      .replace(/\bsmart\+/gi, "smart plus")
      .replace(/\+/g, " plus ");

          // Short-query expansion (embedding only):
          // If query is very short and intent is pricing/offer, embeddings can be weak.
          // Expand with stable pricing/offer tokens to improve recall without changing user-visible behavior.
          const isShort =
            normalized.length < 18 || normalized.split(/\s+/).filter(Boolean).length < 3;
      
          const embedInput =
            (intent === "pricing" || intent === "offer") && isShort
              ? `${normalized} on-road price breakup ex-showroom insurance rto tcs discount offer scheme variant`
              : normalized;
      
          const textHash = await sha256Hex(embedInput.toLowerCase());

    // Cache lookup (service-role table; never blocks if it fails)
    let embedding: number[] | null = null;
    try {
      const { data: cached, error: cacheErr } = await supabase
        .from("ai_embeddings_cache")
        .select("embedding")
        .eq("organization_id", organizationId)
        .eq("model", EMBED_MODEL)
        .eq("text_hash", textHash)
        .maybeSingle();

      if (!cacheErr && cached?.embedding) {
        embedding = cached.embedding as unknown as number[];
      }
    } catch {
      // ignore cache failures
    }

    if (!embedding) {
      const embeddingResp = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: embedInput,
      });

      const e = embeddingResp.data?.[0]?.embedding;
      if (!e) return null;
      embedding = e as unknown as number[];

      // Cache insert (best-effort)
      try {
        await supabase.from("ai_embeddings_cache").insert({
          organization_id: organizationId,
          model: EMBED_MODEL,
          text_hash: textHash,
          embedding,
        });
      } catch {
        // ignore cache write failures
      }
    }

    const VECTOR_COUNT = 40;
    const LEXICAL_COUNT = 40;

    const runVector = async (threshold: number) => {
      return await supabase.rpc("match_knowledge_chunks_scoped", {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: VECTOR_COUNT,
        p_organization_id: organizationId,
        p_only_published: true,
      });
    };

    const runLexical = async () => {
      return await supabase.rpc("match_knowledge_chunks_lexical_scoped", {
        p_query: normalized,
        match_count: LEXICAL_COUNT,
        p_organization_id: organizationId,
        p_only_published: true,
      });
    };

    // 2) Match KB chunks (strict → fallback)
    let vectorData: any[] = [];
    let vectorErr: any = null;

    let { data: v1, error: e1 } = await runVector(INITIAL_THRESHOLD);
    vectorErr = e1;
    vectorData = (v1 ?? []) as any[];

    if (
      (!vectorData.length || vectorErr) &&
      FALLBACK_THRESHOLD < INITIAL_THRESHOLD
    ) {
      const { data: v2, error: e2 } = await runVector(FALLBACK_THRESHOLD);
      vectorErr = e2;
      vectorData = (v2 ?? []) as any[];
    }

    // Lexical always runs (even if vector hits) to catch exact strings
    let lexData: any[] = [];
    let lexErr: any = null;

    if (!KB_DISABLE_LEXICAL) {
      const { data: lexDataRaw, error } = await runLexical();
      lexErr = error;
      lexData = (lexDataRaw ?? []) as any[];
    } else {
      logger.info("[kb] lexical disabled; skipping lexical rpc");
    }

    if ((!vectorData.length && !lexData.length) || vectorErr) {
      // if vector errors out entirely, treat as no KB (don’t crash)
      if (vectorErr)
        logger.warn("[kb] vector rpc failed", { error: vectorErr });
      if (lexErr) logger.warn("[kb] lexical rpc failed", { error: lexErr });
      if (!vectorData.length && !lexData.length) return null;
    }

    // Merge candidates by chunk id
    const merged = new Map<string, KBCandidate>();

    for (const r of vectorData) {
      const id = String(r.id);
      const sim = Number(r.similarity ?? 0);
      merged.set(id, {
        id,
        article_id: String(r.article_id),
        title: String(r.article_title || "KB"),
        chunk: String(r.chunk || ""),
        similarity: sim,
        score: combinedScore(sim, undefined, intent),
      });
    }

    for (const r of lexData) {
      const id = String(r.id);
      const rank = Number(r.rank ?? 0);
      const existing = merged.get(id);
      if (existing) {
        existing.rank = rank;
        existing.score = combinedScore(existing.similarity, rank, intent);
      } else {
        merged.set(id, {
          id,
          article_id: String(r.article_id),
          title: String(r.article_title || "KB"),
          chunk: String(r.chunk || ""),
          rank,
          score: combinedScore(undefined, rank, intent),
        });
      }
    }

    const rows = [...merged.values()];

    // 3) Post-filter + ranking
    const model = (params.vehicleModel || "").trim();
    const modelNorm = model ? normalizeForMatch(model) : "";

    const used: {
      id: string;
      article_id: string;
      title: string;
      similarity: number;
    }[] = [];
    const rejected: {
      id: string;
      article_id: string;
      title: string;
      similarity: number;
      reason: string;
    }[] = [];

    // Helper: boost if model string appears in title/chunk (never hard-drop)
    function boostScore(params: {
      baseScore: number;
      title: string;
      chunk: string;
      intent: "pricing" | "offer" | "features" | "service" | "other";
    }): number {
      let score = params.baseScore;

      const t = normalizeForMatch(params.title);
      const c = normalizeForMatch(params.chunk);
      const text = `${t} ${c}`;

      // 1) Model boost (your existing logic)
      if (modelNorm) {
        if (t.includes(modelNorm)) score += 0.06; // slightly stronger
        if (containsPhrase(c, modelNorm)) score += 0.04;
      }

      // 2) Intent boost: force pricing queries to rank pricing docs higher
      const pricingSignals = [
        "price",
        "pricing",
        "ex showroom",
        "ex-showroom",
        "on road",
        "on-road",
        "esp",
        "emi",
        "rto",
        "insurance",
        "down payment",
        "discount",
        "offer",
        "final deal",
        "total",
        "breakup",
        "cost",
        "tax",
        "registration",
        "fees",
      ];

      const featuresSignals = [
        "feature",
        "features",
        "spec",
        "specs",
        "variant-wise features",
        "equipment",
        "safety",
        "infotainment",
        "interior",
        "exterior",
        "dimension",
        "capacity",
        "performance",
        "mileage",
        "engine",
        "transmission",
        "tyre",
        "warranty",
      ];

      const isPricingish = pricingSignals.some((k) => text.includes(k));
      const isFeaturesish = featuresSignals.some((k) => text.includes(k));

      if (params.intent === "pricing") {
        if (isPricingish) score += 0.12; // ✅ big bump for pricing articles
        if (isFeaturesish) score -= 0.05; // ✅ slight penalty for feature docs

        // If an "offers" doc matches strongly, allow it but don't let it outrank pricing tables.
        const offerSignals = [
          "discount",
          "offer",
          "scheme",
          "special offer",
          "exchange",
          "corporate",
          "loyalty",
        ];
        const isOfferish = offerSignals.some((k) => text.includes(k));
        if (isOfferish) score += 0.03; // ✅ small bump only (keeps it secondary for pricing intent)
      } else if (params.intent === "offer") {
        // Offers should prefer explicit offer/discount docs over generic pricing tables.
        const offerSignals = [
          "discount",
          "offer",
          "scheme",
          "special offer",
          "exchange",
          "corporate",
          "loyalty",
        ];
        const isOfferish = offerSignals.some((k) => text.includes(k));

        if (isOfferish) score += 0.14; // ✅ strong bump for offer articles
        // If it's only pricing-ish (tables) but not offer-ish, slightly de-prioritize.
        if (isPricingish && !isOfferish) score -= 0.04;
        if (isFeaturesish) score -= 0.05;
      } else if (params.intent === "features") {
        if (isFeaturesish) score += 0.08;
      }

      return score;
    }

    // Reject obvious noise
    const viable: KBScoredRow[] = [];

    for (const r of rows) {
      const chunk = (r.chunk || "").trim();
      if (!chunk) {
        rejected.push({
          id: r.id,
          article_id: r.article_id,
          title: r.title,
          similarity: typeof r.similarity === "number" ? r.similarity : 0,
          reason: "empty_chunk",
        });
        continue;
      }

      // Hard reject only if vector similarity exists AND is below hard min.
      if (
        typeof r.similarity === "number" &&
        r.similarity < HARD_MIN_SIMILARITY
      ) {
        rejected.push({
          id: r.id,
          article_id: r.article_id,
          title: r.title,
          similarity: r.similarity,
          reason: "below_hard_min",
        });
        continue;
      }

      const sim = typeof r.similarity === "number" ? r.similarity : undefined;
      const rank = typeof r.rank === "number" ? r.rank : undefined;

      const baseScore = combinedScore(sim, rank, intent);

      viable.push({
        id: r.id,
        article_id: r.article_id,
        title: r.title,
        chunk,
        similarity: sim,
        rank,
        score: boostScore({
          baseScore,
          title: r.title,
          chunk,
          intent,
        }),
      });
    }

    if (!viable.length) return null;

    // Sort by boosted score desc (tie-break by similarity)
    viable.sort(
      (a, b) => b.score - a.score || (b.similarity ?? 0) - (a.similarity ?? 0)
    );

    // Rerank top candidates for better precision
    const reranked = await rerankCandidates({
      query: normalized,
      candidates: viable.map((v) => ({
        id: v.id,
        article_id: v.article_id,
        title: v.title,
        chunk: v.chunk,
        similarity: v.similarity,
        score: v.score,
      })),
      logger,
    });

    // Rebuild viable in reranked order (preserve KBScoredRow shape)
    const viableReranked: KBScoredRow[] = [];
    for (const c of reranked) {
      const found = viable.find((v) => v.id === c.id);
      if (found) viableReranked.push(found);
    }
    viable.length = 0;
    viable.push(...viableReranked);

    // Determine confidence: strong vs weak (best-effort KB still allowed)
    const best = viable[0];

    // If lexical rank exists, let score drive confidence.
    // Vector similarity is optional.
    const hasLexicalEvidence = typeof best.rank === "number" && best.rank > 0;
    const hasVectorEvidence = typeof best.similarity === "number";

    const confidence: "strong" | "weak" =
      best.score >= 0.62 ||
      (hasVectorEvidence && best.similarity! >= SOFT_MIN_SIMILARITY) ||
      (hasLexicalEvidence && best.score >= 0.55)
        ? "strong"
        : "weak";

    if (confidence === "weak") {
      logger.warn("[kb] semantic match weak; injecting best-effort KB", {
        best_similarity: best.similarity ?? 0,
        best_title: best.title,
        vehicle_model: model || null,
      });
    }

    // 4) Build compact context from top rows with dedupe
    // 4) Pack context by budget (dynamic, no sim metadata)
    const pricingMode = intent === "pricing" || intent === "offer";

    // 🔒 Pricing requires full-article coverage
    if (pricingMode) {
      const byArticle = new Map<string, KBScoredRow[]>();
      for (const r of viable) {
        if (!byArticle.has(r.article_id)) byArticle.set(r.article_id, []);
        byArticle.get(r.article_id)!.push(r);
      }

    }

    const packed = packKbContext({
      rows: viable,
      maxChars: pricingMode ? 16000 : 11000,
      maxChunks: pricingMode ? 30 : 18,
      maxChunkChars: pricingMode ? 4000 : 1200,
      maxPerArticle: pricingMode ? 12 : 3,
    });

    const context = packed.context;
    if (!context) return null;

    const usedArticleIds = new Set<string>(
      packed.used.map((u) => u.article_id)
    );

    for (const u of packed.used) {
      used.push({
        id: u.id,
        article_id: u.article_id,
        similarity: u.similarity ?? 0,
        title: u.title,
      });
    }

    logger.info("[kb] semantic injected", {
      chars: context.length,
      vehicle_model: model || null,
      articles: [...usedArticleIds],
      used: used.map((u) => ({ title: u.title, similarity: u.similarity })),
    });

    return {
      context,
      article_ids: [...usedArticleIds],
      confidence,
      best_similarity: best.similarity ?? 0,
      best_score: best.score,
      option_titles: Array.from(new Set(used.map((u) => u.title)))
        .filter(Boolean)
        .slice(0, 6),
      debug: {
        used,
        rejected,
        thresholds: {
          hardMin: HARD_MIN_SIMILARITY,
          softMin: SOFT_MIN_SIMILARITY,
          initial: INITIAL_THRESHOLD,
          fallback: FALLBACK_THRESHOLD,
        },
      },
    };
  } catch (err) {
    logger.error("[kb] semantic resolver failed", { error: err });
    return null;
  }
}

async function resolveKnowledgeContextLexicalOnly(params: {
  userMessage: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<{ context: string; article_ids: string[] } | null> {
  const { userMessage, organizationId, logger } = params;
  if (KB_DISABLE_LEXICAL) return null;
  const q = (userMessage || "").trim().replace(/\s+/g, " ");
  if (!q) return null;

  const { data, error } = await supabase.rpc(
    "match_knowledge_chunks_lexical_scoped",
    {
      p_query: q,
      match_count: 40,
      p_organization_id: organizationId,
      p_only_published: true,
    }
  );

  if (error) {
    logger.warn("[kb] lexical-only rpc failed", { error });
    return null;
  }
  if (!data?.length) return null;

  // Convert to KBScoredRow so we can reuse the same packing/diversification.
  const rows: KBScoredRow[] = (data as any[]).map((r) => {
    const rank = Number(r.rank ?? 0);
    return {
      id: String(r.id),
      article_id: String(r.article_id),
      title: String(r.article_title || "KB"),
      chunk: String(r.chunk || ""),
      // lexical-only: no similarity
      similarity: undefined,
      rank,
      // treat rank as a weak proxy for score
      score: combinedScore(undefined, rank),
    };
  });

  const packed = packKbContext({
    rows,
    maxChars: 9000,
    maxChunks: 12,
    maxChunkChars: 1200,
    maxPerArticle: 3,
  });

  const context = packed.context;
  if (!context) return null;

  const articleIds = new Set<string>(packed.used.map((u) => u.article_id));

  logger.info("[kb] lexical-only injected", {
    articles: [...articleIds],
    chars: context.length,
  });
  return { context, article_ids: [...articleIds] };
}

/* ============================================================================
   WORKFLOW ENGINE — Types
============================================================================ */
type WorkflowRow = {
  id: string;
  organization_id: string | null;
  trigger: any | null;
  mode: "smart" | "strict" | null;
  is_active: boolean | null;
};

type WorkflowLogRow = {
  id: string;
  workflow_id: string | null;
  conversation_id: string | null;
  current_step_number: number | null;
  variables: Record<string, any>;
  completed: boolean;
};

/* ============================================================================
   WORKFLOW — TRIGGER DETECTION
============================================================================ */
async function detectWorkflowTrigger(
  user_message: string,
  organizationId: string,
  logger: ReturnType<typeof createLogger>
): Promise<WorkflowRow | null> {
  const workflows = await safeSupabase<WorkflowRow[]>(
    "load_workflows",
    logger,
    () =>
      supabase
        .from("workflows")
        .select("id, organization_id, trigger, mode, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
  );

  if (!workflows?.length) {
    logger.debug("[workflow] no active workflows");
    return null;
  }

  const lowerMsg = user_message.toLowerCase();

  for (const wf of workflows) {
    const trigger = wf.trigger ?? {};
    const triggerType = trigger.type ?? "always";

    if (triggerType === "keyword") {
      const keywords: string[] = trigger.keywords ?? [];
      if (
        keywords.some((k) =>
          lowerMsg.includes((k ?? "").toString().toLowerCase())
        )
      ) {
        logger.info("[workflow] keyword trigger matched", {
          workflow_id: wf.id,
          trigger_keywords: keywords,
        });
        return wf;
      }
    }

    if (triggerType === "intent") {
      const intents: string[] = trigger.intents ?? [];
      if (!intents.length) continue;

      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `Classify user intent into EXACTLY one of: ${intents.join(
                ", "
              )}. Return only that word.`,
            },
            { role: "user", content: user_message },
          ],
        });

        const intent =
          resp.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
        logger.debug("[workflow] intent classification result", {
          intent,
          intents,
        });

        if (intents.map((i) => i.toLowerCase()).includes(intent)) {
          logger.info("[workflow] intent trigger matched", {
            workflow_id: wf.id,
            intent,
          });
          return wf;
        }
      } catch (err) {
        logger.error("[workflow] intent classification error", { error: err });
      }
    }

    if (triggerType === "always") {
      logger.info("[workflow] always trigger matched", { workflow_id: wf.id });
      return wf;
    }
  }

  logger.debug("[workflow] no workflows matched");
  return null;
}

/* ============================================================================
   WORKFLOW — SESSION HELPERS
============================================================================ */
async function loadActiveWorkflow(
  conversationId: string,
  organizationId: string,
  logger: ReturnType<typeof createLogger>
): Promise<WorkflowLogRow | null> {
  const data = await safeSupabase<WorkflowLogRow>(
    "load_active_workflow",
    logger,
    () =>
      supabase
        .from("workflow_logs")
        .select(
          "id, workflow_id, conversation_id, current_step_number, variables, completed"
        )
        .eq("conversation_id", conversationId)
        .eq("organization_id", organizationId)
        .eq("completed", false)
        .maybeSingle()
  );

  if (!data) return null;

  return {
    ...data,
    current_step_number: data.current_step_number ?? 1,
    variables: data.variables ?? {},
    completed: data.completed ?? false,
  };
}

async function startWorkflow(
  workflowId: string,
  conversationId: string,
  organizationId: string,
  logger: ReturnType<typeof createLogger>
): Promise<WorkflowLogRow | null> {
  const data = await safeSupabase<WorkflowLogRow>(
    "start_workflow",
    logger,
    () =>
      supabase
        .from("workflow_logs")
        .insert({
          organization_id: organizationId,
          workflow_id: workflowId,
          conversation_id: conversationId,
          current_step_number: 1,
          variables: {},
          completed: false,
        })
        .select(
          "id, workflow_id, conversation_id, current_step_number, variables, completed"
        )
        .single()
  );

  if (!data) return null;

  logger.info("[workflow] started", {
    workflow_id: workflowId,
    log_id: data.id,
  });

  return { ...data, current_step_number: 1, variables: {}, completed: false };
}

type WorkflowStepRow = {
  id: string;
  workflow_id: string;
  step_order: number;
  action: {
    instruction_text?: string;
  } | null;
};

async function getWorkflowSteps(
  workflowId: string,
  logger: ReturnType<typeof createLogger>
): Promise<WorkflowStepRow[]> {
  const data = await safeSupabase<WorkflowStepRow[]>(
    "get_workflow_steps",
    logger,
    () =>
      supabase
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("step_order", { ascending: true })
  );

  return (data ?? []) as WorkflowStepRow[];
}

async function saveWorkflowProgress(
  logId: string,
  organizationId: string,
  nextStep: number,
  vars: Record<string, any>,
  completed: boolean,
  logger: ReturnType<typeof createLogger>
) {
  const { error } = await supabase
    .from("workflow_logs")
    .update({ current_step_number: nextStep, variables: vars, completed })
    .eq("id", logId)
    .eq("organization_id", organizationId);

  if (error)
    logger.error("[workflow] save progress error", { error, log_id: logId });
  else
    logger.debug("[workflow] progress saved", {
      log_id: logId,
      nextStep,
      completed,
    });
}

async function logUnansweredQuestion(params: {
  organization_id: string;
  conversation_id: string;
  channel: string;
  question: string;
  ai_response: string;
  logger: ReturnType<typeof createLogger>;
}) {
  try {
    const { error } = await supabase.rpc("phase6_log_unanswered_question", {
      p_organization_id: params.organization_id,
      p_conversation_id: params.conversation_id,
      p_channel: params.channel,
      p_user_message: params.question,
      p_ai_response: params.ai_response ?? "NO_RESPONSE",
    });

    if (error) {
      params.logger.error("[unanswered_questions] rpc failed", { error });
    } else {
      params.logger.info("[unanswered_questions] logged", {
        conversation_id: params.conversation_id,
      });
    }
  } catch (err) {
    // 🔒 NEVER crash ai-handler because of logging
    params.logger.error("[unanswered_questions] fatal", { error: err });
  }
}

/* ============================================================================
   MAIN HANDLER
============================================================================ */
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  const request_id = getRequestId(req);
  const trace_id = crypto.randomUUID();
  const baseLogger = createLogger({ request_id });

  try {
    // 0) Parse body — SAFE (prevents crash on empty / invalid JSON)
    let body: {
      conversation_id?: string;
      user_message?: string;
    } | null = null;

    const rawBody = await req.text();

    if (rawBody && rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch (err) {
        baseLogger.error("[validation] Invalid JSON body", {
          body_length: rawBody.length,
          error: String(err),
        });

        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (!body) {
      baseLogger.warn("[validation] Empty request body");
      return new Response(JSON.stringify({ error: "Empty request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const conversation_id = body.conversation_id;
    const raw_message = body.user_message;

    if (!conversation_id || !raw_message) {
      baseLogger.warn("[validation] Missing conversation_id or user_message");
      return new Response("Bad Request", { status: 400 });
    }

    const user_message = raw_message.trim();
    if (!user_message) return new Response("Empty message", { status: 400 });

    // 1) Load conversation
    const conv = await safeSupabase<{
      id: string;
      organization_id: string;
      channel: string;
      contact_id: string | null;
      ai_enabled: boolean | null;
      ai_locked: boolean | null;
      ai_locked_by: string | null;
      ai_locked_until: string | null;
      ai_locked_at: string | null;

      ai_lock_reason: string | null;

      // Phase 1
      ai_mode: AiMode | null;
      ai_summary: string | null;
      ai_last_entities: Record<string, any> | null;
      campaign_id?: string | null;
      workflow_id?: string | null;
      campaign_context?: Record<string, any> | null;
      campaign_reply_sheet_tab?: string | null;
    }>("load_conversation", baseLogger, () =>
      supabase
        .from("conversations")
        .select(
          `
          id,
          organization_id,
          channel,
          contact_id,
          ai_enabled,
          ai_mode,
          ai_summary,
          ai_last_entities,
          ai_locked,
          ai_locked_by,
          ai_locked_at,
          ai_locked_until,
          campaign_id,
          workflow_id,
          campaign_context,
          campaign_reply_sheet_tab,
          ai_lock_reason
          `
        )
        .eq("id", conversation_id)
        .maybeSingle()
    );

    if (!conv) return new Response("Conversation not found", { status: 404 });

    // PHASE 1 AUTHZ: enforce tenant boundary (service_role bypasses RLS)
    const isInternal = isInternalRequest(req);
    let actor_user_id: string | null = null;
    let actor_email: string | null = null;

    if (!isInternal) {
      try {
        const u = await requireUser(req);
        actor_user_id = u.id;
        actor_email = u.email;
        await requireOrgMembership({
          supabaseAdmin: supabase,
          userId: u.id,
          organizationId: conv.organization_id,
        });
      } catch {
        return new Response("Forbidden", { status: 403 });
      }
    }

    if (conv.ai_enabled === false)
      return new Response("AI disabled", { status: 200 });

    // 🔒 SECURITY: Ensure organization exists and is active
    const org = await safeSupabase<{ status: string }>(
      "load_organization_status",
      baseLogger,
      () =>
        supabase
          .from("organizations")
          .select("status")
          .eq("id", conv.organization_id)
          .maybeSingle()
    );

    if (!org || org.status !== "active") {
      baseLogger.error("[org] inactive or missing organization", {
        organization_id: conv.organization_id,
      });

      return new Response("Organization inactive", { status: 403 });
    }

    // PHASE 4: start AI trace (best-effort, never blocks)
    await traceInsertStart({
      trace_id,
      organization_id: conv.organization_id,
      conversation_id: conv.id,
      request_id,
      channel: conv.channel,
      caller_type: isInternal ? "internal" : "user",
      user_text: user_message,
    });

    /* ============================================================================
   4.1 AGENT TAKEOVER — HARD AI LOCK (SERVER ENFORCED)
============================================================================ */

    /* ============================================================================
   AGENT TAKEOVER — EXPIRING AI LOCK (P1-C)
============================================================================ */

    if (conv.ai_locked === true) {
      const until = conv.ai_locked_until
        ? Date.parse(conv.ai_locked_until)
        : NaN;
      const now = Date.now();

      // 🔒 Lock active → block AI
      if (!Number.isNaN(until) && until > now) {
        baseLogger.warn(
          "[ai-handler] blocked by agent takeover (active lock)",
          {
            conversation_id,
            organization_id: conv.organization_id,
            ai_locked_by: conv.ai_locked_by,
            ai_locked_at: conv.ai_locked_at,
            ai_locked_until: conv.ai_locked_until,
            ai_lock_reason: conv.ai_lock_reason,
          }
        );

        await logAuditEvent(supabase, {
          organization_id: conv.organization_id,
          action: "ai_reply_blocked_agent_takeover",
          entity_type: "conversation",
          entity_id: conversation_id,
          actor_user_id: conv.ai_locked_by ?? null,
          actor_email: null,
          metadata: {
            reason: conv.ai_lock_reason ?? "agent_takeover",
            channel: conv.channel,
            request_id,
            locked_until: conv.ai_locked_until,
          },
        });

        return new Response(
          JSON.stringify({
            conversation_id,
            no_reply: true,
            reason: "AI_LOCKED_BY_AGENT",
            request_id,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // ⏱️ Lock expired → auto-unlock
      await supabase
        .from("conversations")
        .update({
          ai_locked: false,
          ai_locked_by: null,
          ai_locked_at: null,
          ai_locked_until: null,
          ai_lock_reason: null,
        })
        .eq("id", conversation_id);

      baseLogger.info("[ai-handler] agent lock expired → auto-unlocked", {
        conversation_id,
        organization_id: conv.organization_id,
      });
    }

    // Phase 1 — AI mode guard
    const aiMode: AiMode = (conv.ai_mode as AiMode) || "auto";

    if (aiMode === "off") {
      return new Response(
        JSON.stringify({
          conversation_id,
          no_reply: true,
          request_id,
          reason: "AI_MODE_OFF",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // If human is actively handling, block auto replies
    if (aiMode === "auto") {
      const humanActive = await wasHumanActiveRecently({
        conversationId: conversation_id,
        logger: baseLogger,
        seconds: 60,
      });

      if (humanActive) {
        await logAuditEvent(supabase, {
          organization_id: conv.organization_id,
          action: "ai_reply_skipped_human_active",
          entity_type: "conversation",
          entity_id: conversation_id,
          actor_user_id: null,
          actor_email: null,
          metadata: { ai_mode: aiMode, seconds: 60 },
        });

        return new Response(
          JSON.stringify({
            conversation_id,
            no_reply: true,
            request_id,
            reason: "HUMAN_ACTIVE",
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 🔒 PSF HARD GUARD — longer cooldown if PSF
    const psfCaseForGuard = await loadOpenPsfCaseByConversation(
      conversation_id
    );

    if (psfCaseForGuard) {
      const humanActive = await wasHumanActiveRecently({
        conversationId: conversation_id,
        logger: baseLogger,
        seconds: 600, // ⏱ 10 minutes for PSF
      });

      if (humanActive) {
        await logAuditEvent(supabase, {
          organization_id: conv.organization_id,
          action: "ai_reply_skipped_psf_human_active",
          entity_type: "conversation",
          entity_id: conversation_id,
          actor_user_id: null,
          actor_email: null,
          metadata: { seconds: 600 },
        });

        return new Response(
          JSON.stringify({
            conversation_id,
            no_reply: true,
            request_id,
            reason: "PSF_HUMAN_ACTIVE",
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const organizationId = conv.organization_id;
    const channel = conv.channel || "web";
    const contactId = conv.contact_id;

    const logger = createLogger({
      request_id,
      conversation_id,
      organization_id: organizationId,
      channel,
    });

    // 2) Wallet (required for any AI call; greetings are free)
    const wallet = await loadWalletForOrg(organizationId);

    if (!wallet) {
      logger.error("[wallet] missing or inactive wallet");

      if (!isGreetingMessage(user_message)) {
        // AUDIT: wallet blocked
        await logAuditEvent(supabase, {
          organization_id: organizationId,
          action: "wallet_blocked",
          entity_type: "conversation",
          entity_id: conversation_id,
          actor_user_id: null,
          actor_email: null,
          metadata: {
            reason: "WALLET_NOT_AVAILABLE",
            channel,
            user_message: user_message.slice(0, 500),
            request_id,
          },
        });

        return new Response(
          JSON.stringify({
            error: "Wallet not available",
            error_code: "WALLET_NOT_AVAILABLE",
            request_id,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 2.5) Phase 5: Per-org AI rate limits (requests + tokens).
    // Enforced for non-greeting messages (greetings are free).
    // P3: we do a small early pre-charge to stop abuse quickly, then top-up later
    // once we know the packed prompt size.
    let prechargedTokens = 0;

    if (!isGreetingMessage(user_message)) {
      // Small, conservative pre-charge: user message + baseline.
      // (We top-up later after prompt/context packing.)
      prechargedTokens = Math.max(
        0,
        estimateTokensFromText(user_message) + 600
      );

      try {
        await supabase.rpc("consume_ai_quota", {
          p_organization_id: organizationId,
          p_estimated_tokens: prechargedTokens,
        });
      } catch (err: any) {
        const msg = String(err?.message || err || "");
        if (msg.toLowerCase().includes("ai_rate_limit_exceeded")) {
          logger.warn("[rate-limit] exceeded (precharge)", {
            estimated_tokens: prechargedTokens,
          });

          return new Response(
            JSON.stringify({
              error: "rate_limit_exceeded",
              request_id,
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }

        logger.error("[rate-limit] consume_ai_quota failed (precharge)", {
          error: err,
        });
        // Fail-open for unexpected RPC failures to avoid production outages.
      }
    }

    // 3) Fetch contact phone (needed for WhatsApp sends, including greetings)
    let contactPhone: string | null = null;
    if (channel === "whatsapp" && contactId) {
      const contact = await safeSupabase<{ phone: string | null }>(
        "load_contact_phone",
        logger,
        () =>
          supabase
            .from("contacts")
            .select("phone")
            .eq("id", contactId)
            .maybeSingle()
      );
      contactPhone = contact?.phone ?? null;
    }

    // 4) Personality (needed for greeting + fallback)
    const personality = await loadBotPersonality({
      organizationId,
    });

    const fallbackMessage =
      personality?.fallback_message ??
      "I’m sorry, I don’t have enough information to answer that.";

    const greetingMessage =
      personality?.greeting_message ?? "Hello how can I help you today?";

    const personaBlock = `
Tone & Language:
- Tone: ${personality.tone}
- Language: ${personality.language}
- Voice: ${personality.gender_voice}
- Response length: ${personality.short_responses ? "Short" : "Normal"}
- Emoji usage: ${personality.emoji_usage ? "Allowed" : "Not allowed"}

TONE OVERRIDE (IMPORTANT):
- Sound like an experienced car sales executive on WhatsApp.
- Be confident, friendly, and helpful.
- Avoid corporate disclaimers and call-center language.

Business Information:
${personality.business_context || "No business context provided."}

DOs (Always follow):
${personality.dos || "- None specified."}

DON’Ts (Strictly avoid):
${personality.donts || "- None specified."}
`.trim();

    // ------------------------------------------------------------------
    // HARD GREETING RULE (NO AI) — ALWAYS REPLY TO hi/hello/hey/namaste etc.
    // ------------------------------------------------------------------
    if (isGreetingMessage(user_message)) {
      const greetText =
        personality.greeting_message ??
        personality.fallback_message ??
        "Hello 👋 How can I help you today?";

      // Save bot message
      await supabase.from("messages").insert({
        conversation_id,
        organization_id: organizationId,
        sender: "bot",
        message_type: "text",
        text: greetText,
        channel,
        order_at: new Date().toISOString(),
        outbound_dedupe_key: request_id,
        metadata: { request_id, trace_id, kind: "greeting" },
      });

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id);

      // Send WhatsApp reply if WhatsApp
      if (channel === "whatsapp" && contactPhone) {
        await safeWhatsAppSend(logger, {
          organization_id: organizationId,
          to: contactPhone,
          type: "text",
          text: greetText,
        });
      }

      return new Response(
        JSON.stringify({
          conversation_id,
          ai_response: greetText,
          request_id,
          hard_greeting: true,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* ============================================================================
   PSF FLOW — SHORT CIRCUIT
============================================================================ */

    const psfCase = await loadOpenPsfCaseByConversation(conversation_id);

    if (psfCase) {
      logger.info("[psf] handling feedback reply", {
        psf_case_id: psfCase.id,
      });

      const result = await classifyPsfSentiment(logger, user_message);

      await supabase
        .from("psf_cases")
        .update({
          sentiment: result.sentiment,
          ai_summary: result.summary,
          action_required: result.sentiment === "negative",
          first_customer_reply_at:
            psfCase.first_customer_reply_at ?? new Date().toISOString(),
          last_customer_reply_at: new Date().toISOString(),
        })
        .eq("id", psfCase.id);

      // 🚫 PSF NEGATIVE — DO NOT AUTO REPLY
      if (result.sentiment === "negative") {
        return new Response(
          JSON.stringify({
            conversation_id,
            psf_handled: true,
            sentiment: "negative",
            no_auto_reply: true,
            request_id,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // 🔍 AUDIT: PSF feedback received
      await logAuditEvent(supabase, {
        organization_id: organizationId,
        action: "psf_feedback_received",
        entity_type: "psf_case",
        entity_id: psfCase.id,
        actor_user_id: null,
        actor_email: null,
        metadata: {
          sentiment: result.sentiment,
          summary: result.summary,
          conversation_id,
          campaign_id: psfCase.campaign_id,
          channel,
          request_id,
        },
      });

      const replyText =
        result.sentiment === "positive"
          ? "Thank you for your feedback! We’re glad you had a good experience 😊"
          : "Thank you for sharing your feedback. We appreciate you taking the time to respond.";

      // Save bot reply
      await supabase.from("messages").insert({
        conversation_id,
        organization_id: organizationId,
        sender: "bot",
        message_type: "text",
        text: replyText,
        channel,
        order_at: new Date().toISOString(),
        outbound_dedupe_key: request_id,
        metadata: {
          request_id,
          trace_id,
          kind: "psf_reply",
          sentiment: result.sentiment,
        },
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id);

      if (channel === "whatsapp" && contactPhone) {
        await safeWhatsAppSend(logger, {
          organization_id: organizationId,
          to: contactPhone,
          type: "text",
          text: replyText,
        });
      }

      return new Response(
        JSON.stringify({
          conversation_id,
          psf_handled: true,
          sentiment: result.sentiment,
          request_id,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* ============================================================================
   AI UNDERSTANDING (EARLY — REQUIRED FOR ENTITY LOCKING)
============================================================================ */

    let aiExtract: AiExtractedIntent = {
      vehicle_model: null,
      fuel_type: null,
      intent: "other",
    };

    // Phase 2: Continuity lock for short follow-ups
    const locked = conv.ai_last_entities ?? {};
    const lockedTopic = locked?.topic ?? null;
    const lockedIntent = locked?.intent ?? null;
    const lockedModel = locked?.model ?? null;
    const lockedFuel = locked?.fuel_type ?? null;

    const shouldContinue =
      (lockedTopic || lockedModel) &&
      isShortFollowupMessage(user_message) &&
      !isExplicitTopicChange(user_message);

    if (shouldContinue) {
      aiExtract = {
        vehicle_model: lockedModel,
        fuel_type: lockedFuel,
        intent:
          (lockedIntent as any) ??
          (lockedTopic === "offer_pricing" ? "pricing" : "other"),
      };
      logger.info("[ai-handler] follow-up continuity lock applied", {
        locked_topic: lockedTopic,
        locked_intent: aiExtract.intent,
        locked_model: lockedModel,
      });
    } else if (!isGreetingMessage(user_message)) {
      // Only extract intent if KB may be used
      aiExtract = await extractUserIntentWithAI({
        userMessage: user_message,
        logger,
      });
      logger.info("[ai-extract] result", aiExtract);

      // Heuristic intent failsafe: if AI extraction is missing/other, infer from keywords.
      // This prevents pricing/offer turns from being treated as "other" and getting blocked/hedged.
      const heuristic = inferIntentHeuristic(user_message);
      if (
        (!aiExtract.intent || aiExtract.intent === "other") &&
        heuristic.intent !== "other"
      ) {
        logger.info("[ai-extract] heuristic_override", {
          from: aiExtract.intent || "other",
          to: heuristic.intent,
          signals: heuristic.signals,
        });
        aiExtract.intent = heuristic.intent;
      }
    }

    /* ---------------------------------------------------------------------------
   PHASE 1 — ENTITY DETECTION & LOCKING (STEP 5)
--------------------------------------------------------------------------- */

    // 🧠 Merge AI-extracted entities into locked entities (Issue 4)
    const nextEntities = mergeEntities(conv.ai_last_entities, {
      model: aiExtract.vehicle_model ?? undefined,
      fuel_type: aiExtract.fuel_type ?? undefined,
      // Phase 2: keep intent/topic sticky; do not wipe on weak turns
      intent:
        aiExtract.intent && aiExtract.intent !== "other"
          ? aiExtract.intent
          : undefined,
      topic:
        aiExtract.intent === "pricing" || aiExtract.intent === "offer"
          ? "offer_pricing"
          : undefined,
    });

    // 7) WhatsApp typing_on before expensive work
    if (channel === "whatsapp" && contactPhone) {
      await safeWhatsAppSend(logger, {
        organization_id: organizationId,
        to: contactPhone,
        type: "typing_on",
      });
    }

    // 8) Load conversation history
    const recentMessages = await safeSupabase<
      { sender: string; text: string | null; order_at: string | null }[]
    >("load_recent_messages", logger, () =>
      supabase
        .from("messages")
        .select("sender, text, order_at")
        .eq("conversation_id", conversation_id)
        .order("order_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(20)
    );

    const historyMessages = buildChatMessagesFromHistory(
      (recentMessages ?? []).map((m) => ({ sender: m.sender, text: m.text })),
      user_message
    );

    // PHASE 0: Prevent chat-history contamination for pricing/offers
    // If the user mentioned prices/discounts earlier, treat those numbers as unverified and redact them
    // so the model cannot repeat them as facts.
    const historyMessagesSafe =
      aiExtract.intent === "pricing" || aiExtract.intent === "offer"
        ? historyMessages.map((m) =>
            m.role === "user"
              ? { ...m, content: redactUserProvidedPricing(m.content) }
              : m
          )
        : historyMessages;

    // 9) Campaign context (best-effort; fixed schema)
    let campaignContextText = "";
    if (contactId) {
      const campaignCtx = await fetchCampaignContextForContact(
        organizationId,
        contactId,
        logger
      );
      if (campaignCtx) {
        campaignContextText = buildCampaignContextText(campaignCtx);
        logger.debug("[ai-handler] campaign context injected", {
          delivered: campaignCtx.delivered,
          failed: campaignCtx.failed,
        });
      }
    }

    let kbAttempted = false;
    let kbFound = false;

    // 10) Phase 6 — Knowledge Base Resolution (Semantic → Deterministic)
    let contextText = "";
    let kbMatchMeta: any = null;

    kbAttempted = true;

    // 10A) Semantic KB (preferred)
    const isFollowUpForKb =
      isShortFollowupMessage(user_message) &&
      !isExplicitTopicChange(user_message);
    const semanticQueryText = buildSemanticQueryText({
      userMessage: user_message,
      isFollowUp: isFollowUpForKb,
      lockedEntities: conv.ai_last_entities ?? null,
      extracted: aiExtract,
      campaignContextText,
    });

    if (isFollowUpForKb) {
      logger.info("[kb] follow-up semantic query rewrite", {
        raw: user_message.slice(0, 80),
        semantic_query: semanticQueryText.slice(0, 180),
      });
    }

    const semanticKB = await resolveKnowledgeContextSemantic({
      userMessage: semanticQueryText,
      organizationId,
      logger,
      vehicleModel:
        aiExtract.vehicle_model ?? conv.ai_last_entities?.model ?? null,
      intent: aiExtract.intent,
      fuelType: aiExtract.fuel_type ?? null,
    });

    if (semanticKB?.context) {
      contextText = semanticKB.context;
      kbFound = true;
      kbMatchMeta = {
        match_type: "semantic",
        article_ids: semanticKB.article_ids,
        confidence: semanticKB.confidence,
        best_similarity: semanticKB.best_similarity,
        best_score: semanticKB.best_score,
        option_titles: semanticKB.option_titles,
      };
    } else {
      // 10B) Deterministic fallback (lexical-only) — optional
      const lexicalOnly = KB_DISABLE_LEXICAL
        ? null
        : await resolveKnowledgeContextLexicalOnly({
            userMessage: user_message,
            organizationId,
            logger,
          });

      if (lexicalOnly?.context) {
        contextText = lexicalOnly.context;
        kbFound = true;
        kbMatchMeta = {
          match_type: "lexical_only",
          article_ids: lexicalOnly.article_ids,
        };
      } else {
        logger.warn("[kb] attempted but NO match", {
          user_message: user_message.slice(0, 120),
        });
      }
    }

    // PHASE 4: persist KB retrieval trace (best-effort)
    const kbTracePatch: Record<string, any> = {
      kb_used: kbFound,
      kb_reason: kbFound ? "matched" : "no_match",
      kb_threshold: semanticKB?.debug?.thresholds?.initial ?? null,
      kb_top_score: semanticKB?.best_score ?? null,
      kb_top_similarity: semanticKB?.best_similarity ?? null,
      kb_chunks: semanticKB?.debug?.used ?? [],
      decision: {
        kb_attempted: kbAttempted,
        kb_found: kbFound,
        kb_match_meta: kbMatchMeta,
        kb_thresholds: semanticKB?.debug?.thresholds ?? null,
        kb_rejected: semanticKB?.debug?.rejected ?? [],
        kb_hybrid: true,
        kb_rerank: true,
      },
    };
    await traceUpdate(trace_id, kbTracePatch);

    // Persist KB anchors into conversation memory for follow-ups (best-effort)
    const nextEntitiesWithKb: any = { ...(nextEntities as any) };
    try {
      if (kbFound) {
        nextEntitiesWithKb.last_kb = {
          match_type: kbMatchMeta?.match_type ?? null,
          article_ids:
            kbMatchMeta?.article_ids ??
            (kbMatchMeta?.article_id ? [kbMatchMeta.article_id] : []),
          confidence: kbMatchMeta?.confidence ?? null,
          best_similarity: kbMatchMeta?.best_similarity ?? null,
          best_score: kbMatchMeta?.best_score ?? null,
          option_titles:
            kbMatchMeta?.option_titles ??
            (kbMatchMeta?.title ? [kbMatchMeta.title] : []),
          at: new Date().toISOString(),
        };
      }
    } catch {
      // never break on memory anchors
    }

    const requiresAuthoritativeKB =
      aiExtract.intent === "pricing" || aiExtract.intent === "offer";

    // PHASE 0: For pricing/offers, treat KB as valid ONLY if it actually contains pricing/offer signals.
    // This prevents hallucinations when KB context is non-empty but irrelevant (e.g., features doc).
    const kbHasPricingSignals =
  looksLikePricingOrOfferContext(contextText) ||
  // strong pricing-table heuristic: multiple big numbers + pricing column keywords
  (
    (/(ex[-\s]?showroom|on[-\s]?road|insurance|rto|tcs)/i.test(contextText)) &&
    ((contextText.match(/\b\d{5,}\b/g) || []).length >= 3)
  ) ||
  // your existing variant+keyword rule
  (/\bvariant\b/i.test(contextText) &&
    /(\bprice\b|₹|\bon[-\s]?road\b|\bex[-\s]?showroom\b|\brto\b|\binsurance\b)/i.test(contextText));


    const campaignHasPricingSignals =
      looksLikePricingOrOfferContext(campaignContextText) ||
      looksLikePricingOrOfferContext(
        JSON.stringify(conv.campaign_context ?? {})
      );

    const pricingEstimateRequired =
      requiresAuthoritativeKB &&
      !kbHasPricingSignals &&
      semanticKB?.confidence !== "strong";

    if (pricingEstimateRequired) {
      logger.warn(
        "[pricing] verified pricing not found in KB/Campaign — allow estimate with disclaimer",
        {
          intent: aiExtract.intent,
          vehicle_model: aiExtract.vehicle_model,
          kb_found: kbFound,
          kb_has_pricing_signals: kbHasPricingSignals,
          campaign_has_pricing_signals: campaignHasPricingSignals,
        }
      );
    }

    // 🔒 PRICING SAFETY NET
    if (!kbFound && aiExtract.intent === "pricing" && contextText === "") {
      logger.warn("[kb] pricing intent but no KB context found");
    }

    // 🧠 Intent-aware soft handling (Issue 3 - Option B)
    // If user intent is pricing/features but KB has no match,
    // allow AI to ask ONE clarifying question instead of fallback.
    const intentNeedsKB =
      aiExtract.intent === "pricing" ||
      aiExtract.intent === "offer" ||
      aiExtract.intent === "features";

    if (!kbFound && intentNeedsKB) {
      logger.info("[decision] intent_requires_clarification", {
        intent: aiExtract.intent,
        vehicle_model: aiExtract.vehicle_model,
      });

      // IMPORTANT:
      // Leave contextText empty
      // System prompt will instruct AI to ask ONE clarifying question
    }

    // ------------------------------------------------------------------
    // P2 — STRICT KB-ONLY MODE
    // If conversation.ai_mode = "kb_only", the bot must not answer from
    // general knowledge. It may only respond when we have a strong KB match.
    // Otherwise, it should politely decline and log the unanswered question.
    // ------------------------------------------------------------------
    const kbStrongEnoughForKbOnly =
      kbFound &&
      contextText.trim().length > 0 &&
      (kbMatchMeta?.match_type === "lexical_only" ||
        semanticKB?.confidence === "strong");

    let forcedReplyText: string | null = null;
    if (aiMode === "kb_only" && !kbStrongEnoughForKbOnly) {
      forcedReplyText =
        "I don’t have this information in our knowledge base yet. If you share the exact model/variant (or the brochure), I’ll confirm the right details — our sales team can also verify it for you.";

      logger.warn("[kb_only] blocked: no strong KB match", {
        conversation_id,
        organization_id: organizationId,
        kb_found: kbFound,
        kb_match: kbMatchMeta ?? null,
      });
    }

    // ------------------------------------------------------------------
    // WORKFLOW CONTEXT (GUIDANCE ONLY — NO EXECUTION)
    // ------------------------------------------------------------------
    let workflowInstructionText = "";
    let resolvedWorkflow: WorkflowLogRow | null = null;

    const activeWorkflow = await loadActiveWorkflow(
      conversation_id,
      organizationId,
      logger
    );
    resolvedWorkflow = activeWorkflow;

    // 🔒 NEW: honor workflow attached by campaign
    if (!resolvedWorkflow && conv.workflow_id) {
      resolvedWorkflow = await startWorkflow(
        conv.workflow_id,
        conversation_id,
        organizationId,
        logger
      );
      logger.info("[workflow] attached from campaign", {
        workflow_id: conv.workflow_id,
        conversation_id,
      });
    }

    // fallback to detection only if nothing exists
    if (!resolvedWorkflow) {
      const wf = await detectWorkflowTrigger(
        user_message,
        organizationId,
        logger
      );

      if (wf) {
        resolvedWorkflow = await startWorkflow(
          wf.id,
          conversation_id,
          organizationId,
          logger
        );
      }
    }

    if (resolvedWorkflow) {
      const steps = await getWorkflowSteps(
        resolvedWorkflow.workflow_id!,
        logger
      );

      if (steps?.length) {
        const index = Math.max(
          0,
          Math.min(
            (resolvedWorkflow.current_step_number ?? 1) - 1,
            steps.length - 1
          )
        );

        const step = steps[index];
        workflowInstructionText = safeText(
          (step as any).instruction_text ?? step.action?.instruction_text
        );
      }
    }

    // ------------------------------------------------------------------
    // PHASE 3 — WORKFLOW ↔ KB RECONCILIATION (DETERMINISTIC PRECEDENCE)
    // ------------------------------------------------------------------
    // Rule: If KB/Campaign already provides a sufficient answer for the current intent,
    // workflow guidance must NOT cause redundant questions or override facts.

    const kbSufficientForIntent =
      Boolean(contextText?.trim()) &&
      (requiresAuthoritativeKB
        ? kbHasPricingSignals || campaignHasPricingSignals
        : true);

    const workflowRequiresKB =
      (workflowInstructionText || "")
        .toLowerCase()
        .includes("knowledge base") ||
      (workflowInstructionText || "").toLowerCase().includes("kb");

    let workflowRequiresKBButMissing = false;

    if (kbSufficientForIntent && workflowInstructionText?.trim()) {
      logger.info("[workflow] suppressed (KB sufficient)", {
        intent: aiExtract.intent,
        has_kb: kbFound,
      });
      workflowInstructionText = "";
    }

    if (!kbFound && workflowRequiresKB && workflowInstructionText?.trim()) {
      // Workflow text is indicating KB usage, but KB retrieval returned nothing.
      // Do not continue blindly; let the system prompt ask ONE clarifying question / escalate.
      workflowRequiresKBButMissing = true;
      logger.warn("[workflow] KB required by workflow but missing", {
        intent: aiExtract.intent,
      });
    }

    if (workflowInstructionText?.trim()) {
      logger.info("[decision] workflow_guidance_active", {
        has_workflow: true,
      });
    }

    const campaignFactsBlock = buildCampaignFactsBlock(
      conv.campaign_context ?? null
    );

    // KB meta for best-effort options
    const kbConfidence: "strong" | "weak" | "none" = kbMatchMeta?.confidence
      ? (kbMatchMeta.confidence as any)
      : kbFound
      ? "weak"
      : "none";

    const kbOptionTitles: string[] = (kbMatchMeta?.option_titles ?? [])
      .filter(Boolean)
      .slice(0, 6);

    // P3: Keep full KB/Campaign context for validation, but trim what we send to the model
    // to stay within budget and reduce cost.
    const highRiskIntentForContext =
      aiExtract.intent === "pricing" || aiExtract.intent === "offer";

    const kbContextForPrompt = highRiskIntentForContext
      ? extractPricingFocusedContext(
          contextText,
          channel === "whatsapp" ? 9000 : 14000
        )
      : truncateTextToTokenLimit(
          contextText,
          channel === "whatsapp" ? 1200 : 3200
        );

    const campaignContextForPrompt = highRiskIntentForContext
      ? extractPricingFocusedContext(
          campaignContextText,
          channel === "whatsapp" ? 5000 : 9000
        )
      : truncateTextToTokenLimit(
          campaignContextText,
          channel === "whatsapp" ? 700 : 1800
        );

    // 11) System prompt
    const systemPrompt = `
You are an AI assistant representing this business.

Your job:
- Use Knowledge Base (KB) context when available.
- Use dealership tone & personality rules.
- Answer concisely unless the customer asks for more details.
- Follow bot instructions strictly.
- Use the fallback message ONLY when the question cannot be reasonably answered.

IMPORTANT:
- UNVERIFIED FACTS FIREWALL (PHASE 4 — HARD):
  - This rule applies ONLY to FACTS the USER claims first (e.g., "I was told ₹X", "discount is ₹Y", "delivery in 2 weeks").
  - Treat user-provided prices/discounts/offers/availability/timelines as UNVERIFIED unless the same info appears in Knowledge Context or Campaign Context.
  - If the user asks you to CONFIRM their claim ("right?", "correct?"), say you can't verify it from authorized sources and ask ONE short clarifying question (variant) or offer a human handoff.
  - If the user is ASKING you for pricing/offers (and they did NOT provide numbers), answer confidently using verified numbers from Knowledge/Campaign context.
  - HARD DO-NOT-SAY:
  - Do NOT say "I can't verify", "I cannot verify", "can't confirm", "mujhe verify nahi", "मैं verify नहीं कर सकती" unless the USER first provided a specific number/claim you are being asked to confirm.
  - Never learn dealership facts from chat history or user repetition.

 - PRICING RESPONSE FORMAT (WHEN KB HAS VERIFIED NUMBERS):
   - If the user asked for pricing and verified numbers exist in KB/Campaign context:
     1) First line MUST be:
        "<Model> <Variant> (<Fuel/Transmission>) – On-road: ₹<OnRoad>"
     2) Second line MUST be:
        "Breakup: Ex-showroom ₹…, Insurance ₹…, RTO ₹…, TCS ₹…"
        (Include only fields present in sources)
     3) Third line (optional, 1 line max):
        "Also, special offers are currently running on select variants (e.g., Smart). Want me to share the best offer options too?"
        IMPORTANT: this offers line must come AFTER pricing, not before.
   - If verified numbers are NOT present, ask ONE short clarifying question (variant only) OR say it's not available in KB and sales team will confirm.

------------------------
DEALERSHIP INFORMATION
------------------------
- Organization ID: ${organizationId}
- Channel: ${channel}

------------------------
CONVERSATION MEMORY (PHASE 1)
------------------------
Summary (rolling):
${conv.ai_summary || "No summary yet."}

Locked Entities (do NOT change unless user changes):
${JSON.stringify(nextEntitiesWithKb || {}, null, 2)}

CRITICAL ENTITY RULE:
- If Locked Entities includes "model", you MUST NOT switch to any other model unless the user explicitly mentions a different model.
- If Locked Entities includes "topic": "offer_pricing", follow-up messages like "tell me more" MUST expand the same offer context.

------------------------
KNOWN FACTS (CRITICAL)
------------------------
${campaignFactsBlock}

RULE:
- NEVER ask for information listed above.
- If already known, proceed to the next logical step.

------------------------
BOT PERSONALITY & BUSINESS RULES (CRITICAL)
------------------------
${personaBlock}
PRICING / DISCOUNT POLICY (IMPORTANT):
PRICING_ESTIMATE_REQUIRED: ${pricingEstimateRequired ? "YES" : "NO"}
- For pricing/offers, use verified numbers ONLY if they appear in Knowledge Context or Campaign Context.
- If verified numbers are NOT present, you may provide a rough estimate ONLY if it helps the customer, but you MUST clearly say: "This is an estimate. Our sales team will confirm the exact on-road price/offer."
- If the customer asks about DISCOUNTS/OFFERS but does not mention a model/variant, ask ONE short clarifying question and include 3–5 model options you can help with (from context if available).
- If the customer asks about PRICING but variant is missing, ask ONE short clarifying question (variant) OR share the closest variant pricing only if it is explicitly in Knowledge/Campaign context.

------------------------
WORKFLOW STEP (INTERNAL GUIDANCE — NOT A SCRIPT)
------------------------
${workflowInstructionText || "No active workflow guidance."}

WORKFLOW PRECEDENCE (PHASE 3 — CRITICAL):
- Knowledge Context and Campaign Context ALWAYS override workflow guidance.
- If the answer is already present in Knowledge/Campaign context, DO NOT ask workflow questions.
- Never ask for details that are already known (Known Facts / Locked Entities / KB).

IMPORTANT:
- The workflow step is a GOAL, not a sentence to repeat.
- Respond naturally in your own words.
EACH TIME.
- Do NOT mention workflows, steps, or instructions.
- Ask at most ONE relevant question if needed.

WORKFLOW ↔ KB PRECEDENCE (PHASE 3 — CRITICAL)
- Knowledge Context and Campaign Context ALWAYS override workflow guidance.
- If the answer is present in Knowledge/Campaign context, DO NOT ask workflow questions.
- If workflow guidance conflicts with Knowledge/Campaign facts, ignore the workflow guidance for this turn.
- If workflow requires KB and KB is missing, ask ONE clarifying question or offer to connect to a human (do not guess).

These rules OVERRIDE default AI behavior.

------------------------
KNOWLEDGE CONTEXT (MOST IMPORTANT)
------------------------
KB_MATCH_META (INTERNAL):
- kb_found: ${kbFound}
- kb_confidence: ${kbConfidence}
- kb_option_titles: ${kbOptionTitles.join(" | ") || "none"}

KB_META (INTERNAL):
- match_type: ${kbMatchMeta?.match_type || "none"}
- confidence: ${kbMatchMeta?.confidence || "n/a"}
- best_similarity: ${kbMatchMeta?.best_similarity ?? "n/a"}
- option_titles: ${JSON.stringify(kbMatchMeta?.option_titles ?? [], null, 0)}

${kbContextForPrompt}

${
  workflowRequiresKBButMissing
    ? "WORKFLOW GUARD: Workflow requires Knowledge Base to proceed, but KB context is missing. Ask ONE short clarifying question or connect to a human advisor. Do NOT guess."
    : ""
}

------------------------
KNOWLEDGE USAGE RULES (CRITICAL)
------------------------
BEST-EFFORT KB (NEW):
- If Knowledge Context is present, you MUST base your answer on it (even if it is a weak match).
- If multiple KB topics seem relevant or the user message is a short follow-up (e.g. "tell me more"), present 2–4 options from the KB and ask the user to pick ONE.
- Do NOT hallucinate facts outside Knowledge/Campaign Context.

- The knowledge context is AUTHORITATIVE.
- If the answer exists in the knowledge context, you MUST answer confidently.
- Use soft disclaimers if needed, never refusal.
- Do NOT escalate if KB contains the answer.
- NEVER copy or paste it verbatim.
- ALWAYS summarize, rephrase, and explain in your own words.
- Use bullet points where helpful.
- Answer like a dealership executive, not a document.

------------------------
CAMPAIGN CONTEXT (AUTHORITATIVE)
------------------------
- Campaign pricing, discounts, and offers are ALWAYS authorized.
- If campaign data exists, treat it as the primary source for pricing and offers.
- Never refuse pricing that appears in campaign context.
- Use qualification language if needed, never denial.


${campaignContextForPrompt || "No prior campaign history available."}

ENTITY SAFETY RULE (CRITICAL)
------------------------
- If a vehicle model is locked, keep using it.
- For pricing/offers, do NOT assume numbers. Require verified pricing/offer signals in KB or Campaign Context.
- If variant changes the quote and is not known, ask ONE short clarifying question.
- If intent is unclear, ask ONE clarifying question.
- Do NOT invent prices or discounts.

------------------------
RESPONSE DECISION RULES (CRITICAL)
------------------------
You are allowed to intentionally NOT reply ONLY if the user message adds no conversational value.
Short follow-up messages that indicate buying intent ALWAYS have conversational value.


If replying would add no value, you MUST respond with exactly:
${AI_NO_REPLY_TOKEN}

DO NOT explain why.
DO NOT add any text.
ONLY return ${AI_NO_REPLY_TOKEN}.

You MUST reply normally if:
- The user greets (hi/hello/namaste)
- The user asks a question
- The user shows interest
- The user requests clarification
- The user re-engages after a gap

If you need to ask a clarifying question:
- Ask exactly ONE short question
- Prefer asking about variant or fuel type


------------------------
FORMATTING & STYLE
------------------------
- Always answer the latest customer message.
- Keep WhatsApp replies short & simple (1–3 sentences max).
- You MAY use the fallback/sales-advisor handoff when verified pricing/offers are missing, even if KB context is non-empty but irrelevant.

Respond now to the customer's latest message only.
`.trim();

    // 12) AI settings (skip if a strict-mode forced reply is already chosen)
    const aiSettings = forcedReplyText
      ? null
      : await resolveAISettings({
          organizationId,
          logger,
        });

    // P3: Model routing (cheap model for routine turns, bigger model only when needed)
    const routedModel = forcedReplyText
      ? ""
      : chooseRoutedModel({
          provider: aiSettings!.provider,
          configuredModel: aiSettings!.model,
          channel,
          kbConfidence,
          aiMode,
          userMessage: user_message,
          hasWorkflow: Boolean(workflowInstructionText?.trim()),
        });

    // P3: Dynamic context packing (token-budgeted)
    const limits = modelTokenLimits(routedModel || aiSettings?.model || "");
    const systemTokens = estimateTokensFromText(systemPrompt);
    const maxHistoryTokens = Math.max(
      0,
      limits.maxContext - limits.reserveOutput - systemTokens
    );

    const packedHistory = packHistoryByTokenBudget({
      history: historyMessagesSafe,
      maxTokens: maxHistoryTokens,
    });

    const historyMessagesPacked = packedHistory.packed;

    // P3: Rate-limit top-up after we know the actual packed prompt size.
    if (!isGreetingMessage(user_message) && routedModel) {
      const promptTokensEstimate =
        systemTokens + estimateTokensFromMessages(historyMessagesPacked);
      const totalEstimate = promptTokensEstimate + limits.reserveOutput;
      const topUp = Math.max(0, totalEstimate - prechargedTokens);

      if (topUp > 0) {
        try {
          await supabase.rpc("consume_ai_quota", {
            p_organization_id: organizationId,
            p_estimated_tokens: topUp,
          });
        } catch (err: any) {
          const msg = String(err?.message || err || "");
          if (msg.toLowerCase().includes("ai_rate_limit_exceeded")) {
            logger.warn("[rate-limit] exceeded (top-up)", {
              total_estimated_tokens: totalEstimate,
              precharged_tokens: prechargedTokens,
            });

            return new Response(
              JSON.stringify({
                error: "rate_limit_exceeded",
                request_id,
              }),
              { status: 429, headers: { "Content-Type": "application/json" } }
            );
          }

          logger.error("[rate-limit] consume_ai_quota failed (top-up)", {
            error: err,
          });
          // Fail-open on unexpected errors.
        }
      }

      logger.info("[token-budget] packed", {
        model: routedModel,
        system_tokens_est: systemTokens,
        history_tokens_est: packedHistory.usedTokens,
        reserve_output: limits.reserveOutput,
        total_tokens_est: totalEstimate,
      });
    }

    logger.info("[ai-decision] context_summary", {
      kb_attempted: kbAttempted,
      kb_found: kbFound,
      kb_match: kbMatchMeta ?? null,
      has_workflow: Boolean(workflowInstructionText?.trim()),
      has_campaign: Boolean(campaignContextText?.trim()),
      model_routed: routedModel || aiSettings?.model,
    });

    // 13) Run AI completion (or honor forced reply)
    const aiResult = forcedReplyText
      ? null
      : await runAICompletion({
          provider: aiSettings!.provider,
          model: routedModel,
          systemPrompt,
          historyMessages: historyMessagesPacked,
          logger,
        });

    let aiResponseText = forcedReplyText ?? aiResult?.text ?? fallbackMessage;
    if (!aiResponseText) aiResponseText = fallbackMessage;

    // If user asked pricing and KB has pricing signals, but the model didn't output any numbers,
// show the KB options instead of only asking "confirm variant".
if (
  aiExtract.intent === "pricing" &&
  kbHasPricingSignals &&
  !/\d/.test(aiResponseText) &&
  /variant|confirm|which/i.test(aiResponseText)
) {
  const lines = (contextText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => /on[- ]?road|ex[- ]?showroom|insurance|rto|tcs|₹/i.test(l))
    .slice(0, 12);

  if (lines.length) {
    aiResponseText =
      `Here’s what I have in the knowledge base:\n` +
      lines.map((l) => `• ${l}`).join("\n") +
      `\n\nWhich exact variant (fuel + transmission) should I quote for you?`;
  }
}

    const looksLikeClarification =
  /\?\s*$/.test(aiResponseText.trim()) &&
  !/\d/.test(aiResponseText) &&
  !/₹/.test(aiResponseText);


    // ------------------------------------------------------------------
    // REAL GROUNDEDNESS VALIDATOR (KB/Campaign supported claims only)
    // ------------------------------------------------------------------
    const shouldValidate =
  Boolean(contextText?.trim() || campaignContextText?.trim()) &&
  aiResponseText !== fallbackMessage &&
  !looksLikeClarification;


    if (shouldValidate) {
      const highRiskIntent =
        aiExtract.intent === "pricing" || aiExtract.intent === "offer";

      // Only fail-close when pricing/offer is NOT supported by KB/Campaign signals
      // (i.e. when the model might be guessing).
      const failClosed =
        highRiskIntent &&
        pricingEstimateRequired &&
        !kbHasPricingSignals &&
        !campaignHasPricingSignals;

      const v = await validateGroundedness({
        answer: aiResponseText,
        userMessage: user_message,
        kbContext: contextText,
        campaignContext: campaignContextText,
        logger,
        failClosed,
      });

      if (!v.grounded) {
        // Prefer grounded rewrite; if missing, fall back to safe clarification
        aiResponseText =
          v.revised_answer ||
          "I can help — which exact variant (fuel + transmission) is this for? I’ll share the exact pricing from the knowledge base.";
      }
    }

    // ------------------------------------------------------------------
    // GROUNDEDNESS VALIDATOR (HIGH-RISK: pricing/offer/spec/policy)
    // If pricing signals are missing from KB/Campaign, block numeric answers.
    // ------------------------------------------------------------------
    const highRiskIntent =
      aiExtract.intent === "pricing" || aiExtract.intent === "offer";

    // Block pricing-style answers ONLY when pricing is truly unsupported by KB or campaign
    if (
      highRiskIntent &&
      pricingEstimateRequired &&
      !kbHasPricingSignals &&
      !campaignHasPricingSignals
    ) {
      const hasAnyNumber = /\d/.test(aiResponseText);

      if (answerLooksLikePricingOrOffer(aiResponseText) || hasAnyNumber) {
        logger.warn("[validator] blocked unsupported pricing-style answer", {
          intent: aiExtract.intent,
          kb_found: kbFound,
          kb_has_pricing_signals: kbHasPricingSignals,
          campaign_has_pricing_signals: campaignHasPricingSignals,
        });

        aiResponseText =
          "I can help — which exact variant (fuel + transmission) is this for? I’ll share the exact quote from the knowledge base.";
      }
    }

    
    // ------------------------------------------------------------------
    // HARD DO-NOT-SAY ENFORCEMENT:
    // Do not say "can't verify/can't confirm" unless user provided a numeric claim.
    // ------------------------------------------------------------------
    const userProvidedNumber = /\d|₹/.test(user_message || "");
    const containsCantVerify =
      /\b(can'?t|cannot)\s+(verify|confirm)\b/i.test(aiResponseText) ||
      /verify\s+nahi/i.test(aiResponseText) ||
      /मैं\s+verify/i.test(aiResponseText);

    if (!userProvidedNumber && containsCantVerify) {
      logger.warn("[validator] removed cant-verify phrasing (no user numeric claim)", {
        intent: aiExtract.intent,
      });

      // Replace with one short clarifying question (variant only).
      aiResponseText =
        "Sure — which exact variant (fuel + transmission) should I quote for?";
    }

    // 14) Wallet debit + AI usage log (only if AI was actually called)
    if (aiResult) {
      const chargedAmount = getChargedAmountForModel(aiResult.model);

      // If wallet missing earlier but we are here => block (since this is AI)
      if (!wallet) {
        return new Response(
          JSON.stringify({
            error: "Wallet not available",
            error_code: "WALLET_NOT_AVAILABLE",
            request_id,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }

      if (wallet.balance < chargedAmount) {
        logger.warn("[wallet] insufficient balance for AI call", {
          balance: wallet.balance,
          required: chargedAmount,
        });

        // AUDIT: wallet blocked (low balance)
        await logAuditEvent(supabase, {
          organization_id: organizationId,
          action: "wallet_blocked",
          entity_type: "wallet",
          entity_id: wallet.id,
          actor_user_id: null,
          actor_email: null,
          metadata: {
            reason: "LOW_WALLET_BALANCE",
            balance: wallet.balance,
            required: chargedAmount,
            model: aiResult.model,
            conversation_id,
            channel,
            request_id,
          },
        });

        return new Response(
          JSON.stringify({
            error: "Insufficient wallet balance",
            error_code: "LOW_WALLET_BALANCE",
            request_id,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }

      const estimatedCost = estimateActualCost({
        provider: aiResult.provider,
        model: aiResult.model,
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
      });

      // 1) Insert AI usage log FIRST
      const { data: usage, error: usageError } = await supabase
        .from("ai_usage_logs")
        .insert({
          organization_id: organizationId,
          conversation_id: conversation_id,
          provider: aiResult.provider,
          model: aiResult.model,
          input_tokens: aiResult.inputTokens,
          output_tokens: aiResult.outputTokens,
          estimated_cost: estimatedCost,
          charged_amount: chargedAmount,
        })
        .select("id")
        .single();

      if (usageError || !usage) {
        logger.error("[wallet] ai usage insert failed", { usageError });
        return new Response("AI usage logging failed", { status: 500 });
      }

      // 2) Debit wallet
      const walletTxnId = await createWalletDebit({
        walletId: wallet.id,
        organizationId, // ✅ ADD THIS LINE
        amount: chargedAmount,
        aiUsageId: usage.id,
      });

      if (!walletTxnId) {
        logger.error("[wallet] debit failed");
        return new Response(
          JSON.stringify({
            error: "Wallet debit failed",
            error_code: "WALLET_DEBIT_FAILED",
            request_id,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // AUDIT: wallet debit success for AI chat
      await logAuditEvent(supabase, {
        organization_id: organizationId,
        action: "wallet_debit_ai_chat",
        entity_type: "wallet_transaction",
        entity_id: walletTxnId,
        actor_user_id: null,
        actor_email: null,
        metadata: {
          amount: chargedAmount,
          provider: aiResult.provider,
          model: aiResult.model,
          conversation_id,
          channel,
          request_id,
          ai_usage_id: usage.id,
        },
      });

      // 3) Link usage → wallet transaction
      await supabase
        .from("ai_usage_logs")
        .update({ wallet_transaction_id: walletTxnId })
        .eq("id", usage.id);
    }

    // 15) NO-REPLY handling (do NOT save message / do NOT send)
    if (aiResponseText.trim() === AI_NO_REPLY_TOKEN) {
      if (resolvedWorkflow) {
        logger.warn("[ai-handler] NO_REPLY blocked due to active workflow", {
          workflow_id: resolvedWorkflow.workflow_id,
        });

        aiResponseText = "Okay, noted. Let me know how you’d like to proceed.";
      } else {
        logger.info("[ai-handler] AI chose not to reply", { user_message });

        // AUDIT: AI no-reply
        await logAuditEvent(supabase, {
          organization_id: organizationId,
          action: "ai_no_reply",
          entity_type: "conversation",
          entity_id: conversation_id,
          actor_user_id: null,
          actor_email: null,
          metadata: {
            channel,
            request_id,
            user_message: user_message.slice(0, 500),
            kb_match: kbMatchMeta ?? null,
            has_workflow: Boolean(workflowInstructionText?.trim()),
          },
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation_id);

        return new Response(
          JSON.stringify({ conversation_id, no_reply: true, request_id }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // --------------------------------------------------
    // WORKFLOW PROGRESSION (ADVANCE STEP AFTER AI REPLY)
    // --------------------------------------------------
    if (resolvedWorkflow) {
      const steps = await getWorkflowSteps(
        resolvedWorkflow.workflow_id!,
        logger
      );

      const nextStep = (resolvedWorkflow.current_step_number ?? 1) + 1;
      const completed = nextStep > steps.length;

      await saveWorkflowProgress(
        resolvedWorkflow.id,
        organizationId,
        nextStep,
        resolvedWorkflow.variables ?? {},
        completed,
        logger
      );
    }

    // 16) Phase 6.3 — Log unanswered question
    // - Classic fallback
    // - OR kb_only blocked reply (P2)
    const shouldLogUnanswered =
      (aiResponseText === fallbackMessage && !intentNeedsKB) ||
      (aiMode === "kb_only" && forcedReplyText !== null);

    if (shouldLogUnanswered) {
      await logUnansweredQuestion({
        organization_id: organizationId,
        conversation_id,
        channel,
        question: user_message,
        ai_response: aiResponseText,
        logger,
      });

      // AUDIT: unanswered saved (fallback used)
      await logAuditEvent(supabase, {
        organization_id: organizationId,
        action: "unanswered_logged",
        entity_type: "conversation",
        entity_id: conversation_id,
        actor_user_id: null,
        actor_email: null,
        metadata: {
          channel,
          request_id,
          question: user_message.slice(0, 500),
          kb_match: kbMatchMeta ?? null,
          has_workflow: Boolean(workflowInstructionText?.trim()),
        },
      });
    }

    if (
      aiExtract.intent === "pricing" &&
      kbFound &&
      aiResponseText === fallbackMessage
    ) {
      logger.error("[guard] pricing fallback despite KB present");
    }

    // 17) Save message + update conversation
    await supabase.from("messages").insert({
      conversation_id,
      organization_id: organizationId,
      sender: "bot",
      message_type: "text",
      text: aiResponseText,
      channel,
      order_at: new Date().toISOString(),
      outbound_dedupe_key: request_id,
      metadata: { request_id, trace_id, kb: kbMatchMeta ?? null },
    });

    // 🔒 Persist locked entities (Issue 4)
    await supabase
      .from("conversations")
      .update({
        ai_last_entities: nextEntitiesWithKb,
      })
      .eq("id", conversation_id);

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    // 18) WhatsApp send
    if (channel === "whatsapp" && contactPhone) {
      await safeWhatsAppSend(logger, {
        organization_id: organizationId,
        to: contactPhone,
        type: "text",
        text: aiResponseText,
      });
    }

    // PHASE 4: finalize AI trace (best-effort)
    await traceUpdate(trace_id, {
      status: "succeeded",
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        conversation_id,
        ai_response: aiResponseText,
        request_id,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[ai-handler] Fatal error", err);

    // PHASE 4: mark trace failed (best-effort)
    await traceUpdate(trace_id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_stage: "fatal",
      error: { message: String(err?.message ?? err) },
    });

    return new Response(
      JSON.stringify({
        error: err?.message ?? "Internal Server Error",
        error_code: "INTERNAL_ERROR",
        request_id,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
