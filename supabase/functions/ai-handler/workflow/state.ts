export type ConversationState = {
    conversationId: string;
    workflowId: string;
    current_step: number;
    variables: Record<string, any>;
  };
  
  export async function loadState(
    conversationId: string,
    workflowId: string,
    supabase: any,
  ): Promise<ConversationState> {
    const { data } = await supabase
      .from("conversation_state")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("workflow_id", workflowId)
      .maybeSingle();
  
    if (!data) {
      return {
        conversationId,
        workflowId,
        current_step: 1,
        variables: {},
      };
    }
  
    return {
      conversationId,
      workflowId,
      current_step: data.current_step ?? 1,
      variables: data.variables ?? {},
    };
  }
  
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
    });
  }
  