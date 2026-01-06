// supabase/functions/psf-create-reminder/index.ts
// PSF REMINDERS — Edge Function
// - Finds OPEN PSF cases that need a reminder
// - Sends WhatsApp reminder via whatsapp-send
// - Writes the reminder into `messages`
// - Updates psf_cases: last_reminder_sent_at, reminders_sent_count

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ============================================================
   ENV
============================================================ */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// Optional tuning
const REMINDER_AFTER_HOURS = Number(Deno.env.get("PSF_REMINDER_AFTER_HOURS") ?? 24);
const REMINDER_COOLDOWN_HOURS = Number(Deno.env.get("PSF_REMINDER_COOLDOWN_HOURS") ?? 24);
const MAX_REMINDERS_PER_CASE = Number(Deno.env.get("PSF_MAX_REMINDERS_PER_CASE") ?? 3);

// Optional safety cap per run
const MAX_CASES_PER_RUN = Number(Deno.env.get("PSF_MAX_CASES_PER_RUN") ?? 50);

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============================================================
   HELPERS
============================================================ */
function shouldSendReminder(params: {
  now: Date;
  createdAt: string | null;
  lastCustomerReplyAt: string | null;
  lastReminderSentAt: string | null;
  remindersSent: number | null;
}) {
  const now = params.now.getTime();

  const createdTs = params.createdAt ? Date.parse(params.createdAt) : NaN;
  const lastCustomerReplyTs = params.lastCustomerReplyAt
    ? Date.parse(params.lastCustomerReplyAt)
    : NaN;
  const lastReminderTs = params.lastReminderSentAt
    ? Date.parse(params.lastReminderSentAt)
    : NaN;

  const remindersSent =
    typeof params.remindersSent === "number" ? params.remindersSent : 0;

  if (remindersSent >= MAX_REMINDERS_PER_CASE) return false;

  const baseTs = Number.isFinite(lastCustomerReplyTs)
    ? lastCustomerReplyTs
    : Number.isFinite(createdTs)
    ? createdTs
    : NaN;

  if (!Number.isFinite(baseTs)) return false;

  const elapsedSinceBaseHours = (now - baseTs) / (1000 * 60 * 60);
  if (elapsedSinceBaseHours < REMINDER_AFTER_HOURS) return false;

  if (Number.isFinite(lastReminderTs)) {
    const elapsedSinceReminderHours = (now - lastReminderTs) / (1000 * 60 * 60);
    if (elapsedSinceReminderHours < REMINDER_COOLDOWN_HOURS) return false;
  }

  return true;
}

async function safeWhatsAppSend(payload: any) {
  const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { ok: false, error: json?.error ?? JSON.stringify(json) };
  }

  const waId =
    json?.meta_response?.messages?.[0]?.id ??
    json?.meta_response?.message_id ??
    json?.messages?.[0]?.id ??
    json?.message_id ??
    null;

  return { ok: true, waId };
}

function defaultReminderText() {
  return (
    "Hi 👋 Just a quick follow-up on our recent service experience. " +
    "Could you please share your feedback (1–2 lines)? It will help us improve."
  );
}

/* ============================================================
   MAIN
============================================================ */
serve(async (req: Request) => {
  const now = new Date();

  try {
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const reminderText =
      String(body?.text ?? "").trim() || defaultReminderText();

    const organizationIdFilter: string | null = body?.organization_id ?? null;

    let q = supabase
      .from("psf_cases")
      .select(
        `
        id,
        organization_id,
        conversation_id,
        resolution_status,
        created_at,
        last_customer_reply_at,
        last_reminder_sent_at,
        reminders_sent_count
      `,
      )
      .eq("resolution_status", "open")
      .not("conversation_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(MAX_CASES_PER_RUN);

    if (organizationIdFilter) {
      q = q.eq("organization_id", organizationIdFilter);
    }

    const { data: cases, error } = await q;

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to load PSF cases", details: error.message }),
        { status: 500 },
      );
    }

    let scanned = cases?.length ?? 0;
    let eligible = 0;
    let sent = 0;
    let failed = 0;
    const results: any[] = [];

    for (const psf of cases ?? []) {
      const ok = shouldSendReminder({
        now,
        createdAt: psf.created_at ?? null,
        lastCustomerReplyAt: psf.last_customer_reply_at ?? null,
        lastReminderSentAt: psf.last_reminder_sent_at ?? null,
        remindersSent: psf.reminders_sent_count ?? null,
      });

      if (!ok) continue;
      eligible++;

      const { data: conv } = await supabase
        .from("conversations")
        .select("id, organization_id, channel, contact_id")
        .eq("id", psf.conversation_id)
        .maybeSingle();

      if (!conv?.contact_id || conv.channel !== "whatsapp") {
        failed++;
        continue;
      }

      const { data: contact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("id", conv.contact_id)
        .maybeSingle();

      if (!contact?.phone) {
        failed++;
        continue;
      }

      const sendRes = await safeWhatsAppSend({
        organization_id: conv.organization_id,
        to: contact.phone,
        type: "text",
        text: reminderText,
      });

      if (!sendRes.ok) {
        failed++;
        continue;
      }

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        sender: "bot",
        message_type: "text",
        text: reminderText,
        channel: "whatsapp",
        whatsapp_message_id: sendRes.waId,
      });

      const currentCount =
        typeof psf.reminders_sent_count === "number"
          ? psf.reminders_sent_count
          : 0;

      await supabase
        .from("psf_cases")
        .update({
          last_reminder_sent_at: now.toISOString(),
          reminders_sent_count: currentCount + 1,
        })
        .eq("id", psf.id);

      await supabase
        .from("conversations")
        .update({ last_message_at: now.toISOString() })
        .eq("id", conv.id);

      sent++;
      results.push({
        psf_case_id: psf.id,
        status: "sent",
        reminders_sent_count: currentCount + 1,
      });

      if (sent >= MAX_CASES_PER_RUN) break;
    }

    return new Response(
      JSON.stringify({
        success: true,
        now: now.toISOString(),
        scanned,
        eligible,
        sent,
        failed,
        config: {
          REMINDER_AFTER_HOURS,
          REMINDER_COOLDOWN_HOURS,
          MAX_REMINDERS_PER_CASE,
          MAX_CASES_PER_RUN,
        },
        results,
      }),
      { status: 200 },
    );
  } catch (e: any) {
    console.error("[psf-create-reminder] fatal", e);
    return new Response(
      JSON.stringify({ error: "Internal Error", details: e?.message }),
      { status: 500 },
    );
  }
});