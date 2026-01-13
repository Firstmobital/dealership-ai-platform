// supabase/functions/whatsapp-send/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ===========================================================================
   ENV
=========================================================================== */

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
// IMPORTANT: Use anon key for user-scoped checks so RLS applies.
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const WHATSAPP_API_BASE_URL =
  Deno.env.get("WHATSAPP_API_BASE_URL") ?? "https://graph.facebook.com/v20.0";

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// User-scoped client (for auth + membership checks)
function createUserClient(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(PROJECT_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

/* ===========================================================================
   IDEMPOTENCY HELPERS (P1-A)
=========================================================================== */

function stableJsonStringify(obj: any): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(stableJsonStringify).join(",")}]`;
  }
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${k}:${stableJsonStringify(obj[k])}`)
    .join(",")}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ===========================================================================
   TYPES
=========================================================================== */

type MessageType =
  | "text"
  | "typing_on"
  | "template"
  | "image"
  | "video"
  | "audio"
  | "document";

type SendBody = {
  // ✅ Agent inbox send (preferred)
  conversation_id?: string;

  organization_id?: string;
  contact_id?: string | null;
  to?: string;
  type?: MessageType;

  text?: string;

  template_name?: string;
  template_language?: string;
  template_variables?: string[];
  template_components?: any[] | null;

  image_url?: string;
  video_url?: string;
  audio_url?: string;
  document_url?: string;
  filename?: string;

  message_type?: MessageType;
  media_url?: string | null;
  mime_type?: string | null;

  // Optional override for non-inbox flows
  sender?: "bot" | "agent";
  metadata?: {
    reply_sheet_tab?: string | null;
  } | null;

  // Campaign context (optional)
  campaign_id?: string | null;
  campaign_message_id?: string | null;

  // Best-effort plain text for UI (especially templates)
  rendered_text?: string | null;

};

/* ==========================================================================
   PHONE NORMALIZATION (INDIA)
   - Contacts often store +91XXXXXXXXXX
   - WhatsApp expects "91XXXXXXXXXX"
=========================================================================== */

function normalizePhoneToWaIndia(raw: string): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (/^91\d{10}$/.test(d)) return d;
  if (/^\d{10}$/.test(d)) return `91${d}`;
  if (/^\+91\d{10}$/.test(raw)) return raw.replace(/^\+/, "");
  if (/^\d{12}$/.test(d) && d.startsWith("91")) return d;
  return null;
}

/* ===========================================================================
   RESOLVE SETTINGS (ORG ONLY)
=========================================================================== */

async function resolveWhatsappSettings(orgId: string) {
  const { data } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("organization_id", orgId)
    .neq("is_active", false)
    .maybeSingle();

  return data ?? null;
}

/* ===========================================================================
   TEMPLATE COMPONENTS
=========================================================================== */

function buildTemplateComponents(body: SendBody): any[] {
  // Campaigns MUST use variables only
  if (Array.isArray(body.template_variables)) {
    if (body.template_variables.some(v => !v || !String(v).trim())) {
      throw new Error("Empty template variable detected");
    }

    return [
      {
        type: "body",
        parameters: body.template_variables.map((v) => ({
          type: "text",
          text: String(v),
        })),
      },
    ];
  }

  // Inbox / manual sends may still use explicit components
  if (Array.isArray(body.template_components)) {
    return body.template_components;
  }

  return [];
}

function persistVariableMismatch(params: {
  conversationId: string | null;
  sender: "bot" | "agent";
  errorDetails: string;
  metadata?: any;
}) {
  const { conversationId, sender, errorDetails, metadata } = params;

  if (!conversationId) return;

  return supabase.from("messages").insert({
    conversation_id: conversationId,
    sender,
    channel: "whatsapp",
    whatsapp_status: "failed",
    error: "variable_mismatch",
    error_details: errorDetails,
    metadata: metadata ?? null,
    sent_at: new Date().toISOString(),
  });
}


/* ===========================================================================
   BUILD WHATSAPP PAYLOAD
=========================================================================== */

function buildWhatsappPayload(body: SendBody) {
  const { type, to } = body;
  if (!type || !to) throw new Error("Missing type or to");

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type,
  };

  if (type === "text") {
    if (!body.text?.trim()) throw new Error("Missing text");
    return { ...payload, text: { body: body.text.trim() } };
  }

  if (type === "template") {
    if (!body.template_name || !body.template_language) {
      throw new Error("Missing template_name or template_language");
    }

    return {
      ...payload,
      template: {
        name: body.template_name,
        language: { code: body.template_language },
        components: buildTemplateComponents(body),
      },
    };
  }

  if (type === "image") {
    if (!body.image_url) throw new Error("Missing image_url");
    return {
      ...payload,
      image: {
        link: body.image_url,
        ...(body.text?.trim()
          ? { caption: body.text.trim().slice(0, 1000) }
          : {}),
      },
    };
  }

  if (type === "video") {
    if (!body.video_url) throw new Error("Missing video_url");
    return {
      ...payload,
      video: {
        link: body.video_url,
        ...(body.text?.trim()
          ? { caption: body.text.trim().slice(0, 1000) }
          : {}),
      },
    };
  }

  if (type === "audio") {
    if (!body.audio_url) throw new Error("Missing audio_url");
    return { ...payload, audio: { link: body.audio_url } };
  }

  if (type === "document") {
    if (!body.document_url) throw new Error("Missing document_url");
    return {
      ...payload,
      document: {
        link: body.document_url,
        filename: body.filename ?? "Document",
        ...(body.text?.trim()
          ? { caption: body.text.trim().slice(0, 1000) }
          : {}),
      },
    };
  }

  if (type === "typing_on") return null;

  throw new Error(`Unsupported type: ${type}`);
}

/* ===========================================================================
   MAIN HANDLER
=========================================================================== */

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
      });
    }

    const body = (await req.json()) as SendBody;

    /* ==========================================================
       AUTH (required for inbox agent sends)
    ========================================================== */

    const userClient = createUserClient(req);
    const { data: authData } = await userClient.auth.getUser();
    const authedUserId = authData?.user?.id ?? null;

    // ==========================================================
    // INBOX AGENT SEND (conversation_id)
    // ==========================================================

    if (body.conversation_id) {
      if (!authedUserId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        });
      }

      const conversationId = body.conversation_id.trim();
      const msgType = (body.type ?? body.message_type ?? "text") as MessageType;

      if (msgType === "typing_on") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      // Resolve conversation + org + contact
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("id, organization_id, contact_id, channel")
        .eq("id", conversationId)
        .maybeSingle();

      if (convErr || !conv?.id) {
        return new Response(
          JSON.stringify({ error: "Conversation not found" }),
          {
            status: 404,
          }
        );
      }

      if (conv.channel !== "whatsapp") {
        return new Response(
          JSON.stringify({ error: "Conversation is not WhatsApp" }),
          { status: 400 }
        );
      }

      // Membership check
      const { data: membership } = await supabase
        .from("organization_users")
        .select("id")
        .eq("organization_id", conv.organization_id)
        .eq("user_id", authedUserId)
        .maybeSingle();

      if (!membership?.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }

      // Resolve contact phone
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("id", conv.contact_id)
        .maybeSingle();

      const to = normalizePhoneToWaIndia(contact?.phone ?? "");
      if (!to) {
        return new Response(
          JSON.stringify({ error: "Invalid or missing contact phone" }),
          { status: 400 }
        );
      }

      const orgId = String(conv.organization_id);
      const settings = await resolveWhatsappSettings(orgId);
      if (!settings?.api_token || !settings?.whatsapp_phone_id) {
        return new Response(
          JSON.stringify({ error: "WhatsApp settings not found" }),
          { status: 400 }
        );
      }

      // Build WA payload
      let waPayload: any;

try {
  waPayload = buildWhatsappPayload({
    ...body,
    organization_id: orgId,
    to,
    type: msgType,
    image_url:
      msgType === "image"
        ? body.media_url ?? body.image_url
        : body.image_url,
    document_url:
      msgType === "document"
        ? body.media_url ?? body.document_url
        : body.document_url,
  });
} catch (err: any) {
  await persistVariableMismatch({
    conversationId,
    sender: "agent",
    errorDetails: err.message,
  });

  return new Response(
    JSON.stringify({
      error: "VARIABLE_MISMATCH",
      details: err.message,
    }),
    { status: 422 }
  );
}


      // Idempotency (conversation_id based)
      const keyMaterial = stableJsonStringify({
        orgId,
        conversationId,
        to,
        type: msgType,
        text: body.text ?? null,
        media_url: body.media_url ?? null,
        mime_type: body.mime_type ?? null,
        filename: body.filename ?? null,
      });

      const outboundDedupeKey = await sha256Hex(keyMaterial);

      const { data: existing } = await supabase
        .from("messages")
        .select("id, whatsapp_message_id")
        .eq("conversation_id", conversationId)
        .eq("outbound_dedupe_key", outboundDedupeKey)
        .maybeSingle();

      if (existing?.id) {
        return new Response(
          JSON.stringify({
            success: true,
            deduped: true,
            message_id: existing.id,
            whatsapp_message_id: existing.whatsapp_message_id ?? null,
          }),
          { status: 200 }
        );
      }

      // Send to Meta
      const url = `${WHATSAPP_API_BASE_URL}/${settings.whatsapp_phone_id}/messages`;
      const waRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(waPayload),
      });

      const metaResponse = await waRes.json().catch(() => null);

      console.log("[whatsapp-send][system] META RESPONSE:", metaResponse);

      if (!waRes.ok) {
        return new Response(
          JSON.stringify({ error: "Meta send failed", metaResponse }),
          { status: 500 }
        );
      }

      const waMessageId = metaResponse?.messages?.[0]?.id ?? null;

      if (!waMessageId) {
        await persistVariableMismatch({
          conversationId,
          sender: body.sender ?? "bot",
          errorDetails: "Meta rejected template payload",
          metadata: metaResponse,
        });
      
        return new Response(
          JSON.stringify({
            error: "VARIABLE_MISMATCH",
            details: "Meta rejected template payload",
          }),
          { status: 422 }
        );
      }
      

      // Insert message (sender=agent) + set initial receipt state
      const persistedText = (() => {
        if (msgType === 'text') return body.text ?? null;
        // For templates/media, prefer rendered_text for UI/chat history
        return body.text ?? body.rendered_text ?? null;
      })();

      const persistedMetadata = (() => {
        const base = body.metadata ?? null;
        if (!base && !body.rendered_text) return null;
        const out: any = { ...(base ?? {}) };
        if (body.rendered_text) out.rendered_text = body.rendered_text;
        return Object.keys(out).length ? out : null;
      })();

      const nowIso = new Date().toISOString();
      const { data: inserted, error: insertErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender: "agent",
          channel: "whatsapp",
          message_type: body.message_type ?? msgType,
          text: msgType === "text" ? (body.text ?? null) : ((body.text ?? (body as any).rendered_text ?? null) as any),
          media_url: body.media_url ?? null,
          mime_type: body.mime_type ?? null,
          whatsapp_message_id: waMessageId,
          metadata: persistedMetadata,
          campaign_id: body.campaign_id ?? null,
          campaign_message_id: body.campaign_message_id ?? null,
          outbound_dedupe_key: outboundDedupeKey,
          whatsapp_status: "sent",
          sent_at: nowIso,
        })
        .select("id")
        .maybeSingle();

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: "DB insert failed", details: insertErr }),
          { status: 500 }
        );
      }

      // Takeover lock (30 mins)
      const untilIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await supabase
        .from("conversations")
        .update({
          last_message_at: nowIso,
          ai_locked: true,
          ai_locked_at: nowIso,
          ai_locked_until: untilIso,
          ai_locked_by: authedUserId,
          ai_lock_reason: "agent_manual_send",
        })
        .eq("id", conversationId);

      return new Response(
        JSON.stringify({
          success: true,
          message_id: inserted?.id ?? null,
          whatsapp_message_id: waMessageId,
          meta_response: metaResponse,
        }),
        { status: 200 }
      );
    }

    // ==========================================================
    // LEGACY OR SYSTEM SEND (orgId + to)
    // - used by ai-handler / campaign-dispatch / PSF
    // ==========================================================

    const orgId = body.organization_id?.trim();
    const contactId = body.contact_id ?? null;
    const type = body.type;

    const rawTo = body.to?.trim() ?? "";
    const toNorm = normalizePhoneToWaIndia(rawTo);

    if (!toNorm) {
      return new Response(
        JSON.stringify({
          error: "Invalid recipient phone",
          rawTo,
        }),
        { status: 400 }
      );
    }

    body.to = toNorm;

    if (!orgId || !type || !body.to) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    if (type === "typing_on") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    const settings = await resolveWhatsappSettings(orgId);
    if (!settings?.api_token || !settings?.whatsapp_phone_id) {
      return new Response(
        JSON.stringify({ error: "WhatsApp settings not found" }),
        { status: 400 }
      );
    }

    let waPayload: any;

    let conversationId: string | null = null;

try {
  waPayload = buildWhatsappPayload(body);
} catch (err: any) {
  await persistVariableMismatch({
    conversationId,
    sender: body.sender ?? "bot",
    errorDetails: err.message,
    metadata: body.metadata ?? null,
  });

  return new Response(
    JSON.stringify({
      error: "VARIABLE_MISMATCH",
      details: err.message,
    }),
    { status: 422 }
  );
}

if (!waPayload) {
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}


    /* ============================================================
       P1-A — OUTBOUND IDEMPOTENCY
    ============================================================ */

    

    if (contactId) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .eq("channel", "whatsapp")
        .maybeSingle();

      conversationId = conversation?.id ?? null;
    }

    let outboundDedupeKey: string | null = null;

    if (conversationId) {
      const keyMaterial = stableJsonStringify({
        orgId,
        conversationId,
        to: body.to,
        type,
        text: body.text ?? null,
        template_name: body.template_name ?? null,
        template_language: body.template_language ?? null,
        template_variables: body.template_variables ?? null,
        template_components: body.template_components ?? null,
        image_url: body.image_url ?? null,
        video_url: body.video_url ?? null,
        audio_url: body.audio_url ?? null,
        document_url: body.document_url ?? null,
        filename: body.filename ?? null,
        media_url: body.media_url ?? null,
        mime_type: body.mime_type ?? null,
      });

      outboundDedupeKey = await sha256Hex(keyMaterial);

      const { data: existing } = await supabase
        .from("messages")
        .select("id, whatsapp_message_id")
        .eq("conversation_id", conversationId)
        .eq("outbound_dedupe_key", outboundDedupeKey)
        .maybeSingle();

      if (existing?.id) {
        return new Response(
          JSON.stringify({
            success: true,
            deduped: true,
            whatsapp_message_id: existing.whatsapp_message_id ?? null,
          }),
          { status: 200 }
        );
      }
    }

    /* ============================================================
       SEND TO META
    ============================================================ */

    const url = `${WHATSAPP_API_BASE_URL}/${settings.whatsapp_phone_id}/messages`;

    const waRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(waPayload),
    });

    const metaResponse = await waRes.json().catch(() => null);

    console.log("[whatsapp-send][inbox] META RESPONSE:", metaResponse);

    if (!waRes.ok) {
      return new Response(
        JSON.stringify({ error: "Meta send failed", metaResponse }),
        { status: 500 }
      );
    }

    const waMessageId = metaResponse?.messages?.[0]?.id ?? null;

    if (!waMessageId) {
      await persistVariableMismatch({
        conversationId,
        sender: body.sender ?? "bot",
        errorDetails: "Meta rejected template payload",
        metadata: metaResponse,
      });
    
      return new Response(
        JSON.stringify({
          error: "VARIABLE_MISMATCH",
          details: "Meta rejected template payload",
        }),
        { status: 422 }
      );
    }
    

    if (conversationId) {
      const nowIso = new Date().toISOString();
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender: body.sender ?? "bot",
        channel: "whatsapp",
        message_type: body.message_type ?? type,
        text: type === "text" ? body.text ?? null : null,
        media_url: body.media_url ?? null,
        mime_type: body.mime_type ?? null,
        whatsapp_message_id: waMessageId,
        outbound_dedupe_key: outboundDedupeKey,
        whatsapp_status: "sent",
        sent_at: nowIso,
        metadata: body.metadata ?? null,
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    return new Response(
      JSON.stringify({ success: true, meta_response: metaResponse }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[whatsapp-send] Fatal:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
    });
  }
});
