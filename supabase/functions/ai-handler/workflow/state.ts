// supabase/functions/ai-handler/workflow/state.ts

export type ConversationState = {
  conversationId: string;
  workflowId: string;
  current_step: number;          // 1-based step index
  variables: Record<string, any>;
  completed?: boolean;
};

/**
 * Load workflow execution state for a conversation.
 * If no state exists, initialize a fresh workflow run.
 */
export async function loadState(
  conversationId: string,
  workflowId: string,
  supabase: any,
): Promise<ConversationState> {
  const { data, error } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("workflow_id", workflowId)
    .maybeSingle();

  // If no state found OR any error, start fresh
  if (!data || error) {
    return {
      conversationId,
      workflowId,
      current_step: 1,
      variables: {},
      completed: false,
    };
  }

  return {
    conversationId,
    workflowId,
    current_step: data.current_step ?? 1,
    variables: data.variables ?? {},
    completed: data.completed ?? false,
  };
}

/**
 * Persist workflow execution state.
 * This is called after every AI reply tied to a workflow step.
 */
export async function saveState(params: {
  conversationId: string;
  workflowId: string;
  nextStep: number;
  variables: Record<string, any>;
  reason: string;
  completed: boolean;
  supabase: any;
}) {
  const {
    conversationId,
    workflowId,
    nextStep,
    variables,
    reason,
    completed,
    supabase,
  } = params;

  await supabase.from("conversation_state").upsert({
    conversation_id: conversationId,
    workflow_id: workflowId,
    current_step: nextStep,
    variables,
    last_step_reason: reason,
    completed,
    updated_at: new Date().toISOString(),
  });
}
