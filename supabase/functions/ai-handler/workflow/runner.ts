import { selectNextStepSmart } from "./selector.ts";
import { executeStep } from "./executor.ts";
import { loadState, saveState } from "./state.ts";

export async function runWorkflow({
  workflow,
  steps,
  conversationId,
  userMessage,
  openai,
  supabase,
}: {
  workflow: any;
  steps: any[];
  conversationId: string;
  userMessage: string;
  openai: any;
  supabase: any;
}) {
  const state = await loadState(conversationId, workflow.id, supabase);

  let nextStep;

  if (workflow.mode === "strict") {
    nextStep = steps.find(
      (s) => s.step_order === state.current_step,
    );
  } else {
    nextStep = await selectNextStepSmart({
      workflow,
      steps,
      state,
      userMessage,
      openai,
    });
  }

  if (!nextStep) return null;

  const result = await executeStep({
    step: nextStep,
    state,
    userMessage,
  });

  await saveState({
    conversationId,
    workflowId: workflow.id,
    nextStep: result.nextStep,
    variables: result.variables,
    reason: result.reason,
    completed: result.completed,
    supabase,
  });

  return result;
}
