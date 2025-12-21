// supabase/functions/campaign-dispatch/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ============================================================
   ENV
============================================================ */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============================================================
   DISPATCH LIMITS
============================================================ */
const GLOBAL_MAX_MESSAGES_PER_RUN = 100;
const MAX_MESSAGES_PER_CAMPAIGN_PER_RUN = 50;
const ORG_RATE_LIMIT_PER_RUN = 30;
const MAX_CAMPAIGNS_PER_RUN = 20;

/* ============================================================
   TYPES
============================================================ */
type Campaign = {
  id: string;
  organization_id: string;
  sub_organization_id: string | null;
  whatsapp_template_id: string | null;
  status: "draft" | "scheduled" | "sending" | "completed" | "cancelled" | "failed";
  scheduled_at: string | null;
  started_at: string | null;
};

type CampaignMessage = {
  id: string;
  organization_id: string;
  campaign_id: string;
  sub_organization_id: string | null;
  contact_id: string | null;
  phone: string;
  variables: Record<string, unknown> | null;
  status: "pending" | "queued" | "sent" | "delivered" | "failed" | "cancelled";
};

type WhatsappTemplate = {
  name: string;
  language: string;
  status: "approved" | "pending" | "rejected";
};

/* ============================================================
   PHONE HELPERS
============================================================ */
function normalizePhoneToE164India(raw: string): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");

  if (/^91\d{10}$/.test(d)) return `+${d}`;
  if (/^\d{10}$/.test(d)) return `+91${d}`;
  if (/^\+91\d{10}$/.test(raw)) return raw;

  return null;
}

function waToFromE164(phone: string) {
  return phone.replace(/^\+/, "");
}

/* ============================================================
   VARIABLES → ORDERED ARRAY
============================================================ */
function variablesToArray(vars: Record<string, unknown> | null): string[] {
  if (!vars) return [];

  const keys = Object.keys(vars);
  const numeric = keys.every((k) => /^\d+$/.test(k));

  const ordered = numeric
    ? keys.sort((a, b) => Number(a) - Number(b))
    : keys.sort();

  return ordered.map((k) => String(vars[k] ?? ""));
}

/* ============================================================
   FETCH TEMPLATE
============================================================ */
async function fetchTemplate(templateId: string): Promise<WhatsappTemplate> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("name, language, status")
    .eq("id", templateId)
    .single();

  if (error || !data) throw new Error("Template not found");
  if (data.status !== "approved") throw new Error("Template not approved");

  return data;
}

/* ============================================================
   SEND WHATSAPP TEMPLATE
============================================================ */
async function sendWhatsappTemplate(params: {
  organizationId: string;
  subOrganizationId: string | null;
  phoneE164: string;
  templateName: string;
  language: string;
  variables: string[];
}) {
  const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      organization_id: params.organizationId,
      sub_organization_id: params.subOrganizationId,
      to: waToFromE164(params.phoneE164),
      type: "template",
      template_name: params.templateName,
      template_language: params.language,
      template_variables: params.variables,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(JSON.stringify(body));

  return body?.messages?.[0]?.id ?? body?.message_id ?? null;
}

/* ============================================================
   FETCH ELIGIBLE CAMPAIGNS
============================================================ */
async function fetchEligibleCampaigns(nowIso: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, organization_id, sub_organization_id, whatsapp_template_id, status, scheduled_at, started_at")
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", nowIso)
    .limit(MAX_CAMPAIGNS_PER_RUN);

  if (error) throw error;
  return data ?? [];
}

/* ============================================================
   FETCH PENDING MESSAGES
============================================================ */
async function fetchMessages(campaignId: string): Promise<CampaignMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("id, organization_id, campaign_id, sub_organization_id, contact_id, phone, variables, status")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"])
    .limit(MAX_MESSAGES_PER_CAMPAIGN_PER_RUN);

  if (error) throw error;
  return data ?? [];
}

/* ============================================================
   STATUS UPDATES
============================================================ */
async function markSent(id: string, waId: string | null) {
  await supabaseAdmin.from("campaign_messages").update({
    status: "sent",
    whatsapp_message_id: waId,
    dispatched_at: new Date().toISOString(),
  }).eq("id", id);
}

async function markFailed(id: string, err: string) {
  await supabaseAdmin.from("campaign_messages").update({
    status: "failed",
    error: err.slice(0, 1000),
    dispatched_at: new Date().toISOString(),
  }).eq("id", id);
}

/* ============================================================
   MAIN
============================================================ */
serve(async () => {
  try {
    const nowIso = new Date().toISOString();
    const campaigns = await fetchEligibleCampaigns(nowIso);

    let globalSent = 0;
    const sentPerOrg: Record<string, number> = {};

    for (const campaign of campaigns) {
      if (!campaign.whatsapp_template_id) continue;

      const template = await fetchTemplate(campaign.whatsapp_template_id);
      const messages = await fetchMessages(campaign.id);

      for (const msg of messages) {
        if (globalSent >= GLOBAL_MAX_MESSAGES_PER_RUN) break;

        const orgCount = sentPerOrg[msg.organization_id] ?? 0;
        if (orgCount >= ORG_RATE_LIMIT_PER_RUN) continue;

        const phone = normalizePhoneToE164India(msg.phone);
        if (!phone) {
          await markFailed(msg.id, "Invalid phone");
          continue;
        }

        try {
          const waId = await sendWhatsappTemplate({
            organizationId: msg.organization_id,
            subOrganizationId: msg.sub_organization_id,
            phoneE164: phone,
            templateName: template.name,
            language: template.language,
            variables: variablesToArray(msg.variables),
          });

          await markSent(msg.id, waId);
          globalSent++;
          sentPerOrg[msg.organization_id] = orgCount + 1;
        } catch (e) {
          await markFailed(msg.id, e instanceof Error ? e.message : String(e));
        }
      }

      const { count } = await supabaseAdmin
        .from("campaign_messages")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("status", ["pending", "queued"]);

      if ((count ?? 0) === 0) {
        await supabaseAdmin.from("campaigns").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", campaign.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    console.error("campaign-dispatch fatal", e);
    return new Response(
      JSON.stringify({ error: "Internal Error", details: String(e) }),
      { status: 500 },
    );
  }
});
