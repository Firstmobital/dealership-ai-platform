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
  to?: string;
  type?: MessageType;

  // text
  text?: string;

  // template
  template_name?: string;
  template_language?: string;
  template_variables?: string[];

  // media
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  document_url?: string;
  filename?: string;
};

/* ===========================================================================
   RESOLVE SETTINGS (Hybrid Logic)
=========================================================================== */

async function resolveWhatsappSettings(
  orgId: string,
  subOrgId: string | null
) {
  // 1) Try sub-org override first
  if (subOrgId) {
    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("organization_id", orgId)
      .eq("sub_organization_id", subOrgId)
      .maybeSingle();

    if (error) {
      console.error("[whatsapp-send] sub-org settings error:", error);
    }

    if (data && data.is_active !== false) {
      return data;
    }

    // 2) Fallback → org-level
    const { data: orgData, error: orgError } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("organization_id", orgId)
      .is("sub_organization_id", null)
      .maybeSingle();

    if (orgError) {
      console.error("[whatsapp-send] org-level fallback error:", orgError);
    }

    if (orgData && orgData.is_active !== false) {
      return orgData;
    }

    return null;
  }

  // 3) If no sub-org → fetch org-level only
  const { data, error } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("organization_id", orgId)
    .is("sub_organization_id", null)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp-send] org-level settings error:", error);
  }

  if (data && data.is_active !== false) {
    return data;
  }

  return null;
}

/* ===========================================================================
   BUILD WHATSAPP PAYLOAD
=========================================================================== */

function buildWhatsappPayload(body: SendBody) {
  const { type, to } = body;

  if (!type || !to) {
    throw new Error("Missing type or to");
  }

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type,
  };

  switch (type) {
    case "text":
      if (!body.text?.trim()) {
        throw new Error("Missing text for type=text");
      }
      return { ...payload, text: { body: body.text.trim() } };

    case "template":
      if (!body.template_name || !body.template_language) {
        throw new Error("Missing template_name or template_language");
      }
      return {
        ...payload,
        template: {
          name: body.template_name,
          language: { code: body.template_language },
          components: body.template_variables?.length
            ? [
                {
                  type: "body",
                  parameters: body.template_variables.map((v) => ({
                    type: "text",
                    text: v,
                  })),
                },
              ]
            : [],
        },
      };

    case "image":
      if (!body.image_url) throw new Error("Missing image_url");
      return { ...payload, image: { link: body.image_url } };

    case "video":
      if (!body.video_url) throw new Error("Missing video_url");
      return { ...payload, video: { link: body.video_url } };

    case "audio":
      if (!body.audio_url) throw new Error("Missing audio_url");
      return { ...payload, audio: { link: body.audio_url } };

    case "document":
      if (!body.document_url) throw new Error("Missing document_url");
      return {
        ...payload,
        document: {
          link: body.document_url,
          filename: body.filename || undefined,
        },
      };

    case "typing_on":
      // Cloud API doesn't support typing indicators (Messenger-only)
      return null;

    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

/* ===========================================================================
   MAIN HANDLER
=========================================================================== */

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as SendBody;

    const orgId = body.organization_id?.trim();
    const subOrgId =
      body.sub_organization_id === undefined
        ? null
        : body.sub_organization_id;

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const type = body.type;
    const to = body.to?.trim();

    if (!type) {
      return new Response(JSON.stringify({ error: "Missing type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // typing_on is NO-OP
    if (type === "typing_on") {
      return new Response(
        JSON.stringify({ success: true, message: "typing_on ignored" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing to" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    /* ===========================
       RESOLVE SETTINGS
    ============================ */

    const settings = await resolveWhatsappSettings(orgId, subOrgId);

    if (
      !settings ||
      !settings.api_token ||
      !settings.whatsapp_phone_id
    ) {
      return new Response(
        JSON.stringify({
          error:
            "No WhatsApp settings found (api_token or whatsapp_phone_id missing).",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const waPayload = buildWhatsappPayload(body);

    if (!waPayload) {
      // typing_on no-op safeguard
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    /* ===========================
       SEND TO META
    ============================ */

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
      console.error("[whatsapp-send] Meta API error:", metaResponse);
      return new Response(
        JSON.stringify({
          error: "Failed to send WhatsApp message",
          meta_status: waRes.status,
          meta_response: metaResponse,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        meta_status: waRes.status,
        meta_response: metaResponse,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[whatsapp-send] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
