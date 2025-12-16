// supabase/functions/ai-handler/index.ts
// deno-lint-ignore-file no-explicit-any
// FORCE_DEPLOY_2025_12_15


import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ============================================================================
   ENV
============================================================================ */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!OPENAI_API_KEY || !PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[ai-handler] Missing required environment variables", {
    hasOpenAI: !!OPENAI_API_KEY,
    hasProjectUrl: !!PROJECT_URL,
    hasServiceRoleKey: !!SERVICE_ROLE_KEY,
  });
}

/* ============================================================================
   CLIENTS
============================================================================ */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============================================================================
   LOGGING UTILITIES
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
      console.log(JSON.stringify({ level: "info", message, ...base, ...extra }));
    },
    warn(message: string, extra: Record<string, any> = {}) {
      console.warn(JSON.stringify({ level: "warn", message, ...base, ...extra }));
    },
    error(message: string, extra: Record<string, any> = {}) {
      console.error(JSON.stringify({ level: "error", message, ...base, ...extra }));
    },
    debug(message: string, extra: Record<string, any> = {}) {
      console.log(JSON.stringify({ level: "debug", message, ...base, ...extra }));
    },
  };
}

/* ============================================================================
   SAFE HELPERS
============================================================================ */
async function safeSupabase<T>(
  opName: string,
  logger: ReturnType<typeof createLogger>,
  fn: () => Promise<{ data: T | null; error: any }>,
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
  payload: any,
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

async function safeEmbedding(
  logger: ReturnType<typeof createLogger>,
  input: string,
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
  params: { systemPrompt: string; userMessage: string },
): Promise<string | null> {
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
   UNANSWERED QUESTION LOGGER  ✅ OPTION A
============================================================================ */
async function logUnansweredQuestion(
  organizationId: string,
  question: string,
  logger: ReturnType<typeof createLogger>,
) {
  const q = question.trim();
  if (!q) return;

  try {
    const { data: existing, error } = await supabase
      .from("unanswered_questions")
      .select("id, occurrences")
      .eq("organization_id", organizationId)
      .eq("question", q)
      .maybeSingle();

    if (error) {
      logger.error("[unanswered] select error", { error });
      return;
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("unanswered_questions")
        .update({ occurrences: (existing.occurrences ?? 0) + 1 })
        .eq("id", existing.id);

      if (updateError) {
        logger.error("[unanswered] update error", { error: updateError });
      }
    } else {
      const { error: insertError } = await supabase
        .from("unanswered_questions")
        .insert({
          organization_id: organizationId,
          question: q,
          occurrences: 1,
        });

      if (insertError) {
        logger.error("[unanswered] insert error", { error: insertError });
      }
    }
  } catch (err) {
    logger.error("[unanswered] fatal error", { error: err });
  }
}


/* ============================================================================
   🔥 NEW: RAG HELPER — SUB-ORG → ORG → GLOBAL
============================================================================ */
async function resolveKnowledgeContext(params: {
  embedding: number[];
  userMessage: string;
  organizationId: string;
  subOrganizationId: string | null;
  logger: ReturnType<typeof createLogger>;
}): Promise<{ context: string; forced: boolean } | null>{
  const {
    embedding,
    userMessage,
    organizationId,
    subOrganizationId,
    logger,
  } = params;

  /* --------------------------------------------------
     OPTION 3 — FORCE TITLE MATCH (FIRST PASS)
  -------------------------------------------------- */
  const keywords = userMessage
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, "")
  .split(" ")
  .filter(w => w.length >= 3 && !["who", "what", "is", "are", "the"].includes(w));

logger.debug("[rag] title keywords", { keywords });

let titleMatches: any[] = [];

if (!keywords.length) {
  logger.debug("[rag] no usable title keywords");
} else {
  for (const word of keywords) {
    const { data, error } = await supabase
      .from("knowledge_articles")
      .select("id, organization_id, title")
      .eq("organization_id", organizationId)
      .ilike("title", `%${word}%`)
      .limit(3);

    if (error) {
      logger.error("[rag] title match query error", { error, word });
      continue;
    }

    if (data?.length) {
      titleMatches = data;
      break;
    }
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
    logger.info("[rag] title match used", {
      article_id: article.id,
      title: article.title,
    });

    return {
      context: chunks.map((c: any) => c.chunk).join("\n\n"),
      forced: true, // 🔥 IMPORTANT
    };
    
  }
}


  /* --------------------------------------------------
     SEMANTIC SEARCH (FALLBACK)
  -------------------------------------------------- */
  const { data: matches, error: matchErr } = await supabase.rpc(
    "match_knowledge_chunks",
    {
      query_embedding: embedding,
      match_count: 15,
      match_threshold: 0.05,
    },
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

  const allowed = new Set(
    articles
      .filter((a: any) => {
        if (a.organization_id !== organizationId) return false;
        if (!subOrganizationId) return true;
        return (
          a.sub_organization_id === null ||
          a.sub_organization_id === subOrganizationId
        );
      })
      .map((a: any) => a.id),
  );

  const filtered = matches.filter((m: any) =>
    allowed.has(m.article_id),
  );

  if (!filtered.length) return null;

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

type WorkflowStepRow = {
  id: string;
  workflow_id: string | null;
  step_order: number;
  action: any; // { ai_action, instruction_text, expected_user_input, metadata }
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
   TRIGGER DETECTION
============================================================================ */
async function detectWorkflowTrigger(
  user_message: string,
  organizationId: string,
  subOrgId: string | null,
  logger: ReturnType<typeof createLogger>,
): Promise<WorkflowRow | null> {
  const workflows = await safeSupabase<WorkflowRow[]>(
    "load_workflows",
    logger,
    () =>
      supabase
        .from("workflows")
        .select(
          "id, organization_id, sub_organization_id, trigger, mode, is_active",
        )
        .eq("organization_id", organizationId)
        .eq("is_active", true),
  );

  if (!workflows?.length) {
    logger.debug("[workflow] no active workflows");
    return null;
  }

  const lowerMsg = user_message.toLowerCase();

  for (const wf of workflows) {
    const trigger = wf.trigger ?? {};
    const triggerType = trigger.type ?? "always";

    // Sub-Org scoping
    if (wf.sub_organization_id && wf.sub_organization_id !== subOrgId) continue;

    // Keyword match
    if (triggerType === "keyword") {
      const keywords: string[] = trigger.keywords ?? [];
      if (
        keywords.some((k) =>
          lowerMsg.includes((k ?? "").toString().toLowerCase()),
        )
      ) {
        logger.info("[workflow] keyword trigger matched", {
          workflow_id: wf.id,
          trigger_keywords: keywords,
        });
        return wf;
      }
    }

    // Intent classification
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
              content:
                `Classify user intent into EXACTLY one of: ${intents.join(
                  ", ",
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
   WORKFLOW SESSION HELPERS
============================================================================ */
async function loadActiveWorkflow(
  conversationId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<WorkflowLogRow | null> {
  const data = await safeSupabase<WorkflowLogRow>(
    "load_active_workflow",
    logger,
    () =>
      supabase
        .from("workflow_logs")
        .select(
          "id, workflow_id, conversation_id, current_step_number, variables, completed",
        )
        .eq("conversation_id", conversationId)
        .eq("completed", false)
        .maybeSingle(),
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
  logger: ReturnType<typeof createLogger>,
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
          "id, workflow_id, conversation_id, current_step_number, variables, completed",
        )
        .single(),
  );

  if (!data) return null;

  logger.info("[workflow] started", { workflow_id: workflowId, log_id: data.id });

  return {
    ...data,
    current_step_number: 1,
    variables: {},
    completed: false,
  };
}

async function getWorkflowSteps(
  workflowId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<WorkflowStepRow[]> {
  const data = await safeSupabase<WorkflowStepRow[]>(
    "get_workflow_steps",
    logger,
    () =>
      supabase
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("step_order", { ascending: true }),
  );

  return (data ?? []) as WorkflowStepRow[];
}

async function saveWorkflowProgress(
  logId: string,
  nextStep: number,
  vars: Record<string, any>,
  completed: boolean,
  logger: ReturnType<typeof createLogger>,
) {
  const { error } = await supabase
    .from("workflow_logs")
    .update({
      current_step_number: nextStep,
      variables: vars,
      completed,
    })
    .eq("id", logId);

  if (error) {
    logger.error("[workflow] save progress error", { error, log_id: logId });
  } else {
    logger.debug("[workflow] progress saved", {
      log_id: logId,
      nextStep,
      completed,
    });
  }
}

/* ============================================================================
   STEP EXECUTION ENGINE (Smart + Strict Compatible)
============================================================================ */
type StepResult = {
  output: string;
  end: boolean;
  nextStepNumber?: number;
};

function safeText(str: any): string {
  return typeof str === "string" ? str : "";
}

async function executeStep(
  step: WorkflowStepRow,
  log: WorkflowLogRow,
  user_message: string,
  logger: ReturnType<typeof createLogger>,
): Promise<StepResult> {
  const action = step.action ?? {};
  const aiAction = action.ai_action ?? "ask_question";
  const instructionText = safeText(action.instruction_text);
  const expectedKey = safeText(action.expected_user_input);
  const metadata = action.metadata ?? {};

  logger.debug("[workflow] execute step", {
    step_order: step.step_order,
    aiAction,
  });

  switch (aiAction) {
    case "ask_question":
    case "give_information":
    case "use_knowledge_base":
      return {
        output: instructionText,
        end: false,
      };

    case "save_user_response": {
      const key = expectedKey || "value";
      log.variables[key] = user_message;
      return {
        output: instructionText || "Noted.",
        end: false,
      };
    }

    case "branch": {
      const rule = metadata.rule ?? {};
      const field = rule.field;
      const value = rule.value;
      const goto = Number(rule.goto_step ?? 0);

      if (field && goto > 0 && log.variables[field] == value) {
        return {
          output: safeText(rule.goto_text) || instructionText || "Okay.",
          end: false,
          nextStepNumber: goto,
        };
      }

      return {
        output: instructionText || "Continuing…",
        end: false,
      };
    }

    case "end":
      return {
        output: instructionText || "Workflow completed!",
        end: true,
        nextStepNumber: step.step_order,
      };

    default:
      logger.warn("[workflow] unknown ai_action, falling back", { aiAction });
      return {
        output: instructionText || "Okay.",
        end: false,
      };
  }
}

async function runStrictMode(
  step: WorkflowStepRow,
  log: WorkflowLogRow,
  user_message: string,
  logger: ReturnType<typeof createLogger>,
) {
  const action = step.action ?? {};
  const expected = action.expected_user_input ?? "";

  if (expected && (!user_message || !user_message.trim())) {
    return {
      output: "Please provide the required information to continue.",
      end: false,
    } as StepResult;
  }

  return executeStep(step, log, user_message, logger);
}

async function runSmartMode(
  step: WorkflowStepRow,
  log: WorkflowLogRow,
  user_message: string,
  logger: ReturnType<typeof createLogger>,
) {
  return executeStep(step, log, user_message, logger);
}

/* ============================================================================
   MAIN HANDLER
============================================================================ */

serve(async (req: Request): Promise<Response> => {
  const request_id = crypto.randomUUID();
  const logger = createLogger({ request_id });

  logger.info("[ai-handler] request received");

  try {
    /* --------------------------------------------------------------
       0) Parse Body
    -------------------------------------------------------------- */
    const body = (await req.json()) as {
      conversation_id?: string;
      user_message?: string;
    };

    const conversation_id = body.conversation_id;
    const raw_message = body.user_message;

    if (!conversation_id || !raw_message) {
      logger.warn("[validation] Missing conversation_id or user_message");
      return new Response("Bad Request", { status: 400 });
    }

    const user_message = raw_message.trim();
    if (!user_message) {
      return new Response("Empty message", { status: 400 });
    }

    /* --------------------------------------------------------------
       1) Load Conversation
    -------------------------------------------------------------- */
    const conv = await safeSupabase<{
      id: string;
      organization_id: string;
      channel: string;
      contact_id: string | null;
      sub_organization_id: string | null;
      ai_enabled: boolean | null;
    }>(
      "load_conversation",
      logger,
      () =>
        supabase
          .from("conversations")
          .select(
            "id, organization_id, channel, contact_id, sub_organization_id, ai_enabled",
          )
          .eq("id", conversation_id)
          .maybeSingle(),
    );

    if (!conv) {
      return new Response("Conversation not found", { status: 404 });
    }

    if (conv.ai_enabled === false) {
      return new Response("AI disabled", { status: 200 });
    }

    const organizationId = conv.organization_id;
    const subOrganizationId = conv.sub_organization_id ?? null;
    const channel = conv.channel || "web";
    const contactId = conv.contact_id;

    const scopedLogger = createLogger({
      request_id,
      conversation_id,
      organization_id: organizationId,
      sub_organization_id: subOrganizationId,
      channel,
    });

    /* --------------------------------------------------------------
       2) Fetch Contact Phone (WhatsApp)
    -------------------------------------------------------------- */
    let contactPhone: string | null = null;

    if (channel === "whatsapp" && contactId) {
      const contact = await safeSupabase<{ phone: string | null }>(
        "load_contact_phone",
        scopedLogger,
        () =>
          supabase
            .from("contacts")
            .select("phone")
            .eq("id", contactId)
            .maybeSingle(),
      );
      contactPhone = contact?.phone ?? null;
    }

    /* --------------------------------------------------------------
       3) Load Bot Personality + Instructions
    -------------------------------------------------------------- */
    async function loadBotPersonality() {
      let q = supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", organizationId);

      q = subOrganizationId
        ? q.eq("sub_organization_id", subOrganizationId)
        : q.is("sub_organization_id", null);

      const { data } = await q.maybeSingle();
      return (
        data ?? {
          fallback_message:
            "I'm sorry, I don’t have enough information to answer that.",
          short_responses: true,
        }
      );
    }

    async function loadBotInstructions() {
      let q = supabase
        .from("bot_instructions")
        .select("rules")
        .eq("organization_id", organizationId);

      q = subOrganizationId
        ? q.eq("sub_organization_id", subOrganizationId)
        : q.is("sub_organization_id", null);

      const { data } = await q.maybeSingle();
      return data ?? { rules: {} };
    }

    const personality = await loadBotPersonality();
    const extraInstructions = await loadBotInstructions();
    const fallbackMessage =
      personality.fallback_message ??
      "I'm sorry, I don’t have enough information to answer that.";

    /* --------------------------------------------------------------
       4) Load Conversation History
    -------------------------------------------------------------- */
    const recentMessages = await safeSupabase<
      { sender: string; text: string | null; created_at: string }[]
    >(
      "load_recent_messages",
      scopedLogger,
      () =>
        supabase
          .from("messages")
          .select("sender, text, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: true })
          .limit(20),
    );

    const historyText =
      recentMessages
        ?.map(
          (m) =>
            `${new Date(m.created_at).toISOString()} - ${m.sender}: ${
              m.text ?? ""
            }`,
        )
        .join("\n") ?? "";

    /* --------------------------------------------------------------
       5) WhatsApp Typing Indicator
    -------------------------------------------------------------- */
    if (channel === "whatsapp" && contactPhone) {
      await safeWhatsAppSend(scopedLogger, {
        organization_id: organizationId,
        sub_organization_id: subOrganizationId,
        to: contactPhone,
        type: "typing_on",
      });
    }

    /* --------------------------------------------------------------
       🔥 GREETING SHORT-CIRCUIT
    -------------------------------------------------------------- */
    if (["hi", "hello", "hey", "namaste"].includes(user_message.toLowerCase())) {
      const reply =
        "Hello 👋 Welcome to Techwheels Motors. How can I help you today?";

      await supabase.from("messages").insert({
        conversation_id,
        sender: "bot",
        message_type: "text",
        text: reply,
        channel,
        sub_organization_id: subOrganizationId,
      });

      if (channel === "whatsapp" && contactPhone) {
        await safeWhatsAppSend(scopedLogger, {
          organization_id: organizationId,
          sub_organization_id: subOrganizationId,
          to: contactPhone,
          type: "text",
          text: reply,
        });
      }

      return new Response("ok");
    }

    /* --------------------------------------------------------------
       5.5) WORKFLOW ENGINE (UNCHANGED)
    -------------------------------------------------------------- */
    let activeWorkflow = await loadActiveWorkflow(
      conversation_id,
      scopedLogger,
    );

    if (!activeWorkflow) {
      const wf = await detectWorkflowTrigger(
        user_message,
        organizationId,
        subOrganizationId,
        scopedLogger,
      );
      if (wf) {
        activeWorkflow = await startWorkflow(
          wf.id,
          conversation_id,
          scopedLogger,
        );
      }
    }

    /* --------------------------------------------------------------
       WORKFLOW HANDLING
    -------------------------------------------------------------- */
    if (activeWorkflow) {
      scopedLogger.info("[workflow] active workflow detected", {
        log_id: activeWorkflow.id,
        workflow_id: activeWorkflow.workflow_id,
        current_step: activeWorkflow.current_step_number,
      });

      const wfRow = await safeSupabase<WorkflowRow>(
        "load_workflow_by_id",
        scopedLogger,
        () =>
          supabase
            .from("workflows")
            .select(
              "id, organization_id, sub_organization_id, trigger, mode, is_active",
            )
            .eq("id", activeWorkflow!.workflow_id)
            .maybeSingle(),
      );

      if (wfRow) {
        const workflow = wfRow as WorkflowRow;
        const steps = await getWorkflowSteps(workflow.id, scopedLogger);

        if (!steps.length) {
          scopedLogger.warn("[workflow] no steps for workflow, ignoring", {
            workflow_id: workflow.id,
          });
        } else {
          let stepNum = activeWorkflow.current_step_number ?? 1;
          if (stepNum < 1) stepNum = 1;
          if (stepNum > steps.length) stepNum = steps.length;

          const step = steps[stepNum - 1];

          if (step) {
            const run =
              (workflow.mode ?? "smart") === "strict"
                ? runStrictMode
                : runSmartMode;

            const result = await run(
              step,
              activeWorkflow,
              user_message,
              scopedLogger,
            );

            const nextStep =
              result.nextStepNumber ?? (activeWorkflow.current_step_number ?? 1) +
                1;

            const isFinished = result.end || nextStep > steps.length;

            await saveWorkflowProgress(
              activeWorkflow.id,
              nextStep,
              activeWorkflow.variables,
              isFinished,
              scopedLogger,
            );

            const reply = result.output || fallbackMessage;

            /* ------------------------------------------
               Save + Send Bot Reply
            -------------------------------------------- */
            const { error: insertErr } = await supabase.from("messages")
              .insert({
                conversation_id,
                sender: "bot",
                message_type: "text",
                text: reply,
                channel,
                sub_organization_id: subOrganizationId,
              });

            if (insertErr) {
              scopedLogger.error("[messages] insert workflow reply error", {
                error: insertErr,
              });
            }

            const { error: convUpdateErr } = await supabase
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversation_id);

            if (convUpdateErr) {
              scopedLogger.error("[conversations] update last_message_at error", {
                error: convUpdateErr,
              });
            }

            if (channel === "whatsapp" && contactPhone) {
              await safeWhatsAppSend(scopedLogger, {
                organization_id: organizationId,
                sub_organization_id: subOrganizationId,
                to: contactPhone,
                type: "text",
                text: reply,
              });
            }

            scopedLogger.info("[ai-handler] workflow reply sent", { reply });

            return new Response(
              JSON.stringify({
                conversation_id,
                ai_response: reply,
                workflow_active: true,
                request_id,
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
        }
      }
    }
    // ------------------------------------------------------------------
// SAFETY GUARD: If a workflow was active but did not return a response,
// do NOT allow RAG to execute.
// ------------------------------------------------------------------
if (activeWorkflow) {
  scopedLogger.debug(
    "[workflow] active workflow detected but no response sent — skipping RAG",
  );

  return new Response(
    JSON.stringify({
      conversation_id,
      skipped: true,
      reason: "Workflow active",
      request_id,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}


    /* --------------------------------------------------------------
   6) RAG PIPELINE (SUBORG → ORG → GLOBAL FALLBACK)
-------------------------------------------------------------- */

    let contextText = "No relevant dealership knowledge found.";

    const embedding = await safeEmbedding(scopedLogger, user_message);

    if (embedding) {
      try {
        const resolved = await resolveKnowledgeContext({
          embedding,
          userMessage: user_message,
          organizationId,
          subOrganizationId,
          logger: scopedLogger,
        });
        
        if (resolved?.forced) {
          // 🔥 BYPASS OPENAI COMPLETELY
          const reply = resolved.context;
        
          await supabase.from("messages").insert({
            conversation_id,
            sender: "bot",
            message_type: "text",
            text: reply,
            channel,
            sub_organization_id: subOrganizationId,
          });
        
          if (channel === "whatsapp" && contactPhone) {
            await safeWhatsAppSend(scopedLogger, {
              organization_id: organizationId,
              sub_organization_id: subOrganizationId,
              to: contactPhone,
              type: "text",
              text: reply,
            });
          }
        
          scopedLogger.info("[ai-handler] forced KB reply sent");
        
          return new Response(
            JSON.stringify({
              conversation_id,
              ai_response: reply,
              request_id,
              forced_kb: true,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        
        if (resolved) {
          contextText = resolved.context;
        }
         else {
          scopedLogger.debug("[rag] no KB context resolved");
        }
      } catch (err) {
        scopedLogger.error("[rag] fatal error", { error: err });
      }
    }

    /* --------------------------------------------------------------
       7) Build System Prompt (same as your original, tiny wording tweak)
       Change: fallback only if NO knowledge context is provided.
    -------------------------------------------------------------- */
    const personaBlock = [
      subOrganizationId && `- Division ID: ${subOrganizationId}`,
      personality?.tone && `- Tone: ${personality.tone}`,
      personality?.language && `- Language: ${personality.language}`,
      personality?.short_responses
        ? "- Responses must be concise."
        : "- Normal-length responses allowed.",
      personality?.emoji_usage ? "- Emojis allowed." : "- No emojis.",
      personality?.gender_voice && `- Voice: ${personality.gender_voice}`,
    ]
      .filter(Boolean)
      .join("\n");

    const extraRules = extraInstructions?.rules
      ? JSON.stringify(extraInstructions.rules)
      : "{}";

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
PERSONALITY RULES
------------------------
${personaBlock || "- Default neutral personality."}

------------------------
BOT RULES (JSON)
------------------------
${extraRules}

------------------------
KNOWLEDGE CONTEXT (MOST IMPORTANT)
------------------------
${contextText}

Use this context as the primary source of truth about:
- Models, pricing, variants, and offers
- Dealership timings, location, and services
- Policies, financing, and processes
- Any dealership-specific instructions

If multiple KB chunks are relevant, combine them into a single clear answer.

------------------------
CONVERSATION HISTORY
------------------------
${historyText || "No previous messages."}

------------------------
FORMATTING & STYLE
------------------------
- Always answer the latest customer message.
- If answering with dealership info (timing, offers, etc.), use short bullet points where helpful.
- Keep WhatsApp replies short & simple (1–3 sentences max).
- If the user asks for next steps, suggest clear actions (Call, Visit, Test drive, Book service).
- If the knowledge context above does not contain the answer, say exactly: "${fallbackMessage}".

Respond now to the customer's latest message only.
`.trim();

    scopedLogger.debug("[ai-handler] system prompt built");

    /* --------------------------------------------------------------
       8) OpenAI Response
    -------------------------------------------------------------- */
    let aiResponseText = await safeChatCompletion(scopedLogger, {
      systemPrompt,
      userMessage: user_message,
    });

    if (!aiResponseText) {
      aiResponseText = fallbackMessage;
    }

    /* --------------------------------------------------------------
       9) Log unanswered fallback
    -------------------------------------------------------------- */
    if (aiResponseText === fallbackMessage) {
      scopedLogger.info("[ai-handler] using fallback message");
      await logUnansweredQuestion(organizationId, user_message, scopedLogger);
    }

    /* --------------------------------------------------------------
       10) Save bot response
    -------------------------------------------------------------- */
    const { error: insertErr } = await supabase.from("messages").insert({
      conversation_id,
      sender: "bot",
      message_type: "text",
      text: aiResponseText,
      channel,
      sub_organization_id: subOrganizationId,
    });

    if (insertErr) {
      scopedLogger.error("[messages] insert ai reply error", { error: insertErr });
    }

    const { error: convUpdateErr } = await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    if (convUpdateErr) {
      scopedLogger.error("[conversations] update last_message_at error", {
        error: convUpdateErr,
      });
    }

    /* --------------------------------------------------------------
       11) WhatsApp Send
    -------------------------------------------------------------- */
    if (channel === "whatsapp" && contactPhone) {
      await safeWhatsAppSend(scopedLogger, {
        organization_id: organizationId,
        sub_organization_id: subOrganizationId,
        to: contactPhone,
        type: "text",
        text: aiResponseText,
      });
    }

    scopedLogger.info("[ai-handler] reply sent", {
      ai_response_preview: aiResponseText.slice(0, 200),
    });

    return new Response(
      JSON.stringify({
        conversation_id,
        ai_response: aiResponseText,
        request_id,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    logger.error("[ai-handler] Fatal error", { error: err });
    return new Response(
      JSON.stringify({
        error: err?.message ?? "Internal Server Error",
        error_code: "INTERNAL_ERROR",
        request_id,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
