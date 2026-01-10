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
   VARIABLE SCHEMA HELPERS (match frontend behavior)
------------------------------------------------------------------ */
function extractVariableIndices(text: string | null): number[] {
    if (!text) return [];
    const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
    const indices = matches.map((m) => Number(m[1]));
    return Array.from(new Set(indices)).sort((a, b) => a - b);
  }
  
  function pickComponentText(mt: any, type: string): string | null {
    const comps = Array.isArray(mt?.components) ? mt.components : [];
    const c = comps.find((x: any) => String(x?.type ?? "").toUpperCase() === type);
    return (c?.text ?? null) as string | null;
  }
  
  function pickHeader(mt: any): { header_type: any; header_text: string | null } {
    const comps = Array.isArray(mt?.components) ? mt.components : [];
    const header = comps.find(
      (x: any) => String(x?.type ?? "").toUpperCase() === "HEADER",
    );
  
    const format = String(header?.format ?? header?.header_type ?? "").toUpperCase();
    const header_type =
      format === "TEXT" || format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT"
        ? format
        : null;
  
    const header_text = header_type === "TEXT" ? (header?.text ?? null) : null;
    return { header_type, header_text };
  }
  
/* ------------------------------------------------------------------
   STATUS MAP (Meta → Local)
------------------------------------------------------------------ */
function mapStatus(metaStatus: string | null | undefined) {
  const s = String(metaStatus ?? "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  // If Meta says PAUSED, it's still an approved template — we don't have a paused state locally.
  if (s === "PAUSED") return "approved";
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
      .select(
        "id, organization_id, name, language, category, meta_template_id, status, header_type, header_text, body, footer, header_variable_count, header_variable_indices, body_variable_count, body_variable_indices",
      )
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

    const localsByMetaId = new Map<string, any>();
    const localsByNameLang = new Map<string, any>();
    for (const lt of locals ?? []) {
      if (lt.meta_template_id) localsByMetaId.set(String(lt.meta_template_id), lt);
      if (lt.name && lt.language) localsByNameLang.set(`${String(lt.name)}::${String(lt.language)}`, lt);
    }

    const upserts: any[] = [];
    let matched = 0;
    let inserted = 0;
    let updated = 0;
    // Build upserts from Meta list (so Meta-only templates get inserted)
    for (const mt of metaTemplates) {
      const metaId = mt?.id ? String(mt.id) : null;
      const name = String(mt?.name ?? "");
      const language = String(mt?.language ?? mt?.languages?.[0]?.code ?? "");
      if (!name || !language) continue;

      const category = mt?.category ? String(mt.category) : null;
      const status = mapStatus(mt?.status);

      const { header_type, header_text } = pickHeader(mt);
      const body = pickComponentText(mt, "BODY");
      const footer = pickComponentText(mt, "FOOTER");

      const headerVars = header_type === "TEXT" ? extractVariableIndices(header_text) : [];
      const bodyVars = extractVariableIndices(body);
      // Find local row to update (if exists)
      let local = null as any;
      if (metaId && localsByMetaId.has(metaId)) local = localsByMetaId.get(metaId);
      if (!local) {
        const key = `${name}::${language}`;
        if (localsByNameLang.has(key)) local = localsByNameLang.get(key);
      }

      if (local) matched++;

      const patch: any = {
        organization_id,
        name,
        language,
        category,
        status,
        meta_template_id: metaId,
        header_type,
        header_text,
        body,
        footer,

        header_variable_count: headerVars.length,
        header_variable_indices: headerVars.length > 0 ? headerVars : null,
        body_variable_count: bodyVars.length,
        body_variable_indices: bodyVars.length > 0 ? bodyVars : null,
        updated_at: new Date().toISOString(),
      };

      // If we have an existing local row, include its id so the upsert updates it.
      if (local?.id) patch.id = local.id;
      upserts.push(patch);
    }
 

    /* =========================================================
       5️⃣ APPLY UPSERTS
    ========================================================= */

     // Upsert in small batches to avoid payload limits
   const BATCH = 50;
    for (let i = 0; i < upserts.length; i += BATCH) {
      const batch = upserts.slice(i, i + BATCH);
      const { error } = await supabase
        .from("whatsapp_templates")
        // requires a unique constraint for conflict target if you want true "id-less" upserts.
        // We include `id` when known, otherwise insert happens normally.
        .upsert(batch, { onConflict: "id" });

      if (error) {
        return jsonResponse(500, { error: "DB upsert failed", db: error });
      }
    }

    // derive inserted/updated roughly
    // (exact counts would require comparing prior state; keep it simple)
    inserted = Math.max(0, upserts.length - matched);
    updated = Math.min(upserts.length, matched);

    return jsonResponse(200, {
      success: true,
      meta_count: metaTemplates.length,
      local_count: locals?.length ?? 0,
      matched,
      inserted,
      updated,
    });
  } catch (e) {
    return jsonResponse(500, {
      error: "Unexpected error",
      details: String(e),
    });
  }
});