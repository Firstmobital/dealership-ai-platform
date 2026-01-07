// supabase/functions/psf-send-manual-reminder/index.ts
// supabase/functions/psf-send-manual-reminder/index.ts
// FINAL — Manual PSF Reminder (Enterprise-safe)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ============================================================
   ENV
============================================================ */

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const MAX_REMINDERS_PER_CASE = 3;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============================================================
   HELPERS
============================================================ */

function defaultReminderText() {
  return (
    "Hi 👋 Just a quick reminder regarding your recent service visit. " +
    "We’d really appreciate your feedback — it helps us improve."
  );
}

/* ============================================================
   HANDLER
============================================================ */

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const psfCaseId = body?.psf_case_id;

    if (!psfCaseId) {
      return new Response("psf_case_id required", { status: 400 });
    }

    /* --------------------------------------------------------
       1) Load PSF case (CANONICAL FIELDS ONLY)
    -------------------------------------------------------- */
    const { data: psf, error: psfError } = await supabase
      .from("psf_cases")
      .select(
        `
        id,
        organization_id,
        conversation_id,
        resolution_status,
        first_customer_reply_at,
        reminder_count
      `
      )
      .eq("id", psfCaseId)
      .maybeSingle();

    if (psfError || !psf) {
      return new Response("PSF case not found", { status: 404 });
    }

    /* --------------------------------------------------------
       2) Safety checks
    -------------------------------------------------------- */
    if (psf.resolution_status !== "open") {
      return new Response("PSF case not open", { status: 409 });
    }

    if (psf.first_customer_reply_at) {
      return new Response("Customer already replied", { status: 409 });
    }

    const sentCount =
      typeof psf.reminder_count === "number" ? psf.reminder_count : 0;

    if (sentCount >= MAX_REMINDERS_PER_CASE) {
      return new Response("Reminder limit reached", { status: 409 });
    }

    if (!psf.conversation_id) {
      return new Response("Missing conversation", { status: 409 });
    }

    /* --------------------------------------------------------
       3) Load conversation + contact (ORG-LOCKED)
    -------------------------------------------------------- */
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, organization_id, channel, contact_id")
      .eq("id", psf.conversation_id)
      .eq("organization_id", psf.organization_id)
      .maybeSingle();

    if (!conv || conv.channel !== "whatsapp" || !conv.contact_id) {
      return new Response("Invalid conversation", { status: 409 });
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("phone")
      .eq("id", conv.contact_id)
      .eq("organization_id", psf.organization_id)
      .maybeSingle();

    if (!contact?.phone) {
      return new Response("Missing contact phone", { status: 409 });
    }

    const text = defaultReminderText();

    /* --------------------------------------------------------
       4) Send WhatsApp (SERVICE ROLE)
    -------------------------------------------------------- */
    const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        organization_id: psf.organization_id,
        to: contact.phone,
        type: "text",
        text,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[psf-reminder] whatsapp failed", t);
      return new Response("WhatsApp send failed", { status: 500 });
    }

    /* --------------------------------------------------------
       5) Persist message
    -------------------------------------------------------- */
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      sender: "bot",
      message_type: "text",
      text,
      channel: "whatsapp",
      organization_id: psf.organization_id,
    });

    /* --------------------------------------------------------
       6) Update PSF case
    -------------------------------------------------------- */
    const newCount = sentCount + 1;

    await supabase
      .from("psf_cases")
      .update({
        last_reminder_at: new Date().toISOString(),
        reminder_count: newCount,
      })
      .eq("id", psf.id);

    return new Response(
      JSON.stringify({
        success: true,
        reminder_count: newCount,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[psf-manual-reminder] fatal", e);
    return new Response("Internal error", { status: 500 });
  }
});
