// supabase/functions/ai-handler/workflow/directive.ts
// Engine-enforced workflow directives: the engine decides, LLM only renders.

export type SaySchema = {
  allow_numbers: boolean;
  max_questions: number;
  forbidden_phrases?: string[];
};

export type WorkflowDirective =
  | {
      action: "ask";
      question: string;
      required_entities: string[];
      step_order: number;
    }
  | {
      // Phase 1: hidden workflow guidance (never sent verbatim to customer)
      action: "guide";
      guide_text: string;
      step_order: number;
    }
  | {
      action: "say";
      message_seed: string;
      schema: SaySchema;
      step_order: number;
    }
  | {
      action: "escalate";
      reason: string;
      step_order: number;
    };

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function readInstructionText(step: unknown): string {
  const s = asRecord(step);
  const action = asRecord(s.action);

  // Phase 1 canonical priority:
  // 1) action.instruction_text
  // 2) top-level instruction_text
  // 3) ""
  return String(action.instruction_text ?? s.instruction_text ?? "").trim();
}

function readAiAction(step: unknown): string {
  const s = asRecord(step);
  const action = asRecord(s.action);

  // Phase 1 canonical priority:
  // 1) action.ai_action
  // 2) top-level ai_action
  // 3) default "instruction"
  const raw = action.ai_action ?? s.ai_action ?? s.aiAction ?? null;
  const t = String(raw ?? "").trim();
  return t || "instruction";
}

function parseRequiredEntities(step: unknown): string[] {
  const s = asRecord(step);
  const action = asRecord(s.action);

  // Canonical contract (Phase 4): prefer action.expected_user_input/metadata.
  const actionMeta = asRecord(action.metadata);
  const legacyMeta = asRecord(s.metadata);

  const fromMeta = Array.isArray(actionMeta.required_entities)
    ? actionMeta.required_entities
    : Array.isArray(legacyMeta.required_entities)
      ? legacyMeta.required_entities
      : null;
  if (fromMeta && fromMeta.length) return fromMeta.map((x: unknown) => String(x));

  const rawExp =
    (action.expected_user_input ?? s.expected_user_input ?? "").toString().trim();
  if (!rawExp) return [];
  return rawExp
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}

function parseSaySchema(step: unknown): SaySchema {
  const s = asRecord(step);
  const action = asRecord(s.action);

  // Canonical contract (Phase 4): prefer action.metadata, fallback to legacy metadata.
  const meta = {
    ...asRecord(s.metadata),
    ...asRecord(action.metadata),
  };

  const allow_numbers =
    typeof meta.allow_numbers === "boolean" ? meta.allow_numbers : false;
  const max_questions =
    typeof meta.max_questions === "number" && meta.max_questions >= 0
      ? meta.max_questions
      : 0;
  const forbidden_phrases: string[] = Array.isArray(meta.forbidden_phrases)
    ? meta.forbidden_phrases.map((x: unknown) => String(x)).filter(Boolean)
    : ["contact dealer", "contact dealership"];

  return { allow_numbers, max_questions, forbidden_phrases };
}

export function buildDirective(
  step: unknown,
  entities: Record<string, unknown>
): WorkflowDirective {
  const s = asRecord(step);
  const stepOrder = Number(s.step_order ?? s.stepOrder ?? 0) || 0;

  const instruction = readInstructionText(step);
  const aiAction = readAiAction(step);

  // Phase 1: treat instruction-like / missing action as hidden guidance.
  // IMPORTANT: Never convert these into a customer-facing "say" seed.
  const aiActionNorm = aiAction.toLowerCase();
  if (aiActionNorm === "instruction" || aiActionNorm === "guide" || !aiActionNorm) {
    return {
      action: "guide",
      guide_text: instruction,
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "ask_question") {
    const required = parseRequiredEntities(step);
    const missing = required.filter((k) => !entities?.[k]);

    if (missing.length || required.length === 0) {
      return {
        action: "ask",
        question: instruction || "Could you please share a bit more detail?",
        required_entities: missing.length ? missing : required,
        step_order: stepOrder,
      };
    }

    return {
      action: "say",
      message_seed: "",
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "end") {
    // Preserve legacy behavior: end steps were implemented as a final SAY.
    return {
      action: "say",
      message_seed: instruction,
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "escalate") {
    return {
      action: "escalate",
      reason: instruction || "manual review",
      step_order: stepOrder,
    };
  }

  if (aiActionNorm === "branch") {
    // Preserve existing behavior for now (Phase 1: do not redesign branching).
    return {
      action: "say",
      message_seed: instruction,
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  // Phase 1 safety: fallback/default becomes GUIDE, not SAY.
  return {
    action: "guide",
    guide_text: instruction,
    step_order: stepOrder,
  };
}
