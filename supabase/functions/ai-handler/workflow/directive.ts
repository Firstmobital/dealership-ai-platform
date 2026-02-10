// supabase/functions/ai-handler/workflow/directive.ts
// Engine-enforced workflow directives: the engine decides, LLM only renders.

export type WorkflowDirective =
  | { action: "ask"; question: string; required_entities: string[]; step_order: number }
  | { action: "say"; message: string; step_order: number }
  | { action: "escalate"; reason: string; step_order: number };

function parseRequiredEntities(step: any): string[] {
  // Prefer metadata.required_entities if present
  const meta = step?.metadata ?? {};
  const fromMeta = Array.isArray(meta.required_entities) ? meta.required_entities : null;
  if (fromMeta && fromMeta.length) return fromMeta.map((x: any) => String(x));

  // Fallback: expected_user_input as comma-separated keys (e.g., "model,variant,city")
  const exp = (step?.expected_user_input ?? "").toString().trim();
  if (!exp) return [];
  return exp
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildDirective(step: any, entities: Record<string, any>): WorkflowDirective {
  const stepOrder = Number(step?.step_order ?? step?.stepOrder ?? 0) || 0;

  // Normalize instruction text
  const instruction =
    (step?.instruction_text ??
      step?.action?.instruction_text ??
      step?.action?.text ??
      "")
      .toString()
      .trim();

  const aiAction = (step?.ai_action ?? step?.aiAction ?? "give_information").toString();

  // "ask_question" steps are enforced deterministically
  if (aiAction === "ask_question") {
    const required = parseRequiredEntities(step);
    const missing = required.filter((k) => !entities?.[k]);

    // Always ask the question if required entities are missing OR required set is empty (generic ask step).
    if (missing.length || required.length === 0) {
      return {
        action: "ask",
        question: instruction || "Could you please share a bit more detail?",
        required_entities: missing.length ? missing : required,
        step_order: stepOrder,
      };
    }

    // If nothing missing, we can advance; treat as "say" no-op.
    return { action: "say", message: "", step_order: stepOrder };
  }

  // Explicit end / escalate handling
  if (aiAction === "end") {
    return { action: "say", message: instruction, step_order: stepOrder };
  }

  if (aiAction === "branch") {
    // Branching isn't supported yet; keep deterministic by treating as say.
    return { action: "say", message: instruction, step_order: stepOrder };
  }

  // For any other step, treat instruction as information to incorporate.
  return { action: "say", message: instruction, step_order: stepOrder };
}
