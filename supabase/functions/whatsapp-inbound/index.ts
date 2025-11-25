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
const WHATSAPP_API_BASE_URL =
  Deno.env.get("WHATSAPP_API_BASE_URL") ??
  "https://graph.facebook.com/v20.0";
const DEBUG = Deno.env.get("DEBUG") === "true";
const MAX_TEXT_LENGTH = 4000;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* =====================================================================================
   STRUCTURED LOGGING (DEBUG-GATED)
===================================================================================== */
function log(stage: string, data: any) {
  if (!DEBUG) return;
  console.log(
    `[whatsapp-inbound] ${stage}`,
    JSON.stringify(data, null, 2),
  );
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
async function autoAssignConversationAgent(
  subOrganizationId: string | null,
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
   SUB-ORG RESOLUTION
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
   MEDIA DOWNLOAD + STORAGE
===================================================================================== */

async function downloadAndStoreMedia(
  mediaId: string,
  apiToken: string,
  orgId: string,
  conversationId: string,
): Promise<{ mediaUrl: string | null; mimeType: string | null }> {
  try {
    const metaRes = await fetch(
      `${WHATSAPP_API_BASE_URL}/${mediaId}?access_token=${apiToken}`,
    );
    const metaJson: any = await metaRes.json();

    if (!metaRes.ok) {
      log("MEDIA_META_ERROR", { status: metaRes.status, body: metaJson });
      return { mediaUrl: null, mimeType: null };
    }

    const url = metaJson.url as string | undefined;
    const mimeType = metaJson.mime_type as string | undefined;

    if (!url) {
      return { mediaUrl: null, mimeType: null };
    }

    const fileRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!fileRes.ok) {
      log("MEDIA_DOWNLOAD_ERROR", {
        status: fileRes.status,
        headers: Object.fromEntries(fileRes.headers.entries()),
      });
      return { mediaUrl: null, mimeType: mimeType ?? null };
    }

    const blob = await fileRes.blob();
    const ext = mimeType?.split("/")?.[1] ?? "bin";
    const path = `${orgId}/${conversationId}/${mediaId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(path, blob, {
        contentType: mimeType ?? "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      log("MEDIA_UPLOAD_ERROR", uploadError);
      return { mediaUrl: null, mimeType: mimeType ?? null };
    }

    const { data: publicUrlData } = supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .getPublicUrl(path);

    const publicUrl = publicUrlData?.publicUrl ?? null;
    return { mediaUrl: publicUrl, mimeType: mimeType ?? null };
  } catch (err) {
    log("MEDIA_FATAL_ERROR", err);
    return { mediaUrl: null, mimeType: null };
  }
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
    log("RAW_BODY", { hasBody: !!body });

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
    const waMessageId: string | undefined = waMessage.id;
    const contactInfo = value.contacts?.[0];
    const phoneNumberId = value.metadata?.phone_number_id;

    if (!phoneNumberId) {
      log("MISSING_PHONE_NUMBER_ID", { valueExists: !!value });
      return new Response(JSON.stringify({ error: "No phone_number_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    /* ------------------ IDEMPOTENCY CHECK ------------------ */
    if (waMessageId) {
      const { data: existingMsg, error: existingMsgError } = await supabase
        .from("messages")
        .select("id")
        .eq("whatsapp_message_id", waMessageId)
        .maybeSingle();

      if (existingMsgError) {
        log("IDEMPOTENCY_CHECK_ERROR", existingMsgError);
      }

      if (existingMsg) {
        log("DUPLICATE_MESSAGE_SKIPPED", { waMessageId });
        return new Response(
          JSON.stringify({
            success: true,
            duplicate: true,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }

    const { data: waSettings, error: waSettingsError } = await supabase
      .from("whatsapp_settings")
      .select("organization_id, api_token, sub_organization_id")
      .eq("whatsapp_phone_id", phoneNumberId)
      .maybeSingle();

    if (waSettingsError) {
      log("WA_SETTINGS_ERROR", waSettingsError);
    }

    if (!waSettings) {
      log("WA_SETTINGS_NOT_FOUND", { phoneNumberId });
      return new Response(
        JSON.stringify({ error: "No WhatsApp settings for this phone_number_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const organizationId = waSettings.organization_id as string;
    const apiToken = waSettings.api_token as string | null;
    const waSettingsSubOrgId = (waSettings.sub_organization_id ??
      null) as string | null;

    /* Extract type + text + potential media id */
    const type = waMessage.type || "text";
    let text: string | null = null;
    let mediaId: string | null = null;

    if (type === "text") {
      text = waMessage.text?.body ?? null;
    } else if (type === "button") {
      text = waMessage.button?.text ?? null;
    } else if (type === "interactive") {
      text =
        waMessage.interactive?.button_reply?.title ??
        waMessage.interactive?.list_reply?.title ??
        null;
    } else if (type === "image") {
      text = waMessage.image?.caption ?? "Customer sent an image";
      mediaId = waMessage.image?.id ?? null;
    } else if (type === "video") {
      text = waMessage.video?.caption ?? "Customer sent a video";
      mediaId = waMessage.video?.id ?? null;
    } else if (type === "audio") {
      text = "Customer sent audio";
      mediaId = waMessage.audio?.id ?? null;
    } else if (type === "voice") {
      text = "Customer sent voice";
      mediaId = waMessage.audio?.id ?? null;
    } else if (type === "sticker") {
      text = "Customer sent sticker";
      mediaId = waMessage.sticker?.id ?? null;
    } else if (type === "document") {
      text =
        waMessage.document?.caption ??
        waMessage.document?.filename ??
        "Customer sent document";
      mediaId = waMessage.document?.id ?? null;
    } else {
      text = "Unsupported message type.";
    }

    // Truncate text for safety
    if (text && text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH);
    }

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
      const { data: inserted, error: insertContactError } = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          phone: waNumber,
          name,
        })
        .select()
        .single();

      if (insertContactError || !inserted) {
        log("CONTACT_INSERT_ERROR", insertContactError);
        return new Response("Failed to create contact", { status: 500 });
      }

      contactId = inserted.id;
    } else {
      contactId = existingContact.id;
      if (name && existingContact.name !== name) {
        await supabase.from("contacts").update({ name }).eq("id", contactId);
      }
    }

    /* =====================================================================================
       CONVERSATION HANDLING (AUTO-ASSIGNMENT)
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
      const autoAssignedUserId = await autoAssignConversationAgent(
        subOrganizationId,
      );

      const { data: newConv, error: newConvError } = await supabase
        .from("conversations")
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          channel: "whatsapp",
          ai_enabled: true,
          sub_organization_id: subOrganizationId,
          last_message_at: new Date().toISOString(),
          assigned_to: autoAssignedUserId,
          whatsapp_user_phone: waNumber,
        })
        .select()
        .single();

      if (newConvError || !newConv) {
        log("CONV_INSERT_ERROR", newConvError);
        return new Response("Failed to create conversation", { status: 500 });
      }

      conversationId = newConv.id;
    } else {
      conversationId = existingConv.id;

      if (!existingConv.assigned_to) {
        const autoAssignedUserId = await autoAssignConversationAgent(
          subOrganizationId,
        );

        if (autoAssignedUserId) {
          await supabase
            .from("conversations")
            .update({
              assigned_to: autoAssignedUserId,
              last_message_at: new Date().toISOString(),
              whatsapp_user_phone: waNumber,
            })
            .eq("id", conversationId);
        } else {
          await supabase
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              whatsapp_user_phone: waNumber,
            })
            .eq("id", conversationId);
        }
      } else {
        await supabase
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            whatsapp_user_phone: waNumber,
          })
          .eq("id", conversationId);
      }
    }

    /* ------------------ MEDIA HANDLING ------------------ */
    let mediaUrl: string | null = null;
    let mimeType: string | null = null;

    if (mediaId && apiToken) {
      const stored = await downloadAndStoreMedia(
        mediaId,
        apiToken,
        organizationId,
        conversationId,
      );
      mediaUrl = stored.mediaUrl;
      mimeType = stored.mimeType;
    }

    /* ------------------ Store message (aligned with schema) ------------------ */
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "customer",
      message_type: type,
      text,
      media_url: mediaUrl,
      mime_type: mimeType,
      channel: "whatsapp",
      sub_organization_id: subOrganizationId,
      whatsapp_message_id: waMessageId ?? null,
      wa_received_at: new Date().toISOString(),
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
    log("FATAL_ERROR", { error: String(err) });
    return new Response("Internal Error", { status: 500 });
  }
});

