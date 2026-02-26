import { supabase } from "./clients.ts";

/* ============================================================================
   PHASE 4 — TRACE HELPERS (OBSERVABILITY)
============================================================================ */
export async function traceInsertStart(params: {
  trace_id: string;
  organization_id: string;
  conversation_id: string;
  request_id: string;
  channel: string;
  caller_type: "internal" | "user";
  user_text: string;
}) {
  try {
    await supabase.from("ai_turn_traces").insert({
      id: params.trace_id,
      organization_id: params.organization_id,
      conversation_id: params.conversation_id,
      request_id: params.request_id,
      channel: params.channel,
      caller_type: params.caller_type,
      user_text: params.user_text,
      status: "started",
      started_at: new Date().toISOString(),
    });
  } catch {
    // never break ai-handler because of tracing
  }
}

export async function traceUpdate(trace_id: string, patch: Record<string, any>) {
  try {
    await supabase.from("ai_turn_traces").update(patch).eq("id", trace_id);
  } catch {
    // never break ai-handler because of tracing
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
