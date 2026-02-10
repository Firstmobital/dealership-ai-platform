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

function parseRequiredEntities(step: any): string[] {
  // Prefer metadata.required_entities if present
  const meta = step?.metadata ?? {};
  const fromMeta = Array.isArray(meta.required_entities)
    ? meta.required_entities
    : null;

  if (fromMeta && fromMeta.length) return fromMeta.map((x: any) => String(x));

  // Fallback: expected_user_input as comma-separated keys (e.g., "model,variant,city")
  const exp = (step?.expected_user_input ?? "").toString().trim();
  if (!exp) return [];

  return exp
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSaySchema(step: any): SaySchema {
  const meta = step?.metadata ?? {};

  // Defaults: safe dealership behavior
  const allow_numbers =
    typeof meta.allow_numbers === "boolean" ? meta.allow_numbers : false;

  const max_questions =
    typeof meta.max_questions === "number" && meta.max_questions > 0
      ? meta.max_questions
      : 1;

  const forbidden_phrases: string[] = Array.isArray(meta.forbidden_phrases)
    ? meta.forbidden_phrases.map((x: any) => String(x)).filter(Boolean)
    : ["contact dealer", "contact dealership"];

  return { allow_numbers, max_questions, forbidden_phrases };
}

export function buildDirective(
  step: any,
  entities: Record<string, any>
): WorkflowDirective {
  const stepOrder = Number(step?.step_order ?? step?.stepOrder ?? 0) || 0;

  // Normalize instruction text
  const instruction =
    (
      step?.instruction_text ??
      step?.action?.instruction_text ??
      step?.action?.text ??
      ""
    )
      .toString()
      .trim();

  const aiAction = (step?.ai_action ?? step?.aiAction ?? "give_information")
    .toString()
    .trim();

  // "ask_question" steps are enforced deterministically
  if (aiAction === "ask_question") {
    const required = parseRequiredEntities(step);
    const missing = required.filter((k) => !entities?.[k]);

    // Always ask if required entities are missing OR required set is empty (generic ask step)
    if (missing.length || required.length === 0) {
      return {
        action: "ask",
        question: instruction || "Could you please share a bit more detail?",
        required_entities: missing.length ? missing : required,
        step_order: stepOrder,
      };
    }

    // Nothing missing → allow advancement by returning a no-op SAY seed
    return {
      action: "say",
      message_seed: "",
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  // Explicit end
  if (aiAction === "end") {
    return {
      action: "say",
      message_seed: instruction,
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  // Escalation (if you have such steps)
  if (aiAction === "escalate") {
    return {
      action: "escalate",
      reason: instruction || "manual review",
      step_order: stepOrder,
    };
  }

  // Branching not supported yet; keep deterministic by treating as SAY
  if (aiAction === "branch") {
    return {
      action: "say",
      message_seed: instruction,
      schema: parseSaySchema(step),
      step_order: stepOrder,
    };
  }

  // Default: treat as SAY with schema
  return {
    action: "say",
    message_seed: instruction,
    schema: parseSaySchema(step),
    step_order: stepOrder,
  };
}
