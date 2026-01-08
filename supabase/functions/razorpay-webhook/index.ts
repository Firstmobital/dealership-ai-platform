// supabase/functions/razorpay-webhook/index.ts
// Phase 5 — Razorpay Webhook → Validate signature → Credit wallet

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ============================================================
   ENV
============================================================ */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

if (!PROJECT_URL || !SERVICE_ROLE_KEY || !RAZORPAY_WEBHOOK_SECRET) {
  throw new Error("Missing required environment variables");
}

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============================================================
   HELPERS
============================================================ */
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-razorpay-signature",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, message);
  return toHex(new Uint8Array(sig));
}

// Constant-time string comparison
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ============================================================
   MAIN
============================================================ */
serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const signature = req.headers.get("x-razorpay-signature") || "";
    if (!signature) {
      return json(400, { error: "Missing x-razorpay-signature" });
    }

    // IMPORTANT: use RAW body for signature validation
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const expected = await hmacSha256Hex(RAZORPAY_WEBHOOK_SECRET, rawBody);

    if (!safeEqual(expected, signature)) {
      return json(401, { error: "Invalid signature" });
    }

    const event = JSON.parse(new TextDecoder().decode(rawBody));
    const evt = event?.event as string;

    // We only act on successful payment capture
    if (evt !== "payment.captured") {
      return json(200, { ok: true, ignored: evt || "unknown" });
    }

    const payment = event?.payload?.payment?.entity;
    const orderId = payment?.order_id as string | undefined;
    const paymentId = payment?.id as string | undefined;
    const status = payment?.status as string | undefined;
    const amountPaise = payment?.amount as number | undefined;
    const currency = payment?.currency as string | undefined;

    if (!orderId || !paymentId || !amountPaise || !currency) {
      return json(400, { error: "Invalid payload: missing fields" });
    }

    /* -------------------------------------------
       Load local order
    --------------------------------------------*/
    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("razorpay_orders")
      .select("organization_id, wallet_id, amount_paise, status")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (orderErr) return json(500, { error: orderErr.message });
    if (!orderRow) return json(404, { error: "Order not found" });

    // Amount safety check
    if (orderRow.amount_paise !== amountPaise) {
      return json(400, {
        error: "Amount mismatch",
        expected: orderRow.amount_paise,
        got: amountPaise,
      });
    }

    /* -------------------------------------------
       Idempotent payment record
    --------------------------------------------*/
    const { error: payErr } = await supabaseAdmin
      .from("razorpay_payments")
      .upsert(
        {
          organization_id: orderRow.organization_id,
          wallet_id: orderRow.wallet_id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          amount_paise: amountPaise,
          currency,
          status: status || "captured",
          raw_event: event,
        },
        { onConflict: "razorpay_payment_id" },
      );

    if (payErr) return json(500, { error: payErr.message });

    // Mark order paid (best-effort, idempotent)
    if (orderRow.status !== "paid") {
      await supabaseAdmin
        .from("razorpay_orders")
        .update({ status: "paid" })
        .eq("razorpay_order_id", orderId);
    }

    /* -------------------------------------------
       Prevent double credit
    --------------------------------------------*/
    const { data: existingCredit } = await supabaseAdmin
      .from("wallet_transactions")
      .select("id")
      .eq("wallet_id", orderRow.wallet_id)
      .eq("type", "credit")
      .eq("reference_type", "razorpay")
      .contains("metadata", { razorpay_payment_id: paymentId })
      .limit(1);

    if (existingCredit && existingCredit.length > 0) {
      return json(200, { ok: true, already_credited: true });
    }

    const amountRupees = amountPaise / 100;

    const { error: creditErr } = await supabaseAdmin
      .from("wallet_transactions")
      .insert({
        organization_id: orderRow.organization_id,
        wallet_id: orderRow.wallet_id,
        type: "credit",
        direction: "in",
        amount: amountRupees,
        reference_type: "razorpay",
        reference_id: null,
        metadata: {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          currency,
          amount_paise: amountPaise,
        },
        purpose: "razorpay",
        created_by: null,
        created_by_role: "razorpay",
      });

    if (creditErr) return json(500, { error: creditErr.message });

    return json(200, { ok: true, credited: true });
  } catch (e: any) {
    return json(500, { error: String(e?.message || e) });
  }
});
