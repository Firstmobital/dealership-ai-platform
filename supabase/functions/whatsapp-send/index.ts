// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* =====================================================================================
   ENV
===================================================================================== */

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* =====================================================================================
   LOGGING
===================================================================================== */

function log(stage: string, data: any) {
  console.log(`[whatsapp-send] ${stage}`, JSON.stringify(data, null, 2));
}

/* =====================================================================================
   TYPES
===================================================================================== */

type SendBody = {
  organization_id?: string;
  sub_organization_id?: string | null;
  to?: string;
  type?: "text" | "typing_on" | "template";
  text?: string;

  // (optional) future-proof template fields
  template_name?: string;
  template_language?: string;
  template_variables?: string[];
};

/* =====================================================================================
   HELPERS
===================================================================================== */

/**
 * Resolve the best whatsapp_settings row using Option D:
 *  1) If sub_organization_id provided → try that first.
 *  2) Then fallback to org-level (sub_organization_id IS NULL).
 *  3) Then fallback to any active row for the org.
 */
async function resolveWhatsappSettings(
  organizationId: string,
  subOrganizationId?: string | null,
) {
  // 1) Try exact (org + sub_org)
  if (subOrganizationId) {
    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("id, api_token, whatsapp_phone_id, sub_organization_id")
      .eq("organization_id", organizationId)
      .eq("sub_organization_id", subOrganizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      log("RESOLVE_SETTINGS_SUBORG_ERR", error);
    }
    if (data) {
      return data;
    }
  }

  // 2) Fallback: org-level (no sub_org)
  {
    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("id, api_token, whatsapp_phone_id, sub_organization_id")
      .eq("organization_id", organizationId)
      .is("sub_organization_id", null)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      log("RESOLVE_SETTINGS_ORGLEVEL_ERR", error);
    }
    if (data) {
      return data;
    }
  }

  // 3) Final fallback: any active row for org
  {
    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("id, api_token, whatsapp_phone_id, sub_organization_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1);

    if (error) {
      log("RESOLVE_SETTINGS_ANY_ERR", error);
    }
    if (data && data.length > 0) {
      return data[0];
    }
  }

  return null;
}

/**
 * Build the WhatsApp Cloud API request body based on type.
 * Currently supports:
 *  - "text" → normal text message
 *  - "typing_on" → send a "typing" state style payload (best-effort)
 *  - you can extend with "template" later
 */
function buildWhatsappPayload(args: {
  to: string;
  type: "text" | "typing_on" | "template";
  text?: string;
  template_name?: string;
  template_language?: string;
  template_variables?: string[];
}) {
  const { to, type, text, template_name, template_language, template_variables } =
    args;

  if (type === "typing_on") {
    // WhatsApp Cloud API doesn't have a perfect "typing" only state like Messenger.
    // Common hack: send a message with a short delay or ephemeral indicator.
    // Here we send a 'mark as read' style stub or very short message can be changed later.
    return {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: "…", // you can change this to something else or remove typing_on support if not desired
      },
    };
  }

  if (type === "template" && template_name && template_language) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template_name,
        language: {
          code: template_language,
        },
        components: template_variables?.length
          ? [
              {
                type: "body",
                parameters: template_variables.map((v) => ({
                  type: "text",
                  text: v,
                })),
              },
            ]
          : [],
      },
    };
  }

  // default: plain text
  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: text || "",
    },
  };
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */

serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = (await req.json().catch(() => null)) as SendBody | null;
    log("INBOUND_REQUEST", body);

    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const {
      organization_id,
      sub_organization_id,
      to,
      type = "text",
      text,
      template_name,
      template_language,
      template_variables,
    } = body;

    if (!organization_id || !to) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id or to" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ------------------------------------------------------------------
    // Resolve WhatsApp settings (Option D)
    // ------------------------------------------------------------------
    const settings = await resolveWhatsappSettings(
      organization_id,
      sub_organization_id ?? null,
    );

    if (!settings) {
      log("NO_SETTINGS_FOUND", { organization_id, sub_organization_id });
      return new Response(
        JSON.stringify({
          error:
            "No active WhatsApp settings found for this organization/sub-organization",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const apiToken: string = settings.api_token;
    const whatsappPhoneId: string = settings.whatsapp_phone_id;

    // ------------------------------------------------------------------
    // Build outbound payload
    // ------------------------------------------------------------------
    const waPayload = buildWhatsappPayload({
      to,
      type,
      text,
      template_name,
      template_language,
      template_variables,
    });

    log("WA_OUTBOUND_PAYLOAD", { whatsappPhoneId, waPayload });

    const url = `https://graph.facebook.com/v20.0/${whatsappPhoneId}/messages`;

    const waRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(waPayload),
    });

    const waJson = await waRes.json().catch(() => null);
    log("WA_RESPONSE", { status: waRes.status, body: waJson });

    if (!waRes.ok) {
      return new Response(
        JSON.stringify({
          error: "WhatsApp API error",
          status: waRes.status,
          details: waJson,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        whatsapp_response: waJson,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    log("FATAL_ERROR", { message: err?.message, stack: err?.stack });
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
