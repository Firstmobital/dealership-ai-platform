// supabase/functions/razorpay-webhook/index.ts
// Phase 5 — Step 4: Razorpay Webhook -> Validate signature -> Credit wallet

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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

serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const signature = req.headers.get("x-razorpay-signature") || "";
    if (!signature) return json(400, { error: "Missing x-razorpay-signature" });

    // IMPORTANT: use RAW body bytes for signature validation
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const expected = await hmacSha256Hex(RAZORPAY_WEBHOOK_SECRET, rawBody);

    // Razorpay sends expected HMAC in X-Razorpay-Signature
    if (expected !== signature) {
      return json(401, { error: "Invalid signature" });
    }

    const event = JSON.parse(new TextDecoder().decode(rawBody));

    // We primarily care about successful payment capture
    // Razorpay webhooks are signed using HMAC-SHA256 with the webhook secret. :contentReference[oaicite:3]{index=3}
    const evt = event?.event as string;

    if (evt !== "payment.captured") {
      // Acknowledge other events to avoid retries
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

    // Find our local order mapping
    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("razorpay_orders")
      .select("organization_id,wallet_id,amount_paise,status")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (orderErr) return json(500, { error: orderErr.message });
    if (!orderRow) return json(404, { error: "Order not found" });

    // Amount must match (protect against tampering)
    if (orderRow.amount_paise !== amountPaise) {
      return json(400, { error: "Amount mismatch", expected: orderRow.amount_paise, got: amountPaise });
    }

    // Idempotency: upsert payment record by unique payment id
    const { error: payInsErr } = await supabaseAdmin
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

    if (payInsErr) return json(500, { error: payInsErr.message });

    // Mark order paid (best-effort)
    await supabaseAdmin
      .from("razorpay_orders")
      .update({ status: "paid" })
      .eq("razorpay_order_id", orderId);

    // Credit wallet: amount in rupees for wallet_transactions
    const amountRupees = Number(amountPaise) / 100;

    // IMPORTANT: prevent double-credit:
    // we only credit if we haven't already credited for this payment_id.
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

    const { error: creditErr } = await supabaseAdmin
      .from("wallet_transactions")
      .insert({
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
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
});
