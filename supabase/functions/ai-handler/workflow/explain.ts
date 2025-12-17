export function explainStepDecision(state) {
    return {
      step: state.current_step,
      reason: state.last_step_reason,
      variables: state.variables,
    };
  }
  