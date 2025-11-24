// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import OpenAI from "https://esm.sh/openai@4.47.0";

/* =====================================================================================
   ENV
===================================================================================== */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "test-token";
const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* =====================================================================================
   STRUCTURED LOGGING
===================================================================================== */
function log(stage: string, data: any) {
  console.log(`[whatsapp-inbound] ${stage}`, JSON.stringify(data, null, 2));
}

/* =====================================================================================
   VERIFY TOKEN HANDLER (GET)
===================================================================================== */
async function verifyWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  log("VERIFY_REQUEST", { mode, token, challenge });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Invalid verify token", { status: 403 });
}

/* =====================================================================================
   AUTO-ASSIGNMENT (Stage 5D)
===================================================================================== */
// >>> NEW: Stage 5D auto-assignment helper
async function autoAssignConversationAgent(
  subOrganizationId: string | null
): Promise<string | null> {
  if (!subOrganizationId) return null;

  const { data, error } = await supabase
    .from("sub_organization_users")
    .select("user_id")
    .eq("sub_organization_id", subOrganizationId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    log("AUTO_ASSIGN_ERROR", error);
    return null;
  }

  return data?.[0]?.user_id ?? null;
}

/* =====================================================================================
   CAMPAIGN COUNTERS (UNCHANGED)
===================================================================================== */
async function recomputeCampaignCounters(campaignId: string) {
  try {
    const { count: sentCount } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "delivered"]);

    const { count: failedCount } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");

    await supabase
      .from("campaigns")
      .update({
        sent_count: sentCount ?? 0,
        failed_count: failedCount ?? 0,
      })
      .eq("id", campaignId);
  } catch (e) {
    log("COUNTER_FATAL", e);
  }
}

/* =====================================================================================
   STATUS HANDLER (UNCHANGED)
===================================================================================== */
async function handleStatuses(statuses: any[]) {
  for (const st of statuses) {
    try {
      const waMessageId = st.id;
      const waStatus = st.status;
      const ts = st.timestamp;
      const errorText = st.errors?.[0]?.message;

      if (!waMessageId || !waStatus) continue;

      const { data: cm } = await supabase
        .from("campaign_messages")
        .select("id, campaign_id, status")
        .eq("whatsapp_message_id", waMessageId)
        .maybeSingle();

      if (!cm) continue;

      let newStatus: "sent" | "delivered" | "failed" | null = null;

      if (waStatus === "sent") newStatus = "sent";
      else if (waStatus === "delivered" || waStatus === "read")
        newStatus = "delivered";
      else if (waStatus === "failed") newStatus = "failed";

      if (newStatus === "delivered" && ts) {
        const ms = Number(ts) * 1000;
        await supabase
          .from("campaign_messages")
          .update({
            status: "delivered",
            delivered_at: new Date(ms).toISOString(),
          })
          .eq("id", cm.id);
      }

      if (newStatus === "failed") {
        await supabase
          .from("campaign_messages")
          .update({
            status: "failed",
            error: errorText?.slice(0, 1000) ?? null,
          })
          .eq("id", cm.id);
      }

      if (newStatus === "sent") {
        await supabase
          .from("campaign_messages")
          .update({ status: "sent" })
          .eq("id", cm.id);
      }

      await recomputeCampaignCounters(cm.campaign_id);
    } catch (err) {
      log("STATUS_FATAL", err);
    }
  }
}

/* =====================================================================================
   SUB-ORG RESOLUTION (UNCHANGED)
===================================================================================== */
async function getGeneralSubOrgId(orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from("sub_organizations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", "general")
    .maybeSingle();

  return data?.id ?? null;
}

async function classifySubOrgSlugFromText(text: string): Promise<string> {
  if (!openai) return "general";
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Classify message into: sales, service, finance, accessories, general.",
        },
        { role: "user", content: text },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    const allowed = ["sales", "service", "finance", "accessories", "general"];
    return allowed.includes(raw) ? raw : "general";
  } catch {
    return "general";
  }
}

async function resolveSubOrganizationId(
  organizationId: string,
  fixedSubOrgId: string | null,
  text: string | null,
): Promise<string | null> {
  if (fixedSubOrgId) return fixedSubOrgId;

  if (text) {
    const slug = await classifySubOrgSlugFromText(text);

    const { data } = await supabase
      .from("sub_organizations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("slug", slug)
      .maybeSingle();

    if (data?.id) return data.id;
  }

  return await getGeneralSubOrgId(organizationId);
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */
serve(async (req: Request) => {
  try {
    if (req.method === "GET") return verifyWebhook(req);
    if (req.method !== "POST") {
      return new Response("Not allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    log("RAW_BODY", body);

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages ?? [];
    const statuses = value?.statuses ?? [];

    /* ------------------ STATUS ONLY ------------------ */
    if (statuses.length > 0) {
      await handleStatuses(statuses);
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    /* ------------------ INBOUND MESSAGE ------------------ */
    const waMessage = messages[0];
    const contactInfo = value.contacts?.[0];
    const phoneNumberId = value.metadata?.phone_number_id;

    const { data: waSettings } = await supabase
      .from("whatsapp_settings")
      .select("organization_id, api_token, sub_organization_id")
      .eq("whatsapp_phone_id", phoneNumberId)
      .maybeSingle();

    const organizationId = waSettings.organization_id;
    const apiToken = waSettings.api_token;
    const waSettingsSubOrgId = waSettings.sub_organization_id ?? null;

    /* Extract text */
    const type = waMessage.type || "text";
    let text = null;

    if (type === "text") text = waMessage.text?.body ?? null;
    if (type === "button") text = waMessage.button?.text ?? null;
    if (type === "interactive")
      text =
        waMessage.interactive?.button_reply?.title ??
        waMessage.interactive?.list_reply?.title ??
        null;
    if (type === "image") text = waMessage.image?.caption ?? "Customer sent an image";
    if (type === "video") text = waMessage.video?.caption ?? "Customer sent a video";
    if (type === "audio") text = "Customer sent audio";
    if (type === "voice") text = "Customer sent voice";
    if (type === "sticker") text = "Customer sent sticker";
    if (type === "document")
      text =
        waMessage.document?.caption ??
        waMessage.document?.filename ??
        "Customer sent document";

    /* ------------------ Resolve sub-organization ------------------ */
    const subOrganizationId = await resolveSubOrganizationId(
      organizationId,
      waSettingsSubOrgId,
      text,
    );

    /* ------------------ CONTACT UPSERT ------------------ */
    const waNumber = contactInfo?.wa_id || waMessage.from;
    const name = contactInfo?.profile?.name ?? `User-${waNumber.slice(-4)}`;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("phone", waNumber)
      .maybeSingle();

    let contactId: string;

    if (!existingContact) {
      const { data: inserted } = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          phone: waNumber,
          name,
        })
        .select()
        .single();
      contactId = inserted.id;
    } else {
      contactId = existingContact.id;
      if (name && existingContact.name !== name) {
        await supabase.from("contacts").update({ name }).eq("id", contactId);
      }
    }

    /* =====================================================================================
       CONVERSATION HANDLING (AUTO-ASSIGNMENT ADDED)
    ====================================================================================== */
    let convQuery = supabase
      .from("conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("channel", "whatsapp");

    if (subOrganizationId) {
      convQuery = convQuery.eq("sub_organization_id", subOrganizationId);
    } else {
      convQuery = convQuery.is("sub_organization_id", null);
    }

    const { data: existingConv } = await convQuery
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;

    if (!existingConv) {
      // >>> NEW: Auto-assign agent for NEW conversations
      const autoAssignedUserId = await autoAssignConversationAgent(subOrganizationId);

      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          channel: "whatsapp",
          ai_enabled: true,
          sub_organization_id: subOrganizationId,
          last_message_at: new Date().toISOString(),
          assigned_to: autoAssignedUserId, // >>> NEW
        })
        .select()
        .single();

      conversationId = newConv.id;
    } else {
      conversationId = existingConv.id;

      // >>> NEW: Auto-assign if existing conversation has no agent
      if (!existingConv.assigned_to) {
        const autoAssignedUserId = await autoAssignConversationAgent(subOrganizationId);

        if (autoAssignedUserId) {
          await supabase
            .from("conversations")
            .update({
              assigned_to: autoAssignedUserId,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", conversationId);
        } else {
          await supabase
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId);
        }
      } else {
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);
      }
    }

    /* ------------------ Store message ------------------ */
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "customer",
      message_type: type,
      text,
      media_url: null,
      channel: "whatsapp",
      sub_organization_id: subOrganizationId,
    });

    /* ------------------ AI Handler ------------------ */
    await fetch(`${PROJECT_URL}/functions/v1/ai-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        user_message: text ?? "",
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    log("FATAL_ERROR", err);
    return new Response("Internal Error", { status: 500 });
  }
});
