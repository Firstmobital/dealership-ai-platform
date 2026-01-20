// supabase/functions/ai-engine/index.ts
// P0 FINAL — INTERNAL ONLY
// This function exists ONLY for legacy WhatsApp webhook compatibility.
// It must never be exposed publicly because it uses service_role and reads messages.
//
// Security model:
// - Require INTERNAL_API_KEY via x-internal-api-key (or Authorization: Bearer <key>)
// - Derive organization_id from conversation row (DB truth)
// - Always scope inserts/updates to that derived org

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getRequestId, isInternalRequest } from "../_shared/auth.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Simple helper that calls OpenAI Chat Completions.
// We keep this engine lightweight; the main RAG logic lives in `ai-handler`.
async function generateResponse(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn("[ai-engine] Missing OPENAI_API_KEY, returning stub response");
    return `AI response placeholder for: ${prompt}`;
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a concise dealership assistant. Keep answers short and helpful.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[ai-engine] OpenAI error:", resp.status, text);
    return "Sorry, I could not generate a response right now.";
  }

  const data = await resp.json();
  const content =
    data?.choices?.[0]?.message?.content ??
    "Sorry, I could not generate a response right now.";

  return typeof content === "string" ? content : String(content);
}

type AiEngineBody = {
  conversation_id?: string;
  // optional for idempotency across upstream retries
  request_id?: string;
};

// Legacy helper: used by `whatsapp-webhook`.
// New WhatsApp pipeline uses `whatsapp-inbound` + `ai-handler`.
serve(async (req: Request): Promise<Response> => {
  const rid = getRequestId(req);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // P0: internal gate (service_role + message reads)
  if (!isInternalRequest(req)) {
    return new Response(
      JSON.stringify({ error: "Forbidden", request_id: rid }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = (await req.json()) as AiEngineBody;
    const conversation_id = body.conversation_id;
    const request_id = (body.request_id || "").trim() || rid;

    if (!conversation_id) {
      return new Response(
        JSON.stringify({ error: "Missing conversation_id", request_id }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Load conversation (DB truth for org)
    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, organization_id, channel")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convErr) {
      console.error("[ai-engine] conversation load error:", convErr);
      return new Response(
        JSON.stringify({ error: "Failed to load conversation", request_id }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found", request_id }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const organization_id = String((conversation as any).organization_id);
    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Conversation missing organization_id", request_id }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Load recent messages so we can pick the latest customer text
    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("id, sender, text, created_at")
      .eq("conversation_id", conversation_id)
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (msgErr) {
      console.error("[ai-engine] messages load error:", msgErr);
    }

    const lastCustomer = (messages || []).find((m) => m.sender !== "bot");
    const userMessage =
      lastCustomer?.text ?? "Customer sent a message on WhatsApp.";

    // Generate AI reply
    const aiResponse = await generateResponse(userMessage);

    // Insert bot message (idempotent via outbound_dedupe_key)
    const { data: inserted, error: insertErr } = await supabase
      .from("messages")
      .insert({
        organization_id,
        conversation_id,
        sender: "bot",
        message_type: "text",
        text: aiResponse,
        media_url: null,
        channel: "whatsapp",
        outbound_dedupe_key: request_id,
      })
      .select("created_at")
      .maybeSingle();

    if (insertErr) {
      console.error("[ai-engine] insert bot message error:", insertErr);
    }

    // Update conversation last_message_at
    if (inserted?.created_at) {
      const { error: updErr } = await supabase
        .from("conversations")
        .update({ last_message_at: inserted.created_at })
        .eq("id", conversation_id)
        .eq("organization_id", organization_id);

      if (updErr) {
        console.error("[ai-engine] update conversation error:", updErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, response: aiResponse, request_id }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ai-engine] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", request_id: rid }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

