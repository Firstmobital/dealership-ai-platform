import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { buildDirective } from "../ai-handler/workflow/directive.ts";
import { enforceDirective } from "../ai-handler/workflow/enforcer.ts";
import { extractSlotsFromUserText } from "../ai-handler/workflow/slots.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Step = {
  id?: string;
  step_order?: number;
  ai_action?: string | null;
  instruction_text?: string | null;
  expected_user_input?: string | null;
  metadata?: Record<string, unknown> | null;
  action?: Record<string, unknown> | null;
};

type SimulatorState = {
  currentStep: number;
  variables: Record<string, unknown>;
  completed: boolean;
};

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function normalizeForMatch(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldAutoSkipStep(params: { step: Step; lastUserMessage: string }): boolean {
  const action = asRecord(params.step.action);
  if (action.skip_if_answered !== true) return false;

  const keywords = Array.isArray(action.match_any_keywords)
    ? action.match_any_keywords
        .map((k) => String(k || "").trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!keywords.length) return false;

  const normalizedUser = normalizeForMatch(params.lastUserMessage || "");
  if (!normalizedUser) return false;

  return keywords.some((k) => normalizedUser.includes(normalizeForMatch(k)));
}

function findFirstIncompleteStep(params: {
  steps: Step[];
  startStepNumber: number;
  lastUserMessage: string;
}): { step: Step | null; nextStepNumber: number; skipped: number[] } {
  const byOrder = new Map<number, Step>();
  for (const s of params.steps) {
    const order = Number(s.step_order ?? 0);
    if (!Number.isFinite(order) || order <= 0) continue;
    byOrder.set(order, s);
  }

  let current = Math.max(1, Number(params.startStepNumber || 1));
  const skipped: number[] = [];

  while (true) {
    const step = byOrder.get(current);
    if (!step) {
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

function stripInterrogativesForSay(text: string): string {
  let t = String(text || "").trim();
  if (!t) return t;

  const qm = t.indexOf("?");
  if (qm >= 0) t = t.slice(0, qm);

  t = t
    .replace(/\b(can you|could you|would you|will you|do you|did you|are you|is it|is there|have you)\b[^.!,;:]*$/i, "")
    .replace(/\b(what|which|when|where|why|how)\b[^.!,;:]*$/i, "")
    .trim();

  t = t.replace(/[؟?]+/g, "").trim();
  return t;
}

function renderSayFromSlots(template: string, slots: Record<string, unknown>): string {
  const safe = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  };

  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, keyRaw) => {
    const key = String(keyRaw || "").trim();
    if (!key) return "";
    const slotKey = key.startsWith("slots.") ? key.slice("slots.".length) : key;
    if (!slotKey) return "";
    return safe(slots[slotKey]);
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const body = await req.json();
    const rawSteps = Array.isArray(body?.steps) ? body.steps : [];
    const state = asRecord(body?.state) as unknown as Partial<SimulatorState>;
    const userMessage = String(body?.user_message ?? "").trim();

    const steps: Step[] = rawSteps
      .map((s: unknown) => asRecord(s) as unknown as Step)
      .filter((s) => Number.isFinite(Number(s.step_order ?? 0)))
      .sort((a, b) => Number(a.step_order ?? 0) - Number(b.step_order ?? 0));

    const currentStep = Math.max(1, Number(state.currentStep ?? 1));
    const baseVariables = asRecord(state.variables);

    if (!steps.length) {
      return json({
        output: "No workflow steps provided.",
        generated_reply: "No workflow steps provided.",
        current_step: currentStep,
        next_step: currentStep,
        nextStep: currentStep,
        would_advance: false,
        step_would_advance: false,
        completed: true,
        variables: baseVariables,
        directive_action: "none",
        skipped_steps: [],
      });
    }

    if (state.completed === true) {
      return json({
        output: "Workflow already completed.",
        generated_reply: "Workflow already completed.",
        current_step: currentStep,
        next_step: currentStep,
        nextStep: currentStep,
        would_advance: false,
        step_would_advance: false,
        completed: true,
        variables: baseVariables,
        directive_action: "completed",
        skipped_steps: [],
      });
    }

    const slotsBase = asRecord(baseVariables.slots);
    const slotRes = extractSlotsFromUserText(userMessage, slotsBase, {});
    const variables = {
      ...baseVariables,
      slots: slotRes.next,
    };

    const entityBag: Record<string, unknown> = {
      ...variables,
      ...asRecord(variables.slots),
    };

    const { step, nextStepNumber, skipped } = findFirstIncompleteStep({
      steps,
      startStepNumber: currentStep,
      lastUserMessage: userMessage,
    });

    if (!step) {
      return json({
        output: "Workflow completed.",
        generated_reply: "Workflow completed.",
        current_step: currentStep,
        next_step: nextStepNumber,
        nextStep: nextStepNumber,
        would_advance: false,
        step_would_advance: false,
        completed: true,
        variables,
        directive_action: "completed",
        skipped_steps: skipped,
      });
    }

    const directive = buildDirective(step, entityBag);
    const maxStepOrder = Math.max(...steps.map((s) => Number(s.step_order ?? 0)));
    const stepOrder = Number(step.step_order ?? nextStepNumber);

    let generatedReply = "";
    let wouldAdvance = false;
    let completed = false;
    let nextStep = stepOrder;

    if (directive.action === "ask") {
      generatedReply = enforceDirective(directive);
      wouldAdvance = false;
      completed = false;
      nextStep = stepOrder;
    } else if (directive.action === "escalate") {
      generatedReply = enforceDirective(directive);
      wouldAdvance = true;
      completed = true;
      nextStep = maxStepOrder + 1;
    } else if (directive.action === "say") {
      const slots = asRecord(variables.slots);
      const rendered = renderSayFromSlots(directive.message_seed ?? "", slots);
      generatedReply =
        stripInterrogativesForSay(rendered || enforceDirective(directive)) || "Okay.";

      wouldAdvance = true;
      nextStep = stepOrder + 1;
      completed = stepOrder >= maxStepOrder;
    } else if (directive.action === "send_media") {
      generatedReply = directive.caption_seed?.trim()
        ? directive.caption_seed.trim()
        : `Media would be sent: ${directive.media_key}`;
      wouldAdvance = true;
      completed = false;
      nextStep = stepOrder + 1;
    } else {
      generatedReply =
        "Guide step: live engine would generate a response using this workflow guidance.";
      wouldAdvance = false;
      completed = false;
      nextStep = stepOrder;
    }

    return json({
      output: generatedReply,
      generated_reply: generatedReply,
      current_step: stepOrder,
      next_step: nextStep,
      nextStep,
      would_advance: wouldAdvance,
      step_would_advance: wouldAdvance,
      completed,
      variables,
      directive_action: directive.action,
      skipped_steps: skipped,
    });
  } catch (error) {
    console.error("[workflow-simulate] error", error);
    return json({ error: "SIMULATION_FAILED" }, 500);
  }
});