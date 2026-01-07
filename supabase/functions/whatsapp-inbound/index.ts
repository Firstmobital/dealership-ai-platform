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
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const WHATSAPP_API_BASE_URL =
  Deno.env.get("WHATSAPP_API_BASE_URL") ?? "https://graph.facebook.com/v20.0";

const DEBUG = Deno.env.get("DEBUG") === "true";
const MAX_TEXT_LENGTH = 4000;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* =====================================================================================
   LOGGING
===================================================================================== */

type LogContext = {
  request_id: string;
  organization_id?: string | null;
  conversation_id?: string | null;
};

function createLogger(ctx: LogContext) {
  return {
    info: (m: string, e = {}) =>
      console.log(JSON.stringify({ level: "info", ...ctx, message: m, ...e })),
    warn: (m: string, e = {}) =>
      console.warn(JSON.stringify({ level: "warn", ...ctx, message: m, ...e })),
    error: (m: string, e = {}) =>
      console.error(
        JSON.stringify({ level: "error", ...ctx, message: m, ...e }),
      ),
    debug: (m: string, e = {}) =>
      DEBUG &&
      console.log(JSON.stringify({ level: "debug", ...ctx, message: m, ...e })),
    with(extra: Partial<LogContext>) {
      return createLogger({ ...ctx, ...extra });
    },
  };
}

/* =====================================================================================
   HELPERS
===================================================================================== */

function normalizeWaPhone(input?: string | null): string | null {
  if (!input) return null;
  const d = input.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.startsWith("91")) return d;
  return d || null;
}

/* =====================================================================================
   MEDIA HELPERS
===================================================================================== */

async function fetchWhatsappMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Uint8Array; mimeType: string }> {
  const metaRes = await fetch(`${WHATSAPP_API_BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to fetch media metadata`);
  }

  const meta = await metaRes.json();

  const mediaRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!mediaRes.ok) {
    throw new Error(`Failed to download media`);
  }

  const buffer = new Uint8Array(await mediaRes.arrayBuffer());
  const mimeType =
    mediaRes.headers.get("content-type") ??
    meta.mime_type ??
    "application/octet-stream";

  return { buffer, mimeType };
}

async function storeWhatsappMedia(
  organizationId: string,
  conversationId: string,
  messageId: string,
  buffer: Uint8Array,
  mimeType: string,
) {
  const ext = mimeType.split("/")[1] || "bin";
  const path = `${organizationId}/${conversationId}/${messageId}.${ext}`;

  const { error } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/* =====================================================================================
   AI HELPERS
===================================================================================== */

async function classifyIntent(text: string) {
  if (!openai) return "general";
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Classify message into EXACTLY one of: sales, service, finance, accessories, general.",
        },
        { role: "user", content: text.slice(0, MAX_TEXT_LENGTH) },
      ],
    });
    const i = r.choices[0]?.message?.content?.trim().toLowerCase();
    return ["sales", "service", "finance", "accessories"].includes(i)
      ? i
      : "general";
  } catch {
    return "general";
  }
}

async function triggerAIHandler(params: {
  conversationId: string;
  userMessage: string;
}) {
  await fetch(`${PROJECT_URL}/functions/v1/ai-handler`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      conversation_id: params.conversationId,
      user_message: params.userMessage,
      mode: "reply",
    }),
  }).catch(() => {});
}

/* =====================================================================================
   CAMPAIGN DELIVERY RECEIPTS (P1-B)
===================================================================================== */

async function processStatusReceipt(
  status: any,
  value: any,
  baseLogger: ReturnType<typeof createLogger>,
) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const settings = await supabase
    .from("whatsapp_settings")
    .select("organization_id")
    .eq("whatsapp_phone_id", phoneNumberId)
    .neq("is_active", false)
    .maybeSingle();

  if (!settings.data) return;

  const orgId = settings.data.organization_id;
  const logger = baseLogger.with({ organization_id: orgId });

  const waId = status.id;
  if (!waId) return;

  const ts = new Date(Number(status.timestamp) * 1000).toISOString();

  let patch: Record<string, any>;
  let messagePatch: Record<string, any> | null = null;

  switch (status.status) {
    case "sent":
      patch = { status: "sent", dispatched_at: ts };
      messagePatch = { whatsapp_status: "sent", sent_at: ts };
      break;
    case "delivered":
      patch = { status: "delivered", delivered_at: ts };
      messagePatch = { whatsapp_status: "delivered", delivered_at: ts };
      break;
    case "read":
      // campaign_messages enum doesn't have "read"; treat as delivered.
      patch = { status: "delivered", delivered_at: ts };
      messagePatch = { whatsapp_status: "read", read_at: ts, delivered_at: ts };
      break;
    case "failed":
      patch = {
        status: "failed",
        error: status.errors?.[0]?.title ?? "unknown",
      };
      messagePatch = { whatsapp_status: "failed" };
      break;
    default:
      return;
  }

  let updatedAny = false;

  const { data, error } = await supabase
    .from("campaign_messages")
    .update(patch)
    .eq("organization_id", orgId)
    .eq("whatsapp_message_id", waId)
    .select("id")
    .limit(50);

  if (error) {
    logger.error("[campaign] receipt update failed", { error, waId });
    return;
  }

  if (data?.length) {
    updatedAny = true;
    logger.info("[campaign] receipt updated", {
      waId,
      status: patch.status,
      updated: data.length,
    });
    // continue to also update messages table
  }

  // Update inbox messages receipts too (org-scoped via conversation)
  if (messagePatch) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("id, conversation_id")
      .eq("whatsapp_message_id", waId)
      .limit(50);

    const convIds = Array.from(
      new Set((msgRows ?? []).map((r: any) => r.conversation_id).filter(Boolean)),
    );

    if (convIds.length) {
      const { data: allowedConvs } = await supabase
        .from("conversations")
        .select("id")
        .eq("organization_id", orgId)
        .in("id", convIds);

      const allowedIds = (allowedConvs ?? []).map((c: any) => c.id);

      if (allowedIds.length) {
        const { error: mErr } = await supabase
          .from("messages")
          .update(messagePatch)
          .eq("whatsapp_message_id", waId)
          .in("conversation_id", allowedIds);

        if (!mErr) updatedAny = true;
      }
    }
  }

  if (!updatedAny) {
    // 🔒 P1-B: DEAD-LETTER unmatched receipts
    await supabase.from("campaign_delivery_receipt_failures").insert({
      organization_id: orgId,
      whatsapp_message_id: waId,
      status: patch.status,
      error_title: patch.error ?? null,
      raw_status: status ?? {},
      raw_value: value ?? {},
    });

    logger.warn("[campaign] receipt unmatched (logged)", {
      waId,
      status: patch.status,
    });
  }
}

/* =====================================================================================
   VERIFY
===================================================================================== */

async function verifyWebhook(req: Request) {
  if (!VERIFY_TOKEN) {
    return new Response("Missing WHATSAPP_VERIFY_TOKEN", { status: 500 });
  }

  const url = new URL(req.url);
  if (
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === VERIFY_TOKEN
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", {
      status: 200,
    });
  }
  return new Response("Invalid token", { status: 403 });
}

/* =====================================================================================
   INBOUND MESSAGE HANDLER
===================================================================================== */

async function processInboundMessage(
  msg: any,
  value: any,
  baseLogger: ReturnType<typeof createLogger>,
) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const settings = await supabase
    .from("whatsapp_settings")
    .select("organization_id, api_token")
    .eq("whatsapp_phone_id", phoneNumberId)
    .neq("is_active", false)
    .maybeSingle();

  if (!settings.data) return;

  const orgId = settings.data.organization_id;
  const logger = baseLogger.with({ organization_id: orgId });

  const waNumber = normalizeWaPhone(msg.from);
  if (!waNumber) return;

  const name = value.contacts?.[0]?.profile?.name ?? null;

  const contact = await supabase
    .from("contacts")
    .upsert(
      { organization_id: orgId, phone: waNumber, name },
      { onConflict: "organization_id,phone" },
    )
    .select()
    .single();

  if (!contact.data) return;

  const contactId = contact.data.id;

  const existingConv = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .maybeSingle();

  let conversationId: string;

  if (!existingConv.data) {
    const c = await supabase
      .from("conversations")
      .insert({
        organization_id: orgId,
        contact_id: contactId,
        channel: "whatsapp",
        ai_enabled: true,
        last_message_at: new Date().toISOString(),
        whatsapp_user_phone: waNumber,
      })
      .select()
      .single();

    if (!c.data) return;
    conversationId = c.data.id;
  } else {
    conversationId = existingConv.data.id;
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  const convLogger = logger.with({ conversation_id: conversationId });

  const text = msg.text?.body ?? null;

  /* ============================================================
     IDEMPOTENCY GUARD
  ============================================================ */

  const { data: existingMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("whatsapp_message_id", msg.id)
    .maybeSingle();

  if (existingMessage) {
    convLogger.warn("DUPLICATE_WHATSAPP_MESSAGE_IGNORED", {
      whatsapp_message_id: msg.id,
    });
    return;
  }

  /* ============================================================
     MEDIA HANDLING
  ============================================================ */

  let mediaUrl: string | null = null;
  let mimeType: string | null = null;

  if (msg.type !== "text" && msg[msg.type]?.id && settings.data.api_token) {
    try {
      const media = await fetchWhatsappMedia(
        msg[msg.type].id,
        settings.data.api_token,
      );

      mediaUrl = await storeWhatsappMedia(
        orgId,
        conversationId,
        msg.id,
        media.buffer,
        media.mimeType,
      );

      mimeType = media.mimeType;
    } catch (err) {
      convLogger.error("MEDIA_PROCESSING_FAILED", { error: String(err) });
    }
  }

  /* ============================================================
     INSERT MESSAGE
  ============================================================ */

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "customer",
    channel: "whatsapp",
    message_type: msg.type ?? "text",
    text,
    media_url: mediaUrl,
    mime_type: mimeType,
    whatsapp_message_id: msg.id,
    wa_received_at: new Date().toISOString(),
  });

  /* ============================================================
     AI TRIGGER (TEXT ONLY)
  ============================================================ */

  if (text) {
    const safeText = text.slice(0, MAX_TEXT_LENGTH);
    await triggerAIHandler({ conversationId, userMessage: safeText });

    const intent = await classifyIntent(safeText);
    await supabase
      .from("conversations")
      .update({ intent, intent_source: "ai" })
      .eq("id", conversationId);
  }

  convLogger.info("INBOUND_MESSAGE_OK");
}

/* =====================================================================================
   SERVER
===================================================================================== */

serve(async (req) => {
  const request_id = crypto.randomUUID();
  const logger = createLogger({ request_id });

  try {
    if (req.method === "GET") return verifyWebhook(req);
    if (req.method !== "POST")
      return new Response("Method not allowed", { status: 405 });

    const body = await req.json();

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const st of change.value?.statuses ?? []) {
          await processStatusReceipt(st, change.value, logger);
        }
        for (const msg of change.value?.messages ?? []) {
          await processInboundMessage(msg, change.value, logger);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    logger.error("FATAL", { error: String(e) });
    return new Response("Internal Error", { status: 500 });
  }
});