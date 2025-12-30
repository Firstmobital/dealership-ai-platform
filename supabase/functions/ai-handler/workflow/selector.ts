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

export function selectNextStep({
  steps,
  state,
}: {
  steps: Array<{
    id: string;
    step_order: number;
    instruction_text: string;
  }>;
  state: {
    current_step: number;
    completed?: boolean;
  };
}) {
  // If workflow is already marked completed, do nothing
  if (state.completed) {
    return null;
  }

  // Steps are 1-based indexed (step_order)
  const nextStep = steps.find(
    (step) => step.step_order === state.current_step,
  );

  // If no step exists at this index, workflow is complete
  if (!nextStep) {
    return null;
  }

  return nextStep;
}
