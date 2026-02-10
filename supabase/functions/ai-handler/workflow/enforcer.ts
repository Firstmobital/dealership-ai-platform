// supabase/functions/ai-handler/workflow/enforcer.ts
import { WorkflowDirective } from "./directive.ts";

// Deterministic text for non-LLM replies.
export function enforceDirective(d: WorkflowDirective): string {
  if (d.action === "ask") return d.question;

  if (d.action === "escalate") {
    return "I’m sharing this with the Techwheels team right now so they can assist you. Meanwhile, please share your mobile number and preferred time to call.";
  }

  return (d.message || "").trim();
}
