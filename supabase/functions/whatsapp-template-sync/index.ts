// supabase/functions/whatsapp-template-sync/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ------------------------------------------------------------------
   CORS
------------------------------------------------------------------ */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: any) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------
   STATUS MAP (Meta → Local)
------------------------------------------------------------------ */
function mapStatus(metaStatus: string | null | undefined) {
  const s = String(metaStatus ?? "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PAUSED") return "paused";
  if (s === "PENDING") return "pending";
  return "pending";
}

/* ------------------------------------------------------------------
   FETCH ALL META TEMPLATES (PAGINATED)
------------------------------------------------------------------ */
async function fetchAllMetaTemplates(params: {
  wabaId: string;
  token: string;
}): Promise<any[]> {
  const { wabaId, token } = params;

  const results: any[] = [];
  let nextUrl =
    `https://graph.facebook.com/v20.0/${wabaId}/message_templates` +
    `?limit=200&access_token=${token}`;

  for (let i = 0; i < 10; i++) {
    const res = await fetch(nextUrl);
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const err: any = new Error("Meta fetch failed");
      err.meta = json;
      throw err;
    }

    if (Array.isArray(json?.data)) {
      results.push(...json.data);
    }

    if (!json?.paging?.next) break;
    nextUrl = json.paging.next;
  }

  return results;
}

/* ------------------------------------------------------------------
   HANDLER
------------------------------------------------------------------ */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const PROJECT_URL = Deno.env.get("PROJECT_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        error: "Missing PROJECT_URL or SERVICE_ROLE_KEY",
      });
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const organization_id = body?.organization_id as string | undefined;

    if (!organization_id) {
      return jsonResponse(400, { error: "organization_id required" });
    }

    /* =========================================================
       1️⃣ LOAD WHATSAPP SETTINGS (ORG-LEVEL ONLY)
    ========================================================= */
    const { data: settings, error: settingsErr } = await supabase
      .from("whatsapp_settings")
      .select("whatsapp_business_id, api_token")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .maybeSingle();

    if (settingsErr || !settings?.whatsapp_business_id || !settings?.api_token) {
      return jsonResponse(400, {
        error: "Active WhatsApp settings not found",
      });
    }

    const wabaId = String(settings.whatsapp_business_id);
    const token = String(settings.api_token);

    /* =========================================================
       2️⃣ FETCH META TEMPLATES
    ========================================================= */
    let metaTemplates: any[] = [];
    try {
      metaTemplates = await fetchAllMetaTemplates({ wabaId, token });
    } catch (e: any) {
      return jsonResponse(502, {
        error: "Meta fetch failed",
        meta: e?.meta ?? String(e),
      });
    }

    /* =========================================================
       3️⃣ LOAD LOCAL TEMPLATES (ORG ONLY)
    ========================================================= */
    const { data: locals, error: localErr } = await supabase
      .from("whatsapp_templates")
      .select("id, name, language, meta_template_id, status")
      .eq("organization_id", organization_id);

    if (localErr) {
      return jsonResponse(500, {
        error: "DB read failed",
        db: localErr,
      });
    }

    /* =========================================================
       4️⃣ MATCH META ↔ LOCAL
    ========================================================= */
    const metaById = new Map<string, any>();
    const metaByNameLang = new Map<string, any>();

    for (const mt of metaTemplates) {
      const metaId = mt?.id ? String(mt.id) : null;
      const name = String(mt?.name ?? "");
      const lang =
        String(mt?.language ?? mt?.languages?.[0]?.code ?? "");

      if (metaId) metaById.set(metaId, mt);
      if (name && lang) metaByNameLang.set(`${name}::${lang}`, mt);
    }

    const updates: any[] = [];
    let matched = 0;

    for (const lt of locals ?? []) {
      const currentMetaId = lt.meta_template_id
        ? String(lt.meta_template_id)
        : null;

      let match: any | null = null;

      if (currentMetaId && metaById.has(currentMetaId)) {
        match = metaById.get(currentMetaId);
      } else {
        const key = `${String(lt.name)}::${String(lt.language)}`;
        match = metaByNameLang.get(key) ?? null;
      }

      if (!match) continue;
      matched++;

      const newStatus = mapStatus(match.status);
      const metaId = match?.id ? String(match.id) : null;
      const nextMetaId = currentMetaId ?? metaId;

      if (lt.status !== newStatus || (!currentMetaId && nextMetaId)) {
        updates.push({
          id: lt.id,
          status: newStatus,
          meta_template_id: nextMetaId,
          updated_at: new Date().toISOString(),
        });
      }
    }

    /* =========================================================
       5️⃣ APPLY UPDATES
    ========================================================= */
    for (const row of updates) {
      const { error } = await supabase
        .from("whatsapp_templates")
        .update({
          status: row.status,
          meta_template_id: row.meta_template_id,
          updated_at: row.updated_at,
        })
        .eq("id", row.id);

      if (error) {
        return jsonResponse(500, {
          error: "DB update failed",
          db: error,
        });
      }
    }

    return jsonResponse(200, {
      success: true,
      meta_count: metaTemplates.length,
      local_count: locals?.length ?? 0,
      matched,
      updated: updates.length,
    });
  } catch (e) {
    return jsonResponse(500, {
      error: "Unexpected error",
      details: String(e),
    });
  }
});