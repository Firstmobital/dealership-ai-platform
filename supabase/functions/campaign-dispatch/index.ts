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
// TYPES (UPDATED FOR SUB-ORG SUPPORT)
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
// TEMPLATE RENDERING
// ------------------------------------------------------------
function renderTemplate(template: string, variables: Record<string, unknown> | null): string {
  if (!variables) return template;
  let output = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(pattern, String(value ?? ""));
  }
  return output;
}

// ------------------------------------------------------------
// SEND WHATSAPP MESSAGE (UPDATED FOR SUB-ORG)
// ------------------------------------------------------------
async function sendWhatsappMessage(
  organizationId: string,
  subOrganizationId: string | null,
  phone: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; raw?: unknown; errorText?: string }> {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-send`;

  const payload = {
    organization_id: organizationId,
    sub_organization_id: subOrganizationId,
    to: phone,
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
    .select("id, organization_id, sub_organization_id, status, scheduled_at, started_at, template_body")
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
    .select("id, organization_id, campaign_id, sub_organization_id, phone, variables, status")
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
// MAIN HANDLER (UPDATED)
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
    }> = [];

    for (const campaign of campaigns) {
      await updateCampaignStatusOnProgress(campaign);

      const messages = await fetchMessagesForCampaign(campaign.id);

      let attempted = 0;
      let sent = 0;
      let failed = 0;
      let skipped = 0;

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

        attempted += 1;

        const text = renderTemplate(campaign.template_body, msg.variables);

        try {
          const res = await sendWhatsappMessage(
            msg.organization_id,
            msg.sub_organization_id ?? null,
            msg.phone,
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

