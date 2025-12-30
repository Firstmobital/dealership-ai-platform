// supabase/functions/ai-handler/workflow/explain.ts

/**
 * Provides a lightweight, human-readable explanation
 * of the current workflow execution state.
 *
 * IMPORTANT:
 * - This is for debugging, logs, or admin UI only
 * - NOT used by the AI while replying to customers
 */
export function explainStepDecision(state: {
  current_step: number;
  variables: Record<string, any>;
  completed?: boolean;
}) {
  return {
    current_step: state.current_step,
    completed: state.completed ?? false,
    variables: state.variables ?? {},
    note:
      state.completed
        ? "Workflow has completed all steps."
        : "Workflow is progressing sequentially using instruction-based steps.",
  };
}
