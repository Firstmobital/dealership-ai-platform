// supabase/functions/ai-handler/workflow/executor.ts

export type StepResult = {
  output: string;
  nextStep: number;
  variables: Record<string, any>;
  completed: boolean;
  reason: string;
};

/**
 * Executes a workflow step.
 *
 * IMPORTANT DESIGN:
 * - Steps contain ONLY instruction_text (guidance)
 * - AI reply generation happens OUTSIDE this file
 * - Executor only:
 *   - Advances step
 *   - Preserves variables
 *   - Marks completion
 *
 * No step types.
 * No branching.
 * No AI decisions.
 */
export async function executeStep(params: {
  step: {
    step_order: number;
    instruction_text: string;
  };
  state: {
    current_step: number;
    variables: Record<string, any>;
  };
  userMessage: string;
}): Promise<StepResult> {
  const { step, state } = params;

  // Clone variables safely (reserved for future use)
  const variables = { ...state.variables };

  // Move to next sequential step
  const nextStep = step.step_order + 1;

  return {
    // IMPORTANT:
    // output is NOT used as the customer reply anymore
    // AI reply is generated elsewhere
    output: "",
    nextStep,
    variables,
    completed: false,
    reason: "Advanced to next sequential step",
  };
}
