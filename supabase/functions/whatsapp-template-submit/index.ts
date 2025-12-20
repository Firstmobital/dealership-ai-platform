// supabase/functions/whatsapp-template-submit/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { template_id } = await req.json();

    if (!template_id) {
      return new Response("template_id required", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // 1️⃣ Fetch template
    const { data: template, error } = await supabase
      .from("whatsapp_templates")
      .select(`
        *,
        whatsapp_settings (
          whatsapp_business_id,
          api_token
        )
      `)
      .eq("id", template_id)
      .single();

    if (error || !template) {
      console.error(error);
      return new Response("Template not found", { status: 404 });
    }

    if (template.status !== "draft") {
      return new Response("Only draft templates can be submitted", {
        status: 400,
      });
    }

    const settings = template.whatsapp_settings;
    if (!settings?.whatsapp_business_id || !settings?.api_token) {
      return new Response("WhatsApp settings missing", { status: 400 });
    }

    // 2️⃣ Build Meta payload
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

    // 3️⃣ Send to Meta
    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${settings.whatsapp_business_id}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      console.error("Meta error", metaJson);
      return new Response(JSON.stringify(metaJson), { status: 400 });
    }

    // 4️⃣ Update DB
    await supabase
      .from("whatsapp_templates")
      .update({
        status: "pending",
        meta_template_id: metaJson.id,
      })
      .eq("id", template_id);

    return new Response(
      JSON.stringify({ success: true, meta: metaJson }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Template submit error", err);
    return new Response("Internal error", { status: 500 });
  }
});
