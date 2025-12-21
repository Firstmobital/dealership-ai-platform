import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Maps Meta statuses -> our DB statuses
function mapStatus(metaStatus: string | null | undefined) {
  const s = String(metaStatus ?? "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PAUSED") return "paused";
  if (s === "PENDING") return "pending";
  return "pending";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const organization_id = body?.organization_id as string | undefined;
    const sub_organization_id = (body?.sub_organization_id ?? null) as string | null;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 1) Load WhatsApp settings (must have waba + token)
    let settingsQuery = supabase
      .from("whatsapp_settings")
      .select("whatsapp_business_id, api_token")
      .eq("organization_id", organization_id)
      .eq("is_active", true);

    if (sub_organization_id) settingsQuery = settingsQuery.eq("sub_organization_id", sub_organization_id);
    else settingsQuery = settingsQuery.is("sub_organization_id", null);

    const { data: settings, error: settingsError } = await settingsQuery.single();
    if (settingsError || !settings?.whatsapp_business_id || !settings?.api_token) {
      return new Response(JSON.stringify({ error: "WhatsApp settings not found/incomplete" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const wabaId = settings.whatsapp_business_id;
    const token = settings.api_token;

    // 2) Fetch templates from Meta WABA
    // Endpoint is /{WABA_ID}/message_templates
    // (Meta returns template list + status + language + name + id)
    const url = `https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=200&access_token=${token}`;

    const res = await fetch(url);
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Meta fetch failed", meta: json }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    const metaTemplates: any[] = Array.isArray(json?.data) ? json.data : [];

    // 3) Pull our templates to match by (name+language) and update
    const { data: localTemplates, error: localErr } = await supabase
      .from("whatsapp_templates")
      .select("id, name, language, meta_template_id, status")
      .eq("organization_id", organization_id);

    if (localErr) {
      return new Response(JSON.stringify({ error: "DB read failed", db: localErr }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const updates: any[] = [];
    for (const lt of localTemplates ?? []) {
      const match = metaTemplates.find((mt) => {
        const mtName = String(mt?.name ?? "");
        const mtLang = String(mt?.language ?? mt?.languages?.[0]?.code ?? "");
        return mtName === lt.name && mtLang === lt.language;
      });

      if (!match) continue;

      const newStatus = mapStatus(match.status);
      const metaId = match.id ? String(match.id) : null;

      // Update only if changed / missing meta id
      if (lt.status !== newStatus || (!lt.meta_template_id && metaId)) {
        updates.push({
          id: lt.id,
          status: newStatus,
          meta_template_id: lt.meta_template_id ?? metaId,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (updates.length) {
      const { error: upErr } = await supabase.from("whatsapp_templates").upsert(updates);
      if (upErr) {
        return new Response(JSON.stringify({ error: "DB update failed", db: upErr }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, updated: updates.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Unexpected error", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
