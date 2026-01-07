// supabase/functions/whatsapp-send/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ===========================================================================
   ENV
=========================================================================== */

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const WHATSAPP_API_BASE_URL =
  Deno.env.get("WHATSAPP_API_BASE_URL") ??
  "https://graph.facebook.com/v20.0";

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
};

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
  const components: any[] = [];

  if (Array.isArray(body.template_components)) {
    components.push(...body.template_components);
  }

  if (Array.isArray(body.template_variables) && body.template_variables.length) {
    components.push({
      type: "body",
      parameters: body.template_variables.map((v) => ({
        type: "text",
        text: String(v ?? ""),
      })),
    });
  }

  return components;
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
    return { ...payload, image: { link: body.image_url } };
  }

  if (type === "video") {
    if (!body.video_url) throw new Error("Missing video_url");
    return { ...payload, video: { link: body.video_url } };
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

    const orgId = body.organization_id?.trim();
    const contactId = body.contact_id ?? null;
    const type = body.type;
    const to = body.to?.trim();

    if (!orgId || !type || !to) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 },
      );
    }

    if (type === "typing_on") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    const settings = await resolveWhatsappSettings(orgId);
    if (!settings?.api_token || !settings?.whatsapp_phone_id) {
      return new Response(
        JSON.stringify({ error: "WhatsApp settings not found" }),
        { status: 400 },
      );
    }

    const waPayload = buildWhatsappPayload(body);
    if (!waPayload) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    /* ============================================================
       P1-A — OUTBOUND IDEMPOTENCY
    ============================================================ */

    let conversationId: string | null = null;

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
        to,
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
          { status: 200 },
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

    if (!waRes.ok) {
      return new Response(
        JSON.stringify({ error: "Meta send failed", metaResponse }),
        { status: 500 },
      );
    }

    const waMessageId =
      metaResponse?.messages?.[0]?.id ??
      metaResponse?.message_id ??
      null;

    if (conversationId) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender: "bot",
        channel: "whatsapp",
        message_type: body.message_type ?? type,
        text: type === "text" ? body.text ?? null : null,
        media_url: body.media_url ?? null,
        mime_type: body.mime_type ?? null,
        whatsapp_message_id: waMessageId,
        outbound_dedupe_key: outboundDedupeKey,
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    return new Response(
      JSON.stringify({ success: true, meta_response: metaResponse }),
      { status: 200 },
    );
  } catch (err) {
    console.error("[whatsapp-send] Fatal:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500 },
    );
  }
});