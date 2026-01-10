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
   VARIABLE HELPERS
------------------------------------------------------------------ */
function extractVariableIndices(text: string | null): number[] {
  if (!text) return [];
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  return Array.from(
    new Set(matches.map((m) => Number(m[1]))),
  ).sort((a, b) => a - b);
}

function pickComponentText(mt: any, type: string): string | null {
  const comps = Array.isArray(mt?.components) ? mt.components : [];
  const c = comps.find(
    (x: any) => String(x?.type ?? "").toUpperCase() === type,
  );
  return (c?.text ?? null) as string | null;
}

function pickHeader(mt: any): {
  header_type: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  header_text: string | null;
} {
  const comps = Array.isArray(mt?.components) ? mt.components : [];
  const header = comps.find(
    (x: any) => String(x?.type ?? "").toUpperCase() === "HEADER",
  );

  const format = String(header?.format ?? "").toUpperCase();
  const header_type =
    format === "TEXT" || format === "IMAGE" || format === "VIDEO" ||
    format === "DOCUMENT"
      ? format
      : null;

  const header_text = header_type === "TEXT" ? header?.text ?? null : null;
  return { header_type, header_text };
}

/* ------------------------------------------------------------------
   STATUS MAP
------------------------------------------------------------------ */
function mapStatus(metaStatus: string | null | undefined) {
  const s = String(metaStatus ?? "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PAUSED") return "approved";
  if (s === "PENDING") return "pending";
  return "pending";
}

/* ------------------------------------------------------------------
   META FETCH (PAGINATED)
------------------------------------------------------------------ */
async function fetchAllMetaTemplates({
  wabaId,
  token,
}: {
  wabaId: string;
  token: string;
}): Promise<any[]> {
  const results: any[] = [];
  let nextUrl =
    `https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=200&access_token=${token}`;

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

    /* ---------------------------------------------------------
       Load WhatsApp settings
    --------------------------------------------------------- */
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("whatsapp_business_id, api_token")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!settings?.whatsapp_business_id || !settings?.api_token) {
      return jsonResponse(400, {
        error: "Active WhatsApp settings not found",
      });
    }

    /* ---------------------------------------------------------
       Fetch Meta templates
    --------------------------------------------------------- */
    const metaTemplates = await fetchAllMetaTemplates({
      wabaId: String(settings.whatsapp_business_id),
      token: String(settings.api_token),
    });

    /* ---------------------------------------------------------
       Load local templates
    --------------------------------------------------------- */
    const { data: locals } = await supabase
      .from("whatsapp_templates")
      .select("id, name, language, meta_template_id")
      .eq("organization_id", organization_id);

    const localsByMetaId = new Map<string, any>();
    const localsByNameLang = new Map<string, any>();

    for (const lt of locals ?? []) {
      if (lt.meta_template_id) {
        localsByMetaId.set(String(lt.meta_template_id), lt);
      }
      if (lt.name && lt.language) {
        localsByNameLang.set(`${lt.name}::${lt.language}`, lt);
      }
    }

    /* ---------------------------------------------------------
       Build UPSERT payloads
    --------------------------------------------------------- */
    const upserts: any[] = [];
    let matched = 0;

    for (const mt of metaTemplates) {
      const metaId = mt?.id ? String(mt.id) : null;
      const name = String(mt?.name ?? "");
      const language = String(mt?.language ?? mt?.languages?.[0]?.code ?? "");

      if (!name || !language) continue;

      const category = mt?.category
  ? String(mt.category).toLowerCase()
  : null;
      const status = mapStatus(mt?.status);

      const { header_type, header_text } = pickHeader(mt);
      const bodyText = pickComponentText(mt, "BODY") ?? "";
      const footer = pickComponentText(mt, "FOOTER");

      const headerVars =
        header_type === "TEXT"
          ? extractVariableIndices(header_text)
          : [];
      const bodyVars = extractVariableIndices(bodyText);

      let local = null;
      if (metaId && localsByMetaId.has(metaId)) {
        local = localsByMetaId.get(metaId);
      } else if (localsByNameLang.has(`${name}::${language}`)) {
        local = localsByNameLang.get(`${name}::${language}`);
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
        body: bodyText,
        footer,
        header_variable_count: headerVars.length,
        header_variable_indices: headerVars.length ? headerVars : null,
        body_variable_count: bodyVars.length,
        body_variable_indices: bodyVars.length ? bodyVars : null,
        updated_at: new Date().toISOString(),
      };
      
      if (local?.id) {
        patch.id = local.id; // 👈 ONLY add when updating
      }
      
      upserts.push(patch);      
    }

    /* ---------------------------------------------------------
       UPSERT (SAFE)
    --------------------------------------------------------- */
    const BATCH = 50;
    for (let i = 0; i < upserts.length; i += BATCH) {
      const batch = upserts.slice(i, i + BATCH);
      const { error } = await supabase
        .from("whatsapp_templates")
        .upsert(batch, {
          onConflict: "organization_id,name,language",
        });

      if (error) {
        return jsonResponse(500, { error: "DB upsert failed", db: error });
      }
    }

    return jsonResponse(200, {
      success: true,
      meta_count: metaTemplates.length,
      matched,
      inserted: Math.max(0, upserts.length - matched),
      updated: matched,
    });
  } catch (e) {
    return jsonResponse(500, {
      error: "Unexpected error",
      details: String(e),
    });
  }
});
