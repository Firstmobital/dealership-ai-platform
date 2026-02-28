import { logAuditEvent } from "../_shared/audit.ts";
import {
  requireUser,
  requireOrgMembership,
  isInternalRequest,
} from "../_shared/auth.ts";
import { buildDirective } from "./workflow/directive.ts";
import { enforceDirective } from "./workflow/enforcer.ts";
import {
  validateAndRepairResponse,
  extractNumberTokens,
} from "./workflow/validator.ts";
import { extractSlotsFromUserText } from "./workflow/slots.ts";
import { openai, gemini, supabase } from "./clients.ts";
import { AI_NO_REPLY_TOKEN, KB_DISABLE_LEXICAL } from "./env.ts";
import { createLogger } from "./logging.ts";
import {
  estimateTokensFromMessages,
  estimateTokensFromText,
  modelTokenLimits,
  chooseRoutedModel,
  packHistoryByTokenBudget,
  truncateTextToTokenLimit,
  extractPricingFocusedContext,
  buildChatMessagesFromHistory,
  validateGroundedness,
  type ChatMsg,
} from "./history.ts";
import {
  extractUserIntentWithAI,
  mergeEntities,
  wasHumanActiveRecently,
  type AiExtractedIntent,
  type AiMode,
} from "./entity_memory.ts";
import {
  inferIntentHeuristic,
  classifyPrimaryIntent,
  type PrimaryIntent,
} from "./intent_heuristics.ts";
import {
  resolveKnowledgeContextSemantic,
} from "./kb_semantic.ts";
import { resolveKnowledgeContextLexicalOnly } from "./kb_lexical.ts";
import {
  answerLooksLikePricingOrOffer,
  looksLikePricingOrOfferContext,
  redactUserProvidedPricing,
  fetchOfferCatalogText,
  extractOfferEntriesFromText,
  pickBestOfferEntry,
  buildOfferReply,
  buildOfferListReply,
} from "./offers_pricing.ts";
import {
  fetchCampaignContextForContact,
  buildCampaignContextText,
  buildCampaignFactsBlock,
} from "./campaign.ts";
import { loadBotPersonality } from "./personality.ts";
import {
  loadOpenPsfCaseByConversation,
  classifyPsfSentiment,
} from "./psf.ts";
import {
  loadWalletForOrg,
  createWalletDebit,
  getChargedAmountForModel,
  estimateActualCost,
  resolveAISettings,
} from "./wallet_quota.ts";
import { safeSupabase, safeWhatsAppSend, safeText } from "./safe_helpers.ts";
import { traceInsertStart, traceUpdate } from "./trace.ts";
import { createServiceTicketIfNeeded } from "./service_ticket.ts";
import { enforceDealershipReplySchema } from "./schema_enforcement.ts";
import { detectUrgency, enforceHighUrgencyReply, type Urgency } from "./urgency.ts";
import { normalizeForMatch } from "./text_normalize.ts";
import {
  userWantsMedia,
  fetchMediaAssets,
  pickAssetsForSend,
  signMediaUrl,
} from "./media_assets.ts";

type JsonObject = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

type TransmissionValue = AiExtractedIntent["transmission"];

function asNullableString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  return null;
}

function asNullableTransmission(v: unknown): TransmissionValue {
  if (v === null || v === undefined) return null;
  if (v === "Manual" || v === "Automatic" || v === "DCA" || v === "AMT") return v;
  return null;
}

/* ============================================================================
   WORKFLOW ENFORCEMENT HELPERS (QUALIFICATION FLOWS)
============================================================================ */

function isQualificationWorkflowInstruction(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("ask the user") ||
    t.includes("fuel type") ||
    t.includes("transmission preference") ||
    t.includes("which fuel") ||
    t.includes("which model") ||
    t.includes("model or segment") ||
    t.includes("which segment") ||
    t.includes("one question")
  );
}

type WorkflowQuestionType =
  | "fuel"
  | "transmission"
  | "model"
  | "confirm"
  | null;

function _detectWorkflowQuestionType(instruction: string): WorkflowQuestionType {
  const t = (instruction || "").toLowerCase();
  if (t.includes("fuel") && t.includes("ask")) return "fuel";
  if (t.includes("transmission") && t.includes("ask")) return "transmission";
  if (
    (t.includes("which model") ||
      t.includes("model or segment") ||
      t.includes("segment")) &&
    t.includes("ask")
  )
    return "model";
  if (t.includes("confirm") || t.includes("preferences have been noted"))
    return "confirm";
  return null;
}

function _hasUserAnsweredFuel(userMsg: string): boolean {
  const u = (userMsg || "").toLowerCase();
  return /\b(petrol|diesel|ev|electric|cng)\b/.test(u);
}

function _hasUserAnsweredTransmission(userMsg: string): boolean {
  const u = (userMsg || "").toLowerCase();
  return /\b(manual|automatic|amt|dca|at)\b/.test(u);
}

function _hasUserAnsweredModel(userMsg: string): boolean {
  const u = (userMsg || "").toLowerCase();
  return /\b(nexon|punch|harrier|safari|curvv|altroz|tiago|tigor)\b/.test(u);
}

function _buildQualificationQuestion(
  qtype: Exclude<WorkflowQuestionType, null>,
  locked: Record<string, unknown>
): string {
  if (qtype === "fuel") {
    return "Sure — which fuel do you prefer: Petrol, Diesel, EV, or Not sure?";
  }
  if (qtype === "transmission") {
    return "Got it — transmission preference: Manual, Automatic, or Either?";
  }
  if (qtype === "model") {
    if (locked?.model) {
      return "Noted. Anything else you prefer — budget range or use-case (city/highway/family)?";
    }
    return "Which model/segment are you interested in? (e.g., Nexon, Punch, Harrier, Safari, Curvv)";
  }
  return "Perfect — noted. I’m checking the best available stock options with applicable offers. Anything specific you want: budget or model?";
}

function enforceTechwheelsOnlyCTA(text: string): string {
  let t = text || "";
  const replacements: Array<[RegExp, string]> = [
    [
      /\bcontact (?:your|the) (?:nearest )?dealer(?:ship)?\b/gi,
      "contact the Techwheels team",
    ],
    [
      /\bvisit (?:your|the) (?:nearest )?dealer(?:ship)?\b/gi,
      "visit Techwheels",
    ],
    [
      /\breach out to (?:your|the) dealer(?:ship)?\b/gi,
      "reach out to Techwheels",
    ],
    [/\bdealer(?:ship)?\b/gi, "Techwheels"],
  ];
  for (const [rx, rep] of replacements) t = t.replace(rx, rep);
  return t;
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
  lockedEntities: Record<string, unknown> | null;
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

    const usageMeta: unknown = (resp as unknown as { response?: { usageMetadata?: unknown } })
      .response?.usageMetadata;
    const usage = asRecord(usageMeta);

    return {
      text,
      inputTokens: typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : 0,
      outputTokens: typeof usage.candidatesTokenCount === "number"
        ? usage.candidatesTokenCount
        : 0,
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
    return runOpenAICompletion(params);
  }
  return runOpenAICompletion(params);
}

/* ============================================================================
   WORKFLOW ENGINE — Types
============================================================================ */
type WorkflowTrigger = { type?: string; [k: string]: unknown };

type WorkflowRow = {
  id: string;
  organization_id: string | null;
  trigger: WorkflowTrigger | null;
  is_active: boolean | null;
};

type WorkflowLogRow = {
  id: string;
  workflow_id: string | null;
  conversation_id: string | null;
  current_step_number: number | null;
  variables: Record<string, unknown>;
  completed: boolean;
  created_at?: string | null;
};

type WorkflowStepRow = {
  id: string;
  workflow_id: string;
  step_order: number;
  action: {
    instruction_text?: string;
    expects_answer?: boolean;
    skip_if_answered?: boolean;
    match_any_keywords?: string[];
  } | null;
};

async function getLastOutboundTemplateName(params: {
  conversationId: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<string | null> {
  const { conversationId, organizationId, logger } = params;

  const rows = await safeSupabase<Array<{ metadata?: unknown; created_at?: string | null }>>(
    "load_last_outbound_messages_for_template_trigger",
    logger,
    () =>
      supabase
        .from("messages")
        .select("metadata, created_at")
        .eq("organization_id", organizationId)
        .eq("conversation_id", conversationId)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(10)
  );

  for (const r of rows ?? []) {
    const meta = asRecord(r?.metadata);
    const whatsapp = asRecord(meta.whatsapp);
    const kind = String(whatsapp.kind ?? "").trim().toLowerCase();
    const name = String(whatsapp.template_name ?? "").trim();
    if (kind === "template" && name) return name;
  }

  return null;
}

/* ============================================================================
   WORKFLOW — TRIGGER DETECTION
============================================================================ */
async function detectWorkflowTrigger(
  user_message: string,
  organizationId: string,
  logger: ReturnType<typeof createLogger>,
  intentBucket: string,
  conversationId?: string | null
): Promise<
  | {
      workflow: WorkflowRow;
      match: {
        source: "keyword" | "whatsapp_template" | "intent" | "always";
        template_name?: string;
      };
    }
  | null
> {
  const workflows = await safeSupabase<WorkflowRow[]>(
    "load_workflows",
    logger,
    () =>
      supabase
        .from("workflows")
        .select("id, organization_id, trigger, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
  );

  if (!workflows?.length) {
    logger.debug("[workflow] no active workflows");
    return null;
  }

  const lowerMsg = (user_message || "").toLowerCase();

  // P0: Deterministic priority.
  // 1) keyword matches
  // 2) whatsapp_template matches (latest outbound message)
  // 3) intent matches
  // 4) always (fallback)
  const keywordWorkflows = workflows.filter(
    (wf) => (wf.trigger?.type ?? "always") === "keyword"
  );
  const templateWorkflows = workflows.filter(
    (wf) => (wf.trigger?.type ?? "always") === "whatsapp_template"
  );
  const intentWorkflows = workflows.filter(
    (wf) => (wf.trigger?.type ?? "always") === "intent"
  );
  const alwaysWorkflows = workflows.filter(
    (wf) => (wf.trigger?.type ?? "always") === "always"
  );

  // 1) KEYWORD
  for (const wf of keywordWorkflows) {
    const keywords: string[] = asStringArray(wf.trigger?.keywords);
    if (
      keywords.some((k) =>
        lowerMsg.includes((k ?? "").toString().toLowerCase())
      )
    ) {
      logger.info("[workflow] keyword trigger matched", {
        workflow_id: wf.id,
        trigger_keywords: keywords,
      });
      return { workflow: wf, match: { source: "keyword" } };
    }
  }

  // 2) WHATSAPP TEMPLATE (latest outbound message)
  if (templateWorkflows.length && conversationId) {
    const lastTemplateRaw = await getLastOutboundTemplateName({
      conversationId,
      organizationId,
      logger,
    });
    const lastTemplate = String(lastTemplateRaw ?? "").trim().toLowerCase();

    if (lastTemplate) {
      for (const wf of templateWorkflows) {
        const templates: string[] = asStringArray(wf.trigger?.templates);
        const templatesLower = templates
          .map((t) => (t ?? "").toString().trim().toLowerCase())
          .filter(Boolean);

        if (templatesLower.includes(lastTemplate)) {
          logger.info("[workflow] whatsapp_template trigger matched", {
            workflow_id: wf.id,
            whatsapp_template_name: lastTemplate,
            trigger_templates: templatesLower,
          });
          return {
            workflow: wf,
            match: { source: "whatsapp_template", template_name: lastTemplate },
          };
        }
      }
    }
  }

  // 3) INTENT
  if (intentWorkflows.length) {
    for (const wf of intentWorkflows) {
      const intents: string[] = asStringArray(wf.trigger?.intents);
      if (!intents.length) continue;

      const intentsLower = intents
        .map((i) => (i ?? "").toString().toLowerCase())
        .filter(Boolean);

      // 1) direct bucket match (sales/service/finance/accessories)
      if (intentsLower.includes((intentBucket ?? "").toLowerCase())) {
        logger.info("[workflow] intent trigger matched (bucket)", {
          workflow_id: wf.id,
          intent: intentBucket,
        });
        return { workflow: wf, match: { source: "intent" } };
      }

      // 2) keyword-ish fallback: if intent list contains words that appear in message
      if (intentsLower.some((i) => i && lowerMsg.includes(i))) {
        logger.info("[workflow] intent trigger matched (keyword fallback)", {
          workflow_id: wf.id,
          intent: intentBucket,
        });
        return { workflow: wf, match: { source: "intent" } };
      }
    }
  }

  // 4) ALWAYS
  if (alwaysWorkflows.length) {
    // Keep existing DB order for fallback.
    logger.info("[workflow] always trigger matched", {
      workflow_id: alwaysWorkflows[0].id,
    });
    return { workflow: alwaysWorkflows[0], match: { source: "always" } };
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
  logger: ReturnType<typeof createLogger>,
  preferredWorkflowId?: string | null
): Promise<WorkflowLogRow | null> {
  // Deterministic: prefer conversation-pinned workflow (campaign / manual attach).
  // Avoid maybeSingle() because multiple open workflow logs can exist.

  const selectCols =
    "id, workflow_id, conversation_id, current_step_number, variables, completed, created_at";

  if (preferredWorkflowId) {
    const preferred = await safeSupabase<WorkflowLogRow>(
      "load_active_workflow_preferred",
      logger,
      () =>
        supabase
          .from("workflow_logs")
          .select(selectCols)
          .eq("conversation_id", conversationId)
          .eq("organization_id", organizationId)
          .eq("completed", false)
          .eq("workflow_id", preferredWorkflowId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
    );

    if (preferred) {
      return {
        ...preferred,
        current_step_number: preferred.current_step_number ?? 1,
        variables: isRecord(preferred.variables) ? preferred.variables : {},
        completed: preferred.completed ?? false,
      };
    }
  }

  const latest = await safeSupabase<WorkflowLogRow>(
    "load_active_workflow_latest",
    logger,
    () =>
      supabase
        .from("workflow_logs")
        .select(selectCols)
        .eq("conversation_id", conversationId)
        .eq("organization_id", organizationId)
        .eq("completed", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
  );

  if (!latest) return null;

  return {
    ...latest,
    current_step_number: latest.current_step_number ?? 1,
    variables: isRecord(latest.variables) ? latest.variables : {},
    completed: latest.completed ?? false,
  };
}

async function startWorkflow(
  workflowId: string,
  conversationId: string,
  organizationId: string,
  logger: ReturnType<typeof createLogger>,
  trigger?: {
    source?: "keyword" | "whatsapp_template" | "intent" | "always" | null;
    template_name?: string | null;
    workflow_name?: string | null;
  }
): Promise<WorkflowLogRow | null> {
  const source = trigger?.source ?? null;
  const templateName = String(trigger?.template_name ?? "").trim();
  const workflowName = String(trigger?.workflow_name ?? "").trim();

  const initialVars: Record<string, unknown> = {};

  // Prefill slots ONLY when started due to whatsapp_template trigger.
  if (source === "whatsapp_template") {
    const slots: Record<string, unknown> = {};

    // Fleet workflow rule
    const isFleetWorkflow =
      workflowName.toLowerCase() === "fleet leads" ||
      templateName.toLowerCase().includes("fleet");
    if (isFleetWorkflow) {
      slots.vehicle_model = "Tata Xpress-T";
    }

    // Only write slots if we have at least one prefilled key
    if (Object.keys(slots).length) initialVars.slots = slots;
  }

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
          variables: initialVars,
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
    trigger_source: source,
    trigger_template_name: templateName || null,
    workflow_name: workflowName || null,
  });

  return {
    ...data,
    current_step_number: 1,
    variables: isRecord((data as unknown as { variables?: unknown }).variables)
      ? ((data as unknown as { variables?: Record<string, unknown> }).variables ?? initialVars)
      : initialVars,
    completed: false,
  };
}

async function getWorkflowSteps(
  workflowId: string,
  organizationId: string,
  logger: ReturnType<typeof createLogger>
): Promise<WorkflowStepRow[]> {
  const data = await safeSupabase<WorkflowStepRow[]>(
    "get_workflow_steps",
    logger,
    () =>
      supabase
        .from("workflow_steps")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("workflow_id", workflowId)
        .order("step_order", { ascending: true })
  );

  return (data ?? []) as WorkflowStepRow[];
}

function shouldAutoSkipStep(params: {
  step: WorkflowStepRow;
  lastUserMessage: string;
}): boolean {
  const action = (params.step?.action ?? {}) as WorkflowStepRow["action"] extends null
    ? Record<string, unknown>
    : NonNullable<WorkflowStepRow["action"]>;

  // Only skip when explicitly enabled
  if (action.skip_if_answered !== true) return false;

  // If no keywords configured, do NOT auto-skip
  const keywords = Array.isArray(action.match_any_keywords)
    ? action.match_any_keywords
        .map((k) => String(k || "").trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!keywords.length) return false;

  const u = normalizeForMatch(params.lastUserMessage || "");
  if (!u) return false;

  // Any keyword match triggers skip
  return keywords.some((k: string) => u.includes(normalizeForMatch(k)));
}

function findFirstIncompleteStep(params: {
  steps: WorkflowStepRow[];
  startStepNumber: number;
  lastUserMessage: string;
}): { step: WorkflowStepRow | null; nextStepNumber: number; skipped: number[] } {
  const steps = Array.isArray(params.steps) ? params.steps : [];
  const byOrder = new Map<number, WorkflowStepRow>();
  for (const s of steps) byOrder.set(Number(s.step_order), s);

  let current = Math.max(1, Number(params.startStepNumber || 1));
  const skipped: number[] = [];

  // Walk forward deterministically through consecutive step_order values
  while (true) {
    const step = byOrder.get(current);
    if (!step) {
      // No step at this number → workflow completed
      return { step: null, nextStepNumber: current, skipped };
    }

    if (shouldAutoSkipStep({ step, lastUserMessage: params.lastUserMessage })) {
      skipped.push(current);
      current += 1;
      continue;
    }

    return { step, nextStepNumber: current, skipped };
  }
}

async function saveWorkflowProgress(
  logId: string,
  organizationId: string,
  nextStep: number,
  vars: Record<string, unknown>,
  completed: boolean,
  logger: ReturnType<typeof createLogger>,
  expectedCurrentStep: number
): Promise<WorkflowLogRow | null> {
  const stableNextStep = Number.isFinite(nextStep) && nextStep > 0 ? nextStep : 1;
  const expected =
    Number.isFinite(expectedCurrentStep) && expectedCurrentStep > 0
      ? expectedCurrentStep
      : null;

  // Optimistic concurrency: only update if the current_step_number is what the caller read.
  // If it changed due to a concurrent writer, we reload the latest row and return it.
  const q = supabase
    .from("workflow_logs")
    .update({ current_step_number: stableNextStep, variables: vars, completed })
    .eq("id", logId)
    .eq("organization_id", organizationId);

  const guarded = expected !== null ? q.eq("current_step_number", expected) : q;

  const { data, error } = await guarded
    .select(
      "id, workflow_id, conversation_id, current_step_number, variables, completed, created_at"
    )
    .maybeSingle();

  if (error)
    logger.error("[workflow] save progress error", { error, log_id: logId });
  else if (data)
    logger.debug("[workflow] progress saved", {
      log_id: logId,
      nextStep: stableNextStep,
      completed,
    });

  // Conflict / no-op: reload latest and return it (do not throw)
  if (!data) {
    logger.warn("[workflow] save progress conflict/no-op; reloading latest", {
      log_id: logId,
      expectedCurrentStep: expected,
      nextStep: stableNextStep,
    });

    const latest = await safeSupabase<WorkflowLogRow>(
      "reload_workflow_log_latest",
      logger,
      () =>
        supabase
          .from("workflow_logs")
          .select(
            "id, workflow_id, conversation_id, current_step_number, variables, completed, created_at"
          )
          .eq("id", logId)
          .eq("organization_id", organizationId)
          .maybeSingle()
    );

    if (!latest) return null;

    return {
      ...latest,
      current_step_number: latest.current_step_number ?? 1,
      variables: isRecord(latest.variables) ? latest.variables : {},
      completed: latest.completed ?? false,
    };
  }

  return {
    ...data,
    current_step_number: data.current_step_number ?? stableNextStep,
    variables: isRecord(data.variables) ? data.variables : vars,
    completed: data.completed ?? completed,
  };
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

// Ensure SAY step replies are strictly non-interrogative.
function stripInterrogativesForSay(text: string): string {
  let t = String(text || "").trim();
  if (!t) return t;

  // If any question mark exists, keep only content before the first '?'.
  const qm = t.indexOf("?");
  if (qm >= 0) t = t.slice(0, qm);

  // Remove common interrogative lead-ins that might survive without '?'.
  t = t
    .replace(/\b(can you|could you|would you|will you|do you|did you|are you|is it|is there|have you)\b[^.!,;:]*$/i, "")
    .replace(/\b(what|which|when|where|why|how)\b[^.!,;:]*$/i, "")
    .trim();

  // Ensure no trailing punctuation that implies a question.
  t = t.replace(/[؟?]+/g, "").trim();

  // If we ended up with nothing, return empty string and let upstream fallback apply.
  return t;
}

function renderSayFromSlots(template: string, slots: Record<string, unknown>): string {
  // Deterministic: only substitute known slot values. No extraction.
  const safe = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  };

  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, keyRaw) => {
    const key = String(keyRaw || "").trim();
    if (!key) return "";

    // Support a common "slots.xxx" prefix but do not allow arbitrary nesting.
    const slotKey = key.startsWith("slots.") ? key.slice("slots.".length) : key;
    if (!slotKey) return "";

    return safe(slots[slotKey]);
  });
}

type AuditSupabaseLike = {
  from(table: string): {
    insert(values: unknown): unknown;
  };
};

export async function mainHandler(params: {
  req: Request;
  request_id: string;
  trace_id: string;
  baseLogger: ReturnType<typeof createLogger>;
  conversation_id: string;
  user_message: string;
}): Promise<Response> {
  const { req, request_id, trace_id, baseLogger, conversation_id, user_message } =
    params;
  try {

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
      ai_last_entities: Record<string, unknown> | null;
      // Behavior-level persisted AI state
      ai_state?: Record<string, unknown> | null;
      funnel_stage?: string | null;
      intent_confidence?: number | null;
      intent_updated_at?: string | null;
      last_workflow_id?: string | null;
      last_workflow_run_at?: string | null;
      last_kb_hit_count?: number | null;
      last_kb_article_ids?: string[] | null;
      last_kb_match_confidence?: string | null;
      campaign_id?: string | null;
      workflow_id?: string | null;
      campaign_context?: Record<string, unknown> | null;
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
          ai_state,
          funnel_stage,
          intent_confidence,
          intent_updated_at,
          last_workflow_id,
          last_workflow_run_at,
          last_kb_hit_count,
          last_kb_article_ids,
          last_kb_match_confidence,
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
    let _actor_user_id: string | null = null;
    let _actor_email: string | null = null;

    if (!isInternal) {
      try {
        const u = await requireUser(req);
        _actor_user_id = u.id;
        _actor_email = u.email;
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

        await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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
        .eq("id", conversation_id)
        .eq("organization_id", conv.organization_id);

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
        organizationId: conv.organization_id,
        logger: baseLogger,
        seconds: 60,
      });

      if (humanActive) {
        await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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
      conversation_id,
      conv.organization_id
    );

    if (psfCaseForGuard) {
      const humanActive = await wasHumanActiveRecently({
        conversationId: conversation_id,
        organizationId: conv.organization_id,
        logger: baseLogger,
        seconds: 600, // ⏱ 10 minutes for PSF
      });

      if (humanActive) {
        await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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
    let contactPhone: string | null = null;
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
        await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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
      } catch (err: unknown) {
        const msg = String((err as { message?: unknown })?.message ?? err ?? "");
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
    if (channel === "whatsapp" && contactId) {
      const contact = await safeSupabase<{
        phone: string | null;
        phone_e164?: string | null;
        whatsapp_number?: string | null;
      }>(
        "load_contact_phone",
        logger,
        () =>
          supabase
            // Prefer E.164 / WhatsApp-specific if present in schema; fallback to phone
            .from("contacts")
            .select("id, phone, phone_e164, whatsapp_number")
            .eq("organization_id", organizationId)
            .eq("id", contactId)
            .maybeSingle()
      );

      // Priority:
      // 1) E.164
      // 2) WhatsApp-specific
      // 3) plain phone
      const p1 = asNullableString((contact as unknown as { phone_e164?: unknown })?.phone_e164);
      const p2 = asNullableString((contact as unknown as { whatsapp_number?: unknown })?.whatsapp_number);
      const p3 = asNullableString((contact as unknown as { phone?: unknown })?.phone);
      contactPhone = p1 ?? p2 ?? p3;
    }

    // 4) Personality (needed for greeting + fallback)
    const personality = await loadBotPersonality({
      organizationId,
    });

    const fallbackMessage =
      personality?.fallback_message ??
      "I’m sorry, I don’t have enough information to answer that.";

    const _greetingMessage =
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

      // Update conversation timestamp (keep this block independent — conversationUpdate is defined later)
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id)
        .eq("organization_id", organizationId);

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

    const psfCase = await loadOpenPsfCaseByConversation(
      conversation_id,
      conv.organization_id
    );

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
        .eq("id", psfCase.id)
        .eq("organization_id", organizationId);

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
      await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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
        .eq("id", conversation_id)
        .eq("organization_id", organizationId);

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
      vehicle_variant: null,
      fuel_type: null,
      transmission: null,
      manufacturing_year: null,
      intent: "other",
    };

    // Phase 2: Continuity lock for short follow-ups
    const locked = conv.ai_last_entities ?? {};
    const lockedTopic = locked?.topic ?? null;
    const lockedIntent = locked?.intent ?? null;
    const lockedModel = locked?.model ?? null;
    const lockedFuel = locked?.fuel_type ?? null;
    const lockedVariant = locked?.variant ?? null;
    const lockedTransmission = locked?.transmission ?? null;
    const lockedYear = locked?.manufacturing_year ?? null;

    // Deterministic locking precedence (P1):
    // - explicit topic change => do not continue intent/topic
    // - strong model mention (unambiguous) => bypass model lock
    const explicitTopicChange = isExplicitTopicChange(user_message);

    // Strong model detection (deterministic): if the current message contains an unambiguous model
    // that differs from the locked model, we bypass ONLY the model lock.
    const userMsgForModelDetect = String(user_message || "");
    const modelDetect = extractSlotsFromUserText(userMsgForModelDetect, {}, {});
    const detectedModelRaw =
      typeof modelDetect?.next?.vehicle_model === "string"
        ? String(modelDetect.next.vehicle_model)
        : null;
    const detectedModel = detectedModelRaw ? detectedModelRaw.trim() : null;

    const lockedModelNorm =
      typeof lockedModel === "string" ? lockedModel.toLowerCase().trim() : "";
    const detectedModelNorm =
      detectedModel ? detectedModel.toLowerCase().trim() : "";

    const hasStrongDifferentModel =
      Boolean(lockedModelNorm) &&
      Boolean(detectedModelNorm) &&
      lockedModelNorm !== detectedModelNorm;

    const isAmbiguousContainsBothModels =
      hasStrongDifferentModel &&
      // @ts-ignore: __test__ is an internal helper exposed for deterministic model-token checks.
      (extractSlotsFromUserText as unknown as { __test__?: { messageContainsModelToken?: (t: string, m: string) => boolean } })
        .__test__?.messageContainsModelToken?.(userMsgForModelDetect.toLowerCase(), lockedModelNorm) === true &&
      // @ts-ignore: __test__ is an internal helper exposed for deterministic model-token checks.
      (extractSlotsFromUserText as unknown as { __test__?: { messageContainsModelToken?: (t: string, m: string) => boolean } })
        .__test__?.messageContainsModelToken?.(userMsgForModelDetect.toLowerCase(), detectedModelNorm) === true;

    const bypassModelContinuityLock =
      hasStrongDifferentModel && !isAmbiguousContainsBothModels;

    const shouldContinue =
      (lockedTopic || lockedModel || lockedVariant) &&
      !explicitTopicChange &&
      // Classic short follow-ups ("ok", "and?", "what about?")
      (isShortFollowupMessage(user_message) ||
        // Pricing/offer follow-ups often aren't "short" but still refer to the same vehicle
        looksLikePricingOrOfferContext(user_message) ||
        /\b(final|total|on\s*road|on-?road|discount|offer|scheme|breakup)\b/i.test(
          user_message
        ));

    if (shouldContinue) {
      // If user explicitly mentioned a different model strongly, bypass only the MODEL aspect of continuity.
      // Keep other locked entities (variant/fuel/transmission/year/intent) as before.
      if (bypassModelContinuityLock) {
        logger.info("[ai-handler] follow-up continuity model lock bypassed", {
          prev_model: lockedModelNorm || null,
          next_model: detectedModelNorm || null,
          reason: "strong_model_signal_in_current_message",
        });

        // Prefer a fresh extract when bypassing model continuity to avoid stale intent/fuel/etc.
        // Then explicitly override vehicle_model to the detected strong model.
        aiExtract = await extractUserIntentWithAI({
          userMessage: user_message,
          logger,
        });
        aiExtract.vehicle_model = detectedModel;

        logger.info("[ai-extract] model_override_after_continuity_bypass", {
          prev_model: lockedModelNorm || null,
          overridden_model: detectedModelNorm || null,
        });
      } else {
        aiExtract = {
          vehicle_model: asNullableString(lockedModel),
          vehicle_variant: asNullableString(lockedVariant),
          fuel_type: asNullableString(lockedFuel),
          transmission: asNullableTransmission(lockedTransmission),
          manufacturing_year: asNullableString(lockedYear),
          intent:
            String(
              lockedIntent ??
                (lockedTopic === "offer_pricing" ? "pricing" : "other")
            ) as AiExtractedIntent["intent"],
        };

        // Deterministic intent precedence inside continuity (P1):
        // Ensure heuristic overrides run even when shouldContinue applied.
        const heuristic = inferIntentHeuristic(user_message);

        // Optional: allow offer -> pricing switch if the current message is explicitly asking for on-road breakup/quote.
        const wantsPricingSwitchFromOffer =
          aiExtract.intent === "offer" &&
          (heuristic.intent === "pricing" ||
            /\b(on\s*road|on-?road|breakup|price|pricing|quote|ex\s*showroom|ex-?showroom)\b/i.test(
              user_message
            ));
        if (wantsPricingSwitchFromOffer) {
          logger.info("[ai-extract] continuity_pricing_override", {
            from: aiExtract.intent,
            to: "pricing",
            signals: heuristic.signals,
          });
          aiExtract.intent = "pricing";
        }

        // 🔥 Offer intent must ALWAYS override a previously locked pricing intent.
        if (heuristic.intent === "offer" && aiExtract.intent !== "offer") {
          logger.info("[ai-extract] continuity_offer_override", {
            from: aiExtract.intent,
            to: "offer",
            signals: heuristic.signals,
          });
          aiExtract.intent = "offer";
        }

        logger.info("[ai-handler] follow-up continuity lock applied", {
          locked_topic: lockedTopic,
          locked_intent: aiExtract.intent,
          locked_model: lockedModel,
          explicit_topic_change: explicitTopicChange,
        });
      }
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
      variant: aiExtract.vehicle_variant ?? undefined,
      fuel_type: aiExtract.fuel_type ?? undefined,
      transmission: aiExtract.transmission ?? undefined,
      manufacturing_year: aiExtract.manufacturing_year ?? undefined,
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
        .eq("organization_id", organizationId)
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

    // ------------------------------------------------------------------
    // PHASE 0.5 — HIGH-LEVEL INTENT + FUNNEL STAGE (DETERMINISTIC)
    // Purpose: persist "sales vs service" continuity across turns and
    // let workflows / UI route conversations more reliably.
    // ------------------------------------------------------------------
    const _msgLower = (user_message || "").toLowerCase();
    const isServiceIntent =
      aiExtract.intent === "service" ||
      /\b(service|servicing|workshop|maintenance|periodic|appointment|pickup|drop|jobs*card|complaint|warranty|rsa|breakdown|repair)\b/i.test(
        user_message
      );
    const isFinanceIntent =
      /\b(emi|loan|finance|downs*payment|dp|interest|tenure|bank|mileages*loan)\b/i.test(
        user_message
      );
    const isAccessoriesIntent =
      /\b(accessor|accessories|seats*cover|floors*mat|alloy|dashcam|infotainment|musics*system)\b/i.test(
        user_message
      );

    const conversationIntent: "sales" | "service" | "finance" | "accessories" =
      isServiceIntent
        ? "service"
        : isFinanceIntent
        ? "finance"
        : isAccessoriesIntent
        ? "accessories"
        : "sales";

    // Back-compat variable used across the handler (schema enforcement + ai_state persistence)
    const intentBucket = conversationIntent as
      | "sales"
      | "service"
      | "finance"
      | "accessories";

    // ------------------------------------------------------------------
    // PRIMARY INTENT (deterministic) — persisted for workflow routing
    // ------------------------------------------------------------------
    const primaryIntentResult = classifyPrimaryIntent({
      userMessage: user_message,
      extractedIntent: aiExtract.intent || "other",
      intentBucket,
    });
    const primary_intent: PrimaryIntent =
      primaryIntentResult?.primary_intent ?? "general_inquiry";

    const funnelStage = isServiceIntent
      ? "post_purchase"
      : /\b(book|booking|confirm|buy|purchase|delivery|ready|tests*drive|schedule|visit)\b/i.test(
          user_message
        )
      ? "decision"
      : /\b(price|pricing|ons*road|variant|variants|feature|features|compare|brochure|mileage|range)\b/i.test(
          user_message
        )
      ? "consideration"
      : "awareness";

    const intentConfidence =
      isServiceIntent || isFinanceIntent || isAccessoriesIntent
        ? 0.85
        : aiExtract.intent && aiExtract.intent !== "other"
        ? 0.7
        : 0.55;

    // ------------------------------------------------------------------
    // URGENCY DETECTION (DETERMINISTIC)
    // ------------------------------------------------------------------
    const urgency: Urgency = detectUrgency(user_message);

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
    let kbMatchMeta: JsonObject | null = null;

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
      vehicleModel: asNullableString(aiExtract.vehicle_model) ??
        asNullableString(conv.ai_last_entities?.model) ?? null,
      intent: aiExtract.intent,
      fuelType: asNullableString(aiExtract.fuel_type) ?? null,
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
    const kbTracePatch: Record<string, unknown> = {
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
    const nextEntitiesWithKb: Record<string, unknown> = {
      ...(isRecord(nextEntities) ? nextEntities : {}),
    };
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

    // ------------------------------------------------------------
    // MVP service ticket creation (transactional service workflow)
    // ------------------------------------------------------------
    let _serviceTicketId: string | null = null;

    if (intentBucket === "service") {
      _serviceTicketId = await createServiceTicketIfNeeded({
        supabaseAdmin: supabase,
        organization_id: organizationId,
        conversation_id: conversation_id,
        contact_id: contactId ?? null,
        channel,
        user_message,
        vehicle_number: asNullableString(asRecord(nextEntitiesWithKb).vehicle_number),
        logger,
      });
    }

    const requiresAuthoritativeKB =
      aiExtract.intent === "pricing" || aiExtract.intent === "offer";

    // PHASE 0: For pricing/offers, treat KB as valid ONLY if it actually contains pricing/offer signals.
    // This prevents hallucinations when KB context is non-empty but irrelevant (e.g., features doc).
    const kbHasPricingSignals =
      looksLikePricingOrOfferContext(contextText) ||
      // strong pricing-table heuristic: multiple big numbers + pricing column keywords
      (/(ex[-\s]?showroom|on[-\s]?road|insurance|rto|tcs)/i.test(contextText) &&
        (contextText.match(/\b\d{5,}\b/g) || []).length >= 3) ||
      // your existing variant+keyword rule
      (/\bvariant\b/i.test(contextText) &&
        /(\bprice\b|₹|\bon[-\s]?road\b|\bex[-\s]?showroom\b|\brto\b|\binsurance\b)/i.test(
          contextText
        ));

    // Forced reply text can be set by deterministic KB handlers (pricing/offers) or strict-mode guards.
    let forcedReplyText: string | null = null;

    const campaignHasPricingSignals =
      looksLikePricingOrOfferContext(campaignContextText) ||
      looksLikePricingOrOfferContext(
        JSON.stringify(conv.campaign_context ?? {})
      );

    // ------------------------------------------------------------------
    // P1-D: OFFER / DISCOUNT — STRUCTURED REPLY FROM KB (NO HALLUCINATION)
    // If KB context contains a structured offers table, respond deterministically
    // and auto-lock the exact variant until the user mentions a new model/variant.
    // ------------------------------------------------------------------
    if (!forcedReplyText && kbHasPricingSignals && contextText.trim()) {
      const wantsOffer =
        aiExtract.intent === "offer" ||
        /\b(discount|offer|scheme|deal)\b/i.test(user_message);

      if (wantsOffer) {
        let entries = extractOfferEntriesFromText(contextText);

        const lockedModel =
          asNullableString(asRecord(nextEntitiesWithKb).model) ??
          asNullableString(aiExtract.vehicle_model) ??
          null;
        const lockedVariant =
          asNullableString(asRecord(nextEntitiesWithKb).variant) ??
          asNullableString(aiExtract.vehicle_variant);

        // If we didn't retrieve the offers catalog chunk(s) (common when chunking split by word-count
        // or retrieval missed the model block), fetch the offers catalog deterministically.
        const modelNormForCheck = normalizeForMatch(String(lockedModel || ""));
        const modelMissingInEntries =
          !!modelNormForCheck &&
          entries.length > 0 &&
          !entries.some((e) =>
            normalizeForMatch(e.model || "").includes(modelNormForCheck)
          );

        if (!entries.length || modelMissingInEntries) {
          const offerCatalog = await fetchOfferCatalogText({
            organizationId: organizationId,
            logger,
            model: lockedModel,
          });

          if (offerCatalog) {
            entries = extractOfferEntriesFromText(offerCatalog);
            // Also override contextText so any downstream logging/debug reflects the catalog.
            contextText = offerCatalog;
          }
        }

        // If variant is known, reply with the exact offer for that variant.
        if (lockedVariant) {
          const picked = pickBestOfferEntry({
            entries,
            lockedModel,
            lockedVariant: lockedVariant ?? null,
            lockedFuel:
              asNullableString(asRecord(nextEntitiesWithKb).fuel_type) ??
              asNullableString(aiExtract.fuel_type) ??
              null,
            lockedTransmission:
              asNullableString(asRecord(nextEntitiesWithKb).transmission) ??
              asNullableTransmission(aiExtract.transmission) ??
              null,
            lockedYear:
              asNullableString(asRecord(nextEntitiesWithKb).manufacturing_year) ??
              asNullableString(aiExtract.manufacturing_year) ??
              null,
          });

          if (picked) {
            forcedReplyText = buildOfferReply(picked);

            // Auto-lock exact match for follow-ups
            (nextEntitiesWithKb as Record<string, unknown>).model =
              picked.model || (asRecord(nextEntitiesWithKb).model as unknown);
            (nextEntitiesWithKb as Record<string, unknown>).variant =
              picked.variant || (asRecord(nextEntitiesWithKb).variant as unknown);
            if (picked.fuel) (nextEntitiesWithKb as Record<string, unknown>).fuel_type = picked.fuel;
            if (picked.transmission)
              (nextEntitiesWithKb as Record<string, unknown>).transmission = picked.transmission;
            if (picked.manufacturing_year)
              (nextEntitiesWithKb as Record<string, unknown>).manufacturing_year =
                picked.manufacturing_year;

            logger.info("[offer] structured_reply_used", {
              model: (nextEntitiesWithKb as Record<string, unknown>).model,
              variant: (nextEntitiesWithKb as Record<string, unknown>).variant,
              fuel: (nextEntitiesWithKb as Record<string, unknown>).fuel_type,
              transmission: (nextEntitiesWithKb as Record<string, unknown>).transmission,
              manufacturing_year: (nextEntitiesWithKb as Record<string, unknown>)
                .manufacturing_year,
            });
          }
        } else {
          // No variant specified: list available offer variants (model-scoped if model is known).
          forcedReplyText = buildOfferListReply({
            entries,
            model: lockedModel,
          });

          // If model is known and there is only one offer variant, auto-lock it.
          if (lockedModel) {
            const modelNorm = normalizeForMatch(String(lockedModel));
            const scoped = entries.filter((e) =>
              normalizeForMatch(e.model || "").includes(modelNorm)
            );
            if (scoped.length === 1) {
              const only = scoped[0];
              (nextEntitiesWithKb as Record<string, unknown>).model =
                only.model || (asRecord(nextEntitiesWithKb).model as unknown);
              (nextEntitiesWithKb as Record<string, unknown>).variant = only.variant;
              if (only.fuel) (nextEntitiesWithKb as Record<string, unknown>).fuel_type = only.fuel;
              if (only.transmission)
                (nextEntitiesWithKb as Record<string, unknown>).transmission = only.transmission;
              if (only.manufacturing_year)
                (nextEntitiesWithKb as Record<string, unknown>).manufacturing_year =
                  only.manufacturing_year;
            }
          }
        }
      }
    }

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

    // kb_only can still override / set a forced reply when KB isn't strong enough.
    if (aiMode === "kb_only" && !kbStrongEnoughForKbOnly && !forcedReplyText) {
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
    let workflowSayMessage = "";
    let workflowSaySchema: {
      allow_numbers: boolean;
      max_questions: number;
      forbidden_phrases?: string[];
    } | null = null;

    let resolvedWorkflow: WorkflowLogRow | null = null;
    let workflowDirectiveAction: "ask" | "say" | "escalate" | null = null;
    let workflowAlreadyAdvanced = false;
    let workflowStepAdvancedThisTurn = false;

    const activeWorkflow = await loadActiveWorkflow(
      conversation_id,
      organizationId,
      logger,
      conv.workflow_id ?? null
    );
    resolvedWorkflow = activeWorkflow;

    // 🔒 NEW: honor workflow attached by campaign
    if (!resolvedWorkflow && conv.workflow_id) {
      resolvedWorkflow = await startWorkflow(
        conv.workflow_id,
        conversation_id,
        organizationId,
        logger,
        {
          source: "always",
          template_name: null,
          workflow_name: null,
        }
      );
      logger.info("[workflow] attached from campaign", {
        workflow_id: conv.workflow_id,
        conversation_id,
      });
    }

    // fallback to detection only if nothing exists
    if (!resolvedWorkflow) {
      const trigger = await detectWorkflowTrigger(
        user_message,
        organizationId,
        logger,
        intentBucket,
        conversation_id
      );

      if (trigger) {
        resolvedWorkflow = await startWorkflow(
          trigger.workflow.id,
          conversation_id,
          organizationId,
          logger,
          {
            source: trigger.match.source,
            template_name: trigger.match.template_name ?? null,
            workflow_name: null,
          }
        );
      }
    }

    if (resolvedWorkflow) {
      // Narrow for TypeScript: within this block we expect a live workflow session.
      // If it ever becomes null due to an unexpected DB state, we bail safely.
      const rw = resolvedWorkflow;
      const steps = await getWorkflowSteps(
        rw.workflow_id!,
        organizationId,
        logger
      );

      if (steps?.length) {
        // Determine max step order deterministically (cannot assume contiguous ordering)
        const maxStepOrder = steps.reduce((m, s) => {
          const o = Number(s.step_order);
          return Number.isFinite(o) && o > m ? o : m;
        }, 0);

        let { step, nextStepNumber, skipped } = findFirstIncompleteStep({
          steps,
          startStepNumber: rw.current_step_number ?? 1,
          lastUserMessage: user_message,
        });

        if (skipped.length) {
          logger.info("[workflow] auto-skipped steps", {
            skipped,
            nextStepNumber,
          });

          // Persist skip-advancement so we don't re-evaluate the same skipped steps
          // (does not change workflow_logs schema)
          const prevExpectedStep = rw.current_step_number ?? 1;

          const updated = await saveWorkflowProgress(
            rw.id,
            organizationId,
            nextStepNumber,
            rw.variables ?? {},
            false,
            logger,
            prevExpectedStep
          );

          if (updated) resolvedWorkflow = updated;

          // If update failed and returned null, bail out of workflow processing.
          if (!resolvedWorkflow) {
            // No behavior change intended; this guards an already-unsafe state.
            // (Previously this would have thrown on property access.)
            // Exit workflow evaluation for this turn.
            step = null;
          } else {
            // Keep in-memory state consistent for downstream progression logic
            resolvedWorkflow.current_step_number = nextStepNumber;
          }

          if (nextStepNumber > prevExpectedStep) {
            workflowStepAdvancedThisTurn = true;
          }
        }

        // ------------------------------------------------------------------
        // WORKFLOW SLOTS (ENGINE-OWNED, DETERMINISTIC)
        // Only extract slots when an active workflow session exists.
        // Persist immediately without changing current_step_number.
        // ------------------------------------------------------------------
        try {
          // Local narrow helpers (keep scoped to this integration block)
          const isRecord = (v: unknown): v is Record<string, unknown> =>
            typeof v === "object" && v !== null && !Array.isArray(v);

          if (!resolvedWorkflow) throw new Error("resolvedWorkflow became null");
          const varsUnknown: unknown = resolvedWorkflow.variables;
          const vars: Record<string, unknown> = isRecord(varsUnknown)
            ? varsUnknown
            : {};

          const slotsUnknown: unknown = vars["slots"];
          const existingSlots: Record<string, unknown> = isRecord(slotsUnknown)
            ? slotsUnknown
            : {};

          const slotRes = extractSlotsFromUserText(user_message, existingSlots, {
            onLog: (level, message, extra) => {
              if (level === "warn") logger.warn(message, extra || {});
              else if (level === "debug") logger.debug(message, extra || {});
              else logger.info(message, extra || {});
            },
          });

          if (slotRes.changed) {
            const nextVars: Record<string, unknown> = {
              ...vars,
              slots: slotRes.next,
            };

            resolvedWorkflow.variables = nextVars;

            // Ensure step number is always a concrete number
            const stepNum = Number(resolvedWorkflow.current_step_number);
            const nextStepNum = Number(nextStepNumber);
            const stableStep =
              Number.isFinite(stepNum) && stepNum > 0
                ? stepNum
                : Number.isFinite(nextStepNum) && nextStepNum > 0
                ? nextStepNum
                : 1;

            const updated = await saveWorkflowProgress(
              resolvedWorkflow.id,
              organizationId,
              stableStep,
              nextVars,
              false,
              logger,
              resolvedWorkflow.current_step_number ?? stableStep
            );

            if (updated) resolvedWorkflow = updated;
            if (!resolvedWorkflow) throw new Error("resolvedWorkflow became null");

            logger.info("[workflow] slots updated", {
              workflow_id: resolvedWorkflow.workflow_id,
              log_id: resolvedWorkflow.id,
              changed: true,
              slot_keys: Object.keys(slotRes.next || {}).slice(0, 12),
            });
          }
        } catch (err) {
          logger.error("[workflow] slot extraction/persist error", {
            error: err,
          });
        }

        // ------------------------------------------------------------------
        // P0 — AUTO-SKIP ASK STEPS IF ALREADY ANSWERED (SLOT-BASED)
        // - Deterministic: driven entirely by workflow directive required_entities + slots.
        // - Guarded: max 3 auto-advances per inbound message to prevent loops.
        // ------------------------------------------------------------------
        if (step) {
          const isNonEmptySlotValue = (v: unknown): boolean => {
            if (v === null || v === undefined) return false;
            if (typeof v === "string") return v.trim().length > 0;
            return true;
          };

          const mapEntityToSlotKey = (entity: string): string => {
            const k = String(entity || "").trim().toLowerCase();
            if (k === "fuel" || k === "fuel_type") return "fuel_type";
            if (k === "model" || k === "vehicle_model") return "vehicle_model";
            if (k === "variant" || k === "vehicle_variant") return "vehicle_variant";
            if (k === "city") return "city";
            if (k === "transmission") return "transmission";
            return k;
          };

          for (let auto = 0; auto < 3; auto += 1) {
            if (!step) break;

            const directive = buildDirective(step, nextEntitiesWithKb || {});
            if (directive.action !== "ask") break;

            const required = Array.isArray(directive.required_entities)
              ? directive.required_entities
              : [];

            // If the step doesn't declare required entities, do NOT auto-skip.
            if (!required.length) break;

            const vars = isRecord(resolvedWorkflow.variables)
              ? resolvedWorkflow.variables
              : {};
            const slotsUnknown = vars["slots"];
            const slots = isRecord(slotsUnknown) ? slotsUnknown : {};

            // P2 — deterministic model resolution from fuel slot
            if (
              required.includes("vehicle_model") &&
              !slots["vehicle_model"] &&
              typeof slots["fuel_type"] === "string"
            ) {
              const fuel = String(slots["fuel_type"]).toLowerCase().trim();

              if (fuel === "cng") {
                slots["vehicle_model"] = "Tata Xpress-T";

                const nextVars = {
                  ...vars,
                  slots,
                };

                resolvedWorkflow.variables = nextVars;

                const updated = await saveWorkflowProgress(
                  resolvedWorkflow.id,
                  organizationId,
                  resolvedWorkflow.current_step_number ?? 1,
                  nextVars,
                  false,
                  logger,
                  resolvedWorkflow.current_step_number ?? 1
                );

                if (updated) resolvedWorkflow = updated;
                if (!resolvedWorkflow) break;

                logger.info("[workflow] auto-resolved model from fuel slot", {
                  fuel,
                  model: "Tata Xpress-T",
                });
              }
            }

            const allPresent = required
              .map(mapEntityToSlotKey)
              .filter(Boolean)
              .every((slotKey) => isNonEmptySlotValue(slots[slotKey]));

            if (!allPresent) break;

            // Advance one step (consistent with existing step_order numbering)
            const currentOrder = Number(step.step_order);
            const nextStep = Number.isFinite(currentOrder) && currentOrder > 0
              ? currentOrder + 1
              : Number(nextStepNumber) + 1;

            const updatedAdvance = await saveWorkflowProgress(
              resolvedWorkflow.id,
              organizationId,
              nextStep,
              resolvedWorkflow.variables ?? {},
              false,
              logger,
              resolvedWorkflow.current_step_number ?? 1
            );

            if (updatedAdvance) resolvedWorkflow = updatedAdvance;
            if (!resolvedWorkflow) break;
            resolvedWorkflow.current_step_number = nextStep;
            workflowStepAdvancedThisTurn = true;

            const res = findFirstIncompleteStep({
              steps,
              startStepNumber: nextStep,
              lastUserMessage: user_message,
            });
            step = res.step;
            nextStepNumber = res.nextStepNumber;
            skipped = res.skipped;

            logger.info("[workflow] auto-skipped ask step (slots already filled)", {
              workflow_id: resolvedWorkflow.workflow_id,
              log_id: resolvedWorkflow.id,
              from_step: currentOrder,
              to_step: nextStep,
              required_entities: required.map((r) => String(r)).slice(0, 12),
            });
          }
        }

        if (step) {
          // Engine-enforced workflow directive (the engine decides, LLM only renders)
          try {
            const directive = buildDirective(step, nextEntitiesWithKb || {});

            workflowDirectiveAction = directive.action;

            if (directive.action === "ask" || directive.action === "escalate") {
              if (!resolvedWorkflow) throw new Error("resolvedWorkflow became null");
              // Deterministic reply; do NOT rely on the LLM.
              forcedReplyText = enforceDirective(directive);

              // Hold step on ask; end workflow on escalate.
              const nextStepNum =
                directive.action === "ask" ? nextStepNumber : maxStepOrder + 1;

              const completed = directive.action === "escalate";

              const prevExpectedStep = resolvedWorkflow.current_step_number ?? 1;
              const updated = await saveWorkflowProgress(
                resolvedWorkflow.id,
                organizationId,
                nextStepNum,
                resolvedWorkflow.variables ?? {},
                completed,
                logger,
                prevExpectedStep
              );

              if (updated) resolvedWorkflow = updated;
              if (!resolvedWorkflow) throw new Error("resolvedWorkflow became null");

              if (
                directive.action === "escalate" ||
                nextStepNum > prevExpectedStep
              ) {
                workflowStepAdvancedThisTurn = true;
              }

              // Do not inject workflow guidance into prompts when we already produced the enforced reply.
              workflowInstructionText = "";
            }

            // ✅ Phase 1: engine-enforced SAY (seed + schema)
            if (!forcedReplyText && directive.action === "say") {
              if (!resolvedWorkflow) throw new Error("resolvedWorkflow became null");
              // SAY must not re-open qualification loops.
              // Use ONLY already-resolved workflow slots; do not run extraction/qualification helpers.
              const vars = isRecord(resolvedWorkflow.variables)
                ? resolvedWorkflow.variables
                : {};
              const slotsUnknown = vars["slots"];
              const slots = isRecord(slotsUnknown) ? slotsUnknown : {};

              // Render from slots deterministically; any missing slots become empty strings.
              const seed = safeText(directive.message_seed ?? "");
              const rendered = renderSayFromSlots(seed, slots);

              workflowSayMessage = stripInterrogativesForSay(rendered);
              workflowSaySchema = directive.schema
                ? { ...directive.schema, max_questions: 0 }
                : { allow_numbers: true, max_questions: 0 };

              // Do not rely on prompt guidance for correctness
              workflowInstructionText = "";

              // Force the reply text so we do not call the model and we cannot ask follow-ups.
              forcedReplyText = workflowSayMessage;

              // If SAY is the last step, persist completed=true.
              const currentOrder = Number(step.step_order);
              const isLast =
                Number.isFinite(currentOrder) &&
                currentOrder > 0 &&
                currentOrder >= maxStepOrder;

              const expectedStep = resolvedWorkflow.current_step_number ?? 1;
              const nextStepToSet =
                Number.isFinite(currentOrder) && currentOrder > 0
                  ? currentOrder + 1
                  : (resolvedWorkflow.current_step_number ?? 1) + 1;

              const updated = await saveWorkflowProgress(
                resolvedWorkflow.id,
                organizationId,
                nextStepToSet,
                resolvedWorkflow.variables ?? {},
                isLast,
                logger,
                expectedStep
              );

              if (updated) resolvedWorkflow = updated;
              if (!resolvedWorkflow) throw new Error("resolvedWorkflow became null");

              workflowAlreadyAdvanced = true;
              workflowStepAdvancedThisTurn = true;
            }
          } catch (err) {
            logger.error("[workflow] directive build/enforce error", {
              error: err,
            });
          }
        }
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

    // Do NOT suppress qualification-style workflows (they are meant to collect preferences)
    // even if KB has relevant facts.
    if (
      kbSufficientForIntent &&
      workflowInstructionText?.trim() &&
      !isQualificationWorkflowInstruction(workflowInstructionText)
    ) {
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

    // -------------------------------
    // P3: Build prompt variables (MUST be in-scope before systemPrompt)
    // -------------------------------

    // Campaign facts block (safe default)
    const campaignFactsBlock: string =
      typeof buildCampaignFactsBlock === "function"
        ? buildCampaignFactsBlock(conv.campaign_context ?? null)
        : campaignContextText?.trim()
        ? `Campaign Context Available: Yes`
        : `Campaign Context Available: No`;

    // KB confidence label (safe default)
    const kbConfidence: "strong" | "weak" | "none" =
      kbMatchMeta?.confidence === "strong" || kbMatchMeta?.confidence === "weak"
        ? (kbMatchMeta.confidence as "strong" | "weak")
        : kbFound
        ? "weak"
        : "none";

    // Option titles (safe default)
    const kbOptionTitles: string[] = Array.isArray(kbMatchMeta?.option_titles)
      ? asStringArray(kbMatchMeta.option_titles).filter(Boolean).slice(0, 6)
      : [];

    // Context packing (safe + deterministic)
    const highRiskIntentForContext =
      aiExtract.intent === "pricing" || aiExtract.intent === "offer";

    // IMPORTANT: These helpers must exist in your file already.
    // If not, replace them with a simple truncation fallback (I included fallback below).

    const safeTruncate = (t: string, maxChars: number) =>
      (t || "").length > maxChars
        ? (t || "").slice(0, maxChars) + "…"
        : t || "";

    // KB context for prompt
    const kbContextForPrompt: string =
      typeof truncateTextToTokenLimit === "function"
        ? highRiskIntentForContext
          ? typeof extractPricingFocusedContext === "function"
            ? extractPricingFocusedContext(
                contextText || "",
                channel === "whatsapp" ? 9000 : 14000
              )
            : safeTruncate(
                contextText || "",
                channel === "whatsapp" ? 9000 : 14000
              )
          : truncateTextToTokenLimit(
              contextText || "",
              channel === "whatsapp" ? 1200 : 3200
            )
        : safeTruncate(contextText || "", channel === "whatsapp" ? 1200 : 3200);

    // Campaign context for prompt
    const campaignContextForPrompt: string =
      typeof truncateTextToTokenLimit === "function"
        ? highRiskIntentForContext
          ? typeof extractPricingFocusedContext === "function"
            ? extractPricingFocusedContext(
                campaignContextText || "",
                channel === "whatsapp" ? 5000 : 9000
              )
            : safeTruncate(
                campaignContextText || "",
                channel === "whatsapp" ? 5000 : 9000
              )
          : truncateTextToTokenLimit(
              campaignContextText || "",
              channel === "whatsapp" ? 700 : 1800
            )
        : safeTruncate(
            campaignContextText || "",
            channel === "whatsapp" ? 700 : 1800
          );

    // ------------------------------------------------------------------
    // WORKFLOW ENFORCEMENT (ENGINE-ENFORCED)
    // - ask_question steps are answered deterministically via WorkflowDirective
    // - workflow guidance is injected only for "say" steps (LLM renders, engine advances)
    // ------------------------------------------------------------------
    // Allowed number tokens from KB + Campaign context (strict pricing validator)
    const allowedNumbersForOutput = new Set<string>();
    for (const t of extractNumberTokens(String(kbContextForPrompt || "")))
      allowedNumbersForOutput.add(t);
    for (const t of extractNumberTokens(String(campaignContextForPrompt || "")))
      allowedNumbersForOutput.add(t);

    // ------------------------------------------------------------------
    // OPTIONAL MEDIA SENDING (WHATSApp ONLY; REQUESTED ONLY)
    // - Must NOT change normal text behavior
    // - Must only send when user explicitly asks AND model is confidently available
    // ------------------------------------------------------------------
    const wantsMedia = userWantsMedia(user_message);

    const workflowSlots = asRecord(resolvedWorkflow?.variables)?.slots;
    const slots = asRecord(workflowSlots);

    const mediaModel = asNullableString(slots.vehicle_model) ??
      asNullableString(asRecord(nextEntitiesWithKb).model) ??
      asNullableString(aiExtract.vehicle_model) ??
      asNullableString(lockedModel);

    const mediaVariant = asNullableString(slots.vehicle_variant) ??
      asNullableString(asRecord(nextEntitiesWithKb).variant) ??
      asNullableString(aiExtract.vehicle_variant) ??
      asNullableString(lockedVariant);

    if (
      (wantsMedia.wantImages || wantsMedia.wantBrochure) &&
      channel === "whatsapp" &&
      contactPhone &&
      typeof mediaModel === "string" &&
      mediaModel.trim().length > 0
    ) {
      try {
        const assets = await fetchMediaAssets({
          supabase,
          organizationId,
          model: mediaModel,
          variant: mediaVariant,
          wantImages: wantsMedia.wantImages,
          wantBrochure: wantsMedia.wantBrochure,
          logger,
        });

        const picked = pickAssetsForSend(assets);

        // Send images (max 3)
        for (let i = 0; i < (picked.images?.length ?? 0); i += 1) {
          const img = picked.images[i];
          const signed = await signMediaUrl({
            supabase,
            bucket: img.storage_bucket,
            path: img.storage_path,
            ttlSeconds: 600,
            logger,
          });
          if (!signed) continue;

          await supabase.from("messages").insert({
            conversation_id,
            organization_id: organizationId,
            sender: "bot",
            message_type: "image",
            text: null,
            channel: "whatsapp",
            order_at: new Date().toISOString(),
            outbound_dedupe_key: `${request_id}:media:image:${i}`,
            media_url: signed,
            mime_type: img.mime_type ?? "image/jpeg",
            metadata: {
              request_id,
              trace_id,
              kind: "media_asset",
              asset_id: img.id,
              storage_path: img.storage_path,
            },
          });

          await safeWhatsAppSend(logger, {
            organization_id: organizationId,
            to: contactPhone,
            type: "image",
            media_url: signed,
            metadata: { asset_id: img.id },
          });
        }

        // Send brochure (max 1)
        if (picked.brochure) {
          const b = picked.brochure;
          const signed = await signMediaUrl({
            supabase,
            bucket: b.storage_bucket,
            path: b.storage_path,
            ttlSeconds: 600,
            logger,
          });

          if (signed) {
            const baseName = (b.filename ?? `${b.title}.pdf`).replace(/[^a-zA-Z0-9._ -]/g, "").trim();
            const safeName = baseName ? baseName : "brochure.pdf";

            await supabase.from("messages").insert({
              conversation_id,
              organization_id: organizationId,
              sender: "bot",
              message_type: "document",
              text: null,
              channel: "whatsapp",
              order_at: new Date().toISOString(),
              outbound_dedupe_key: `${request_id}:media:brochure:0`,
              media_url: signed,
              mime_type: b.mime_type ?? "application/pdf",
              metadata: {
                request_id,
                trace_id,
                kind: "media_asset",
                asset_id: b.id,
                storage_path: b.storage_path,
                filename: safeName,
              },
            });

            await safeWhatsAppSend(logger, {
              organization_id: organizationId,
              to: contactPhone,
              type: "document",
              media_url: signed,
              filename: safeName,
              metadata: { asset_id: b.id },
            });
          }
        }
      } catch (err: unknown) {
        // Never break the normal text reply
        logger.warn("[media] send failed; continuing with normal text reply", {
          error: err,
          model: mediaModel,
          variant: mediaVariant,
          wants: wantsMedia,
        });
      }
    }

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
  - NEVER tell the customer to contact a dealer/dealership. Always say Techwheels (Techwheels team/showroom).
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
- If Locked Entities includes "variant", keep answering for the SAME variant unless the user explicitly changes the variant.
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
- If verified numbers are NOT present, do NOT estimate or guess. Ask ONE short clarifying question (variant/city) OR say the Techwheels team will confirm the exact on-road price/offer.
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
- If the answer is present in the Knowledge/Campaign context, DO NOT ask workflow questions.
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
          kbConfidence: kbConfidence,
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
        } catch (err: unknown) {
          const msg = String((err as { message?: unknown })?.message ?? err ?? "");
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

    // Enforce SAY hard rule: final reply must not contain a question mark.
    if (workflowDirectiveAction === "say" || (workflowSaySchema?.max_questions === 0 && workflowSayMessage)) {
      aiResponseText = stripInterrogativesForSay(aiResponseText);
    }

    // Strict validators (NO prompt-trust)
    const verifiedNumbersAvailable = Boolean(
      kbHasPricingSignals || campaignHasPricingSignals
    );

    const val = validateAndRepairResponse(aiResponseText, {
      intent: aiExtract.intent,
      verifiedNumbersAvailable,
      allowedNumbers: allowedNumbersForOutput,
      workflowSayMessage,
      saySchema: workflowSaySchema,
    });

    if (!val.ok) {
      logger.warn("[ai-validator] violations", {
        violations: val.violations,
        used_fallback: val.used_fallback,
      });
    }
    aiResponseText = val.text;

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
        .filter((l) =>
          /on[- ]?road|ex[- ]?showroom|insurance|rto|tcs|₹/i.test(l)
        )
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
        // For offer/discount queries, never allow ungrounded numbers to pass through.
        if (aiExtract.intent === "offer") {
          aiResponseText =
            v.revised_answer?.trim() ||
            "I can share the active stock offers — which model are you checking (Nexon / Altroz / Harrier / Safari / Curvv)?";

          // Extra safety: if the validator rewrite still contains currency/numbers,
          // strip them and ask a single clarifying question.
          if (/₹|\b\d{3,}\b/.test(aiResponseText)) {
            aiResponseText =
              "I can share the active stock offers — which model are you checking (Nexon / Altroz / Harrier / Safari / Curvv)?";
          }
        } else {
          aiResponseText =
            v.revised_answer ||
            "I can help — which exact variant (fuel + transmission) is this for? I’ll share the exact pricing from the knowledge base.";
        }
      }
    }

    // ------------------------------------------------------------------
    // GROUNDEDNESS VALIDATOR (HIGH-RISK: pricing/offer/spec/policy)
    // If pricing signals are missing from KB/Campaign, block numeric answers.
    // ------------------------------------------------------------------
    const highRiskIntent =
      aiExtract.intent === "pricing" || aiExtract.intent === "offer";

    const pricingIsActuallyAvailable =
      (kbFound && kbHasPricingSignals) || campaignHasPricingSignals;

    // Block pricing-style answers ONLY when pricing is truly unsupported by KB or campaign
    if (
      highRiskIntent &&
      !pricingIsActuallyAvailable &&
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
      logger.warn(
        "[validator] removed cant-verify phrasing (no user numeric claim)",
        {
          intent: aiExtract.intent,
        }
      );

      // Replace with one short clarifying question (variant only).
      aiResponseText =
        "Sure — which exact variant (fuel + transmission) should I quote for?";

      // Techwheels-only CTA enforcement
      aiResponseText = enforceTechwheelsOnlyCTA(aiResponseText);
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
        await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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
      await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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

    // 14.9) Persist behavior-level conversation state (intent/stage/workflow/KB)
    const nowIso = new Date().toISOString();

    const kbArticleIds: string[] = Array.isArray(kbMatchMeta?.article_ids)
      ? asStringArray(kbMatchMeta.article_ids)
      : [];
    const mergedAiState: Record<string, unknown> = {
      ...(isRecord(conv.ai_state) ? conv.ai_state : {}),
      primary_intent,
      last_intent: aiExtract.intent || "other",
      last_intent_bucket: intentBucket,
      funnel_stage: funnelStage,
      intent_confidence: intentConfidence,
      intent_at: nowIso,
      last_workflow_id: resolvedWorkflow?.workflow_id ?? null,
      last_workflow_run_at: resolvedWorkflow ? nowIso : null,
      last_kb: kbFound ? nextEntitiesWithKb?.last_kb ?? null : null,
      urgency,
    };

    const conversationUpdate: Record<string, unknown> = {
      ai_last_entities: nextEntitiesWithKb,
      ai_state: mergedAiState,
      funnel_stage: funnelStage,
      intent_confidence: intentConfidence,
      intent_updated_at: nowIso,
      // Backward-compatible intent bucket for existing consumers
      intent:
        primaryIntentResult?.legacy_bucket ??
        (intentBucket === "service"
          ? "service"
          : intentBucket === "sales"
          ? "sales"
          : "general"),
      last_workflow_id: resolvedWorkflow?.workflow_id ?? null,
      last_workflow_run_at: resolvedWorkflow ? nowIso : null,
      last_kb_hit_count: kbFound ? kbArticleIds.length || 0 : 0,
      last_kb_article_ids: kbFound ? kbArticleIds : [],
      last_kb_match_confidence: kbMatchMeta?.confidence ?? null,
      last_message_at: nowIso,
    };

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
        await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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
          .update(conversationUpdate)
          .eq("id", conversation_id)
          .eq("organization_id", organizationId);

        return new Response(
          JSON.stringify({ conversation_id, no_reply: true, request_id }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // --------------------------------------------------
    // WORKFLOW PROGRESSION (ENGINE-ENFORCED)
    // - ask: do NOT advance (we are waiting for required info)
    // - say: advance after reply
    // - escalate: already completed earlier
    // --------------------------------------------------
    if (resolvedWorkflow) {
      if (workflowAlreadyAdvanced === true) {
        logger.debug("[workflow] progression skipped (already advanced)", {
          workflow_id: resolvedWorkflow.workflow_id,
          currentStep: resolvedWorkflow.current_step_number ?? 1,
        });
      } else {
        if (workflowStepAdvancedThisTurn) {
          logger.debug(
            "[workflow] progression skipped (step already advanced this turn)",
            {
              workflow_id: resolvedWorkflow.workflow_id,
              currentStep: resolvedWorkflow.current_step_number ?? 1,
            }
          );
        } else {
          const steps = await getWorkflowSteps(
            resolvedWorkflow.workflow_id!,
            organizationId,
            logger
          );

          const maxStepOrder = (steps ?? []).reduce((m, s) => {
            const o = Number(s?.step_order);
            return Number.isFinite(o) && o > m ? o : m;
          }, 0);

          const currentStep = resolvedWorkflow.current_step_number ?? 1;

          if (workflowDirectiveAction === "ask") {
            // Hold; already persisted in the directive branch.
            logger.debug("[workflow] hold step (awaiting required info)", {
              workflow_id: resolvedWorkflow.workflow_id,
              currentStep,
            });
          } else if (workflowDirectiveAction === "escalate") {
            // Already marked completed in the directive branch.
            logger.debug("[workflow] completed via escalation", {
              workflow_id: resolvedWorkflow.workflow_id,
              currentStep,
            });
          } else {
            const nextStepNumber = currentStep + 1;
            const completed = maxStepOrder > 0 ? nextStepNumber > maxStepOrder : true;

            await saveWorkflowProgress(
              resolvedWorkflow.id,
              organizationId,
              nextStepNumber,
              resolvedWorkflow.variables ?? {},
              completed,
              logger,
              currentStep
            );
            workflowStepAdvancedThisTurn = true;
          }
        }
      }
    }

    // 15.5) Enforce dealership response schema (single question, clear next step)
    aiResponseText = enforceDealershipReplySchema({
      text: aiResponseText,
      intentBucket,
      extractedIntent: aiExtract.intent || "other",
    });

    // 15.6) Enforce high urgency reply rules
    if (urgency === "high") {
      aiResponseText = enforceHighUrgencyReply(aiResponseText);
    }

    // Re-apply SAY hard rule after any post-processing that might introduce questions.
    if (
      workflowDirectiveAction === "say" ||
      (workflowSaySchema?.max_questions === 0 && workflowSayMessage)
    ) {
      aiResponseText = stripInterrogativesForSay(aiResponseText);
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
      await logAuditEvent(supabase as unknown as AuditSupabaseLike, {
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

    await supabase
      .from("conversations")
      .update(conversationUpdate)
      .eq("id", conversation_id)
      .eq("organization_id", organizationId);

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
  } catch (err: unknown) {
    console.error("[ai-handler] Fatal error", err);

    // PHASE 4: mark trace failed (best-effort)
    await traceUpdate(trace_id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_stage: "fatal",
      error: { message: String((err as { message?: unknown })?.message ?? err) },
    });

    return new Response(
      JSON.stringify({
        error: (err as { message?: unknown })?.message ?? "Internal Server Error",
        error_code: "INTERNAL_ERROR",
        request_id,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
