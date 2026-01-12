// supabase/functions/org-create/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ------------------------------------------------------------------
   ENV
------------------------------------------------------------------ */

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: any) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createUserClient(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(PROJECT_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

const admin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ------------------------------------------------------------------
   SERVER
------------------------------------------------------------------ */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const userClient = createUserClient(req);
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return jsonResponse(401, { error: "Not authenticated" });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    if (!name) return jsonResponse(400, { error: "Missing name" });

    // 1) Create org (service role write, bypasses RLS)
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name })
      .select("*")
      .single();

    if (orgErr) return jsonResponse(400, { error: orgErr.message });

    // 2) Create membership
    const { error: memErr } = await admin
      .from("organization_users")
      .insert({
        organization_id: org.id,
        user_id: userRes.user.id,
        role: "admin",
        last_active_at: new Date().toISOString(),
      });

    if (memErr) {
      // Best effort cleanup (don’t block client on cleanup)
      await admin.from("organizations").delete().eq("id", org.id);
      return jsonResponse(400, { error: memErr.message });
    }

    return jsonResponse(200, { organization: org });
  } catch (e) {
    return jsonResponse(500, { error: String(e) });
  }
});
