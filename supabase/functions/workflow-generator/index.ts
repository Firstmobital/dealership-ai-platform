// supabase/functions/workflow-generator/index.ts
// FINAL — STRICT AI WORKFLOW GENERATOR (CRM SAFE)

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";

/* ------------------------------------------------------------------ */
/* ENV                                                                */
/* ------------------------------------------------------------------ */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

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
  "end",
] as const;

type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

type WorkflowTrigger =
  | { type: "always" }
  | { type: "keyword"; keywords: string[] }
  | { type: "intent"; intents: string[] }
  | { type: "whatsapp_template"; templates: string[] };

type WorkflowStep = {
  ai_action: AllowedAction;
  instruction_text: string;
  expected_user_input: string;
  metadata: Record<string, unknown>;
};

type GeneratedWorkflow = {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  mode: "smart";
  is_active: boolean;
  steps: WorkflowStep[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function isAllowedAction(v: unknown): v is AllowedAction {
  return typeof v === "string" && (ALLOWED_ACTIONS as readonly string[]).includes(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normalizeTrigger(v: unknown): WorkflowTrigger {
  if (!isPlainObject(v)) return { type: "always" };
  const t = safeString((v as any).type).trim() as WorkflowTrigger["type"];

  if (t === "keyword") {
    const keywords = normalizeStringArray((v as any).keywords);
    return { type: "keyword", keywords };
  }

  if (t === "intent") {
    const intents = normalizeStringArray((v as any).intents);
    return { type: "intent", intents };
  }

  if (t === "whatsapp_template") {
    const templates = normalizeStringArray((v as any).templates);
    return { type: "whatsapp_template", templates };
  }

  return { type: "always" };
}

function normalizeSteps(v: unknown): WorkflowStep[] {
  if (!Array.isArray(v)) return [];

  const out: WorkflowStep[] = [];

  for (const raw of v) {
    if (!isPlainObject(raw)) continue;

    const ai_action = (raw as any).ai_action;
    if (!isAllowedAction(ai_action)) continue;

    const instruction_text = safeString((raw as any).instruction_text).trim();
    const expected_user_input = safeString((raw as any).expected_user_input).trim();
    const metadataRaw = (raw as any).metadata;
    const metadata = isPlainObject(metadataRaw) ? metadataRaw : {};

    // enforce: save_user_response must store a snake_case key
    if (ai_action === "save_user_response") {
      const key = expected_user_input;
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        // drop invalid key; keep step but make it a question instead of saving garbage
        out.push({
          ai_action: "ask_question",
          instruction_text: instruction_text || "Please share the required details.",
          expected_user_input: "",
          metadata,
        });
        continue;
      }
    }

    out.push({
      ai_action,
      instruction_text: instruction_text.slice(0, 220),
      expected_user_input: ai_action === "save_user_response" ? expected_user_input : "",
      metadata,
    });
  }

  return out;
}

function ensureFinalEndStep(steps: WorkflowStep[]): WorkflowStep[] {
  const last = steps[steps.length - 1];
  if (last?.ai_action === "end") return steps;
  return [
    ...steps,
    {
      ai_action: "end",
      instruction_text: "Thanks! Our team will assist you further.",
      expected_user_input: "",
      metadata: {},
    },
  ];
}

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

  // Missing key: clear 500 with explicit error code
  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: "MISSING_OPENAI_API_KEY" }, 500);
  }

  if (!openai) {
    return jsonResponse({ error: "MISSING_OPENAI_API_KEY" }, 500);
  }

  try {
    const { organization_id, description } = await req.json();

    if (!organization_id || !description) {
      return jsonResponse({ error: "MISSING_FIELDS" }, 400);
    }

    /* --------------------------------------------------------------
       🔒 SYSTEM PROMPT — STRICT JSON SCHEMA
    -------------------------------------------------------------- */
    const systemPrompt = `
You are an AI workflow builder for a CRM system.

Return EXACTLY ONE JSON object matching this schema (no markdown, no commentary):

{
  "name": "string",
  "description": "string",
  "trigger": { "type": "always" | "keyword" | "intent" | "whatsapp_template", "keywords"?: ["string"], "intents"?: ["string"], "templates"?: ["string"] },
  "mode": "smart",
  "is_active": true,
  "steps": [
    {
      "ai_action": "ask_question" | "give_information" | "save_user_response" | "use_knowledge_base" | "end",
      "instruction_text": "string",
      "expected_user_input": "string",
      "metadata": {}
    }
  ]
}

Rules:
- Prefer simple sequential steps. Do NOT use branching unless the user explicitly requires branching.
- Keep each instruction_text short (max ~200 chars).
- ask_question steps: must contain ONLY ONE question.
- save_user_response: use ONLY when storing a field; expected_user_input MUST be a snake_case key (e.g. "vehicle_model").
  - For all other ai_action values, expected_user_input MUST be an empty string.
- If the user asks about pricing/specs/offers, add a use_knowledge_base step instead of inventing facts.
- The final step MUST have ai_action "end".

Output MUST be valid JSON.
`.trim();

    const userPrompt = `Organization ID: ${organization_id}

Task:
${description}

Create a SMART workflow.`.trim();

    let text = "";

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      text = completion.choices?.[0]?.message?.content ?? "";
    } catch (e: any) {
      // OpenAI call failed: return 502 with details
      return jsonResponse(
        {
          error: "OPENAI_ERROR",
          message: e?.message ? String(e.message) : "OpenAI request failed",
          status: typeof e?.status === "number" ? e.status : undefined,
        },
        502
      );
    }

    // With JSON-mode we expect a raw JSON string body.
    const parsedRaw = JSON.parse(text) as any;

    const normalized: GeneratedWorkflow = {
      name: safeString(parsedRaw?.name).trim() || "New Workflow",
      description: safeString(parsedRaw?.description).trim() || String(description),
      trigger: normalizeTrigger(parsedRaw?.trigger),
      mode: "smart",
      is_active:
        typeof parsedRaw?.is_active === "boolean" ? parsedRaw.is_active : true,
      steps: [],
    };

    const steps = normalizeSteps(parsedRaw?.steps);
    if (!steps.length) {
      return jsonResponse({ error: "INVALID_WORKFLOW", message: "INVALID_STEPS_ARRAY" }, 400);
    }

    normalized.steps = ensureFinalEndStep(steps);

    return jsonResponse({ success: true, workflow: normalized }, 200);
  } catch (err: any) {
    return jsonResponse(
      {
        error: "INVALID_WORKFLOW",
        message: err?.message ? String(err.message) : "Invalid workflow",
      },
      400
    );
  }
});

