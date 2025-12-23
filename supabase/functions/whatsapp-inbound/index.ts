// supabase/functions/whatsapp-inbound/index.ts
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
  Deno.env.get("WHATSAPP_API_BASE_URL") ?? "https://graph.facebook.com/v20.0";

const DEBUG = Deno.env.get("DEBUG") === "true";
const MAX_TEXT_LENGTH = 4000;

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  console.error("[whatsapp-inbound] Missing required env vars", {
    hasProjectUrl: !!PROJECT_URL,
    hasServiceRoleKey: !!SERVICE_ROLE_KEY,
  });
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* =====================================================================================
   STRUCTURED LOGGING
===================================================================================== */

type LogContext = {
  request_id: string;
  conversation_id?: string | null;
  organization_id?: string | null;
  sub_organization_id?: string | null;
};

function createLogger(ctx: LogContext) {
  const base = {
    request_id: ctx.request_id,
    conversation_id: ctx.conversation_id ?? null,
    organization_id: ctx.organization_id ?? null,
    sub_organization_id: ctx.sub_organization_id ?? null,
  };

  return {
    info(message: string, extra: Record<string, any> = {}) {
      console.log(JSON.stringify({ level: "info", message, ...base, ...extra }));
    },
    warn(message: string, extra: Record<string, any> = {}) {
      console.warn(JSON.stringify({ level: "warn", message, ...base, ...extra }));
    },
    error(message: string, extra: Record<string, any> = {}) {
      console.error(JSON.stringify({ level: "error", message, ...base, ...extra }));
    },
    debug(message: string, extra: Record<string, any> = {}) {
      if (!DEBUG) return;
      console.log(JSON.stringify({ level: "debug", message, ...base, ...extra }));
    },
    with(extraCtx: Partial<LogContext>) {
      return createLogger({ ...ctx, ...extraCtx });
    },
  };
}

/* =====================================================================================
   SAFE HELPERS
===================================================================================== */

async function safeSupabase<T>(
  opName: string,
  logger: ReturnType<typeof createLogger>,
  fn: () => Promise<{ data: T | null; error: any }>,
): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      logger.error(`[supabase] ${opName} error`, { error });
      return null;
    }
    return data;
  } catch (err) {
    logger.error(`[supabase] ${opName} fatal`, { error: err });
    return null;
  }
}

async function safeFetchJson(
  logger: ReturnType<typeof createLogger>,
  label: string,
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: any | null }> {
  try {
    const res = await fetch(url, init);
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      logger.error(`[fetch] ${label} non-OK`, { status: res.status, body: json });
      return { ok: false, status: res.status, json };
    }

    logger.debug(`[fetch] ${label} ok`, { status: res.status });
    return { ok: true, status: res.status, json };
  } catch (err) {
    logger.error(`[fetch] ${label} fatal`, { error: err });
    return { ok: false, status: 0, json: null };
  }
}

async function safeOpenAIClassify(
  text: string,
  logger: ReturnType<typeof createLogger>,
): Promise<string> {
  if (!openai) return "general";
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Classify message into EXACTLY one of: sales, service, finance, accessories, general. Return only that word.",
        },
        { role: "user", content: text },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    const allowed = ["sales", "service", "finance", "accessories", "general"];
    if (allowed.includes(raw)) return raw;

    logger.debug("[openai] classification out-of-range", { raw });
    return "general";
  } catch (err) {
    logger.error("[openai] classification error", { error: err });
    return "general";
  }
}

/* =====================================================================================
   CONVERSATION INTENT TAGGING (Phase 1)
===================================================================================== */

async function updateConversationIntentIfNeeded(
  conversationId: string,
  text: string | null,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    if (!text) return;

    const conv = await safeSupabase<{
      intent: string | null;
      intent_source: string | null;
      intent_update_count: number | null;
    }>(
      "conversations.intent_read",
      logger,
      () =>
        supabase
          .from("conversations")
          .select("intent, intent_source, intent_update_count")
          .eq("id", conversationId)
          .maybeSingle(),
    );

    if (!conv) return;

    const count = conv.intent_update_count ?? 0;
    const canUpdate = !conv.intent || (conv.intent_source === "ai" && count < 2);
    if (!canUpdate) return;

    const intent = await safeOpenAIClassify(text, logger);

    const updated = await safeSupabase<{ id: string }>(
      "conversations.intent_update",
      logger,
      () =>
        supabase
          .from("conversations")
          .update({
            intent,
            intent_source: "ai",
            intent_update_count: count + 1,
          })
          .eq("id", conversationId)
          .select("id")
          .maybeSingle(),
    );

    if (updated) {
      logger.info("CONVERSATION_INTENT_UPDATED", {
        intent,
        intent_update_count: count + 1,
      });
    }
  } catch (err) {
    logger.error("CONVERSATION_INTENT_FATAL", { error: String(err) });
  }
}


/* =====================================================================================
   PHONE NORMALIZATION
===================================================================================== */
// We store & match phones consistently as: 91XXXXXXXXXX (digits only)
function normalizeWaPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits; // fallback (still digits-only)
}

/* =====================================================================================
   VERIFY TOKEN HANDLER (GET)
===================================================================================== */
async function verifyWebhook(req: Request, request_id: string): Promise<Response> {
  const logger = createLogger({ request_id });
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  logger.debug("VERIFY_REQUEST", { mode, tokenPresent: !!token });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logger.info("VERIFY_SUCCESS");
    return new Response(challenge ?? "", { status: 200 });
  }

  logger.warn("VERIFY_FAILED", { mode, token });
  return new Response("Invalid verify token", { status: 403 });
}

/* =====================================================================================
   AUTO-ASSIGNMENT
===================================================================================== */
async function autoAssignConversationAgent(
  subOrganizationId: string | null,
  logger: ReturnType<typeof createLogger>,
): Promise<string | null> {
  if (!subOrganizationId) return null;

  const data = await safeSupabase<{ user_id: string }[]>(
    "sub_organization_users.auto_assign",
    logger,
    () =>
      supabase
        .from("sub_organization_users")
        .select("user_id")
        .eq("sub_organization_id", subOrganizationId)
        .order("created_at", { ascending: true })
        .limit(1),
  );

  if (!data?.length) return null;
  return data[0].user_id ?? null;
}

/* =====================================================================================
   CAMPAIGN COUNTERS
===================================================================================== */
async function recomputeCampaignCounters(
  campaignId: string,
  logger: ReturnType<typeof createLogger>,
) {
  try {
    const { count: sentCount, error: sentError } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "delivered"]);

    if (sentError) logger.error("COUNTER_SENT_ERROR", { error: sentError });

    const { count: failedCount, error: failedError } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");

    if (failedError) logger.error("COUNTER_FAILED_ERROR", { error: failedError });

    const { error: updError } = await supabase
      .from("campaigns")
      .update({
        sent_count: sentCount ?? 0,
        failed_count: failedCount ?? 0,
      })
      .eq("id", campaignId);

    if (updError) logger.error("COUNTER_UPDATE_ERROR", { error: updError });
  } catch (e) {
    logger.error("COUNTER_FATAL", { error: e });
  }
}

/* =====================================================================================
   STATUS HANDLER (sent/delivered/read/failed)
===================================================================================== */
async function handleStatuses(statuses: any[], logger: ReturnType<typeof createLogger>) {
  for (const st of statuses) {
    try {
      const waMessageId = st.id;
      const waStatus = st.status;
      const ts = st.timestamp;
      const errorText = st.errors?.[0]?.message;

      if (!waMessageId || !waStatus) continue;

      const cm = await safeSupabase<{
        id: string;
        campaign_id: string;
        status: string;
      }>(
        "campaign_messages.by_whatsapp_message_id",
        logger,
        () =>
          supabase
            .from("campaign_messages")
            .select("id, campaign_id, status")
            .eq("whatsapp_message_id", waMessageId)
            .maybeSingle(),
      );

      if (!cm) continue;

      if ((waStatus === "delivered" || waStatus === "read") && ts) {
        const ms = Number(ts) * 1000;
        const { error } = await supabase
          .from("campaign_messages")
          .update({
            status: "delivered",
            delivered_at: new Date(ms).toISOString(),
          })
          .eq("id", cm.id);
        if (error) logger.error("STATUS_UPDATE_DELIVERED_ERROR", { error });
      } else if (waStatus === "failed") {
        const { error } = await supabase
          .from("campaign_messages")
          .update({
            status: "failed",
            error: errorText?.slice(0, 1000) ?? null,
          })
          .eq("id", cm.id);
        if (error) logger.error("STATUS_UPDATE_FAILED_ERROR", { error });
      } else if (waStatus === "sent") {
        const { error } = await supabase
          .from("campaign_messages")
          .update({ status: "sent" })
          .eq("id", cm.id);
        if (error) logger.error("STATUS_UPDATE_SENT_ERROR", { error });
      }

      await recomputeCampaignCounters(cm.campaign_id, logger);
    } catch (err) {
      logger.error("STATUS_FATAL", { error: err });
    }
  }
}

/* =====================================================================================
   SUB-ORG RESOLUTION
===================================================================================== */
async function getGeneralSubOrgId(
  orgId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<string | null> {
  const data = await safeSupabase<{ id: string }>(
    "sub_organizations.general",
    logger,
    () =>
      supabase
        .from("sub_organizations")
        .select("id")
        .eq("organization_id", orgId)
        .eq("slug", "general")
        .maybeSingle(),
  );
  return data?.id ?? null;
}

async function resolveSubOrganizationId(
  organizationId: string,
  fixedSubOrgId: string | null,
  text: string | null,
  logger: ReturnType<typeof createLogger>,
): Promise<string | null> {
  if (fixedSubOrgId) return fixedSubOrgId;

  if (text) {
    const slug = await safeOpenAIClassify(text, logger);

    const data = await safeSupabase<{ id: string }>(
      "sub_organizations.by_slug",
      logger,
      () =>
        supabase
          .from("sub_organizations")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("slug", slug)
          .maybeSingle(),
    );

    if (data?.id) return data.id;
  }

  return await getGeneralSubOrgId(organizationId, logger);
}

/* =====================================================================================
   MEDIA DOWNLOAD + STORAGE
===================================================================================== */
async function downloadAndStoreMedia(
  mediaId: string,
  apiToken: string,
  orgId: string,
  conversationId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<{ mediaUrl: string | null; mimeType: string | null }> {
  try {
    const meta = await safeFetchJson(
      logger,
      "wa-media-metadata",
      `${WHATSAPP_API_BASE_URL}/${mediaId}?access_token=${apiToken}`,
    );
    if (!meta.ok || !meta.json) return { mediaUrl: null, mimeType: null };

    const url = meta.json.url as string | undefined;
    const mimeType = meta.json.mime_type as string | undefined;

    if (!url) {
      logger.warn("MEDIA_META_MISSING_URL", { mediaId });
      return { mediaUrl: null, mimeType: mimeType ?? null };
    }

    const fileRes = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!fileRes.ok) {
      logger.error("MEDIA_DOWNLOAD_ERROR", { status: fileRes.status });
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
      logger.error("MEDIA_UPLOAD_ERROR", { error: uploadError });
      return { mediaUrl: null, mimeType: mimeType ?? null };
    }

    const { data: publicUrlData } = supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .getPublicUrl(path);

    return { mediaUrl: publicUrlData?.publicUrl ?? null, mimeType: mimeType ?? null };
  } catch (err) {
    logger.error("MEDIA_FATAL_ERROR", { error: err });
    return { mediaUrl: null, mimeType: null };
  }
}

/* =====================================================================================
   SETTINGS RESOLUTION (prefers sub-org scoped row, else org-wide)
===================================================================================== */
type WASettings = {
  organization_id: string;
  api_token: string | null;
  sub_organization_id: string | null;
  is_active: boolean | null;
};

async function resolveWhatsAppSettings(
  phoneNumberId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<WASettings | null> {
  // fetch all active rows for that phone id, then pick:
  // 1) sub_organization_id != null
  // 2) else sub_organization_id == null
  const rows = await safeSupabase<WASettings[]>(
    "whatsapp_settings.by_phone_id",
    logger,
    () =>
      supabase
        .from("whatsapp_settings")
        .select("organization_id, api_token, sub_organization_id, is_active")
        .eq("whatsapp_phone_id", phoneNumberId)
        .neq("is_active", false),
  );

  if (!rows?.length) return null;

  const subScoped = rows.find((r) => r.sub_organization_id);
  return subScoped ?? rows[0];
}

/* =====================================================================================
   PROCESS SINGLE INBOUND MESSAGE
===================================================================================== */
async function processInboundMessage(
  waMessage: any,
  value: any,
  logger: ReturnType<typeof createLogger>,
): Promise<{ status: number; body: any }> {
  const waMessageId: string | undefined = waMessage.id;
  const contactInfo = value.contacts?.[0];

  const phoneNumberId: string | null =
    value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null;

  if (!phoneNumberId) {
    logger.error("MISSING_PHONE_NUMBER_ID", { hasValue: !!value, hasMetadata: !!value?.metadata });
    return { status: 400, body: { error: "Missing metadata.phone_number_id" } };
  }

  logger.debug("INBOUND_PHONE_NUMBER_ID", { phoneNumberId });

  // Idempotency: skip if already stored
  if (waMessageId) {
    const existingMsg = await safeSupabase<{ id: string }>(
      "messages.by_whatsapp_message_id",
      logger,
      () =>
        supabase
          .from("messages")
          .select("id")
          .eq("whatsapp_message_id", waMessageId)
          .maybeSingle(),
    );

    if (existingMsg) {
      logger.info("DUPLICATE_MESSAGE_SKIPPED", { waMessageId });
      return { status: 200, body: { success: true, duplicate: true } };
    }
  }

  const waSettings = await resolveWhatsAppSettings(phoneNumberId, logger);
  if (!waSettings) {
    logger.error("WA_SETTINGS_NOT_FOUND_FATAL", {
      phoneNumberId,
      hint: "Ensure whatsapp_settings.whatsapp_phone_id is populated and is_active=true",
    });
    return { status: 400, body: { error: "No active WhatsApp settings for this phone_number_id" } };
  }

  const organizationId = waSettings.organization_id;
  const apiToken = waSettings.api_token;
  const waSettingsSubOrgId = waSettings.sub_organization_id ?? null;

  const scopedLogger = logger.with({ organization_id: organizationId });

  // Extract type + text + media id
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

  if (text && text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);

  // Resolve sub-org
  const subOrganizationId = await resolveSubOrganizationId(
    organizationId,
    waSettingsSubOrgId,
    text,
    scopedLogger,
  );
  const convLogger = scopedLogger.with({ sub_organization_id: subOrganizationId });

  // Contact upsert
  const rawWaNumber = contactInfo?.wa_id || waMessage.from;
  const waNumber = normalizeWaPhone(rawWaNumber);

  if (!waNumber) {
    convLogger.error("MISSING_FROM_NUMBER", { rawWaNumber });
    return { status: 400, body: { error: "Missing sender number" } };
  }

  const name = contactInfo?.profile?.name ?? `User-${waNumber.slice(-4)}`;

  const existingContact = await safeSupabase<any>(
    "contacts.by_phone",
    convLogger,
    () =>
      supabase
        .from("contacts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("phone", waNumber)
        .maybeSingle(),
  );

  let contactId: string;

  if (!existingContact) {
    const inserted = await safeSupabase<any>(
      "contacts.insert",
      convLogger,
      () =>
        supabase
          .from("contacts")
          .insert({ organization_id: organizationId, phone: waNumber, name })
          .select()
          .single(),
    );

    if (!inserted) return { status: 500, body: { error: "Failed to create contact" } };
    contactId = inserted.id;
  } else {
    contactId = existingContact.id;
    if (name && existingContact.name !== name) {
      const { error } = await supabase.from("contacts").update({ name }).eq("id", contactId);
      if (error) convLogger.error("CONTACT_UPDATE_NAME_ERROR", { error });
    }
  }

  // Conversation lookup / create
  let convQuery = supabase
    .from("conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp");

  if (subOrganizationId) convQuery = convQuery.eq("sub_organization_id", subOrganizationId);
  else convQuery = convQuery.is("sub_organization_id", null);

  const existingConv = await safeSupabase<any>(
    "conversations.by_contact",
    convLogger,
    () =>
      convQuery
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
  );

  let conversationId: string;

  if (!existingConv) {
    const autoAssignedUserId = await autoAssignConversationAgent(subOrganizationId, convLogger);

    const newConv = await safeSupabase<any>(
      "conversations.insert",
      convLogger,
      () =>
        supabase
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
          .single(),
    );

    if (!newConv) return { status: 500, body: { error: "Failed to create conversation" } };
    conversationId = newConv.id;
  } else {
    conversationId = existingConv.id;

    // always bump last_message_at + store phone
    const { error } = await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        whatsapp_user_phone: waNumber,
      })
      .eq("id", conversationId);

    if (error) convLogger.error("CONV_UPDATE_ERROR", { error, conversationId });

    // assign if empty
    if (!existingConv.assigned_to) {
      const autoAssignedUserId = await autoAssignConversationAgent(subOrganizationId, convLogger);
      if (autoAssignedUserId) {
        const { error: assignErr } = await supabase
          .from("conversations")
          .update({ assigned_to: autoAssignedUserId })
          .eq("id", conversationId);
        if (assignErr) convLogger.error("CONV_UPDATE_ASSIGN_ERROR", { error: assignErr });
      }
    }
  }

  const msgLogger = convLogger.with({ conversation_id: conversationId });

  // Media
  let mediaUrl: string | null = null;
  let mimeType: string | null = null;

  if (mediaId && apiToken) {
    const stored = await downloadAndStoreMedia(
      mediaId,
      apiToken,
      organizationId,
      conversationId,
      msgLogger,
    );
    mediaUrl = stored.mediaUrl;
    mimeType = stored.mimeType;
  }

  // Store message
  const { error: insertMsgError } = await supabase.from("messages").insert({
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

  if (insertMsgError) msgLogger.error("MESSAGE_INSERT_ERROR", { error: insertMsgError });
  // Phase 1: AI intent tagging (safe, capped to avoid churn)
await updateConversationIntentIfNeeded(conversationId, text, msgLogger);


  // Link reply to campaign message (if replying to a campaign message)
  const contextMessageId: string | null =
    waMessage?.context?.id ? String(waMessage.context.id) : null;

  if (contextMessageId && waMessageId) {
    const { error: replyUpdateError } = await supabase
      .from("campaign_messages")
      .update({
        replied_at: new Date().toISOString(),
        reply_whatsapp_message_id: waMessageId,
        reply_text: text?.slice(0, 2000) ?? null,
      })
      .eq("whatsapp_message_id", contextMessageId)
      .is("replied_at", null);

    if (replyUpdateError) {
      msgLogger.error("CAMPAIGN_REPLY_LINK_ERROR", { error: replyUpdateError, contextMessageId });
    } else {
      msgLogger.info("CAMPAIGN_REPLY_LINKED", { contextMessageId, reply_whatsapp_message_id: waMessageId });
    }
  }

  // AI Handler
  const aiText = text ?? "Customer sent a non-text WhatsApp message.";
  const aiRes = await safeFetchJson(
    msgLogger,
    "ai-handler",
    `${PROJECT_URL}/functions/v1/ai-handler`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        user_message: aiText,
      }),
    },
  );

  if (!aiRes.ok) {
    msgLogger.error("AI_HANDLER_CALL_FAILED", { status: aiRes.status, body: aiRes.json });
  }

  return { status: 200, body: { success: true } };
}

/* =====================================================================================
   TEMPLATE STATUS UPDATE HANDLER
===================================================================================== */
async function handleTemplateStatusUpdate(value: any, logger: ReturnType<typeof createLogger>) {
  const templateUpdate = value?.message_template_status_update;
  if (!templateUpdate) return false;

  const { message_template_id, event, reason } = templateUpdate;

  let newStatus: "approved" | "rejected" | null = null;
  if (event === "APPROVED") newStatus = "approved";
  if (event === "REJECTED") newStatus = "rejected";

  if (newStatus && message_template_id) {
    const { error } = await supabase
      .from("whatsapp_templates")
      .update({ status: newStatus })
      .eq("meta_template_id", message_template_id);

    if (error) {
      logger.error("TEMPLATE_STATUS_UPDATE_ERROR", { message_template_id, event, error });
    } else {
      logger.info("TEMPLATE_STATUS_UPDATED", { message_template_id, status: newStatus, reason });
    }
  }

  return true;
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */
serve(async (req: Request): Promise<Response> => {
  const request_id = crypto.randomUUID();
  const baseLogger = createLogger({ request_id });

  try {
    if (req.method === "GET") return await verifyWebhook(req, request_id);

    if (req.method !== "POST") {
      baseLogger.warn("INVALID_METHOD", { method: req.method });
      return new Response(
        JSON.stringify({
          error: "Not allowed",
          error_code: "METHOD_NOT_ALLOWED",
          request_id,
        }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      baseLogger.error("INVALID_JSON_BODY");
      return new Response(JSON.stringify({ error: "Invalid JSON", request_id }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Meta can send multiple entries/changes
    const entries = Array.isArray(body.entry) ? body.entry : [];
    if (!entries.length) {
      baseLogger.info("NO_ENTRIES");
      return new Response(JSON.stringify({ ok: true, request_id }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value;

        // 1) Template status updates
        if (await handleTemplateStatusUpdate(value, baseLogger)) continue;

        const statuses = value?.statuses ?? [];
        const messages = value?.messages ?? [];

        // 2) Status updates first
        if (statuses.length > 0) await handleStatuses(statuses, baseLogger);

        // 3) Inbound messages
        if (!messages.length) {
          baseLogger.debug("NO_MESSAGES_IN_CHANGE");
          continue;
        }

        for (const msg of messages) {
          const res = await processInboundMessage(msg, value, baseLogger);
          if (res.status >= 400) {
            baseLogger.warn("MESSAGE_PROCESSING_NON_200", { status: res.status, body: res.body });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, request_id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    baseLogger.error("FATAL_ERROR", { error: String(err) });
    return new Response(
      JSON.stringify({
        error: "Internal Error",
        error_code: "INTERNAL_ERROR",
        request_id,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
