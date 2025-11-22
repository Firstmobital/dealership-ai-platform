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
   CAMPAIGN COUNTERS
===================================================================================== */
async function recomputeCampaignCounters(campaignId: string) {
  try {
    const { count: sentCount, error: sentErr } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "delivered"]);

    const { count: failedCount, error: failErr } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");

    const safeSent = sentCount ?? 0;
    const safeFailed = failedCount ?? 0;

    await supabase
      .from("campaigns")
      .update({
        sent_count: safeSent,
        failed_count: safeFailed,
      })
      .eq("id", campaignId);

    if (sentErr) log("COUNTER_SENT_ERR", sentErr);
    if (failErr) log("COUNTER_FAIL_ERR", failErr);
  } catch (e) {
    log("COUNTER_FATAL", e);
  }
}

/* =====================================================================================
   HANDLE STATUS UPDATES (DELIVERED / FAILED etc.)
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

      if (!newStatus) continue;

      const updates: Record<string, any> = { status: newStatus };

      if (newStatus === "delivered" && ts) {
        const ms = Number(ts) * 1000;
        if (!Number.isNaN(ms)) updates.delivered_at = new Date(ms).toISOString();
      }

      if (newStatus === "failed" && errorText) {
        updates.error = errorText.slice(0, 1000);
      }

      await supabase
        .from("campaign_messages")
        .update(updates)
        .eq("id", cm.id);

      await recomputeCampaignCounters(cm.campaign_id);
    } catch (err) {
      log("STATUS_FATAL", err);
    }
  }
}

/* =====================================================================================
   HELPER: get default "general" sub_org for an org
===================================================================================== */
async function getGeneralSubOrgId(organizationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("sub_organizations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", "general")
    .maybeSingle();

  if (error) log("GET_GENERAL_SUBORG_ERR", error);
  return data?.id ?? null;
}

/* =====================================================================================
   HELPER: classify text into a sub_org slug (sales/service/finance/accessories/general)
===================================================================================== */
async function classifySubOrgSlugFromText(text: string): Promise<string> {
  if (!openai) {
    return "general";
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a classifier for an automotive dealership. " +
            "Classify the user's message into exactly ONE of these buckets: " +
            "sales, service, finance, accessories, general. " +
            "Reply with ONLY the single word, no explanation.",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    const allowed = ["sales", "service", "finance", "accessories", "general"];
    if (allowed.includes(raw)) return raw as (typeof allowed)[number];
    return "general";
  } catch (err) {
    log("CLASSIFIER_ERROR", err);
    return "general";
  }
}

/* =====================================================================================
   HELPER: resolve sub_organization_id using Option D rules
===================================================================================== */
async function resolveSubOrganizationId(
  organizationId: string,
  whatsappSettingsSubOrgId: string | null,
  text: string | null,
): Promise<string | null> {
  // 1) If WhatsApp settings is tied to a specific sub-org → use that
  if (whatsappSettingsSubOrgId) {
    return whatsappSettingsSubOrgId;
  }

  // 2) If we have text + OpenAI → classify into a sub-org slug
  if (text && text.trim().length > 0) {
    const slug = await classifySubOrgSlugFromText(text);

    const { data, error } = await supabase
      .from("sub_organizations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      log("RESOLVE_SUBORG_LOOKUP_ERR", { slug, error });
    }

    if (data?.id) {
      return data.id;
    }
  }

  // 3) Fallback: "general" sub-org
  return await getGeneralSubOrgId(organizationId);
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */
serve(async (req: Request) => {
  try {
    /* ------------------------------------------------------------------ */
    /* GET = Verify webhook                                               */
    /* ------------------------------------------------------------------ */
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

    const hasMessages = messages.length > 0;
    const hasStatuses = statuses.length > 0;

    /* ------------------------------------------------------------------ */
    /* 1) STATUS UPDATES ONLY                                             */
    /* ------------------------------------------------------------------ */
    if (hasStatuses) {
      log("STATUSES", statuses);
      await handleStatuses(statuses);
    }

    if (!hasMessages) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    /* ------------------------------------------------------------------ */
    /* 2) INBOUND MESSAGE FLOW                                            */
    /* ------------------------------------------------------------------ */
    const waMessage = messages[0];
    const contactInfo = value.contacts?.[0];

    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) {
      log("ERROR_NO_PHONEID", value);
      return new Response("Missing phone_number_id", { status: 400 });
    }

    /* FIND ORG BY PHONE ID */
    const { data: waSettings } = await supabase
      .from("whatsapp_settings")
      .select("id, organization_id, api_token, sub_organization_id")
      .eq("whatsapp_phone_id", phoneNumberId)
      .maybeSingle();

    if (!waSettings) {
      log("ERROR_NO_SETTINGS", { phoneNumberId });
      return new Response("Unknown phone_number_id", { status: 400 });
    }

    const organizationId: string = waSettings.organization_id;
    const apiToken: string = waSettings.api_token;
    const waSettingsSubOrgId: string | null = waSettings.sub_organization_id ?? null;

    /* ------------------------------------------------------------------ */
    /* EXTRACT MESSAGE TYPE + TEXT                                        */
    /* ------------------------------------------------------------------ */
    const messageType = waMessage.type || "text";
    let text: string | null = null;

    if (messageType === "text") text = waMessage.text?.body ?? null;
    if (messageType === "button") text = waMessage.button?.text ?? null;
    if (messageType === "interactive") {
      const it = waMessage.interactive;
      text = it?.button_reply?.title ?? it?.list_reply?.title ?? null;
    }
    if (messageType === "image") text = waMessage.image?.caption ?? "Customer sent an image";
    if (messageType === "video") text = waMessage.video?.caption ?? "Customer sent a video";
    if (messageType === "audio") text = "Customer sent an audio clip";
    if (messageType === "voice") text = "Customer sent a voice note";
    if (messageType === "sticker") text = "Customer sent a sticker";
    if (messageType === "document") {
      text =
        waMessage.document?.caption ??
        waMessage.document?.filename ??
        "Customer sent a document";
    }

    /* ------------------------------------------------------------------ */
    /* RESOLVE SUB-ORGANIZATION (Option D)                                */
    /* ------------------------------------------------------------------ */
    const subOrganizationId =
      await resolveSubOrganizationId(organizationId, waSettingsSubOrgId, text);

    log("RESOLVED_SUBORG", { organizationId, subOrganizationId });

    /* ------------------------------------------------------------------ */
    /* CONTACT UPSERT                                                     */
    /* ------------------------------------------------------------------ */
    const waNumber = contactInfo?.wa_id || waMessage.from;
    const waName = contactInfo?.profile?.name || `User-${waNumber.slice(-4)}`;

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
          name: waName,
        })
        .select()
        .single();
      contactId = inserted.id;
    } else {
      contactId = existingContact.id;
      if (waName && existingContact.name !== waName) {
        await supabase
          .from("contacts")
          .update({ name: waName })
          .eq("id", contactId);
      }
    }

    /* ------------------------------------------------------------------ */
    /* CONVERSATION UPSERT (per org + sub-org + contact + channel)        */
    /* ------------------------------------------------------------------ */
    let convQuery = supabase
      .from("conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("channel", "whatsapp")
      .order("last_message_at", { ascending: false })
      .limit(1);

    if (subOrganizationId) {
      convQuery = convQuery.eq("sub_organization_id", subOrganizationId);
    } else {
      convQuery = convQuery.is("sub_organization_id", null);
    }

    const { data: existingConv } = await convQuery.maybeSingle();

    let conversationId: string;

    if (!existingConv) {
      const { data: insertedConv } = await supabase
        .from("conversations")
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          ai_enabled: true,
          channel: "whatsapp",
          last_message_at: new Date().toISOString(),
          sub_organization_id: subOrganizationId,
        })
        .select()
        .single();
      conversationId = insertedConv.id;
    } else {
      conversationId = existingConv.id;
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }

    /* ------------------------------------------------------------------ */
    /* MEDIA PROCESSING (unchanged logic, but we attach sub_organization) */
    /* ------------------------------------------------------------------ */
    const MEDIA_TYPES = ["image", "video", "audio", "voice", "sticker", "document"];
    const isMedia = MEDIA_TYPES.includes(messageType);
    let mediaUrl: string | null = null;

    if (isMedia) {
      try {
        const mediaId =
          waMessage[messageType]?.id ??
          waMessage.document?.id ??
          waMessage.image?.id ??
          null;

        if (!mediaId) {
          log("MEDIA_NO_ID", { messageType });
        } else {
          const metaRes = await fetch(
            `https://graph.facebook.com/v20.0/${mediaId}`,
            {
              headers: { Authorization: `Bearer ${apiToken}` },
            },
          );

          const meta = await metaRes.json();
          const downloadUrl = meta.url;

          const fileRes = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${apiToken}` },
          });

          const contentType =
            fileRes.headers.get("content-type") ?? "application/octet-stream";
          const buffer = new Uint8Array(await fileRes.arrayBuffer());

          let ext = "bin";
          if (contentType.includes("image")) ext = "jpg";
          if (contentType.includes("video")) ext = "mp4";
          if (contentType.includes("audio")) ext = "mp3";
          if (contentType.includes("ogg")) ext = "ogg";
          if (contentType.includes("webp")) ext = "webp";
          if (waMessage.document?.filename) {
            ext = waMessage.document.filename.split(".").pop()!;
          }

          const path =
            `org_${organizationId}/conversation_${conversationId}/` +
            `${messageType}_${mediaId}.${ext}`;

          const { data: uploaded, error: uploadErr } = await supabase.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .upload(path, buffer, {
              contentType,
              upsert: true,
            });

          if (uploadErr) log("MEDIA_UPLOAD_ERR", uploadErr);

          if (uploaded) {
            const { data: urlData } = supabase.storage
              .from(WHATSAPP_MEDIA_BUCKET)
              .getPublicUrl(uploaded.path);

            mediaUrl = urlData.publicUrl;
          }
        }
      } catch (err) {
        log("MEDIA_PROCESS_ERROR", err);
      }
    }

    /* ------------------------------------------------------------------ */
    /* INSERT INBOUND MESSAGE INTO DB (sender = customer)                 */
    /* ------------------------------------------------------------------ */
    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "customer",
      message_type: messageType,
      text,
      media_url: mediaUrl,
      channel: "whatsapp",
      sub_organization_id: subOrganizationId,
    });

    if (msgErr) log("MESSAGE_STORE_ERROR", msgErr);

    /* ------------------------------------------------------------------ */
    /* CALL AI HANDLER                                                    */
    /* ------------------------------------------------------------------ */
    const aiPayload = {
      conversation_id: conversationId,
      user_message:
        text ??
        (messageType === "image"
          ? "Customer sent an image"
          : messageType === "video"
          ? "Customer sent a video"
          : messageType === "audio" || messageType === "voice"
          ? "Customer sent an audio clip"
          : messageType === "sticker"
          ? "Customer sent a sticker"
          : "Customer sent a document"),
    };

    log("AI_HANDLER_CALL", { ...aiPayload, sub_organization_id: subOrganizationId });

    await fetch(`${PROJECT_URL}/functions/v1/ai-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(aiPayload),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    log("FATAL_ERROR", err);
    return new Response("Internal Error", { status: 500 });
  }
});
