// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ===========================================================================
   ENV
=========================================================================== */

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// Optional override for Meta Graph base URL (defaults to v20.0)
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

  // Text
  text?: string;

  // Template
  template_name?: string;
  template_language?: string;
  template_variables?: string[];

  // Media URLs (public links)
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  document_url?: string;
  filename?: string;
};

/* ===========================================================================
   HELPERS
=========================================================================== */

async function resolveWhatsappSettings(orgId: string, subOrgId: string | null) {
  // Hybrid logic:
  // 1) If subOrgId provided: try that scope first
  // 2) Fallback to org-level settings (sub_organization_id IS NULL)
  // 3) If no subOrgId: only use org-level

  // 1) Sub-org scope
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

    // 2) Fallback to org-level
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

  // 3) Org-level only
  const { data, error } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("organization_id", orgId)
    .is("sub_organization_id", null)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp-send] org-level error:", error);
  }

  if (data && data.is_active !== false) {
    return data;
  }

  return null;
}

function buildWhatsappPayload(body: SendBody) {
  const { type, to } = body;

  if (!type || !to) {
    throw new Error("Missing type or to");
  }

  // WhatsApp Cloud API base fields
  const base: any = {
    messaging_product: "whatsapp",
    to,
    type,
  };

  switch (type) {
    case "text": {
      if (!body.text?.trim()) {
        throw new Error("Missing text for type=text");
      }
      base.text = { body: body.text.trim() };
      return base;
    }

    case "template": {
      if (!body.template_name || !body.template_language) {
        throw new Error("Missing template_name or template_language");
      }

      const components: any[] = [];
      if (body.template_variables && body.template_variables.length > 0) {
        components.push({
          type: "body",
          parameters: body.template_variables.map((v) => ({
            type: "text",
            text: v,
          })),
        });
      }

      base.template = {
        name: body.template_name,
        language: {
          code: body.template_language,
        },
        components,
      };
      return base;
    }

    case "image": {
      if (!body.image_url) {
        throw new Error("Missing image_url for type=image");
      }
      base.image = {
        link: body.image_url,
      };
      return base;
    }

    case "video": {
      if (!body.video_url) {
        throw new Error("Missing video_url for type=video");
      }
      base.video = {
        link: body.video_url,
      };
      return base;
    }

    case "audio": {
      if (!body.audio_url) {
        throw new Error("Missing audio_url for type=audio");
      }
      base.audio = {
        link: body.audio_url,
      };
      return base;
    }

    case "document": {
      if (!body.document_url) {
        throw new Error("Missing document_url for type=document");
      }
      base.document = {
        link: body.document_url,
        filename: body.filename || undefined,
      };
      return base;
    }

    case "typing_on": {
      // WhatsApp Cloud API doesn't support typing indicators like Messenger.
      // Treat this as a NO-OP, but we return success so UI doesn't break.
      return null;
    }

    default:
      throw new Error(`Unsupported message type: ${type}`);
  }
}

/* ===========================================================================
   MAIN HANDLER
=========================================================================== */

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as SendBody;

    const orgId = body.organization_id?.trim();
    const subOrgId =
      body.sub_organization_id === undefined
        ? null
        : body.sub_organization_id;
    const to = body.to?.trim();
    const type = body.type;

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!type) {
      return new Response(
        JSON.stringify({ error: "Missing type" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // For "typing_on", do nothing (no-op)
    if (type === "typing_on") {
      return new Response(
        JSON.stringify({ success: true, message: "typing_on ignored (no-op)" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Missing to" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Resolve WhatsApp settings (hybrid: sub-org override, else org-level)
    const settings = await resolveWhatsappSettings(orgId, subOrgId);

    if (
      !settings ||
      !settings.api_token ||
      !settings.whatsapp_phone_id
    ) {
      console.error("[whatsapp-send] No valid settings found for org/sub-org", {
        orgId,
        subOrgId,
      });
      return new Response(
        JSON.stringify({
          error:
            "WhatsApp settings not configured (api_token or whatsapp_phone_id missing).",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const accessToken = settings.api_token as string;
    const phoneId = settings.whatsapp_phone_id as string;

    // Build WA payload
    let waPayload: any;
    try {
      waPayload = buildWhatsappPayload({ ...body, to, type });
      if (!waPayload) {
        // typing_on no-op already handled above, this is just extra guard
        return new Response(
          JSON.stringify({ success: true, message: "No-op" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (err: any) {
      console.error("[whatsapp-send] Payload build error:", err);
      return new Response(
        JSON.stringify({ error: err?.message ?? "Invalid WhatsApp payload." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const url = `${WHATSAPP_API_BASE_URL}/${phoneId}/messages`;

    const waRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(waPayload),
    });

    const waJson = await waRes.json().catch(() => null);

    if (!waRes.ok) {
      console.error("[whatsapp-send] Meta API error:", {
        status: waRes.status,
        body: waJson,
      });
      return new Response(
        JSON.stringify({
          error: "Failed to send WhatsApp message.",
          meta_status: waRes.status,
          meta_response: waJson,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        meta_status: waRes.status,
        meta_response: waJson,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[whatsapp-send] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
