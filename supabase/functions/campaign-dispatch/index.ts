// supabase/functions/campaign-dispatch/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ------------------------------------------------------------
// ENV VARIABLES
// ------------------------------------------------------------
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ------------------------------------------------------------
// DISPATCH CONFIG
// ------------------------------------------------------------
const GLOBAL_MAX_MESSAGES_PER_RUN = 100;
const MAX_MESSAGES_PER_CAMPAIGN_PER_RUN = 50;
const ORG_RATE_LIMIT_PER_RUN = 30;
const MAX_CAMPAIGNS_PER_RUN = 20;

// ------------------------------------------------------------
// TYPES (UPDATED FOR SUB-ORG SUPPORT + CONTACT LINKING)
// ------------------------------------------------------------
type Campaign = {
  id: string;
  organization_id: string;
  sub_organization_id: string | null;
  status:
    | "draft"
    | "scheduled"
    | "sending"
    | "completed"
    | "cancelled"
    | "failed";
  scheduled_at: string | null;
  started_at: string | null;
  template_body: string;
};

type CampaignMessage = {
  id: string;
  organization_id: string;
  campaign_id: string;
  sub_organization_id: string | null;

  contact_id: string | null;

  phone: string;
  variables: Record<string, unknown> | null;

  status:
    | "pending"
    | "queued"
    | "sent"
    | "delivered"
    | "failed"
    | "cancelled";
};

// ------------------------------------------------------------
// PHONE NORMALIZATION (DB wants +91XXXXXXXXXX)
// ------------------------------------------------------------
function normalizePhoneToE164India(raw: string): string | null {
  if (!raw) return null;

  const trimmed = String(raw).trim();

  // Already in +91XXXXXXXXXX format
  if (/^\+91\d{10}$/.test(trimmed)) return trimmed;

  // If stored like 91XXXXXXXXXX (12 digits)
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (/^91\d{10}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  // If stored like XXXXXXXXXX (10 digits)
  if (/^\d{10}$/.test(digitsOnly)) {
    return `+91${digitsOnly}`;
  }

  return null;
}

// WhatsApp Cloud API commonly expects "to" without "+".
// We keep DB in +E164, but send without "+".
function waToFromE164(phoneE164: string): string {
  return phoneE164.replace(/^\+/, "");
}

// ------------------------------------------------------------
// TEMPLATE RENDERING
// ------------------------------------------------------------
function renderTemplate(
  template: string,
  variables: Record<string, unknown> | null,
): string {
  if (!variables) return template;
  let output = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(pattern, String(value ?? ""));
  }
  return output;
}

// ------------------------------------------------------------
// ENSURE CONTACT EXISTS + BACKFILL contact_id (PHASE 2B)
// ------------------------------------------------------------
async function ensureContactForMessage(params: {
  organizationId: string;
  phoneE164: string;
  campaignMessageId: string;
  existingContactId: string | null;
}) {
  const { organizationId, phoneE164, campaignMessageId, existingContactId } = params;

  // If already linked, nothing to do
  if (existingContactId) return;

  // Look up contact by org+phone
  const { data: existingContact, error: findErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phoneE164)
    .maybeSingle();

  if (findErr) {
    console.error("contacts lookup error", { findErr, organizationId, phoneE164 });
    return;
  }

  let contactId = existingContact?.id ?? null;

  // Create if missing (names/model null for now)
  if (!contactId) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("contacts")
      .insert({
        organization_id: organizationId,
        phone: phoneE164,
        first_name: null,
        last_name: null,
        model: null,
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("contacts insert error", { insErr, organizationId, phoneE164 });
      return;
    }
    contactId = inserted?.id ?? null;
  }

  if (!contactId) return;

  // Backfill campaign_messages.contact_id
  const { error: upErr } = await supabaseAdmin
    .from("campaign_messages")
    .update({ contact_id: contactId })
    .eq("id", campaignMessageId);

  if (upErr) {
    console.error("campaign_messages contact_id update error", {
      upErr,
      campaignMessageId,
      contactId,
    });
  }
}

// ------------------------------------------------------------
// SEND WHATSAPP MESSAGE (UPDATED FOR SUB-ORG + PHONE FORMAT)
// ------------------------------------------------------------
async function sendWhatsappMessage(
  organizationId: string,
  subOrganizationId: string | null,
  phoneE164: string, // +91XXXXXXXXXX
  text: string,
): Promise<{ ok: boolean; messageId?: string; raw?: unknown; errorText?: string }> {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-send`;

  const payload = {
    organization_id: organizationId,
    sub_organization_id: subOrganizationId,
    to: waToFromE164(phoneE164), // send without '+'
    type: "text",
    text,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("whatsapp-send error", { status: res.status, body });
    return { ok: false, errorText: JSON.stringify(body) };
  }

  const messageId =
    (body && (body.message_id || body.id || body.messages?.[0]?.id)) ?? undefined;

  return { ok: true, messageId, raw: body };
}

// ------------------------------------------------------------
// FETCH ELIGIBLE CAMPAIGNS (UPDATED SELECT)
// ------------------------------------------------------------
async function fetchEligibleCampaigns(nowIso: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, organization_id, sub_organization_id, status, scheduled_at, started_at, template_body",
    )
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_CAMPAIGNS_PER_RUN);

  if (error) throw error;
  return (data ?? []) as Campaign[];
}

// ------------------------------------------------------------
// FETCH PENDING / QUEUED MESSAGES (UPDATED SELECT)
// ------------------------------------------------------------
async function fetchMessagesForCampaign(campaignId: string): Promise<CampaignMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("id, organization_id, campaign_id, sub_organization_id, contact_id, phone, variables, status")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"])
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES_PER_CAMPAIGN_PER_RUN);

  if (error) throw error;
  return (data ?? []) as CampaignMessage[];
}

// ------------------------------------------------------------
// UPDATE MESSAGE STATUS → SENT
// ------------------------------------------------------------
async function updateMessageStatusSent(messageId: string, whatsappMessageId?: string) {
  const { error } = await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "sent",
      whatsapp_message_id: whatsappMessageId ?? null,
      dispatched_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);

  if (error) console.error("Error updating message to sent", { messageId, error });
}

// ------------------------------------------------------------
// UPDATE MESSAGE STATUS → FAILED
// ------------------------------------------------------------
async function updateMessageStatusFailed(messageId: string, errorText: string) {
  const { error } = await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "failed",
      dispatched_at: new Date().toISOString(),
      error: errorText.slice(0, 1000),
    })
    .eq("id", messageId);

  if (error) console.error("Error updating message to failed", { messageId, error });
}

// ------------------------------------------------------------
// CAMPAIGN STATUS → SENDING
// ------------------------------------------------------------
async function updateCampaignStatusOnProgress(campaign: Campaign) {
  if (!campaign.started_at || campaign.status === "scheduled") {
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "sending",
        started_at: campaign.started_at ?? new Date().toISOString(),
      })
      .eq("id", campaign.id);
  }
}

// ------------------------------------------------------------
// CAMPAIGN COMPLETE CHECK
// ------------------------------------------------------------
async function updateCampaignStatusIfCompleted(campaign: Campaign) {
  const { count } = await supabaseAdmin
    .from("campaign_messages")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "queued"]);

  const remaining = count ?? 0;
  if (remaining === 0) {
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
  }
}

// ------------------------------------------------------------
// RECOMPUTE CAMPAIGN COUNTERS
// ------------------------------------------------------------
async function recomputeCampaignCountersForCampaign(campaignId: string) {
  const { count: sentCount } = await supabaseAdmin
    .from("campaign_messages")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["sent", "delivered"]);

  const { count: failedCount } = await supabaseAdmin
    .from("campaign_messages")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "failed");

  await supabaseAdmin
    .from("campaigns")
    .update({
      sent_count: sentCount ?? 0,
      failed_count: failedCount ?? 0,
    })
    .eq("id", campaignId);
}

// ------------------------------------------------------------
// MAIN HANDLER (UPDATED FOR PHONE NORMALIZATION + CONTACT BACKFILL)
// ------------------------------------------------------------
serve(async () => {
  try {
    const nowIso = new Date().toISOString();
    const campaigns = await fetchEligibleCampaigns(nowIso);

    if (campaigns.length === 0) {
      return new Response(JSON.stringify({ message: "No eligible campaigns" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sentPerOrg: Record<string, number> = {};
    let globalSentCount = 0;

    const results: Array<{
      campaign_id: string;
      organization_id: string;
      sub_organization_id: string | null;
      attempted: number;
      sent: number;
      failed: number;
      skipped_due_to_rate_limit: number;
      normalized_phones: number;
      contacts_backfilled: number;
    }> = [];

    for (const campaign of campaigns) {
      await updateCampaignStatusOnProgress(campaign);

      const messages = await fetchMessagesForCampaign(campaign.id);

      let attempted = 0;
      let sent = 0;
      let failed = 0;
      let skipped = 0;
      let normalizedPhones = 0;
      let contactsBackfilled = 0;

      for (const msg of messages) {
        if (globalSentCount >= GLOBAL_MAX_MESSAGES_PER_RUN) {
          skipped += 1;
          continue;
        }

        const orgId = msg.organization_id;
        const orgCount = sentPerOrg[orgId] ?? 0;

        if (orgCount >= ORG_RATE_LIMIT_PER_RUN) {
          skipped += 1;
          continue;
        }

        // 1) Normalize phone into DB format +91XXXXXXXXXX
        const normalized = normalizePhoneToE164India(msg.phone);
        if (!normalized) {
          // invalid phone → mark failed (keeps retry meaningful)
          await updateMessageStatusFailed(msg.id, `Invalid phone: ${msg.phone}`);
          failed += 1;
          continue;
        }

        // If stored phone is not normalized, update it once
        if (normalized !== msg.phone) {
          const { error } = await supabaseAdmin
            .from("campaign_messages")
            .update({ phone: normalized })
            .eq("id", msg.id);

          if (!error) normalizedPhones += 1;
        }

        // 2) Ensure contact exists + backfill campaign_messages.contact_id
        if (!msg.contact_id) {
          await ensureContactForMessage({
            organizationId: msg.organization_id,
            phoneE164: normalized,
            campaignMessageId: msg.id,
            existingContactId: msg.contact_id,
          });
          contactsBackfilled += 1;
        }

        attempted += 1;

        const text = renderTemplate(campaign.template_body, msg.variables);

        try {
          const res = await sendWhatsappMessage(
            msg.organization_id,
            msg.sub_organization_id ?? null,
            normalized, // send uses waToFromE164 internally
            text,
          );

          if (res.ok) {
            await updateMessageStatusSent(msg.id, res.messageId);
            sent += 1;
            globalSentCount += 1;
            sentPerOrg[orgId] = orgCount + 1;
          } else {
            await updateMessageStatusFailed(msg.id, res.errorText ?? "Unknown WA error");
            failed += 1;
          }
        } catch (e) {
          console.error("Unexpected WhatsApp error", e);
          await updateMessageStatusFailed(
            msg.id,
            e instanceof Error ? e.message : String(e),
          );
          failed += 1;
        }
      }

      await updateCampaignStatusIfCompleted(campaign);
      await recomputeCampaignCountersForCampaign(campaign.id);

      results.push({
        campaign_id: campaign.id,
        organization_id: campaign.organization_id,
        sub_organization_id: campaign.sub_organization_id,
        attempted,
        sent,
        failed,
        skipped_due_to_rate_limit: skipped,
        normalized_phones: normalizedPhones,
        contacts_backfilled: contactsBackfilled,
      });
    }

    return new Response(
      JSON.stringify({
        message: "campaign-dispatch completed",
        globalSentCount,
        sentPerOrg,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("campaign-dispatch fatal error", error);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});