// supabase/functions/workflow-generator/index.ts
// FINAL — STRICT AI WORKFLOW GENERATOR (CRM SAFE)

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";

/* ------------------------------------------------------------------ */
/* ENV                                                                */
/* ------------------------------------------------------------------ */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/* VALID ACTIONS (CRITICAL)                                            */
/* ------------------------------------------------------------------ */
const ALLOWED_ACTIONS = [
  "ask_question",
  "give_information",
  "save_user_response",
  "use_knowledge_base",
  "branch",
  "end",
];

/* ------------------------------------------------------------------ */
/* SERVER                                                             */
/* ------------------------------------------------------------------ */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const { organization_id, description } = await req.json();

    if (!organization_id || !description) {
      return new Response(
        JSON.stringify({ error: "MISSING_FIELDS" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    /* --------------------------------------------------------------
       🔒 SYSTEM PROMPT — THIS IS THE FIX
    -------------------------------------------------------------- */
    const systemPrompt = `
You are an AI workflow builder for a CRM system.

⚠️ VERY IMPORTANT RULES (DO NOT BREAK):

1. You MUST output ONLY valid JSON.
2. You MUST use ONLY these step actions:

${ALLOWED_ACTIONS.map((a) => `- "${a}"`).join("\n")}

3. DO NOT invent actions like:
collect, validate, confirm, suggest, schedule, followup, wait, notify

4. Every step MUST look like this:

{
  "ai_action": "ask_question",
  "instruction_text": "text here",
  "expected_user_input": "variable_name (ONLY for save_user_response)",
  "metadata": {}
}

5. Branch steps MUST include:
{
  "ai_action": "branch",
  "metadata": {
    "rule": {
      "field": "variable_name",
      "value": "expected_value",
      "goto_step": 3
    }
  }
}

6. Final step MUST be:
{ "ai_action": "end", "instruction_text": "..." }

❌ If you break any rule, the workflow will be rejected.

Return JSON ONLY. No explanation. No markdown.
`.trim();

    /* -------------------------------------------------------------- */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `
Organization ID: ${organization_id}

Task:
${description}

Create a SMART workflow.
`.trim(),
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content ?? "";

    /* --------------------------------------------------------------
       CLEAN JSON
    -------------------------------------------------------------- */
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    /* --------------------------------------------------------------
       VALIDATE STEPS
    -------------------------------------------------------------- */
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error("INVALID_STEPS_ARRAY");
    }

    for (let i = 0; i < parsed.steps.length; i++) {
      const step = parsed.steps[i];
      if (!ALLOWED_ACTIONS.includes(step.ai_action)) {
        throw new Error(`INVALID_STEP_${i + 1}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, workflow: parsed }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "INVALID_WORKFLOW",
        message: err.message,
      }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

