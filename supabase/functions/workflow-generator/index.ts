// supabase/functions/workflow-generator/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";

/* ============================================================================
   ENV VALIDATION
============================================================================ */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

if (!OPENAI_API_KEY) {
  console.error("[workflow-generator] Missing OPENAI_API_KEY");
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* ============================================================================
   CORS
============================================================================ */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/* ============================================================================
   LOGGING
============================================================================ */
function createLogger(request_id: string) {
  return {
    info(msg: string, extra = {}) {
      console.log(JSON.stringify({ level: "info", request_id, msg, ...extra }));
    },
    warn(msg: string, extra = {}) {
      console.warn(JSON.stringify({ level: "warn", request_id, msg, ...extra }));
    },
    error(msg: string, extra = {}) {
      console.error(JSON.stringify({ level: "error", request_id, msg, ...extra }));
    },
    debug(msg: string, extra = {}) {
      console.log(JSON.stringify({ level: "debug", request_id, msg, ...extra }));
    },
  };
}

/* ============================================================================
   SAFE OPENAI WRAPPER
============================================================================ */
async function safeOpenAI(logger: ReturnType<typeof createLogger>, prompt: any) {
  if (!openai) {
    logger.error("OpenAI unavailable");
    return { ok: false, error: "OPENAI_NOT_CONFIGURED" };
  }

  try {
    const resp = await openai.chat.completions.create(prompt);

    const text = resp.choices?.[0]?.message?.content?.trim() ?? "";

    return { ok: true, text };
  } catch (err) {
    logger.error("OpenAI error", { error: String(err) });
    return { ok: false, error: "OPENAI_REQUEST_FAILED" };
  }
}

/* ============================================================================
   CLEAN JSON EXTRACTION
============================================================================ */
function extractJson(text: string, logger: any): string | null {
  if (!text) return null;

  // Remove markdown-style code fences
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Extract substring between first "{" and last "}"
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    logger.error("No valid JSON object detected", { cleaned });
    return null;
  }

  return cleaned.slice(start, end + 1);
}

/* ============================================================================
   WORKFLOW VALIDATION
============================================================================ */
function validateWorkflow(workflow: any, logger: any): string | null {
  if (!workflow) return "WORKFLOW_EMPTY";

  if (!workflow.steps || !Array.isArray(workflow.steps)) {
    return "INVALID_STEPS_ARRAY";
  }

  if (workflow.steps.length < 1 || workflow.steps.length > 20) {
    return "INVALID_STEP_COUNT";
  }

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];

    if (!step.ai_action) return `STEP_${i + 1}_MISSING_ai_action`;

    const allowed = [
      "ask_question",
      "give_information",
      "save_user_response",
      "use_knowledge_base",
      "branch",
      "end",
    ];

    if (!allowed.includes(step.ai_action)) {
      return `STEP_${i + 1}_INVALID_ai_action`;
    }

    // Branch rule validation
    if (step.ai_action === "branch") {
      const rule = step?.metadata?.rule;
      if (!rule || !rule.field || !rule.value || !rule.goto_step) {
        return `STEP_${i + 1}_INVALID_BRANCH_RULE`;
      }
      if (rule.goto_step < 1 || rule.goto_step > workflow.steps.length) {
        return `STEP_${i + 1}_INVALID_BRANCH_GOTO`;
      }
    }

    // save_user_response rule
    if (step.ai_action === "save_user_response" && !step.expected_user_input) {
      return `STEP_${i + 1}_MISSING_EXPECTED_INPUT`;
    }
  }

  return null; // valid
}

/* ============================================================================
   SERVER
============================================================================ */
serve(async (req) => {
  const request_id = crypto.randomUUID();
  const logger = createLogger(request_id);

  // OPTIONS → CORS preflight
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
    const body = await req.json().catch(() => null);

    if (!body) {
      return new Response(
        JSON.stringify({
          error: "INVALID_JSON",
          request_id,
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { organization_id, description } = body;

    if (!organization_id || !description) {
      return new Response(
        JSON.stringify({
          error: "MISSING_FIELDS",
          request_id,
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    logger.info("Generating workflow", { organization_id });

    /* ---------------------------------------------------------
       CALL OPENAI
    ---------------------------------------------------------- */
    const prompt = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `
You are an expert AI workflow architect for a CRM.

Output ONLY valid JSON in this schema:

{
  "name": "",
  "description": "",
  "mode": "smart" | "strict",
  "trigger": {
    "type": "keyword" | "intent" | "always",
    "keywords": [],
    "intents": []
  },
  "is_active": true,
  "steps": []
}
`.trim(),
        },
        {
          role: "user",
          content: `
Organization ID: ${organization_id}
Description: ${description}

Generate a workflow. Output pure JSON only.
`.trim(),
        },
      ],
    };

    const result = await safeOpenAI(logger, prompt);
    if (!result.ok) {
      return new Response(
        JSON.stringify({
          error: result.error,
          request_id,
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const rawJson = extractJson(result.text, logger);
    if (!rawJson) {
      return new Response(
        JSON.stringify({
          error: "INVALID_JSON_FROM_LLM",
          raw: result.text,
          request_id,
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    let workflow;
    try {
      workflow = JSON.parse(rawJson);
    } catch (err) {
      logger.error("JSON_PARSE_ERROR", { rawJson });
      return new Response(
        JSON.stringify({
          error: "JSON_PARSE_ERROR",
          raw: rawJson,
          request_id,
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    /* ---------------------------------------------------------
       VALIDATE WORKFLOW
    ---------------------------------------------------------- */
    const validationErr = validateWorkflow(workflow, logger);
    if (validationErr) {
      logger.warn("INVALID_WORKFLOW", { validationErr });

      return new Response(
        JSON.stringify({
          error: "INVALID_WORKFLOW",
          reason: validationErr,
          raw: workflow,
          request_id,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    /* ---------------------------------------------------------
       SUCCESS
    ---------------------------------------------------------- */
    logger.info("Workflow generated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        workflow,
        request_id,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    logger.error("FATAL", { error: String(err) });

    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        request_id,
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
