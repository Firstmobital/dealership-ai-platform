// supabase/functions/ai-handler/index.ts
// deno-lint-ignore-file no-explicit-any
// PHASE 5 — WALLET ENFORCEMENT FINAL
// PART 1 / 4

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ============================================================================
   ENV
============================================================================ */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
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
  sub_organization_id?: string | null;
  channel?: string;
};

function createLogger(ctx: LogContext) {
  const base = {
    request_id: ctx.request_id,
    conversation_id: ctx.conversation_id,
    organization_id: ctx.organization_id,
    sub_organization_id: ctx.sub_organization_id,
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
  amount: number;
  aiUsageId: string;
}) {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: params.walletId,
      type: "debit",
      direction: "out",
      amount: params.amount,
      reference_type: "ai_usage",
      reference_id: params.aiUsageId,
    })
    .select("id")
    .single();

  if (error) return null;
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
/* ============================================================================
   EMBEDDINGS + CHAT (SAFE)
============================================================================ */
async function safeEmbedding(
  logger: ReturnType<typeof createLogger>,
  input: string
): Promise<number[] | null> {
  try {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input,
    });
    return resp.data?.[0]?.embedding ?? null;
  } catch (err) {
    logger.error("[openai] embedding error", { error: err });
    return null;
  }
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

/* ============================================================================
   PHASE 4 — AI SETTINGS (ORG → SUB-ORG OVERRIDE)
============================================================================ */
async function resolveAISettings(params: {
  organizationId: string;
  subOrganizationId: string | null;
  logger: ReturnType<typeof createLogger>;
}): Promise<{
  provider: "openai" | "gemini";
  model: string;
}> {
  const { organizationId, subOrganizationId, logger } = params;

  if (subOrganizationId) {
    const { data } = await supabase
      .from("ai_settings")
      .select("provider, model")
      .eq("organization_id", organizationId)
      .eq("sub_organization_id", subOrganizationId)
      .maybeSingle();

    if (data?.provider && data?.model) {
      return { provider: data.provider, model: data.model };
    }
  }

  const { data: orgWide } = await supabase
    .from("ai_settings")
    .select("provider, model")
    .eq("organization_id", organizationId)
    .is("sub_organization_id", null)
    .maybeSingle();

  if (orgWide?.provider && orgWide?.model) {
    return { provider: orgWide.provider, model: orgWide.model };
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
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
      ],
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
   PHASE 4 — AI USAGE LOGGING (helper, optional)
============================================================================ */
async function logAIUsage(params: {
  organizationId: string;
  subOrganizationId: string | null;
  conversationId: string;
  provider: "openai" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  chargedAmount: number;
  logger: ReturnType<typeof createLogger>;
}) {
  const {
    organizationId,
    subOrganizationId,
    conversationId,
    provider,
    model,
    inputTokens,
    outputTokens,
    estimatedCost,
    chargedAmount,
    logger,
  } = params;

  try {
    const { error } = await supabase.from("ai_usage_logs").insert({
      organization_id: organizationId,
      sub_organization_id: subOrganizationId,
      conversation_id: conversationId,
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
      charged_amount: chargedAmount,
    });

    if (error) logger.error("[ai-usage] insert failed", { error });
  } catch (err) {
    logger.error("[ai-usage] fatal error", { error: err });
  }
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

/* ============================================================================
   BOT PERSONALITY (ORG → SUB-ORG OVERRIDE)
============================================================================ */
async function loadBotPersonality(params: {
  organizationId: string;
  subOrganizationId: string | null;
}) {
  const { organizationId, subOrganizationId } = params;

  if (subOrganizationId) {
    const { data } = await supabase
      .from("bot_personality")
      .select(
        "tone, language, short_responses, emoji_usage, gender_voice, fallback_message, business_context, dos, donts"
      )
      .eq("organization_id", organizationId)
      .eq("sub_organization_id", subOrganizationId)
      .maybeSingle();

    if (data) return data;
  }

  const { data: orgWide } = await supabase
    .from("bot_personality")
    .select(
      "tone, language, short_responses, emoji_usage, gender_voice, fallback_message, business_context, dos, donts"
    )
    .eq("organization_id", organizationId)
    .is("sub_organization_id", null)
    .maybeSingle();

  return (
    orgWide ?? {
      tone: "Professional",
      language: "English",
      short_responses: true,
      emoji_usage: false,
      gender_voice: "Neutral",
      fallback_message:
        "I’m sorry, I don’t have enough information to answer that.",
      business_context: "",
      dos: "",
      donts: "",
    }
  );
}

/* ============================================================================
   RAG HELPER — SUB-ORG SCOPED + SEMANTIC FALLBACK
============================================================================ */
async function resolveKnowledgeContext(params: {
  embedding: number[];
  userMessage: string;
  organizationId: string;
  subOrganizationId: string | null;
  logger: ReturnType<typeof createLogger>;
}): Promise<{ context: string; forced: boolean } | null> {
  const { embedding, userMessage, organizationId, subOrganizationId, logger } =
    params;

  // PASS 1 — TITLE MATCH (HIGH PRECISION)
  const keywords = userMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(" ")
    .filter(
      (w) =>
        w.length >= 3 &&
        !["who", "what", "is", "are", "the", "this", "that"].includes(w)
    );

  logger.debug("[rag] title keywords", { keywords });

  let titleMatches: any[] = [];

  for (const word of keywords) {
    const { data, error } = await supabase
      .from("knowledge_articles")
      .select("id, title, organization_id, sub_organization_id")
      .eq("organization_id", organizationId)
      .ilike("title", `%${word}%`)
      .limit(3);

    if (error) {
      logger.error("[rag] title query error", { error, word });
      continue;
    }

    if (data?.length) {
      titleMatches = data.filter((a) => {
        if (!subOrganizationId) return true;
        return (
          a.sub_organization_id === null ||
          a.sub_organization_id === subOrganizationId
        );
      });
      if (titleMatches.length) break;
    }
  }

  if (titleMatches.length) {
    const article = titleMatches[0];

    const { data: chunks } = await supabase
      .from("knowledge_chunks")
      .select("chunk")
      .eq("article_id", article.id)
      .order("id", { ascending: true });

    if (chunks?.length) {
      logger.info("[rag] FORCED title match used", {
        article_id: article.id,
        title: article.title,
      });

      return {
        context: chunks.map((c: any) => c.chunk).join("\n\n"),
        forced: true,
      };
    }
  }

  // PASS 2 — SEMANTIC SEARCH (VECTOR)
  const { data: matches, error: matchErr } = await supabase.rpc(
    "match_knowledge_chunks",
    {
      query_embedding: embedding,
      match_count: 15,
      match_threshold: 0.05,
    }
  );

  if (matchErr || !matches?.length) {
    logger.debug("[rag] no semantic matches");
    return null;
  }

  const articleIds = [...new Set(matches.map((m: any) => m.article_id))];

  const { data: articles } = await supabase
    .from("knowledge_articles")
    .select("id, organization_id, sub_organization_id")
    .in("id", articleIds);

  if (!articles?.length) return null;

  const allowedIds = new Set(
    articles
      .filter((a: any) => {
        if (a.organization_id !== organizationId) return false;
        if (!subOrganizationId) return true;
        return (
          a.sub_organization_id === null ||
          a.sub_organization_id === subOrganizationId
        );
      })
      .map((a: any) => a.id)
  );

  const filtered = matches.filter((m: any) => allowedIds.has(m.article_id));
  if (!filtered.length) {
    logger.debug("[rag] semantic matches filtered out by scope");
    return null;
  }

  logger.info("[rag] semantic KB used", {
    matches: filtered.map((m: any) => ({
      article_id: m.article_id,
      similarity: m.similarity,
    })),
  });

  return {
    context: filtered
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, 8)
      .map((m: any) => m.chunk)
      .join("\n\n"),
    forced: false,
  };
}

/* ============================================================================
   WORKFLOW ENGINE — Types
============================================================================ */
type WorkflowRow = {
  id: string;
  organization_id: string | null;
  sub_organization_id: string | null;
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
  subOrgId: string | null,
  logger: ReturnType<typeof createLogger>
): Promise<WorkflowRow | null> {
  const workflows = await safeSupabase<WorkflowRow[]>(
    "load_workflows",
    logger,
    () =>
      supabase
        .from("workflows")
        .select(
          "id, organization_id, sub_organization_id, trigger, mode, is_active"
        )
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

    // Sub-org scoping
    if (wf.sub_organization_id && wf.sub_organization_id !== subOrgId) continue;

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
  logger: ReturnType<typeof createLogger>
): Promise<WorkflowLogRow | null> {
  const data = await safeSupabase<WorkflowLogRow>(
    "start_workflow",
    logger,
    () =>
      supabase
        .from("workflow_logs")
        .insert({
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
  nextStep: number,
  vars: Record<string, any>,
  completed: boolean,
  logger: ReturnType<typeof createLogger>
) {
  const { error } = await supabase
    .from("workflow_logs")
    .update({ current_step_number: nextStep, variables: vars, completed })
    .eq("id", logId);

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
  organization_id: string
  conversation_id: string
  question: string
  ai_response?: string
}) {
  try {
    const { error } = await supabase
      .from("unanswered_questions")
      .insert({
        organization_id: params.organization_id,
        conversation_id: params.conversation_id,
        question: params.question,
        ai_response: params.ai_response ?? null,
      })

    if (error) {
      console.error("[unanswered_questions] insert failed", error)
    }
  } catch (err) {
    console.error("[unanswered_questions] fatal", err)
  }
}

/* ============================================================================
   MAIN HANDLER
============================================================================ */
serve(async (req: Request): Promise<Response> => {
  const request_id = crypto.randomUUID();
  const baseLogger = createLogger({ request_id });

  try {
    // 0) Parse body
    const body = (await req.json()) as {
      conversation_id?: string;
      user_message?: string;
      mode?: "reply" | "suggest_followup";
    };

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
      sub_organization_id: string | null;
      ai_enabled: boolean | null;
    }>("load_conversation", baseLogger, () =>
      supabase
        .from("conversations")
        .select(
          "id, organization_id, channel, contact_id, sub_organization_id, ai_enabled"
        )
        .eq("id", conversation_id)
        .maybeSingle()
    );

    if (!conv) return new Response("Conversation not found", { status: 404 });
    if (conv.ai_enabled === false)
      return new Response("AI disabled", { status: 200 });

    const organizationId = conv.organization_id;
    const subOrganizationId = conv.sub_organization_id ?? null;
    const channel = conv.channel || "web";
    const contactId = conv.contact_id;

    const logger = createLogger({
      request_id,
      conversation_id,
      organization_id: organizationId,
      sub_organization_id: subOrganizationId,
      channel,
    });

    // 2) Wallet (required for any AI call; greetings are free)
    const wallet = await loadWalletForOrg(organizationId);
    if (!wallet) {
      logger.error("[wallet] missing or inactive wallet");
      // Allow greeting reply even if wallet missing? You wanted greeting ALWAYS.
      // But we can still allow greeting because it bypasses AI + wallet.
      // We'll only block if not greeting.
      if (!isGreetingMessage(user_message)) {
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
      subOrganizationId,
    });

    const fallbackMessage =
      personality?.fallback_message ??
      "I’m sorry, I don’t have enough information to answer that.";

    const personaBlock = `
Tone & Language:
- Tone: ${personality.tone}
- Language: ${personality.language}
- Voice: ${personality.gender_voice}
- Response length: ${personality.short_responses ? "Short" : "Normal"}
- Emoji usage: ${personality.emoji_usage ? "Allowed" : "Not allowed"}

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
      const greetText = personality?.language?.toLowerCase?.().includes("hindi")
        ? "Namaste 👋 Techwheels mein aapka swagat hai. Main aapki kaise madad kar sakta/ sakti hoon?"
        : "Hello 👋 Welcome to Techwheels. How can I help you today?";

      // Save bot message
      await supabase.from("messages").insert({
        conversation_id,
        sender: "bot",
        message_type: "text",
        text: greetText,
        channel,
        sub_organization_id: subOrganizationId,
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
          sub_organization_id: subOrganizationId,
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
        sub_organization_id: subOrganizationId,
        to: contactPhone,
        type: "typing_on",
      });
    }

    // 8) Load conversation history
    const recentMessages = await safeSupabase<
      { sender: string; text: string | null; created_at: string }[]
    >("load_recent_messages", logger, () =>
      supabase
        .from("messages")
        .select("sender, text, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(20)
    );

    const historyMessages = buildChatMessagesFromHistory(
      (recentMessages ?? []).map((m) => ({ sender: m.sender, text: m.text })),
      user_message
    );    

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

    // 10) RAG
    let contextText = "No relevant dealership knowledge found.";
    const embedding = await safeEmbedding(logger, user_message);

    if (embedding) {
      const resolved = await resolveKnowledgeContext({
        embedding,
        userMessage: user_message,
        organizationId,
        subOrganizationId,
        logger,
      });

      // KB context is NEVER a direct reply
      if (resolved?.context) {
        contextText = resolved.context;
      }
    }

    // ------------------------------------------------------------------
    // WORKFLOW CONTEXT (GUIDANCE ONLY — NO EXECUTION)
    // ------------------------------------------------------------------
    let workflowInstructionText = "";

    const activeWorkflow = await loadActiveWorkflow(conversation_id, logger);

    let resolvedWorkflow = activeWorkflow;

    if (!resolvedWorkflow) {
      const wf = await detectWorkflowTrigger(
        user_message,
        organizationId,
        subOrganizationId,
        logger
      );

      if (wf) {
        resolvedWorkflow = await startWorkflow(wf.id, conversation_id, logger);
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
        workflowInstructionText = safeText(step.action?.instruction_text);
      }
    }

    // 11) System prompt
    const systemPrompt = `
You are Techwheels AI — a professional automotive dealership assistant.

Your job:
- Use Knowledge Base (KB) context FIRST.
- Use dealership tone & personality rules.
- Answer concisely unless the customer asks for more details.
- Follow bot instructions strictly.
- Only fall back to the fallback message if NO knowledge context is provided.

------------------------
DEALERSHIP INFORMATION
------------------------
- Organization ID: ${organizationId}
- Division: ${subOrganizationId || "general"}
- Channel: ${channel}

------------------------
BOT PERSONALITY & BUSINESS RULES (CRITICAL)
------------------------
${personaBlock}

------------------------
WORKFLOW STEP (INTERNAL GUIDANCE — NOT A SCRIPT)
------------------------
${workflowInstructionText || "No active workflow guidance."}

IMPORTANT:
- The workflow step is a GOAL, not a sentence to repeat.
- Respond naturally in your own words.
EACH TIME.
- Do NOT mention workflows, steps, or instructions.
- Ask at most ONE relevant question if needed.


These rules OVERRIDE default AI behavior.

------------------------
KNOWLEDGE CONTEXT (MOST IMPORTANT)
------------------------
${contextText}

------------------------
KNOWLEDGE USAGE RULES (CRITICAL)
------------------------
- The knowledge context is reference material ONLY.
- NEVER copy or paste it verbatim.
- ALWAYS summarize, rephrase, and explain in your own words.
- Use bullet points where helpful.
- Answer like a dealership executive, not a document.


------------------------
CAMPAIGN HISTORY CONTEXT
------------------------
${campaignContextText || "No prior campaign history available."}

------------------------
RESPONSE DECISION RULES (CRITICAL)
------------------------
You are allowed to intentionally NOT reply.

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

------------------------
FORMATTING & STYLE
------------------------
- Always answer the latest customer message.
- Keep WhatsApp replies short & simple (1–3 sentences max).
- If the knowledge context above does not contain the answer, say exactly: "${fallbackMessage}".

Respond now to the customer's latest message only.
`.trim();

    // 12) AI settings
    const aiSettings = await resolveAISettings({
      organizationId,
      subOrganizationId,
      logger,
    });

    // 13) Run AI completion
    const aiResult = await runAICompletion({
      provider: aiSettings.provider,
      model: aiSettings.model,
      systemPrompt,
      historyMessages,
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
          sub_organization_id: subOrganizationId,
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

      // 3) Link usage → wallet transaction
      await supabase
        .from("ai_usage_logs")
        .update({ wallet_transaction_id: walletTxnId })
        .eq("id", usage.id);
    }


    // 15) NO-REPLY handling (do NOT save message / do NOT send)
    if (aiResponseText.trim() === AI_NO_REPLY_TOKEN) {
      logger.info("[ai-handler] AI chose not to reply", { user_message });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id);

      return new Response(
        JSON.stringify({ conversation_id, no_reply: true, request_id }),
        { headers: { "Content-Type": "application/json" } }
      );
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
        nextStep,
        resolvedWorkflow.variables ?? {},
        completed,
        logger
      );
    }

    // 16) Log unanswered fallback
    if (aiResponseText === fallbackMessage) {
      await logUnansweredQuestion({
        organization_id: organizationId,
        conversation_id,
        question: user_message,
        ai_response: aiResponseText,
      });      
    }

    // 17) Save message + update conversation
    await supabase.from("messages").insert({
      conversation_id,
      sender: "bot",
      message_type: "text",
      text: aiResponseText,
      channel,
      sub_organization_id: subOrganizationId,
    });

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    // 18) WhatsApp send
    if (channel === "whatsapp" && contactPhone) {
      await safeWhatsAppSend(logger, {
        organization_id: organizationId,
        sub_organization_id: subOrganizationId,
        to: contactPhone,
        type: "text",
        text: aiResponseText,
      });
    }

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
