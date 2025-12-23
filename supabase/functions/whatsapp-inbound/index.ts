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
  sub_organization_id?: string | null;
  conversation_id?: string | null;
};

function createLogger(ctx: LogContext) {
  return {
    info: (m: string, e = {}) =>
      console.log(JSON.stringify({ level: "info", ...ctx, message: m, ...e })),
    warn: (m: string, e = {}) =>
      console.warn(JSON.stringify({ level: "warn", ...ctx, message: m, ...e })),
    error: (m: string, e = {}) =>
      console.error(JSON.stringify({ level: "error", ...ctx, message: m, ...e })),
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
        { role: "user", content: text },
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

/* =====================================================================================
   VERIFY
===================================================================================== */
async function verifyWebhook(req: Request) {
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
   MAIN INBOUND HANDLER
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
    .select("organization_id, api_token, sub_organization_id")
    .eq("whatsapp_phone_id", phoneNumberId)
    .neq("is_active", false)
    .limit(1)
    .maybeSingle();

  if (!settings.data) return;

  const orgId = settings.data.organization_id;
  const logger = baseLogger.with({ organization_id: orgId });

  const waNumber = normalizeWaPhone(msg.from);
  if (!waNumber) return;

  const name = value.contacts?.[0]?.profile?.name ?? null;

  /* ---------------- CONTACT UPSERT (SAFE) ---------------- */
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

  /* ---------------- SINGLE CONVERSATION ---------------- */
  const existingConv = await supabase
    .from("conversations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .limit(1)
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
        sub_organization_id: settings.data.sub_organization_id,
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

  /* ---------------- MESSAGE INSERT ---------------- */
  const text = msg.text?.body ?? null;

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "customer",
    message_type: msg.type ?? "text",
    text,
    channel: "whatsapp",
    whatsapp_message_id: msg.id,
    wa_received_at: new Date().toISOString(),
  });

  /* ---------------- INTENT TAGGING ---------------- */
  if (text) {
    const intent = await classifyIntent(text);
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
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const body = await req.json();
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
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
