
export type WorkflowDirective =
  | { action: "ask"; question: string; required_entities: string[] }
  | { action: "say"; message: string }
  | { action: "escalate"; reason: string };

export function buildDirective(step: any, entities: Record<string, any>): WorkflowDirective {
  if (step.required_entities?.length) {
    const missing = step.required_entities.filter((e: string) => !entities[e]);
    if (missing.length) {
      return { action: "ask", question: step.question, required_entities: missing };
    }
  }
  if (step.type === "escalate") {
    return { action: "escalate", reason: step.reason || "manual review" };
  }
  return { action: "say", message: step.instruction_text };
}
