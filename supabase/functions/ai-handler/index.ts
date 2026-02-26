// supabase/functions/ai-handler/index.ts
// deno-lint-ignore-file no-explicit-any
/// <reference path="./deno-ambient.d.ts" />

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createLogger } from "./logging.ts";
import { getRequestId } from "./history.ts";
import { mainHandler } from "./main_handler.ts";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  const request_id = getRequestId(req);
  const trace_id = crypto.randomUUID();
  const baseLogger = createLogger({ request_id });

  // 0) Parse body — SAFE (prevents crash on empty / invalid JSON)
  let body: {
    conversation_id?: string;
    user_message?: string;
  } | null = null;

  const rawBody = await req.text();

  if (rawBody && rawBody.trim().length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch (err) {
      baseLogger.error("[validation] Invalid JSON body", {
        body_length: rawBody.length,
        error: String(err),
      });

      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (!body) {
    baseLogger.warn("[validation] Empty request body");
    return new Response(JSON.stringify({ error: "Empty request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const conversation_id = body.conversation_id;
  const raw_message = body.user_message;

  if (!conversation_id || !raw_message) {
    baseLogger.warn("[validation] Missing conversation_id or user_message");
    return new Response("Bad Request", { status: 400 });
  }

  const user_message = raw_message.trim();
  if (!user_message) return new Response("Empty message", { status: 400 });

  return await mainHandler({
    req,
    request_id,
    trace_id,
    baseLogger,
    conversation_id,
    user_message,
  });
});
