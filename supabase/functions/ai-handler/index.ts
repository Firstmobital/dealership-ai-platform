// supabase/functions/ai-handler/index.ts

// deno-lint-ignore-file no-explicit-any
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
      console.warn(
        JSON.stringify({ level: "warn", message, ...base, ...extra }),
      );
    },
    error(message: string, extra: Record<string, any> = {}) {
      console.error(
        JSON.stringify({ level: "error", message, ...base, ...extra }),
      );
    },
    debug(message: string, extra: Record<string, any> = {}) {
      console.log(
        JSON.stringify({ level: "debug", message, ...base, ...extra }),
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
    const embedding = resp.data?.[0]?.embedding ?? null;
    if (!embedding) {
      logger.warn("[openai] embedding empty", { inputPreview: input.slice(0, 100) });
    }
    return embedding;
  } catch (err) {
    logger.error("[openai] embedding error", { error: err });
    return null;
  }
}

async function safeChatCompletion(
  logger: ReturnType<typeof createLogger>,
  params: {
    systemPrompt: string;
    userMessage: string;
  },
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

    const content = resp.choices?.[0]?.message?.content?.trim() ?? null;
    if (!content) {
      logger.warn("[openai] completion empty");
    }
    return content;
  } catch (err) {
    logger.error("[openai] completion error", { error: err });
    return null;
  }
}

/* ============================================================================
   HELPERS — Unanswered Question Logger
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
      logger.warn("[validation] Missing conversation_id or user_message", {
        body,
      });
      return new Response(
        JSON.stringify({
          error: "Missing conversation_id or user_message",
          error_code: "BAD_REQUEST",
          request_id,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const user_message = raw_message.trim();
    if (!user_message) {
      logger.warn("[validation] Empty user_message");
      return new Response(
        JSON.stringify({
          error: "Empty user_message",
          error_code: "BAD_REQUEST_EMPTY_MESSAGE",
          request_id,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    logger.info("[ai-handler] validated request", {
      conversation_id,
      user_message_preview: user_message.slice(0, 120),
    });

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
      logger.warn("[conversation] not found", { conversation_id });
      return new Response(
        JSON.stringify({
          error: "Conversation not found",
          error_code: "NOT_FOUND",
          request_id,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const organizationId: string = conv.organization_id;
    const channel: string = conv.channel || "web";
    const contactId: string | null = conv.contact_id;
    const subOrganizationId: string | null = conv.sub_organization_id ?? null;

    // Update logger context now that we know more
    const scopedLogger = createLogger({
      request_id,
      conversation_id,
      organization_id: organizationId,
      sub_organization_id: subOrganizationId,
      channel,
    });

    scopedLogger.info("[conversation] loaded");

    /* --------------------------------------------------------------
       1B) Respect AI toggle
    -------------------------------------------------------------- */
    if (conv.ai_enabled === false) {
      scopedLogger.info("[ai-handler] AI disabled for conversation, skipping");
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "AI disabled for this conversation",
          conversation_id,
          request_id,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    /* --------------------------------------------------------------
       2) Fetch Contact Phone (required for WA outbound)
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
    async function loadBotPersonality(organizationId: string, subOrgId: string | null) {
      let q = supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", organizationId);

      if (subOrgId) {
        q = q.eq("sub_organization_id", subOrgId);
      } else {
        q = q.is("sub_organization_id", null);
      }

      const { data: sub } = await q.maybeSingle();
      if (sub) return sub;

      // fallback to org-level
      const { data: org } = await supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", organizationId)
        .is("sub_organization_id", null)
        .maybeSingle();

      return (
        org ?? {
          fallback_message: "I'm sorry, I don’t have enough information to answer that.",
          tone: "neutral",
          emoji_usage: false,
          short_responses: true,
        }
      );
    }

    async function loadBotInstructions(organizationId: string, subOrgId: string | null) {
      let q = supabase
        .from("bot_instructions")
        .select("rules")
        .eq("organization_id", organizationId);

      if (subOrgId) {
        q = q.eq("sub_organization_id", subOrgId);
      } else {
        q = q.is("sub_organization_id", null);
      }

      const { data: sub } = await q.maybeSingle();
      if (sub) return sub;

      // fallback to org-level
      const { data: org } = await supabase
        .from("bot_instructions")
        .select("rules")
        .eq("organization_id", organizationId)
        .is("sub_organization_id", null)
        .maybeSingle();

      return org ?? { rules: {} };
    }

    const personality = await loadBotPersonality(organizationId, subOrganizationId);
    const extraInstructions = await loadBotInstructions(organizationId, subOrganizationId);

    const fallbackMessage: string =
      personality?.fallback_message ??
      "I'm sorry, I don’t have enough information to answer that.";

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

    scopedLogger.debug("[bot] personality loaded", {
      has_personality: !!personality,
      has_extra_rules: !!extraInstructions,
    });

    /* --------------------------------------------------------------
       4) Load Recent Conversation Messages
    -------------------------------------------------------------- */
    const recentMessages = await safeSupabase<
      { sender: string; message_type: string; text: string | null; created_at: string }[]
    >(
      "load_recent_messages",
      scopedLogger,
      () =>
        supabase
          .from("messages")
          .select("sender, message_type, text, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: true })
          .limit(20),
    );

    const historyText =
      recentMessages
        ?.map((m) => {
          const role =
            m.sender === "bot"
              ? "Bot"
              : m.sender === "customer"
              ? "Customer"
              : "User";

          return `${new Date(m.created_at).toISOString()} - ${role}: ${
            m.text ?? ""
          }`;
        })
        .join("\n") ?? "No previous messages.";

    /* --------------------------------------------------------------
       5) WhatsApp typing indicator  
    -------------------------------------------------------------- */
    if (channel === "whatsapp" && contactPhone) {
      scopedLogger.debug("[whatsapp] sending typing indicator");
      await safeWhatsAppSend(scopedLogger, {
        organization_id: organizationId,
        sub_organization_id: subOrganizationId,
        to: contactPhone,
        type: "typing_on",
      });
    }

    /* --------------------------------------------------------------
       5.5) WORKFLOW ENGINE
    -------------------------------------------------------------- */

    let activeWorkflow = await loadActiveWorkflow(
      conversation_id,
      scopedLogger,
    );

    // Start new workflow if none active and trigger matches
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

    /* --------------------------------------------------------------
       6) RAG PIPELINE (IMPROVED)
    -------------------------------------------------------------- */
    let contextText = "No relevant dealership knowledge found.";

    const embedding = await safeEmbedding(scopedLogger, user_message);

    if (embedding) {
      try {
        const { data: matches, error: matchError } = await supabase.rpc(
          "match_knowledge_chunks",
          {
            query_embedding: embedding,
            match_count: 10,
            match_threshold: 0.15,
          },
        );

        if (matchError) {
          scopedLogger.error("[rag] match_knowledge_chunks error", {
            error: matchError,
          });
        } else if (matches?.length) {
          const articleIds = [
            ...new Set(matches.map((m: any) => m.article_id)),
          ];

          const { data: articles, error: artError } = await supabase
            .from("knowledge_articles")
            .select("id, organization_id, sub_organization_id")
            .in("id", articleIds);

          if (artError) {
            scopedLogger.error("[rag] load articles error", { error: artError });
          } else {
            const allowedIds = new Set(
              (articles ?? [])
                .filter((a: any) => {
                  if (a.organization_id !== organizationId) return false;
                  if (!subOrganizationId) return a.sub_organization_id === null;
                  return (
                    a.sub_organization_id === null ||
                    a.sub_organization_id === subOrganizationId
                  );
                })
                .map((a: any) => a.id),
            );

            const filtered = matches.filter((m: any) =>
              allowedIds.has(m.article_id),
            );

            if (filtered.length) {
              const top = filtered
                .sort(
                  (a: any, b: any) =>
                    (b.similarity ?? 0) - (a.similarity ?? 0),
                )
                .slice(0, 8);

              contextText = top.map((m: any) => m.chunk).join("\n\n");

              scopedLogger.debug("[rag] matches found", {
                total_matches: matches.length,
                filtered_matches: filtered.length,
              });
            } else {
              scopedLogger.debug("[rag] matches filtered out by org/suborg");
            }
          }
        } else {
          scopedLogger.debug("[rag] no matches found");
        }
      } catch (err) {
        scopedLogger.error("[rag] fatal error", { error: err });
      }
    }

    /* --------------------------------------------------------------
       7) Build System Prompt (IMPROVED)
    -------------------------------------------------------------- */
    const systemPrompt = `
You are Techwheels AI — a professional automotive dealership assistant.

Your job:
- Use Knowledge Base (KB) context FIRST.
- Use dealership tone & personality rules.
- Answer concisely unless the customer asks for more details.
- Follow bot instructions strictly.
- Only fall back to the fallback message if no KB chunk is relevant.

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
${historyText}

------------------------
FORMATTING & STYLE
------------------------
- Always answer the latest customer message.
- If answering with dealership info (timing, offers, etc.), use short bullet points where helpful.
- Keep WhatsApp replies short & simple (1–3 sentences max).
- If the user asks for next steps, suggest clear actions (Call, Visit, Test drive, Book service).
- If you are not sure and KB is not relevant, say exactly: "${fallbackMessage}".

Respond now to the customer's latest message only.
`.trim();

    scopedLogger.debug("[ai-handler] system prompt built");

    /* --------------------------------------------------------------
       8) OpenAI Response (Fallback if no workflow)
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
      await logUnansweredQuestion(
        organizationId,
        user_message,
        scopedLogger,
      );
    }

    /* --------------------------------------------------------------
       10) Save bot response
    -------------------------------------------------------------- */
    const { error: insertErr } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        sender: "bot",
        message_type: "text",
        text: aiResponseText,
        channel,
        sub_organization_id: subOrganizationId,
      });

    if (insertErr) {
      scopedLogger.error("[messages] insert ai reply error", {
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
