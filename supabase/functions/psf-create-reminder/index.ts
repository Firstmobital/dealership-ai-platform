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
function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

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

  const remindersSent = params.remindersSent ?? 0;

  if (remindersSent >= MAX_REMINDERS_PER_CASE) return false;

  // Must have waited at least REMINDER_AFTER_HOURS since last customer reply OR case creation (if no reply)
  const baseTs = Number.isFinite(lastCustomerReplyTs)
    ? lastCustomerReplyTs
    : Number.isFinite(createdTs)
    ? createdTs
    : NaN;

  if (!Number.isFinite(baseTs)) return false;

  const elapsedSinceBaseHours = (now - baseTs) / (1000 * 60 * 60);
  if (elapsedSinceBaseHours < REMINDER_AFTER_HOURS) return false;

  // Cooldown between reminders
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
    return { ok: false, error: json?.error ?? JSON.stringify(json) ?? "send_failed" };
  }

  const waId =
    json?.meta_response?.messages?.[0]?.id ??
    json?.meta_response?.message_id ??
    json?.messages?.[0]?.id ??
    json?.message_id ??
    null;

  return { ok: true, waId, raw: json };
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
    // Allow both GET and POST (POST can override text)
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const reminderText: string = String(body?.text ?? defaultReminderText()).trim() ||
      defaultReminderText();

    // Optional: limit to one org/sub-org
    const organizationIdFilter: string | null = body?.organization_id ?? null;

    // Fetch candidate cases:
    // - open
    // - action_required = true (i.e., negative sentiment) OR sentiment is null but case is open
    // - has conversation_id (so we can reach contact)
    // - not cancelled/resolved
    //
    // NOTE: We do NOT assume "campaign sent time" exists.
    // We use psf_cases.created_at and last_customer_reply_at.
    let q = supabase
      .from("psf_cases")
      .select(
        "id, organization_id, conversation_id, resolution_status, sentiment, action_required, created_at, last_customer_reply_at, last_reminder_sent_at, reminders_sent_count"
      )
      .eq("resolution_status", "open")
      .not("conversation_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(MAX_CASES_PER_RUN);

    if (organizationIdFilter) {
      q = q.eq("organization_id", organizationIdFilter);
    }

    const { data: cases, error: casesErr } = await q;

    if (casesErr) {
      return new Response(
        JSON.stringify({ error: "Failed to load PSF cases", details: casesErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const candidates = (cases ?? []).filter((c: any) => {
      // You can tighten this if you want ONLY negative:
      // return c.action_required === true;
      return true;
    });

    let scanned = candidates.length;
    let eligible = 0;
    let sent = 0;
    let failed = 0;

    const results: any[] = [];

    for (const psf of candidates) {
      const ok = shouldSendReminder({
        now,
        createdAt: psf.created_at ?? null,
        lastCustomerReplyAt: psf.last_customer_reply_at ?? null,
        lastReminderSentAt: psf.last_reminder_sent_at ?? null,
        remindersSent: psf.reminders_sent_count ?? 0,
      });

      if (!ok) continue;
      eligible++;

      // Load conversation -> contact_id, channel, sub_organization_id
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("id, organization_id, channel, contact_id, sub_organization_id")
        .eq("id", psf.conversation_id)
        .maybeSingle();

      if (convErr || !conv?.contact_id) {
        failed++;
        results.push({
          psf_case_id: psf.id,
          status: "failed",
          reason: "CONVERSATION_OR_CONTACT_MISSING",
        });
        continue;
      }

      // We only send reminders on WhatsApp conversations
      if ((conv.channel ?? "") !== "whatsapp") {
        results.push({
          psf_case_id: psf.id,
          status: "skipped",
          reason: "CHANNEL_NOT_WHATSAPP",
        });
        continue;
      }

      // Load contact phone
      const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .select("id, phone, name, first_name")
        .eq("id", conv.contact_id)
        .maybeSingle();

      const phone = contact?.phone ?? null;

      if (contactErr || !phone) {
        failed++;
        results.push({
          psf_case_id: psf.id,
          status: "failed",
          reason: "CONTACT_PHONE_MISSING",
        });
        continue;
      }

      // 1) Send WhatsApp message
      const sendRes = await safeWhatsAppSend({
        organization_id: conv.organization_id,
        sub_organization_id: conv.sub_organization_id ?? null,
        to: phone, // your system stores digits-only "91XXXXXXXXXX"
        type: "text",
        text: reminderText,
      });

      if (!sendRes.ok) {
        failed++;
        results.push({
          psf_case_id: psf.id,
          status: "failed",
          reason: "WHATSAPP_SEND_FAILED",
          details: sendRes.error,
        });
        continue;
      }

      // 2) Save into messages table (so chat timeline shows the reminder)
      // NOTE: This is important for your UI + audit trail.
      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: conv.id,
        sender: "bot",
        message_type: "text",
        text: reminderText,
        channel: "whatsapp",
        sub_organization_id: conv.sub_organization_id ?? null,
        whatsapp_message_id: sendRes.waId ?? null,
      });

      // Don't fail the whole case if message insert fails; still update psf case
      if (msgErr) {
        results.push({
          psf_case_id: psf.id,
          status: "warn",
          reason: "MESSAGE_INSERT_FAILED",
          details: msgErr.message,
        });
      }

      // 3) Update PSF case reminder markers
      const { error: updErr } = await supabase
        .from("psf_cases")
        .update({
          last_reminder_sent_at: now.toISOString(),
          reminders_sent_count: (psf.reminders_sent_count ?? 0) + 1,
        })
        .eq("id", psf.id);

      if (updErr) {
        // Message already sent; record failure but don't revert send
        failed++;
        results.push({
          psf_case_id: psf.id,
          status: "failed",
          reason: "PSF_UPDATE_FAILED",
          details: updErr.message,
        });
        continue;
      }

      // 4) Keep conversation fresh
      await supabase
        .from("conversations")
        .update({ last_message_at: now.toISOString() })
        .eq("id", conv.id);

      sent++;
      results.push({
        psf_case_id: psf.id,
        status: "sent",
        to: phone,
        whatsapp_message_id: sendRes.waId ?? null,
        reminders_sent_count: (psf.reminders_sent_count ?? 0) + 1,
      });

      // Respect max-per-run hard cap
      if (sent >= MAX_CASES_PER_RUN) break;
    }

    return new Response(
      JSON.stringify({
        success: true,
        now: now.toISOString(),
        config: {
          REMINDER_AFTER_HOURS,
          REMINDER_COOLDOWN_HOURS,
          MAX_REMINDERS_PER_CASE,
          MAX_CASES_PER_RUN,
        },
        scanned,
        eligible,
        sent,
        failed,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[psf-create-reminder] fatal", e);
    return new Response(
      JSON.stringify({ error: "Internal Error", details: e?.message ?? String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
