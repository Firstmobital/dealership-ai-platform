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
const AI_NO_REPLY_TOKEN = "<NO_REPLY>";

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[ai-handler] Missing env vars", {
    hasProjectUrl: !!PROJECT_URL,
    hasServiceRoleKey: !!SERVICE_ROLE_KEY,
    hasOpenAI: !!OPENAI_API_KEY,
    hasGemini: !!GEMINI_API_KEY,
  });
}

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
  similarity: number;
  score: number;
};

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
    "finance"
  ];

  if (keywords.some((k) => t.includes(k))) return true;

  // Numeric patterns that often indicate price/discount (₹ 12,34,567 / 123456 / 40k etc.)
  const hasLargeNumber = /\\b\d{2,}(?:[\d,\.]*\d)?\\b/.test(t);
  const hasKNotation = /\\b\d{1,3}\s?(k|lac|lakh|cr|crore)\\b/.test(t);
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
  t = t.replace(/\\b(rs\.?|inr)\s*[0-9][0-9,\.\s]*/gi, "$1 [REDACTED]");

  // Redact amounts (including shorthand)
  t = t.replace(/\\b\d{2,}(?:[\d,\.]*\d)?\\b/g, "[REDACTED_NUMBER]");
  t = t.replace(/\\b\d{1,3}\s?(k|lac|lakh|cr|crore)\\b/gi, "[REDACTED_AMOUNT]");

  // Also redact single-digit tokens to avoid small numeric leakage (e.g., "40" -> already covered, but "5k" etc.)
  t = t.replace(/\\b\d+\\b/g, "[REDACTED_NUMBER]");

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
type AiMode = "auto" | "suggest" | "off";

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

/* ============================================================================
   PSF HELPERS
============================================================================ */

async function loadOpenPsfCaseByConversation(conversationId: string) {
  const { data } = await supabase
    .from("psf_cases")
    .select("id, campaign_id, sentiment")
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
    console.error("[wallet] missing organizationId in createWalletDebit", params);
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
  const t = (msg || '').trim().toLowerCase();
  if (!t) return false;
  // Keep conservative: only short generic follow-ups
  const phrases = [
    'tell me more',
    'more',
    'details',
    'detail',
    'ok',
    'okay',
    'yes',
    'y',
    'haan',
    'ha',
    'sure',
    'continue',
    'next',
    'k',
    'pls',
    'please',
  ];
  if (phrases.includes(t)) return true;
  if (t.length <= 12 && /^[a-z\s]+$/.test(t)) return true;
  return false;
}

function isExplicitTopicChange(msg: string): boolean {
  const t = (msg || '').toLowerCase();
  // Explicit switches only. If present, do NOT force continuity.
  const patterns = [
    /different/,
    /another/,
    /change/,
    /other/,
    /variant/,
    /model/,
    /harrier/,
    /nexon/,
    /safari/,
    /tiago/,
    /tigor/,
    /altroz/,
    /punch/,
    /service/,
    /booking/,
    /test drive/,
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
  extracted: { vehicle_model: string | null; intent: string; fuel_type: string | null };
  campaignContextText: string;
}): string {
  const raw = (params.userMessage || "").trim().replace(/\s+/g, " ");
  if (!raw) return raw;
  if (!params.isFollowUp) return raw;

  const locked = params.lockedEntities || {};
  const model = String(params.extracted.vehicle_model || locked.model || "").trim();
  const intent = String(params.extracted.intent || locked.intent || "other");

  const topic = model ? ("about " + model) : "about the discussed vehicle/offer";

  // Make follow-ups searchable by including intent-specific keywords
  let focus = "details, features, variants, availability and next steps";
  if (intent === "pricing" || intent === "offer") {
    focus = "pricing, offers, discounts, variants, on-road breakup, availability and next steps";
  } else if (intent === "service") {
    focus = "service details, schedule, required info, cost estimate and next steps";
  }

  const hasCampaign = Boolean((params.campaignContextText || "").trim());
  const campaignHint = hasCampaign ? "Align with any campaign/offer context if present." : "";

  // IMPORTANT: do not embed generic follow-up text alone (e.g., "tell me more")
  return ("Provide more information " + topic + ". Focus on " + focus + ". " + campaignHint).trim();
}



async function safeChatCompletion(
  logger: ReturnType<typeof createLogger>,
  params: { systemPrompt: string; userMessage: string }
): Promise<string | null> {
  // Used for: follow-up suggestion + workflow intent classification
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userMessage },
      ],
    });

    return resp.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.error("[openai] completion error", { error: err });
    return null;
  }
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

/* ============================================================================
   PHASE 6 — DETERMINISTIC KB RESOLVER (NO VECTORS, NO SCORING)
   Order:
   1) Exact Title match (longest title contained in message)
   2) Keyword match (strict: exactly one article allowed)
============================================================================ */
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

function titleMatchesMessage(message: string, title: string): boolean {
  const msg = normalizeForMatch(message);
  const titleNorm = normalizeForMatch(title);

  const tokens = titleNorm.split(" ").filter(
    (t) =>
      t.length >= 3 &&
      !/^\d{4}$/.test(t) && // ignore years like 2026
      t !== "pricing" // normalize price/pricing difference
  );

  if (!tokens.length) return false;

  return tokens.every((t) => containsPhrase(msg, t));
}

/* ============================================================================
   SEMANTIC KB RESOLVER (EMBEDDINGS-BASED)
============================================================================ */

async function resolveKnowledgeContextSemantic(params: {
  userMessage: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
  vehicleModel?: string | null;
}): Promise<{
    context: string;
    article_ids: string[];
    confidence: 'strong' | 'weak';
    best_similarity: number;
    option_titles: string[];
  debug: {
    used: { id: string; article_id: string; similarity: number; title: string }[];
    rejected: { id: string; article_id: string; similarity: number; title: string; reason: string }[];
    thresholds: { hardMin: number; softMin: number; initial: number; fallback: number };
  };
} | null> {
  const { userMessage, organizationId, logger } = params;

  // Phase 2: Keep KB *strict* to reduce hallucinations.
  // - First pass: higher threshold.
  // - Fallback: slightly lower, but still requires a hard minimum similarity.
  const INITIAL_THRESHOLD = 0.58;
  const FALLBACK_THRESHOLD = 0.50;
  const HARD_MIN_SIMILARITY = 0.48; // anything below this is treated as noise
  const SOFT_MIN_SIMILARITY = 0.55; // below this we avoid presenting as authoritative

  try {
    // 1) Create embedding for user query (Phase 5: cache by org+model+text_hash)
    const EMBED_MODEL = "text-embedding-3-small";
    const normalized = (userMessage || "").trim().replace(/\s+/g, " ");
    const textHash = await sha256Hex(normalized.toLowerCase());

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
        input: normalized,
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

    const runMatch = async (threshold: number) => {
      return await supabase.rpc("match_knowledge_chunks_scoped", {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: 12,
        p_organization_id: organizationId,
        p_only_published: true,
      });
    };

    // 2) Match KB chunks (strict → fallback)
    let { data, error } = await runMatch(INITIAL_THRESHOLD);
    if ((error || !data?.length) && FALLBACK_THRESHOLD < INITIAL_THRESHOLD) {
      ({ data, error } = await runMatch(FALLBACK_THRESHOLD));
    }

    if (error || !data?.length) return null;

    const rows = (data as any[]).map((r) => ({
      id: String(r.id),
      article_id: String(r.article_id),
      title: String(r.article_title || "KB"),
      chunk: String(r.chunk || ""),
      similarity: Number(r.similarity ?? 0),
    }));

    // 3) Post-filter + ranking
    const model = (params.vehicleModel || "").trim();
    const modelNorm = model ? normalizeForMatch(model) : "";

    const used: Pick<KBScoredRow, "id" | "article_id" | "title" | "similarity">[] = [];
    const rejected: {
      id: string;
      article_id: string;
      title: string;
      similarity: number;
      reason: string;
    }[] = [];

    // Helper: boost if model string appears in title/chunk (never hard-drop)
    function boostScore(row: Omit<KBScoredRow, "score">): number {
      let score = row.similarity;
      if (modelNorm) {
        const t = normalizeForMatch(row.title);
        const c = normalizeForMatch(row.chunk);
        if (t.includes(modelNorm)) score += 0.05;
        // word-boundary-ish presence
        if (containsPhrase(c, modelNorm)) score += 0.03;
      }
      return score;
    }

    // Reject obvious noise
    const viable: KBScoredRow[] = [];
    for (const r of rows) {
      if (!r.chunk.trim()) {
        rejected.push({ ...r, reason: "empty_chunk" });
        continue;
      }
      if (r.similarity < HARD_MIN_SIMILARITY) {
        rejected.push({ id: r.id, article_id: r.article_id, similarity: r.similarity, title: r.title, reason: "below_hard_min" });
        continue;
      }
      viable.push({ ...r, score: boostScore(r) });
    }

    if (!viable.length) return null;

    // Sort by boosted score desc (tie-break by similarity)
    viable.sort((a, b) => (b.score - a.score) || (b.similarity - a.similarity));

    // Determine confidence: strong vs weak (best-effort KB still allowed)
    const best = viable[0];
    const confidence: 'strong' | 'weak' = best.similarity >= SOFT_MIN_SIMILARITY ? 'strong' : 'weak';

    if (confidence === 'weak') {
      logger.warn('[kb] semantic match weak; injecting best-effort KB', {
        best_similarity: best.similarity,
        best_title: best.title,
        vehicle_model: model || null,
      });
    }

    // 4) Build compact context from top rows with dedupe
    const usedArticleIds = new Set<string>();
    const contextParts: string[] = [];
    const seenChunkHashes = new Set<string>();

    for (const r of viable.slice(0, 6)) {
      usedArticleIds.add(r.article_id);

      // De-dupe chunks by normalized prefix hash
      const key = normalizeForMatch(r.chunk).slice(0, 280);
      if (seenChunkHashes.has(key)) continue;
      seenChunkHashes.add(key);

      contextParts.push(`### ${r.title} (sim=${r.similarity.toFixed(3)})
${r.chunk.trim()}`);
      used.push({ id: r.id, article_id: r.article_id, similarity: r.similarity, title: r.title });
      if (contextParts.length >= 4) break; // keep context small
    }

    let context = contextParts.join("\n\n").trim();
    if (!context) return null;

    const MAX_KB_CHARS = 6500;
    if (context.length > MAX_KB_CHARS) context = context.slice(0, MAX_KB_CHARS);

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
      best_similarity: best.similarity,
      option_titles: Array.from(new Set(used.map((u) => u.title))).filter(Boolean).slice(0, 6),
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

async function resolveKnowledgeContext(params: {
  userMessage: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
  vehicleModel?: string | null;
}): Promise<{
  context: string;
  match_type: "title" | "keyword";
  article_id: string;
  title: string;
} | null> {
  const { userMessage, organizationId, logger } = params;

  const msg = normalizeForMatch(userMessage);
  if (!msg) return null;

  // Load articles in scope (sub-org: allow null/global + exact division)
  const { data: articles, error } = await supabase
    .from("knowledge_articles")
    .select("id, title, content, keywords, status")
    .eq("organization_id", organizationId)
    .eq("status", "published");

  if (error) {
    logger.error("[kb] failed to load articles", { error });
    return null;
  }

  if (!articles?.length) {
    logger.warn("[kb] ZERO articles found for organization", {
      organization_id: organizationId,
    });
    return null;
  }

  const scoped = articles as any[];

  // 🔍 AI-assisted model scoping (smart, typo-safe)
  let kbScoped = scoped;

  if (params.vehicleModel) {
    const model = normalizeForMatch(params.vehicleModel);

    const filtered = scoped.filter((a) =>
      normalizeForMatch(a.title).includes(model)
    );

    if (filtered.length > 0) {
      kbScoped = filtered;
    }

    logger.info("[kb] scoped by AI model", {
      vehicle_model: params.vehicleModel,
      before: scoped.length,
      after: filtered.length,
      used_filtered: filtered.length > 0,
    });
  }

  const effectiveArticles = kbScoped;

  // -------------------------
  // PASS 1 — EXACT TITLE MATCH
  // longest title that appears in the message wins (deterministic)
  // -------------------------
  const titleCandidates = effectiveArticles
    .map((a) => ({
      ...a,
      title_norm: normalizeForMatch(a.title),
      title_len: normalizeForMatch(a.title).length,
    }))
    .filter(
      (a) => a.title_len >= 4 && titleMatchesMessage(userMessage, a.title)
    )
    .sort(
      (a, b) =>
        b.title_len - a.title_len || String(a.id).localeCompare(String(b.id))
    );

  if (titleCandidates.length) {
    const best = titleCandidates[0];
    logger.info("[kb] title match", { article_id: best.id, title: best.title });

    return {
      context: String(best.content || "").trim(),
      match_type: "title",
      article_id: best.id,
      title: best.title,
    };
  }

  // -------------------------
  // PASS 2 — KEYWORD MATCH (DETERMINISTIC, NO SCORING)
  // We avoid "strict single-hit" because generic keywords like "discount"
  // would otherwise match many model articles and get rejected.
  //
  // Deterministic rule:
  // - Count how many keywords from each article appear in the message
  // - Pick the article with the highest count
  // - If tie for highest count -> reject (ask user for clarity)
  // -------------------------
  const keywordCandidates = effectiveArticles
    .map((a) => {
      const kws: string[] = Array.isArray(a.keywords) ? a.keywords : [];
      const normalizedKws = kws
        .map((k) => normalizeForMatch(String(k)))
        .filter((k) => k.length >= 3);

      let matchCount = 0;
      let bestLen = 0;

      for (const k of normalizedKws) {
        if (containsPhrase(msg, k)) {
          matchCount += 1;
          if (k.length > bestLen) bestLen = k.length;
        }
      }

      return { a, matchCount, bestLen };
    })
    .filter((x) => x.matchCount > 0)
    .sort((x, y) => {
      // higher match count wins
      if (y.matchCount !== x.matchCount) return y.matchCount - x.matchCount;
      // then prefer longer matched keyword (more specific)
      if (y.bestLen !== x.bestLen) return y.bestLen - x.bestLen;
      // final deterministic tie-breaker
      return String(x.a.id).localeCompare(String(y.a.id));
    });

  if (!keywordCandidates.length) return null;

  const top = keywordCandidates[0];
  const tied =
    keywordCandidates.length > 1 &&
    keywordCandidates[1].matchCount === top.matchCount &&
    keywordCandidates[1].bestLen === top.bestLen;

  if (tied) {
    // 🔒 Deterministic tie-breaker using locked entity (model)
    if (params.vehicleModel) {
      const modelNorm = normalizeForMatch(params.vehicleModel);

      const entityFiltered = keywordCandidates.filter((x) =>
        normalizeForMatch(x.a.title).includes(modelNorm)
      );

      if (entityFiltered.length === 1) {
        const best = entityFiltered[0].a;

        logger.info("[kb] keyword tie resolved by locked model", {
          model: params.vehicleModel,
          article_id: best.id,
          title: best.title,
        });

        return {
          context: String(best.content || "").trim(),
          match_type: "keyword",
          article_id: best.id,
          title: best.title,
        };
      }
    }

    logger.warn("[kb] keyword tie -> reject", {
      top: keywordCandidates.slice(0, 5).map((x) => ({
        id: x.a.id,
        title: x.a.title,
        matchCount: x.matchCount,
      })),
    });

    return null;
  }

  const best = top.a;
  logger.info("[kb] keyword match", {
    article_id: best.id,
    title: best.title,
    matchCount: top.matchCount,
  });

  return {
    context: String(best.content || "").trim(),
    match_type: "keyword",
    article_id: best.id,
    title: best.title,
  };
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
   FOLLOW-UP SUGGESTION PROMPT (PHASE 1)
============================================================================ */
function buildFollowupSuggestionPrompt(params: {
  campaignContextText: string;
  personalityBlock: string;
}) {
  return `
You are an AI assistant helping a dealership agent.

Your task:
- Suggest ONE short follow-up message
- Sound human and polite
- Do NOT repeat previous messages
- Keep it WhatsApp-friendly (1–2 lines)

PERSONALITY RULES:
${params.personalityBlock}

CAMPAIGN CONTEXT:
${params.campaignContextText || "No campaign context"}

Return ONLY the suggested message text.
`.trim();
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
      mode?: "reply" | "suggest_followup";
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
    const mode = body.mode ?? "reply";

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

    const isSuggestOnly = aiMode === "suggest";

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
    // Only enforced for non-greeting messages (greetings are free).
    if (!isGreetingMessage(user_message)) {
      const estimatedTokens = Math.max(
        0,
        Math.ceil((user_message || "").length / 4) + 800
      );

      try {
        await supabase.rpc("consume_ai_quota", {
          p_organization_id: organizationId,
          p_estimated_tokens: estimatedTokens,
        });
      } catch (err: any) {
        // Supabase will surface the raised exception as an error.
        const msg = String(err?.message || err || "");
        if (msg.toLowerCase().includes("ai_rate_limit_exceeded")) {
          logger.warn("[rate-limit] exceeded", {
            estimated_tokens: estimatedTokens,
          });

          return new Response(
            JSON.stringify({
              error: "rate_limit_exceeded",
              request_id,
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }

        logger.error("[rate-limit] consume_ai_quota failed", { error: err });
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
        sender: "bot",
        message_type: "text",
        text: greetText,
        channel,
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
        sender: "bot",
        message_type: "text",
        text: replyText,
        channel,
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
      intent: 'other',
    };

    // Phase 2: Continuity lock for short follow-ups
    const locked = conv.ai_last_entities ?? {};
    const lockedTopic = locked?.topic ?? null;
    const lockedIntent = locked?.intent ?? null;
    const lockedModel = locked?.model ?? null;
    const lockedFuel = locked?.fuel_type ?? null;

    const shouldContinue =
      lockedTopic &&
      isShortFollowupMessage(user_message) &&
      !isExplicitTopicChange(user_message);

    if (shouldContinue) {
      aiExtract = {
        vehicle_model: lockedModel,
        fuel_type: lockedFuel,
        intent:
          (lockedIntent as any) ??
          (lockedTopic === 'offer_pricing' ? 'pricing' : 'other'),
      };
      logger.info('[ai-handler] follow-up continuity lock applied', {
        locked_topic: lockedTopic,
        locked_intent: aiExtract.intent,
        locked_model: lockedModel,
      });
    } else if (!isGreetingMessage(user_message) && aiMode !== 'suggest') {
      // Only extract intent if KB may be used
      aiExtract = await extractUserIntentWithAI({
        userMessage: user_message,
        logger,
      });
      logger.info('[ai-extract] result', aiExtract);
    }

/* ---------------------------------------------------------------------------
   PHASE 1 — ENTITY DETECTION & LOCKING (STEP 5)
--------------------------------------------------------------------------- */

    // 🧠 Merge AI-extracted entities into locked entities (Issue 4)
    const nextEntities = mergeEntities(conv.ai_last_entities, {
      model: aiExtract.vehicle_model ?? undefined,
      fuel_type: aiExtract.fuel_type ?? undefined,
      // Phase 2: keep intent/topic sticky; do not wipe on weak turns
      intent: aiExtract.intent && aiExtract.intent !== 'other' ? aiExtract.intent : undefined,
      topic:
        aiExtract.intent === 'pricing' || aiExtract.intent === 'offer'
          ? 'offer_pricing'
          : undefined,
    });
    

    // 5) Follow-up suggestion mode (NO send, NO DB write)
    if (mode === "suggest_followup") {
      logger.info("[ai-handler] follow-up suggestion requested");

      // Optional campaign context (best-effort)
      let campaignContextText = "";
      if (contactId) {
        const campaignCtx = await fetchCampaignContextForContact(
          organizationId,
          contactId,
          logger
        );
        if (campaignCtx)
          campaignContextText = buildCampaignContextText(campaignCtx);
      }

      const prompt = buildFollowupSuggestionPrompt({
        campaignContextText,
        personalityBlock: personaBlock,
      });

      const suggestion = await safeChatCompletion(logger, {
        systemPrompt: prompt,
        userMessage: "Suggest a follow-up message.",
      });

      return new Response(
        JSON.stringify({
          conversation_id,
          suggestion: suggestion?.trim() || "",
          request_id,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

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
        .order("order_at", { ascending: true })
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
            m.role === "user" ? { ...m, content: redactUserProvidedPricing(m.content) } : m
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
const isFollowUpForKb = isShortFollowupMessage(user_message) && !isExplicitTopicChange(user_message);
const semanticQueryText = buildSemanticQueryText({
  userMessage: user_message,
  isFollowUp: isFollowUpForKb,
  lockedEntities: conv.ai_last_entities ?? null,
  extracted: aiExtract,
  campaignContextText,
});

if (isFollowUpForKb) {
  logger.info('[kb] follow-up semantic query rewrite', {
    raw: user_message.slice(0, 80),
    semantic_query: semanticQueryText.slice(0, 180),
  });
}

const semanticKB = await resolveKnowledgeContextSemantic({
  userMessage: semanticQueryText,
  organizationId,
  logger,
  vehicleModel:
    aiExtract.vehicle_model ??
    (conv.ai_last_entities?.model ?? null),
});


if (semanticKB?.context) {
  contextText = semanticKB.context;
  kbFound = true;
  kbMatchMeta = {
    match_type: 'semantic',
    article_ids: semanticKB.article_ids,
    confidence: semanticKB.confidence,
    best_similarity: semanticKB.best_similarity,
    option_titles: semanticKB.option_titles,
  };
} else {
  // 10B) Deterministic fallback (KEEP EXISTING LOGIC)
  const resolvedKB = await resolveKnowledgeContext({
    userMessage: user_message,
    organizationId,
    logger,
    vehicleModel:
      aiExtract.vehicle_model ??
      (conv.ai_last_entities?.model ?? null),
  });

  if (resolvedKB?.context) {
    contextText = resolvedKB.context;
    kbFound = true;
    kbMatchMeta = {
      match_type: resolvedKB.match_type,
      article_id: resolvedKB.article_id,
      title: resolvedKB.title,
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
  kb_top_score: semanticKB?.debug?.used?.[0]?.similarity ?? null,
  kb_chunks: semanticKB?.debug?.used ?? [],
  decision: {
    kb_attempted: kbAttempted,
    kb_found: kbFound,
    kb_match_meta: kbMatchMeta,
    kb_thresholds: semanticKB?.debug?.thresholds ?? null,
    kb_rejected: semanticKB?.debug?.rejected ?? [],
  },
};
await traceUpdate(trace_id, kbTracePatch);

// Persist KB anchors into conversation memory for follow-ups (best-effort)
const nextEntitiesWithKb: any = { ...(nextEntities as any) };
try {
  if (kbFound) {
    nextEntitiesWithKb.last_kb = {
      match_type: kbMatchMeta?.match_type ?? null,
      article_ids: kbMatchMeta?.article_ids ?? (kbMatchMeta?.article_id ? [kbMatchMeta.article_id] : []),
      confidence: kbMatchMeta?.confidence ?? null,
      best_similarity: kbMatchMeta?.best_similarity ?? null,
      option_titles: kbMatchMeta?.option_titles ?? (kbMatchMeta?.title ? [kbMatchMeta.title] : []),
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
const kbHasPricingSignals = looksLikePricingOrOfferContext(contextText);
const campaignHasPricingSignals = looksLikePricingOrOfferContext(campaignContextText) ||
  looksLikePricingOrOfferContext(JSON.stringify(conv.campaign_context ?? {}));

const pricingEstimateRequired =
  requiresAuthoritativeKB && !(kbHasPricingSignals || campaignHasPricingSignals);

if (pricingEstimateRequired) {
  logger.warn('[pricing] verified pricing not found in KB/Campaign — allow estimate with disclaimer', {
    intent: aiExtract.intent,
    vehicle_model: aiExtract.vehicle_model,
    kb_found: kbFound,
    kb_has_pricing_signals: kbHasPricingSignals,
    campaign_has_pricing_signals: campaignHasPricingSignals,
  });
}

// 🔒 PRICING SAFETY NET
if (!kbFound && aiExtract.intent === "pricing" && contextText === "") {
  logger.warn("[kb] pricing intent but no KB context found");
}

    // 🧠 Intent-aware soft handling (Issue 3 - Option B)
    // If user intent is pricing/features but KB has no match,
    // allow AI to ask ONE clarifying question instead of fallback.
    const intentNeedsKB =
      aiExtract.intent === "pricing" || aiExtract.intent === "features";

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
    // WORKFLOW CONTEXT (GUIDANCE ONLY — NO EXECUTION)
    // ------------------------------------------------------------------
    let workflowInstructionText = "";
    let resolvedWorkflow: WorkflowLogRow | null = null;

    const activeWorkflow = await loadActiveWorkflow(conversation_id, organizationId, logger);
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
        resolvedWorkflow = await startWorkflow(wf.id, conversation_id, organizationId, logger);
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

    const kbSufficientForIntent = Boolean(contextText?.trim()) && (
      requiresAuthoritativeKB ? (kbHasPricingSignals || campaignHasPricingSignals) : true
    );

    const workflowRequiresKB = (workflowInstructionText || "").toLowerCase().includes("knowledge base") ||
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
    const kbConfidence: 'strong' | 'weak' | 'none' = (kbMatchMeta?.confidence as any) ?? (kbFound ? 'strong' : 'none');
    const kbOptionTitles: string[] = (kbMatchMeta?.option_titles ?? []).filter(Boolean).slice(0, 6);

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
  - Treat ALL user-provided prices, discounts, offers, availability, delivery timelines, and variant claims as UNVERIFIED.
  - You MUST NOT confirm or repeat user-provided numbers as facts unless the same information is present in Knowledge Context or Campaign Context.
  - If the user asks you to confirm an unverified claim ("right?", "correct?"), say you cannot verify it from the authorized sources and ask ONE short clarifying question or offer to connect to a human advisor.
  - Never learn dealership facts from chat history or user repetition.

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
PRICING_ESTIMATE_REQUIRED: ${pricingEstimateRequired ? 'YES' : 'NO'}
- NEVER invent prices or offers.
- NEVER invent prices or offers.
- For pricing/offers, use verified numbers ONLY if they appear in Knowledge Context or Campaign Context.
- If verified numbers are NOT present, you may provide a rough estimate ONLY if it helps the customer, but you MUST clearly say: "This is an estimate. Our sales team will confirm the exact on-road price/offer."
- Never invent discounts/offers. If unsure, provide options and ask ONE short clarifying question (variant/city).

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
- kb_option_titles: ${kbOptionTitles.join(' | ') || 'none'}

KB_META (INTERNAL):
- match_type: ${kbMatchMeta?.match_type || 'none'}
- confidence: ${kbMatchMeta?.confidence || 'n/a'}
- best_similarity: ${kbMatchMeta?.best_similarity ?? 'n/a'}
- option_titles: ${JSON.stringify(kbMatchMeta?.option_titles ?? [], null, 0)}

${contextText}

${workflowRequiresKBButMissing ? "WORKFLOW GUARD: Workflow requires Knowledge Base to proceed, but KB context is missing. Ask ONE short clarifying question or connect to a human advisor. Do NOT guess." : ""}

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


${campaignContextText || "No prior campaign history available."}

ENTITY SAFETY RULE (CRITICAL)
------------------------
- If a vehicle model is locked, keep using it.
- For pricing/offers, do NOT assume numbers. Require verified pricing/offer signals in KB or Campaign Context.
- If variant/city changes the quote and is not known, ask ONE short clarifying question.
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

    // 12) AI settings
    const aiSettings = await resolveAISettings({
      organizationId,
      logger,
    });

    logger.info("[ai-decision] context_summary", {
      kb_attempted: kbAttempted,
      kb_found: kbFound,
      kb_match: kbMatchMeta ?? null,
      has_workflow: Boolean(workflowInstructionText?.trim()),
      has_campaign: Boolean(campaignContextText?.trim()),
    });

    // 13) Run AI completion
    const aiResult = await runAICompletion({
      provider: aiSettings.provider,
      model: aiSettings.model,
      systemPrompt,
      historyMessages: historyMessagesSafe,
      logger,
    });

    let aiResponseText = aiResult?.text ?? fallbackMessage;
    if (!aiResponseText) aiResponseText = fallbackMessage;

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

    // 16) Phase 6.3 — Log unanswered question (fallback only)
    if (aiResponseText === fallbackMessage && !intentNeedsKB) {
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

    /* ---------------------------------------------------------------------------
   PHASE 1 — SUGGEST MODE HARD STOP (STEP 7)
--------------------------------------------------------------------------- */

    if (isSuggestOnly) {
      logger.info("[ai-handler] suggest-only mode — returning draft");

      return new Response(
        JSON.stringify({
          conversation_id,
          draft: aiResponseText,
          auto_send: false,
          request_id,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 17) Save message + update conversation
    await supabase.from("messages").insert({
      conversation_id,
      sender: "bot",
      message_type: "text",
      text: aiResponseText,
      channel,
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
      status: 'succeeded',
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
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_stage: 'fatal',
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