// supabase/functions/razorpay-create-order/index.ts
// Phase 5 — Step 4: Create Razorpay Order (server-side)

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function b64(s: string) {
  return btoa(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json(401, { error: "Missing Authorization token" });

    // Identify user
    const supabaseUser = createClient(PROJECT_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) return json(401, { error: "Invalid token" });

    const userId = userRes.user.id;

    const { organization_id, amount_rupees } = await req.json();

    if (!organization_id) return json(400, { error: "organization_id required" });
    const amt = Number(amount_rupees);
    if (!amt || amt <= 0) return json(400, { error: "amount_rupees must be > 0" });

    // Role check (owner/admin only for recharge)
    const { data: ou, error: ouErr } = await supabaseAdmin
      .from("organization_users")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (ouErr) return json(500, { error: ouErr.message });
    if (!ou?.role || !["owner", "admin"].includes(ou.role)) {
      return json(403, { error: "Insufficient permissions (owner/admin required)" });
    }

    // Ensure wallet exists
    let { data: wallet, error: wErr } = await supabaseAdmin
      .from("wallets")
      .select("id")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (wErr) return json(500, { error: wErr.message });

    if (!wallet?.id) {
      const { data: wNew, error: wNewErr } = await supabaseAdmin
        .from("wallets")
        .insert({ organization_id })
        .select("id")
        .single();

      if (wNewErr) return json(500, { error: wNewErr.message });
      wallet = wNew;
    }

    const amountPaise = Math.round(amt * 100);
    const receipt = `tw_${organization_id}_${Date.now()}`;

    // Create order in Razorpay (Orders API)
    // POST /v1/orders with amount (subunits) and currency
    const rpResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Basic ${b64(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: { organization_id, wallet_id: wallet.id },
      }),
    });

    const rpJson = await rpResp.json();
    if (!rpResp.ok) {
      return json(400, { error: "Razorpay order create failed", details: rpJson });
    }

    const razorpayOrderId = rpJson.id as string;

    // Store locally
    const { error: insErr } = await supabaseAdmin.from("razorpay_orders").insert({
      organization_id,
      wallet_id: wallet.id,
      amount_paise: amountPaise,
      currency: "INR",
      receipt,
      status: "created",
      razorpay_order_id: razorpayOrderId,
      notes: { requested_rupees: amt },
      created_by: userId,
    });

    if (insErr) return json(500, { error: insErr.message });

    return json(200, {
      key_id: RAZORPAY_KEY_ID,
      order_id: razorpayOrderId,
      amount_paise: amountPaise,
      currency: "INR",
      receipt,
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
});
