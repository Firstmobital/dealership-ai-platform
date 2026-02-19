// supabase/functions/ai-handler/workflow/selector.ts

/**
 * Select the next workflow step in a simple, deterministic manner.
 *
 * IMPORTANT DESIGN:
 * - No AI-based step selection
 * - No step type inference
 * - No keyword guessing
 *
 * Steps are executed strictly in step_order sequence.
 * The AI's intelligence is used ONLY to generate replies,
 * not to decide control flow.
 */

type Step = {
  id: string;
  step_order: number;
  instruction_text: string;
};

type WorkflowState = {
  current_step: number;
  completed?: boolean;
};

type QuestionType = "fuel" | "transmission" | "price" | "city" | "model";

function normalizeText(s: unknown): string {
  return String(s ?? "").toLowerCase().trim();
}

function isQuestionStep(instructionText: string): boolean {
  const t = normalizeText(instructionText);
  if (!t) return false;

  // Heuristic #1: explicit question mark
  if (t.includes("?")) return true;

  // Heuristic #2: common question-style leading phrases (English/Hindi)
  return (
    t.startsWith("ask") ||
    t.startsWith("which") ||
    t.startsWith("select") ||
    t.startsWith("choose") ||
    t.startsWith("पूछ") ||
    t.startsWith("क्या")
  );
}

function inferQuestionType(instructionText: string): QuestionType | null {
  const t = normalizeText(instructionText);
  if (!t) return null;

  // Keep mapping intentionally simple + deterministic.
  if (/(\bfuel\b|\bcng\b|\bpetrol\b|\bev\b|\belectric\b)/.test(t)) return "fuel";
  if (/(\btransmission\b|\bautomatic\b|\bamt\b|\bmanual\b|\bmt\b)/.test(t)) {
    return "transmission";
  }
  if (
    /(\bprice\b|on\s*road|on-road|ex\s*showroom|\bdiscount\b|\boffer\b)/.test(
      t,
    )
  ) {
    return "price";
  }
  if (/(\bcity\b|\bregistration\b|\brto\b)/.test(t)) return "city";

  // Model inference is intentionally conservative unless we have a safe list.
  if (/(\bmodel\b)/.test(t)) return "model";

  return null;
}

function hasAnswerForQuestionType(qt: QuestionType, lastUserMessage: string): boolean {
  const m = normalizeText(lastUserMessage);
  if (!m) return false;

  switch (qt) {
    case "fuel":
      return /\b(cng|petrol|diesel|ev|electric)\b/.test(m);
    case "transmission":
      return /\b(automatic|amt|manual|mt|dct)\b/.test(m);
    case "price":
      return /\b(price|on\s*road|on-road|ex\s*showroom|discount|offer)\b/.test(m);
    case "city":
      // Minimal city list to reduce false positives.
      return /\b(jaipur|delhi|mumbai|jodhpur|ahmedabad)\b/.test(m);
    case "model":
      // No safe model list here → do not auto-skip model questions.
      return false;
    default:
      return false;
  }
}

function shouldAutoSkipStep(step: Step, lastUserMessage: string): boolean {
  if (!isQuestionStep(step.instruction_text)) return false; // INFO steps never skipped.

  const qt = inferQuestionType(step.instruction_text);
  if (!qt) return false;

  return hasAnswerForQuestionType(qt, lastUserMessage);
}

export function selectNextStep({
  steps,
  state,
  userMessage,
}: {
  steps: Step[];
  state: WorkflowState;
  userMessage: string;
}) {
  // If workflow is already marked completed, do nothing
  if (state.completed) {
    return null;
  }

  // Steps are 1-based indexed (step_order)
  // Deterministic auto-skip: only QUESTION steps whose answer is already present.
  let cursor = state.current_step;

  while (true) {
    const candidate = steps.find((step) => step.step_order === cursor);

    // If no step exists at this index, workflow is complete
    if (!candidate) return null;

    if (shouldAutoSkipStep(candidate, userMessage)) {
      cursor += 1;
      continue;
    }

    return candidate;
  }
}
