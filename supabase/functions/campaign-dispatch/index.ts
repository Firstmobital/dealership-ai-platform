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
type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "cancelled"
  | "failed";

type Campaign = {
  id: string;
  organization_id: string;
  sub_organization_id: string | null;
  whatsapp_template_id: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  launched_at: string | null;
  variable_mapping: Record<string, string> | null;
};

type CampaignMessageStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled";

type CampaignMessage = {
  id: string;
  organization_id: string;
  campaign_id: string;
  sub_organization_id: string | null;
  contact_id: string | null;
  phone: string;
  variables: Record<string, unknown> | null;
  status: CampaignMessageStatus;
};

type WhatsappTemplate = {
  name: string;
  language: string;
  status: "approved" | "pending" | "rejected";
  body: string | null;
};

type DispatchMode = "scheduled" | "immediate";

/* ============================================================
   HELPERS
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

function variablesToArray(vars: Record<string, unknown> | null): string[] {
  if (!vars) return [];

  const keys = Object.keys(vars);
  const numeric = keys.every((k) => /^\d+$/.test(k));

  const ordered = numeric
    ? keys.sort((a, b) => Number(a) - Number(b))
    : keys.sort();

  return ordered.map((k) => String(vars[k] ?? ""));
}

function resolveTemplateText(
  templateBody: string,
  contact: Record<string, any> | null,
  mapping: Record<string, string> | null,
) {
  let text = templateBody ?? "";
  for (const [key, field] of Object.entries(mapping ?? {})) {
    const value =
      contact?.[field] ??
      contact?.[field?.toLowerCase()] ??
      "";
    text = text.replaceAll(`{{${key}}}`, String(value));
  }
  return text;
}

/* ============================================================
   FETCH TEMPLATE (includes body)
============================================================ */
async function fetchTemplate(templateId: string): Promise<WhatsappTemplate> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("name, language, status, body")
    .eq("id", templateId)
    .single();

  if (error || !data) throw new Error("Template not found");
  if (data.status !== "approved") throw new Error("Template not approved");

  return data as WhatsappTemplate;
}

/* ============================================================
   SEND WHATSAPP TEMPLATE (calls whatsapp-send)
============================================================ */
async function sendWhatsappTemplate(params: {
  organizationId: string;
  subOrganizationId: string | null;
  contactId: string | null;
  phoneE164: string;
  templateName: string;
  language: string;
  variables: string[];
  renderedText: string;
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
      contact_id: params.contactId,
      to: waToFromE164(params.phoneE164),
      type: "template",
      template_name: params.templateName,
      template_language: params.language,
      template_variables: params.variables,
      rendered_text: params.renderedText, // ✅ used for chat insert in whatsapp-send
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(JSON.stringify(body));

  return body?.meta_response?.messages?.[0]?.id ??
    body?.meta_response?.message_id ??
    body?.messages?.[0]?.id ??
    body?.message_id ??
    null;
}

/* ============================================================
   FETCH CAMPAIGN BY ID (immediate mode)
============================================================ */
async function fetchCampaignById(campaignId: string): Promise<Campaign | null> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, organization_id, sub_organization_id, whatsapp_template_id, status, scheduled_at, started_at, launched_at, variable_mapping",
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as Campaign | null;
}

/* ============================================================
   FETCH ELIGIBLE CAMPAIGNS (scheduled runner)
============================================================ */
async function fetchEligibleCampaigns(nowIso: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, organization_id, sub_organization_id, whatsapp_template_id, status, scheduled_at, started_at, launched_at, variable_mapping",
    )
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", nowIso)
    .limit(MAX_CAMPAIGNS_PER_RUN);

  if (error) throw error;
  return (data ?? []) as Campaign[];
}

/* ============================================================
   FETCH PENDING MESSAGES
============================================================ */
async function fetchMessages(campaignId: string): Promise<CampaignMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("campaign_messages")
    .select(
      "id, organization_id, campaign_id, sub_organization_id, contact_id, phone, variables, status",
    )
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"])
    .limit(MAX_MESSAGES_PER_CAMPAIGN_PER_RUN);

  if (error) throw error;
  return (data ?? []) as CampaignMessage[];
}

/* ============================================================
   FETCH CONTACT (for mapping)
============================================================ */
async function fetchContact(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

/* ============================================================
   STATUS UPDATES
============================================================ */
async function markSent(id: string, waId: string | null) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "sent",
      whatsapp_message_id: waId,
      dispatched_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function markFailed(id: string, err: string) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "failed",
      error: err.slice(0, 1000),
      dispatched_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function setRenderedText(id: string, renderedText: string) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({ rendered_text: renderedText })
    .eq("id", id);
}

async function markCampaignSending(campaignId: string, isImmediate: boolean) {
  const patch: Record<string, any> = {
    status: "sending",
    started_at: new Date().toISOString(),
  };

  if (isImmediate) patch.launched_at = new Date().toISOString();

  await supabaseAdmin.from("campaigns").update(patch).eq("id", campaignId);
}

async function markCampaignCompleted(campaignId: string) {
  await supabaseAdmin
    .from("campaigns")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

async function markCampaignFailed(campaignId: string, err: string) {
  await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
  console.error("campaign failed", campaignId, err);
}

/* ============================================================
   DISPATCH SINGLE CAMPAIGN (used by immediate mode)
============================================================ */
async function dispatchCampaign(campaign: Campaign) {
  if (!campaign.whatsapp_template_id) return;
  if (campaign.status === "completed" || campaign.status === "cancelled") return;

  const template = await fetchTemplate(campaign.whatsapp_template_id);
  const messages = await fetchMessages(campaign.id);

  let localSent = 0;
  const sentPerOrg: Record<string, number> = {};

  for (const msg of messages) {
    if (localSent >= GLOBAL_MAX_MESSAGES_PER_RUN) break;

    const orgCount = sentPerOrg[msg.organization_id] ?? 0;
    if (orgCount >= ORG_RATE_LIMIT_PER_RUN) continue;

    const phone = normalizePhoneToE164India(msg.phone);
    if (!phone) {
      await markFailed(msg.id, "Invalid phone");
      continue;
    }

    // Resolve rendered text (best-effort)
    let renderedText = `Template: ${template.name}`;
    try {
      if (template.body && msg.contact_id) {
        const contact = await fetchContact(msg.contact_id);
        renderedText = resolveTemplateText(
          template.body,
          contact,
          campaign.variable_mapping,
        );
      }
      await setRenderedText(msg.id, renderedText);
    } catch {
      // ignore; sending can still proceed
    }

    try {
      const waId = await sendWhatsappTemplate({
        organizationId: msg.organization_id,
        subOrganizationId: msg.sub_organization_id,
        contactId: msg.contact_id,
        phoneE164: phone,
        templateName: template.name,
        language: template.language,
        variables: variablesToArray(msg.variables),
        renderedText,
      });

      await markSent(msg.id, waId);

      localSent++;
      sentPerOrg[msg.organization_id] = orgCount + 1;
    } catch (e) {
      await markFailed(msg.id, e instanceof Error ? e.message : String(e));
    }
  }

  const { count, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "queued"]);

  if (error) throw error;

  if ((count ?? 0) === 0) {
    await markCampaignCompleted(campaign.id);
  }
}

/* ============================================================
   MAIN
============================================================ */
serve(async (req: Request) => {
  try {
    const nowIso = new Date().toISOString();

    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const mode: DispatchMode = body?.mode ?? "scheduled";
    const immediateCampaignId: string | undefined = body?.campaign_id;

    /* ===========================
       IMMEDIATE MODE (Launch Now)
    ============================ */
    if (mode === "immediate") {
      if (!immediateCampaignId) {
        return new Response(
          JSON.stringify({ error: "campaign_id is required for mode=immediate" }),
          { status: 400 },
        );
      }

      const campaign = await fetchCampaignById(immediateCampaignId);
      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
      }

      if (campaign.status === "sending" || campaign.status === "completed") {
        return new Response(
          JSON.stringify({ error: "Campaign already sent or in progress" }),
          { status: 400 },
        );
      }

      await markCampaignSending(campaign.id, true);

      try {
        await dispatchCampaign({ ...campaign, status: "sending" });
        return new Response(
          JSON.stringify({ success: true, mode: "immediate", campaign_id: campaign.id }),
          { status: 200 },
        );
      } catch (e) {
        await markCampaignFailed(campaign.id, e instanceof Error ? e.message : String(e));
        return new Response(
          JSON.stringify({ error: "Dispatch failed", details: String(e) }),
          { status: 500 },
        );
      }
    }

    /* ===========================
       SCHEDULED MODE (Runner)
    ============================ */
    const campaigns = await fetchEligibleCampaigns(nowIso);

    let globalSent = 0;
    const sentPerOrg: Record<string, number> = {};
    let campaignsProcessed = 0;

    for (const campaign of campaigns) {
      if (campaignsProcessed >= MAX_CAMPAIGNS_PER_RUN) break;

      if (!campaign.whatsapp_template_id) continue;

      // Mark sending when first picked up
      if (campaign.status === "scheduled") {
        await markCampaignSending(campaign.id, false);
      }

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

        // Rendered text (best-effort)
        let renderedText = `Template: ${template.name}`;
        try {
          if (template.body && msg.contact_id) {
            const contact = await fetchContact(msg.contact_id);
            renderedText = resolveTemplateText(
              template.body,
              contact,
              campaign.variable_mapping,
            );
          }
          await setRenderedText(msg.id, renderedText);
        } catch {
          // ignore
        }

        try {
          const waId = await sendWhatsappTemplate({
            organizationId: msg.organization_id,
            subOrganizationId: msg.sub_organization_id,
            contactId: msg.contact_id,
            phoneE164: phone,
            templateName: template.name,
            language: template.language,
            variables: variablesToArray(msg.variables),
            renderedText,
          });

          await markSent(msg.id, waId);

          globalSent++;
          sentPerOrg[msg.organization_id] = orgCount + 1;
        } catch (e) {
          await markFailed(msg.id, e instanceof Error ? e.message : String(e));
        }
      }

      const { count, error } = await supabaseAdmin
        .from("campaign_messages")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("status", ["pending", "queued"]);

      if (error) throw error;

      if ((count ?? 0) === 0) {
        await markCampaignCompleted(campaign.id);
      }

      campaignsProcessed++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "scheduled",
        campaigns_processed: campaignsProcessed,
        messages_dispatched: globalSent,
      }),
      { status: 200 },
    );
  } catch (e) {
    console.error("campaign-dispatch fatal", e);
    return new Response(
      JSON.stringify({ error: "Internal Error", details: String(e) }),
      { status: 500 },
    );
  }
});
