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
  sub_organization_id?: string | null;
  contact_id?: string | null;
  to?: string;
  type?: MessageType;

  // text
  text?: string;

  // template
  template_name?: string;
  template_language?: string;
  template_variables?: string[];
  template_components?: any[] | null;

  // direct media
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  document_url?: string;
  filename?: string;

  // logging helpers
  message_type?: MessageType;
  media_url?: string | null;
  mime_type?: string | null;
};

/* ===========================================================================
   RESOLVE SETTINGS
=========================================================================== */

async function resolveWhatsappSettings(
  orgId: string,
  subOrgId: string | null,
) {
  if (subOrgId) {
    const { data } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("organization_id", orgId)
      .eq("sub_organization_id", subOrgId)
      .maybeSingle();

    if (data && data.is_active !== false) return data;
  }

  const { data } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("organization_id", orgId)
    .is("sub_organization_id", null)
    .maybeSingle();

  if (data && data.is_active !== false) return data;
  return null;
}

/* ===========================================================================
   BUILD TEMPLATE COMPONENTS (Phase 2.4)
=========================================================================== */

function buildTemplateComponents(body: SendBody): any[] {
  const components: any[] = [];

  // 1️⃣ Header components (image / document) — already built upstream
  if (Array.isArray(body.template_components)) {
    components.push(...body.template_components);
  }

  // 2️⃣ Body parameters (variables)
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

  /* ---------------- TEXT ---------------- */
  if (type === "text") {
    if (!body.text?.trim()) throw new Error("Missing text");
    return { ...payload, text: { body: body.text.trim() } };
  }

  /* ---------------- TEMPLATE ---------------- */
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

  /* ---------------- DIRECT MEDIA ---------------- */
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
    const subOrgId = body.sub_organization_id ?? null;
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

    const settings = await resolveWhatsappSettings(orgId, subOrgId);
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

    /* ---------------- CHAT LOGGING ---------------- */

    if (contactId) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id, sub_organization_id")
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .eq("channel", "whatsapp")
        .maybeSingle();

      if (conversation) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender: "bot",
          channel: "whatsapp",
          message_type: body.message_type ?? type,
          text: type === "text" ? body.text ?? null : null,
          media_url: body.media_url ?? null,
          mime_type: body.mime_type ?? null,
          whatsapp_message_id: waMessageId,
          sub_organization_id: conversation.sub_organization_id,
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation.id);
      }
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
