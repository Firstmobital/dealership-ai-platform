// supabase/functions/ai-handler/workflow/runner.ts

import { selectNextStep } from "./selector.ts";
import { executeStep } from "./executor.ts";
import { loadState, saveState } from "./state.ts";

/**
 * Runs a workflow for a given conversation.
 *
 * Design principles:
 * - Steps are executed sequentially
 * - Each step contains only instruction_text (guidance)
 * - AI intelligence is used ONLY to generate replies (outside this file)
 * - No AI-based step selection
 * - No strict vs smart modes
 */
export async function runWorkflow({
  workflow,
  steps,
  conversationId,
  userMessage,
  supabase,
}: {
  workflow: {
    id: string;
    name?: string;
  };
  steps: Array<{
    id: string;
    step_order: number;
    instruction_text: string;
  }>;
  conversationId: string;
  userMessage: string;
  supabase: any;
}) {
  // 1️⃣ Load existing workflow state (or initialize)
  const state = await loadState(conversationId, workflow.id, supabase);

  // 2️⃣ Select next step deterministically
  const nextStep = selectNextStep({
    steps,
    state,
  });

  // 3️⃣ If no step remains, workflow is complete
  if (!nextStep) {
    await saveState({
      conversationId,
      workflowId: workflow.id,
      nextStep: state.current_step,
      variables: state.variables,
      reason: "Workflow completed",
      completed: true,
      supabase,
    });

    return null;
  }

  // 4️⃣ Execute step (execution is lightweight, AI reply already generated)
  const result = await executeStep({
    step: nextStep,
    state,
    userMessage,
  });

  // 5️⃣ Persist updated workflow state
  await saveState({
    conversationId,
    workflowId: workflow.id,
    nextStep: result.nextStep,
    variables: result.variables,
    reason: result.reason,
    completed: result.completed,
    supabase,
  });

  // 6️⃣ Return execution result
  return result;
}
