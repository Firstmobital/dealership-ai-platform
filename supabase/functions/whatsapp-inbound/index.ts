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
  fn: () => Promise<{ data: T | null; error: any }>
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
  init?: RequestInit
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
  logger: ReturnType<typeof createLogger>
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
   AUTO-ASSIGNMENT (Stage 5D)
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
   STATUS HANDLER
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

      let newStatus: "sent" | "delivered" | "failed" | null = null;

      if (waStatus === "sent") newStatus = "sent";
      else if (waStatus === "delivered" || waStatus === "read")
        newStatus = "delivered";
      else if (waStatus === "failed") newStatus = "failed";

      if (newStatus === "delivered" && ts) {
        const ms = Number(ts) * 1000;
        const { error } = await supabase
          .from("campaign_messages")
          .update({
            status: "delivered",
            delivered_at: new Date(ms).toISOString(),
          })
          .eq("id", cm.id);
        if (error) logger.error("STATUS_UPDATE_DELIVERED_ERROR", { error });
      }

      if (newStatus === "failed") {
        const { error } = await supabase
          .from("campaign_messages")
          .update({
            status: "failed",
            error: errorText?.slice(0, 1000) ?? null,
          })
          .eq("id", cm.id);
        if (error) logger.error("STATUS_UPDATE_FAILED_ERROR", { error });
      }

      if (newStatus === "sent") {
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
  // If WA settings are already scoped to a specific sub-org, use that.
  if (fixedSubOrgId) return fixedSubOrgId;

  // Else try classification by message text
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

  // Fallback to "general" division
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
    // Metadata fetch
    const meta = await safeFetchJson(
      logger,
      "wa-media-metadata",
      `${WHATSAPP_API_BASE_URL}/${mediaId}?access_token=${apiToken}`,
    );
    if (!meta.ok || !meta.json) {
      return { mediaUrl: null, mimeType: null };
    }

    const url = meta.json.url as string | undefined;
    const mimeType = meta.json.mime_type as string | undefined;

    if (!url) {
      logger.warn("MEDIA_META_MISSING_URL", { mediaId });
      return { mediaUrl: null, mimeType: null };
    }

    // Actual file download
    let fileRes: Response;
    try {
      fileRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });
    } catch (err) {
      logger.error("MEDIA_DOWNLOAD_FATAL", { error: err });
      return { mediaUrl: null, mimeType: mimeType ?? null };
    }

    if (!fileRes.ok) {
      logger.error("MEDIA_DOWNLOAD_ERROR", {
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
      logger.error("MEDIA_UPLOAD_ERROR", { error: uploadError });
      return { mediaUrl: null, mimeType: mimeType ?? null };
    }

    const { data: publicUrlData } = supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .getPublicUrl(path);

    const publicUrl = publicUrlData?.publicUrl ?? null;
    return { mediaUrl: publicUrl, mimeType: mimeType ?? null };
  } catch (err) {
    logger.error("MEDIA_FATAL_ERROR", { error: err });
    return { mediaUrl: null, mimeType: null };
  }
}

/* =====================================================================================
   PROCESS SINGLE INBOUND MESSAGE
===================================================================================== */
async function processInboundMessage(
  waMessage: any,
  value: any,
  logger: ReturnType<typeof createLogger>,
) {
  const statuses = value?.statuses ?? [];
  // status handling already done at top-level; ignore here

  const waMessageId: string | undefined = waMessage.id;
  const contactInfo = value.contacts?.[0];
  const phoneNumberId = value.metadata?.phone_number_id;

  if (!phoneNumberId) {
    logger.warn("MISSING_PHONE_NUMBER_ID", { valueExists: !!value });
    return {
      status: 400 as const,
      body: { error: "No phone_number_id" },
    };
  }

  /* ------------------ IDEMPOTENCY CHECK ------------------ */
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
      return {
        status: 200 as const,
        body: { success: true, duplicate: true },
      };
    }
  }

  /* =================================================================================
     RESOLVE WHATSAPP SETTINGS (HYBRID)
  ================================================================================== */
  const waSubSettings = await safeSupabase<{
    organization_id: string;
    api_token: string | null;
    sub_organization_id: string | null;
    is_active: boolean | null;
  }>(
    "whatsapp_settings.sub_scoped",
    logger,
    () =>
      supabase
        .from("whatsapp_settings")
        .select("organization_id, api_token, sub_organization_id, is_active")
        .eq("whatsapp_phone_id", phoneNumberId)
        .not("sub_organization_id", "is", null)
        .maybeSingle(),
  );

  let waSettings:
    | {
        organization_id: string;
        api_token: string | null;
        sub_organization_id: string | null;
        is_active?: boolean | null;
      }
    | null = null;

  if (waSubSettings && waSubSettings.is_active !== false) {
    waSettings = {
      organization_id: waSubSettings.organization_id,
      api_token: waSubSettings.api_token,
      sub_organization_id: waSubSettings.sub_organization_id ?? null,
      is_active: waSubSettings.is_active ?? true,
    };
  }

  if (!waSettings) {
    const waOrgSettings = await safeSupabase<{
      organization_id: string;
      api_token: string | null;
      sub_organization_id: string | null;
      is_active: boolean | null;
    }>(
      "whatsapp_settings.org_scoped",
      logger,
      () =>
        supabase
          .from("whatsapp_settings")
          .select("organization_id, api_token, sub_organization_id, is_active")
          .eq("whatsapp_phone_id", phoneNumberId)
          .is("sub_organization_id", null)
          .maybeSingle(),
    );

    if (waOrgSettings && waOrgSettings.is_active !== false) {
      waSettings = {
        organization_id: waOrgSettings.organization_id,
        api_token: waOrgSettings.api_token,
        sub_organization_id: waOrgSettings.sub_organization_id ?? null,
        is_active: waOrgSettings.is_active ?? true,
      };
    }
  }

  if (!waSettings) {
    logger.warn("WA_SETTINGS_NOT_FOUND", { phoneNumberId });
    return {
      status: 400 as const,
      body: {
        error: "No active WhatsApp settings for this phone_number_id",
      },
    };
  }

  const organizationId = waSettings.organization_id as string;
  const apiToken = waSettings.api_token as string | null;
  const waSettingsSubOrgId = (waSettings.sub_organization_id ??
    null) as string | null;

  const scopedLogger = logger.with({ organization_id: organizationId });

  /* ------------------ Extract type + text + potential media id ------------------ */
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

  if (text && text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
  }

  /* ------------------ Resolve final sub-organization ------------------ */
  const subOrganizationId = await resolveSubOrganizationId(
    organizationId,
    waSettingsSubOrgId,
    text,
    scopedLogger,
  );

  const convLogger = scopedLogger.with({ sub_organization_id: subOrganizationId });

  /* ------------------ CONTACT UPSERT ------------------ */
  const waNumber = contactInfo?.wa_id || waMessage.from;
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
          .insert({
            organization_id: organizationId,
            phone: waNumber,
            name,
          })
          .select()
          .single(),
    );

    if (!inserted) {
      return {
        status: 500 as const,
        body: { error: "Failed to create contact" },
      };
    }

    contactId = inserted.id;
  } else {
    contactId = existingContact.id;
    if (name && existingContact.name !== name) {
      const { error } = await supabase
        .from("contacts")
        .update({ name })
        .eq("id", contactId);
      if (error) convLogger.error("CONTACT_UPDATE_NAME_ERROR", { error });
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
    const autoAssignedUserId = await autoAssignConversationAgent(
      subOrganizationId,
      convLogger,
    );

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

    if (!newConv) {
      return {
        status: 500 as const,
        body: { error: "Failed to create conversation" },
      };
    }

    conversationId = newConv.id;
  } else {
    conversationId = existingConv.id;

    if (!existingConv.assigned_to) {
      const autoAssignedUserId = await autoAssignConversationAgent(
        subOrganizationId,
        convLogger,
      );

      if (autoAssignedUserId) {
        const { error } = await supabase
          .from("conversations")
          .update({
            assigned_to: autoAssignedUserId,
            last_message_at: new Date().toISOString(),
            whatsapp_user_phone: waNumber,
          })
          .eq("id", conversationId);
        if (error)
          convLogger.error("CONV_UPDATE_ASSIGN_ERROR", { error, conversationId });
      } else {
        const { error } = await supabase
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            whatsapp_user_phone: waNumber,
          })
          .eq("id", conversationId);
        if (error)
          convLogger.error("CONV_UPDATE_ERROR", { error, conversationId });
      }
    } else {
      const { error } = await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          whatsapp_user_phone: waNumber,
        })
        .eq("id", conversationId);
      if (error)
        convLogger.error("CONV_UPDATE_ERROR", { error, conversationId });
    }
  }

  const msgLogger = convLogger.with({ conversation_id: conversationId });

  /* ------------------ MEDIA HANDLING ------------------ */
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

  /* ------------------ Store message ------------------ */
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

  if (insertMsgError) {
    msgLogger.error("MESSAGE_INSERT_ERROR", { error: insertMsgError });
  }

  /* ------------------ AI Handler ------------------ */
  // For non-text, send the best available description.
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
    msgLogger.error("AI_HANDLER_CALL_FAILED", {
      status: aiRes.status,
      body: aiRes.json,
    });
  }

  return {
    status: 200 as const,
    body: { success: true },
  };
}

/* =====================================================================================
   MAIN HANDLER
===================================================================================== */
serve(async (req: Request): Promise<Response> => {
  const request_id = crypto.randomUUID();
  const baseLogger = createLogger({ request_id });

  try {
    if (req.method === "GET") return verifyWebhook(req, request_id);

    if (req.method !== "POST") {
      baseLogger.warn("INVALID_METHOD", { method: req.method });
      return new Response(
        JSON.stringify({
          error: "Not allowed",
          error_code: "METHOD_NOT_ALLOWED",
          request_id,
        }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json().catch(() => null);
    baseLogger.debug("RAW_BODY", { hasBody: !!body });

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages ?? [];
    const statuses = value?.statuses ?? [];

    // Handle statuses (delivery / read / failed) first
    if (statuses.length > 0) {
      await handleStatuses(statuses, baseLogger);
    }

    if (messages.length === 0) {
      baseLogger.info("NO_MESSAGES_IN_WEBHOOK");
      return new Response(
        JSON.stringify({ ok: true, request_id }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Process all messages in this webhook batch
    for (const msg of messages) {
      await processInboundMessage(msg, value, baseLogger);
    }

    return new Response(
      JSON.stringify({ success: true, request_id }),
      { headers: { "Content-Type": "application/json" } },
    );
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

