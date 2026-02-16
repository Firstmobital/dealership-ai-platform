// supabase/functions/ai-handler/workflow/enforcer.ts
import { WorkflowDirective } from "./directive.ts";

// Deterministic text for non-LLM replies.
export function enforceDirective(d: WorkflowDirective): string {
  if (d.action === "ask") {
    // Enforce deterministic, single-question gating.
    // Prefer required_entities when present, but always ask ONLY ONE thing.
    const req = Array.isArray((d as any).required_entities)
      ? (d as any).required_entities.map((x: any) => String(x)).filter(Boolean)
      : [];

    const first = (req[0] || "").toLowerCase();

    // Common dealership workflow entity names
    if (first === "fuel" || first === "fuel_type") {
      return "Sure — which fuel do you prefer: Petrol, Diesel, CNG, or EV?";
    }

    if (first === "transmission") {
      return "Got it — do you prefer Manual or Automatic?";
    }

    if (first === "model" || first === "vehicle_model") {
      return "Which model are you interested in?";
    }

    if (first === "variant" || first === "vehicle_variant") {
      return "Which variant are you looking for?";
    }

    if (first === "vehicle_number" || first === "registration_number") {
      return "Please share your vehicle number.";
    }

    if (first === "city") {
      return "Which city is this for?";
    }

    // Fallback: still enforce a single question.
    const q = (d.question || "").trim();
    if (q) {
      const idx = q.indexOf("?");
      if (idx >= 0) return q.slice(0, idx + 1).trim();
      // If no question mark present, make it a question.
      return q.endsWith(".") ? q.slice(0, -1) + "?" : q + "?";
    }

    return "Could you please share that detail?";
  }

  if (d.action === "escalate") {
    return "I’m sharing this with the Techwheels team right now so they can assist you. Meanwhile, please share your mobile number and preferred time to call.";
  }

  // For 'say', the directive provides a seed message.
  return (d.action === "say" ? d.message_seed : "").trim();
}
