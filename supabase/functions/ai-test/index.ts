// supabase/functions/ai-test/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { getRequestId, isInternalRequest } from "../_shared/auth.ts";

/* =====================================================================================
   ENV
===================================================================================== */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

/* =====================================================================================
   CORS
===================================================================================== */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cors = (r: Response) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => r.headers.set(k, v));
  return r;
};

/* =====================================================================================
   LOGGING
===================================================================================== */
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
  };
}

/* =====================================================================================
   SAFE OPENAI WRAPPER
===================================================================================== */
async function safeOpenAI(logger: any, params: any) {
  if (!OPENAI_API_KEY) {
    logger.error("OPENAI_API_KEY missing");
    return { ok: false, error: "OPENAI_KEY_MISSING" };
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const resp = await client.chat.completions.create(params);

    const text =
      resp.choices?.[0]?.message?.content?.trim() ??
      "I'm here to help with dealership questions!";

    return { ok: true, text };
  } catch (err) {
    logger.error("OpenAI fatal", { error: String(err) });
    return { ok: false, error: "OPENAI_REQUEST_FAILED" };
  }
}

/* =====================================================================================
   SERVER
===================================================================================== */

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return cors(new Response("ok", { status: 200 }));
  }

  const request_id = getRequestId(req);
  const logger = createLogger(request_id);

  // P0: Never expose test endpoints publicly (prevents spend abuse + probing)
  if (!isInternalRequest(req)) {
    return cors(
      new Response(
        JSON.stringify({ ok: false, error: "Forbidden", request_id }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  if (req.method !== "POST") {
    return cors(
      new Response(
        JSON.stringify({
          error: "Method not allowed",
          request_id,
        }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    const conversation_id = body.conversation_id ?? null;
    const user_message = (body.user_message ?? "").toString().trim();

    if (!user_message) {
      return cors(
        new Response(
          JSON.stringify({
            error: "user_message required",
            request_id,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    logger.info("AI Test request received", {
      conversation_id,
      user_message,
    });

    /* ------------------------------------------------------------------
       OpenAI Request
    ------------------------------------------------------------------ */

    const result = await safeOpenAI(logger, {
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a dealership AI assistant. Always reply friendly and concisely.",
        },
        {
          role: "user",
          content: user_message,
        },
      ],
    });

    if (!result.ok) {
      return cors(
        new Response(
          JSON.stringify({
            ok: false,
            error: result.error,
            request_id,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    /* ------------------------------------------------------------------
       Success Response
    ------------------------------------------------------------------ */
    const aiResponse = result.text;

    logger.info("AI Test response generated", {
      ai_response: aiResponse,
    });

    return cors(
      new Response(
        JSON.stringify({
          ok: true,
          conversation_id,
          user_message,
          ai_response: aiResponse,
          request_id,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  } catch (err) {
    logger.error("FATAL", { error: String(err) });

    return cors(
      new Response(
        JSON.stringify({
          ok: false,
          error: "Internal Server Error",
          request_id,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
});

