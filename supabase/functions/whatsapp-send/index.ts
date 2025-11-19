// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// Environment variables
const SUPABASE_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// Supabase (service role)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --------------------------------------
// Types
// --------------------------------------
interface WhatsAppSendPayload {
  organization_id: string;

  to: string; // WhatsApp phone number
  type: "text" | "image" | "document" | "typing_on";

  text?: string;

  image_url?: string;
  image_caption?: string;

  document_url?: string;
  document_caption?: string;
  filename?: string;
}

function fail(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --------------------------------------
// MAIN HANDLER
// --------------------------------------
serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return fail("Only POST allowed", 405);
    }

    const body: WhatsAppSendPayload = await req.json();

    const { organization_id, to, type } = body;

    if (!organization_id) return fail("Missing organization_id");
    if (!to) return fail("Missing destination phone number");
    if (!type) return fail("Missing message type");

    // --------------------------------------
    // 1. Load WhatsApp Settings
    // --------------------------------------
    const { data: settings, error: settingsErr } = await supabase
      .from("whatsapp_settings")
      .select(
        `
        access_token,
        waba_phone_number_id,
        waba_business_account_id,
        phone_number,
        is_active
        `
      )
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (settingsErr || !settings) {
      console.error("[whatsapp-send] Error loading WhatsApp settings:", settingsErr);
      return fail("WhatsApp settings not configured");
    }

    // Validate fields
    const apiToken = settings.access_token;
    const phoneId = settings.waba_phone_number_id;

    if (!apiToken) return fail("WhatsApp API token missing");
    if (!phoneId) return fail("Phone number ID missing");
    if (settings.is_active === false) return fail("WhatsApp integration disabled");

    // WhatsApp Cloud API URL
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

    // --------------------------------------
    // 2. Build WhatsApp Payload
    // --------------------------------------
    let payload: any = {
      messaging_product: "whatsapp",
      to,
    };

    // Typing indicator
    if (type === "typing_on") {
      payload = {
        ...payload,
        status: "typing",
      };
    }

    // Text message
    else if (type === "text") {
      if (!body.text) return fail("Missing text field");

      payload = {
        ...payload,
        type: "text",
        text: {
          preview_url: false,
          body: body.text,
        },
      };
    }

    // Image message
    else if (type === "image") {
      if (!body.image_url) return fail("Missing image_url");

      payload = {
        ...payload,
        type: "image",
        image: {
          link: body.image_url,
          caption: body.image_caption || "",
        },
      };
    }

    // Document message
    else if (type === "document") {
      if (!body.document_url) return fail("Missing document_url");

      payload = {
        ...payload,
        type: "document",
        document: {
          link: body.document_url,
          caption: body.document_caption || "",
          filename: body.filename || "document.pdf",
        },
      };
    }

    // Unsupported type
    else {
      return fail("Unsupported message type");
    }

    // --------------------------------------
    // 3. Send WhatsApp Message
    // --------------------------------------
    const wResp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const wText = await wResp.text();

    console.log("[whatsapp-send] WhatsApp API response:", wResp.status, wText);

    // --------------------------------------
    // 4. Return response
    // --------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        status: wResp.status,
        body: wText,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[whatsapp-send] Fatal Error:", err);
    return fail(err?.message || "Internal Server Error", 500);
  }
});
