// supabase/functions/whatsapp-template-submit/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =====================================================================================
   CORS
===================================================================================== */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* =====================================================================================
   MAIN
===================================================================================== */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => null);
    const template_id = body?.template_id;

    if (!template_id) {
      return new Response(
        JSON.stringify({ error: "template_id required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
    );

    /* ------------------------------------------------------------------
       Fetch template
    ------------------------------------------------------------------ */
    const { data: template, error: tplError } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (tplError || !template) {
      return new Response(
        JSON.stringify({ error: "Template not found" }),
        { status: 404, headers: corsHeaders },
      );
    }

    // Idempotency guard
    if (template.meta_template_id) {
      return new Response(
        JSON.stringify({ error: "Template already submitted" }),
        { status: 409, headers: corsHeaders },
      );
    }

    if (template.status !== "draft") {
      return new Response(
        JSON.stringify({ error: "Only draft templates can be submitted" }),
        { status: 400, headers: corsHeaders },
      );
    }

    /* ------------------------------------------------------------------
       Fetch WhatsApp settings (ORG ONLY)
    ------------------------------------------------------------------ */
    const { data: settings, error: settingsError } = await supabase
      .from("whatsapp_settings")
      .select("whatsapp_business_id, api_token")
      .eq("organization_id", template.organization_id)
      .eq("is_active", true)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "WhatsApp settings not found" }),
        { status: 400, headers: corsHeaders },
      );
    }

    /* ------------------------------------------------------------------
       Build Meta payload
    ------------------------------------------------------------------ */
    const components: any[] = [];

    if (template.header_type === "TEXT" && template.header_text) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        text: template.header_text,
      });
    }

    components.push({
      type: "BODY",
      text: template.body,
    });

    if (template.footer) {
      components.push({
        type: "FOOTER",
        text: template.footer,
      });
    }

    const payload = {
      name: template.name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      category: template.category,
      language: template.language,
      components,
    };

    /* ------------------------------------------------------------------
       Send to Meta
    ------------------------------------------------------------------ */
    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${settings.whatsapp_business_id}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const metaJson = await metaRes.json().catch(() => null);

    if (!metaRes.ok) {
      console.error("Meta template submit error", metaJson);
      return new Response(JSON.stringify(metaJson), {
        status: 400,
        headers: corsHeaders,
      });
    }

    /* ------------------------------------------------------------------
       Update DB
    ------------------------------------------------------------------ */
    await supabase
      .from("whatsapp_templates")
      .update({
        status: "pending",
        meta_template_id: metaJson.id,
      })
      .eq("id", template_id);

    return new Response(
      JSON.stringify({ success: true, meta: metaJson }),
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("Template submit fatal error", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
