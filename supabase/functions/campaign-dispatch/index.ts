// supabase/functions/campaign-dispatch/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ------------------------------------------------------------
// ENV VARIABLES (YOUR STANDARD NAMING)
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
// CAMPAIGN DISPATCH CONFIG
// ------------------------------------------------------------

// Global max messages for ALL orgs combined
const GLOBAL_MAX_MESSAGES_PER_RUN = 100;

// Max messages per campaign per run
const MAX_MESSAGES_PER_CAMPAIGN_PER_RUN = 50;

// Max messages per org per run (throttling)
const ORG_RATE_LIMIT_PER_RUN = 30;

// Max campaigns simultaneously processed
const MAX_CAMPAIGNS_PER_RUN = 20;

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------
type Campaign = {
  id: string;
  organization_id: string;
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
// TEMPLATE RENDERER
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
// CALL whatsapp-send EDGE FUNCTION
// ------------------------------------------------------------
async function sendWhatsappMessage(
  organizationId: string,
  phone: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; raw?: unknown; errorText?: string }> {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-send`;

  const payload = {
    organization_id: organizationId,
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
    return {
      ok: false,
      errorText: JSON.stringify(body),
    };
  }

  const messageId =
    (body && (body.message_id || body.id || body.messages?.[0]?.id)) ??
    undefined;

  return { ok: true, messageId, raw: body };
}

// ------------------------------------------------------------
// FETCH ELIGIBLE CAMPAIGNS
// ------------------------------------------------------------
async function fetchEligibleCampaigns(nowIso: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, organization_id, status, scheduled_at, started_at, template_body",
    )
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_CAMPAIGNS_PER_RUN);

  if (error) {
    console.error("Error fetching campaigns", error);
    throw error;
  }

  return (data ?? []) as Campaign[];
}

// ------------------------------------------------------------
// FETCH PENDING/QUEUED MESSAGES
// ------------------------------------------------------------
async function fetchMessagesForCampaign(
  campaignId: string,
): Promise<CampaignMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("id, organization_id, campaign_id, phone, variables, status")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"])
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES_PER_CAMPAIGN_PER_RUN);

  if (error) {
    console.error("Error fetching campaign_messages", { campaignId, error });
    throw error;
  }

  return (data ?? []) as CampaignMessage[];
}

// ------------------------------------------------------------
// UPDATE MESSAGE STATUS → SENT
// ------------------------------------------------------------
async function updateMessageStatusSent(
  messageId: string,
  whatsappMessageId?: string,
) {
  const { error } = await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "sent",
      whatsapp_message_id: whatsappMessageId ?? null,
      dispatched_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);

  if (error) {
    console.error("Error updating message to sent", { messageId, error });
  }
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

  if (error) {
    console.error("Error updating message to failed", { messageId, error });
  }
}

// ------------------------------------------------------------
// CAMPAIGN STATUS PROGRESS → SENDING
// ------------------------------------------------------------
async function updateCampaignStatusOnProgress(campaign: Campaign) {
  if (!campaign.started_at || campaign.status === "scheduled") {
    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({
        status: "sending",
        started_at: campaign.started_at ?? new Date().toISOString(),
      })
      .eq("id", campaign.id);

    if (error) {
      console.error("Error updating campaign to sending", {
        campaignId: campaign.id,
        error,
      });
    }
  }
}

// ------------------------------------------------------------
// CAMPAIGN COMPLETE CHECK
// ------------------------------------------------------------
async function updateCampaignStatusIfCompleted(campaign: Campaign) {
  const { count, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "queued"]);

  if (error) {
    console.error("Error checking remaining messages", error);
    return;
  }

  const remaining = count ?? 0;

  if (remaining === 0) {
    const { error: updateErr } = await supabaseAdmin
      .from("campaigns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    if (updateErr) {
      console.error("Error setting campaign completed", updateErr);
    }
  }
}

// ------------------------------------------------------------
// MAIN HANDLER
// ------------------------------------------------------------
serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const nowIso = new Date().toISOString();
    const campaigns = await fetchEligibleCampaigns(nowIso);

    if (campaigns.length === 0) {
      return new Response(
        JSON.stringify({ message: "No eligible campaigns" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const sentPerOrg: Record<string, number> = {};
    let globalSentCount = 0;

    const results: Array<{
      campaign_id: string;
      organization_id: string;
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
          const res = await sendWhatsappMessage(orgId, msg.phone, text);

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

      results.push({
        campaign_id: campaign.id,
        organization_id: campaign.organization_id,
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
