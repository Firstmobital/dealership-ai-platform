// supabase/functions/campaign-dispatch/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --------- CONFIG (tweak as needed) ----------

// Max messages we process PER RUN for ALL orgs combined
const GLOBAL_MAX_MESSAGES_PER_RUN = 100;

// Max messages per campaign per run
const MAX_MESSAGES_PER_CAMPAIGN_PER_RUN = 50;

// Max messages per org per run (throttling)
const ORG_RATE_LIMIT_PER_RUN = 30;

// Max campaigns we look at per run
const MAX_CAMPAIGNS_PER_RUN = 20;

// --------------------------------------------

type Campaign = {
  id: string;
  organization_id: string;
  status: "draft" | "scheduled" | "sending" | "completed" | "cancelled" | "failed";
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
  status: "pending" | "queued" | "sent" | "delivered" | "failed" | "cancelled";
};

// Simple template renderer: replaces {{key}} with value from variables
function renderTemplate(template: string, variables: Record<string, unknown> | null): string {
  if (!variables) return template;

  let output = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    output = output.replace(pattern, String(value ?? ""));
  }
  return output;
}

// Call the existing whatsapp-send Edge Function
async function sendWhatsappMessage(
  organizationId: string,
  phone: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; raw?: unknown; errorText?: string }> {
  const url = `${SUPABASE_URL}/functions/v1/whatsapp-send`;

  const payload = {
    organization_id: organizationId,
    to: phone,
    text,
    type: "text",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Use service role so whatsapp-send can also bypass RLS if it needs to
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("whatsapp-send error", { status: res.status, body });
    return {
      ok: false,
      errorText: typeof body === "string" ? body : JSON.stringify(body),
    };
  }

  // Adjust this depending on your whatsapp-send response shape
  const messageId =
    (body && (body.message_id || body.id || body.messages?.[0]?.id)) ?? undefined;

  return { ok: true, messageId, raw: body };
}

// Fetch campaigns that are ready to send
async function fetchEligibleCampaigns(nowIso: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, organization_id, status, scheduled_at, started_at, template_body")
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

// Fetch pending / queued messages for a specific campaign
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

async function updateMessageStatusFailed(messageId: string, errorText: string) {
  const { error } = await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "failed",
      dispatched_at: new Date().toISOString(),
      error: errorText.slice(0, 1000), // avoid huge errors
    })
    .eq("id", messageId);

  if (error) {
    console.error("Error updating message to failed", { messageId, error });
  }
}

// Ensure campaign status (set to sending, completed, etc.)
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

async function updateCampaignStatusIfCompleted(campaign: Campaign) {
  // If no more pending/queued messages, mark as completed
  const { data, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "queued"]);

  if (error) {
    console.error("Error counting remaining messages", {
      campaignId: campaign.id,
      error,
    });
    return;
  }

  const remaining = data?.length === 0 ? 0 : (data as unknown as number) ?? 0;

  if (remaining === 0) {
    const { error: updateError } = await supabaseAdmin
      .from("campaigns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    if (updateError) {
      console.error("Error marking campaign as completed", {
        campaignId: campaign.id,
        updateError,
      });
    }
  }
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const nowIso = new Date().toISOString();

    const campaigns = await fetchEligibleCampaigns(nowIso);

    if (campaigns.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No eligible campaigns",
        }),
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
      let skippedDueToRateLimit = 0;

      for (const msg of messages) {
        // Global limit safety
        if (globalSentCount >= GLOBAL_MAX_MESSAGES_PER_RUN) {
          skippedDueToRateLimit += 1;
          continue;
        }

        const orgId = msg.organization_id;
        const orgCount = sentPerOrg[orgId] ?? 0;

        // Org-level throttling
        if (orgCount >= ORG_RATE_LIMIT_PER_RUN) {
          skippedDueToRateLimit += 1;
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
            await updateMessageStatusFailed(
              msg.id,
              res.errorText ?? "Unknown whatsapp-send error",
            );
            failed += 1;
          }
        } catch (e) {
          console.error("Unexpected error sending WhatsApp message", {
            messageId: msg.id,
            error: e,
          });
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
        skipped_due_to_rate_limit: skippedDueToRateLimit,
      });
    }

    return new Response(
      JSON.stringify({
        message: "campaign-dispatch run completed",
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
