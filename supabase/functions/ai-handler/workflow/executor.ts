export type StepResult = {
  output: string;
  nextStep: number;
  variables: Record<string, any>;
  completed: boolean;
  reason: string;
};

export async function executeStep(params: {
  step: any;
  state: any;
  userMessage: string;
}): Promise<StepResult> {
  const { step, state, userMessage } = params;
  const action = step.action || {};

  let nextStep = step.step_order + 1;
  let variables = { ...state.variables };
  let completed = false;
  let reason = "Sequential step";

  switch (action.ai_action) {
    case "ask_question":
    case "give_information":
      break;

    case "save_user_response":
      if (action.expected_user_input) {
        variables[action.expected_user_input] = userMessage;
        reason = `Saved variable ${action.expected_user_input}`;
      }
      break;

    case "branch":
      const rule = action.metadata?.rule;
      if (
        rule &&
        variables[rule.field] === rule.value &&
        rule.goto_step
      ) {
        nextStep = rule.goto_step;
        reason = `Branch matched: ${rule.field}=${rule.value}`;
      }
      break;

    case "end":
      completed = true;
      reason = "Workflow ended";
      break;
  }

  return {
    output: action.instruction_text || "",
    nextStep,
    variables,
    completed,
    reason,
  };
}
