// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🔧 ENV VARIABLES (your naming, from supabase/.env)
const PROJECT_URL = Deno.env.get("PROJECT_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[WA-SEND] Missing env vars PROJECT_URL or SERVICE_ROLE_KEY");
}

const supabase = createClient(PROJECT_URL!, SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/**
 * Build WhatsApp Cloud API payload based on message_type
 *
 * Supported message_type:
 *  - "text" (default)
 *  - "template"
 *  - "image"
 *  - "document"
 *  - "interactive_buttons"
 *  - "interactive_list"
 */
function buildWaPayload(input: any) {
  const {
    to,
    text,
    message_type = "text",
    template,
    image,
    document,
    interactive,
  } = input;

  if (!to) {
    throw new Error("Missing 'to' in request body");
  }

  switch (message_type) {
    case "text": {
      if (!text) {
        throw new Error("Text messages require 'text' field");
      }

      return {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      };
    }

    case "template": {
      if (!template?.name || !template?.language_code) {
        throw new Error(
          "Template messages require template.name and template.language_code",
        );
      }

      return {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: {
            code: template.language_code, // e.g. "en_US"
          },
          // optional components (headers, body params, buttons)
          // pass-through if provided
          components: template.components ?? [],
        },
      };
    }

    case "image": {
      if (!image?.link && !image?.id) {
        throw new Error(
          "Image messages require image.link (URL) or image.id (media_id)",
        );
      }

      return {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
          link: image.link,
          id: image.id,
          caption: image.caption,
        },
      };
    }

    case "document": {
      if (!document?.link && !document?.id) {
        throw new Error(
          "Document messages require document.link (URL) or document.id (media_id)",
        );
      }

      return {
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
          link: document.link,
          id: document.id,
          filename: document.filename,
          caption: document.caption,
        },
      };
    }

    case "interactive_buttons": {
      // interactive: { body_text, buttons: [{ id, title }] }
      if (!interactive?.body_text || !Array.isArray(interactive?.buttons)) {
        throw new Error(
          "interactive_buttons require interactive.body_text and interactive.buttons[]",
        );
      }

      const buttons = interactive.buttons.map((btn: any) => ({
        type: "reply",
        reply: {
          id: btn.id,
          title: btn.title,
        },
      }));

      return {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: interactive.body_text },
          action: { buttons },
        },
      };
    }

    case "interactive_list": {
      // interactive: { header_text?, body_text, footer_text?, sections: [{ title, rows: [{ id, title, description? }] }] }
      if (!interactive?.body_text || !Array.isArray(interactive?.sections)) {
        throw new Error(
          "interactive_list requires interactive.body_text and interactive.sections[]",
        );
      }

      return {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: interactive.header_text
            ? { type: "text", text: interactive.header_text }
            : undefined,
          body: { text: interactive.body_text },
          footer: interactive.footer_text
            ? { text: interactive.footer_text }
            : undefined,
          action: {
            button: interactive.button_text || "Select",
            sections: interactive.sections.map((section: any) => ({
              title: section.title,
              rows: section.rows.map((row: any) => ({
                id: row.id,
                title: row.title,
                description: row.description,
              })),
            })),
          },
        },
      };
    }

    default:
      throw new Error(`Unsupported message_type: ${message_type}`);
  }
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json();
    const { organization_id } = body;

    if (!organization_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required field: organization_id",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 1️⃣ Load WhatsApp Settings
    const { data: settings, error: settingsError } = await supabase
      .from("whatsapp_settings")
      .select("api_token, whatsapp_phone_id")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (settingsError) {
      console.error("[WA-SEND] DB error:", settingsError);
      return new Response("Database Error", { status: 500 });
    }

    if (!settings) {
      return new Response(
        JSON.stringify({
          error: "No WhatsApp settings found for this organization",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const { api_token, whatsapp_phone_id } = settings;

    if (!api_token || !whatsapp_phone_id) {
      return new Response(
        JSON.stringify({
          error:
            "Incomplete WhatsApp settings. Missing api_token or whatsapp_phone_id",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2️⃣ Build WA payload based on message_type
    let waPayload;
    try {
      waPayload = buildWaPayload(body);
    } catch (e) {
      console.error("[WA-SEND] Build payload error:", e);
      return new Response(
        JSON.stringify({ error: (e as Error).message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3️⃣ Call WhatsApp Cloud API
    const url =
      `https://graph.facebook.com/v20.0/${whatsapp_phone_id}/messages`;

    const waRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(waPayload),
    });

    const waJson = await waRes.json();
    console.log("[WA-SEND] WhatsApp API result:", waJson);

    return new Response(JSON.stringify(waJson), {
      headers: { "Content-Type": "application/json" },
      status: waRes.ok ? 200 : 400,
    });
  } catch (err) {
    console.error("[WA-SEND] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
