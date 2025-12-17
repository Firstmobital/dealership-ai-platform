export async function selectNextStepSmart({
    workflow,
    steps,
    state,
    userMessage,
    openai,
  }) {
    const prompt = `
  You are executing a dealership workflow.
  
  Workflow description:
  ${workflow.description}
  
  Steps:
  ${steps.map(s => `${s.step_order}. ${s.action.ai_action}: ${s.action.instruction_text || ""}`).join("\n")}
  
  Current variables:
  ${JSON.stringify(state.variables)}
  
  User message:
  "${userMessage}"
  
  Rules:
  - Skip steps already logically completed
  - Do not repeat questions
  - Choose the most relevant next step
  - Return ONLY JSON
  
  { "next_step": number, "reason": string }
  `;
  
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
  
    const parsed = JSON.parse(resp.choices[0].message.content);
  
    return steps.find(s => s.step_order === parsed.next_step);
  }
  