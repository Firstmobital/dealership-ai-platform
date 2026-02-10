
import { WorkflowDirective } from "./directive";

export function enforceDirective(d: WorkflowDirective) {
  if (d.action === "ask") return d.question;
  if (d.action === "escalate") return "Escalating to Techwheels team.";
  return d.message;
}
