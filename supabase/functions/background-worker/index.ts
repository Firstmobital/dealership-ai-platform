// supabase/functions/background-worker/index.ts
// P1 — Background job runner (invoked by cron / external scheduler)
//
// Security:
// - INTERNAL ONLY (requires INTERNAL_API_KEY via x-internal-api-key or Authorization: Bearer)
// - Uses service_role to claim and update jobs
//
// Job types implemented:
// - embed_article: calls embed-article Edge Function internally
// - whatsapp_retry_send: calls whatsapp-send Edge Function internally
// - ai_reply_retry: calls ai-handler Edge Function internally
// - campaign_dispatch_tick: calls campaign-dispatch Edge Function internally (scheduled batches)

import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

import { getRequestId, isInternalRequest } from "../_shared/auth.ts";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getFunctionUrl(fnName: string) {
  // Works both locally (supabase functions serve) and in hosted environment.
  // Supabase sets SUPABASE_URL, but project uses PROJECT_URL.
  const base = PROJECT_URL.replace(/\/$/, "");
  return `${base}/functions/v1/${fnName}`;
}

async function markJobCompleted(jobId: string) {
  await supabaseAdmin
    .from("background_jobs")
    .update({ status: "completed", locked_at: null, locked_by: null, last_error: null, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function markJobFailed(jobId: string, errMsg: string, runAt: string | null) {
  await supabaseAdmin
    .from("background_jobs")
    .update({
      status: "queued",
      run_at: runAt ?? new Date(Date.now() + 60_000).toISOString(),
      last_error: errMsg,
      updated_at: new Date().toISOString(),
      // keep locked_* for visibility; claim RPC will reclaim if TTL exceeded
    })
    .eq("id", jobId);
}

async function markJobDead(jobId: string, errMsg: string) {
  await supabaseAdmin
    .from("background_jobs")
    .update({ status: "dead", last_error: errMsg, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

function computeBackoffSeconds(attempts: number) {
  // attempts already incremented in claim_background_jobs
  const base = Math.min(900, Math.pow(2, Math.min(10, attempts)));
  const jitter = Math.floor(Math.random() * 10);
  return base + jitter;
}

async function invokeInternal(fnName: string, body: Record<string, unknown>) {
  const url = getFunctionUrl(fnName);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data: parsed };
}

serve(async (req) => {
  const request_id = getRequestId(req as Request);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed", request_id });
  }

  if (!isInternalRequest(req as Request)) {
    return json(403, { error: "Forbidden", request_id });
  }
  if (!INTERNAL_API_KEY) {
    return json(500, { error: "INTERNAL_API_KEY not set", request_id });
  }

  let limit = 10;
  let worker_id = `worker-${crypto.randomUUID().slice(0, 8)}`;
  let lock_ttl_seconds = 300;

  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 50) limit = body.limit;
    if (typeof body?.worker_id === "string" && body.worker_id.trim()) worker_id = body.worker_id.trim();
    if (typeof body?.lock_ttl_seconds === "number" && body.lock_ttl_seconds >= 30 && body.lock_ttl_seconds <= 3600) {
      lock_ttl_seconds = body.lock_ttl_seconds;
    }
  } catch {
    // ignore body parse
  }

  const { data: jobs, error: claimErr } = await supabaseAdmin
    .rpc("claim_background_jobs", { p_limit: limit, p_worker_id: worker_id, p_lock_ttl_seconds: lock_ttl_seconds });

  if (claimErr) {
    return json(500, { error: "Failed to claim jobs", details: claimErr.message, request_id });
  }

  const processed: any[] = [];

  for (const job of (jobs ?? [])) {
    const jobId = job.id as string;
    const jobType = job.job_type as string;
    const payload = (job.payload ?? {}) as Record<string, unknown>;

    try {
      if (jobType === "embed_article") {
        const article_id = typeof payload.article_id === "string" ? payload.article_id : null;
        if (!article_id) throw new Error("embed_article payload requires article_id");

        const res = await invokeInternal("embed-article", { article_id });
        if (!res.ok) {
          throw new Error(`embed-article failed (${res.status}): ${JSON.stringify(res.data).slice(0, 500)}`);
        }
        await markJobCompleted(jobId);
        processed.push({ id: jobId, type: jobType, status: "completed" });
        continue;
      }

      if (jobType === "whatsapp_retry_send") {
        // Expected payload: { conversation_id, text?, media_url?, template_name?, template_params? }
        const conversation_id = typeof payload.conversation_id === "string" ? payload.conversation_id : null;
        if (!conversation_id) throw new Error("whatsapp_retry_send payload requires conversation_id");

        const res = await invokeInternal("whatsapp-send", payload);
        if (!res.ok) {
          throw new Error(`whatsapp-send failed (${res.status}): ${JSON.stringify(res.data).slice(0, 500)}`);
        }
        await markJobCompleted(jobId);
        processed.push({ id: jobId, type: jobType, status: "completed" });
        continue;
      }

      if (jobType === "ai_reply_retry") {
        // Expected payload: { conversation_id, user_message }
        const conversation_id = typeof payload.conversation_id === "string" ? payload.conversation_id : null;
        const user_message = typeof payload.user_message === "string" ? payload.user_message : null;
        if (!conversation_id || !user_message) throw new Error("ai_reply_retry payload requires conversation_id and user_message");

        const res = await invokeInternal("ai-handler", {
          conversation_id,
          user_message,
          mode: "reply",
          retry: true,
        });
        if (!res.ok) {
          throw new Error("ai-handler failed (" + res.status + "): " + JSON.stringify(res.data).slice(0, 500));
        }
        await markJobCompleted(jobId);
        processed.push({ id: jobId, type: jobType, status: "completed" });
        continue;
      }

      if (jobType === "campaign_dispatch_tick") {
        // Expected payload: { campaign_id?: string, limit?: number }
        const campaign_id = typeof payload.campaign_id === "string" ? payload.campaign_id : null;
        const limit = typeof payload.limit === "number" ? payload.limit : 50;

        const res = await invokeInternal("campaign-dispatch", {
          mode: "scheduled",
          campaign_id,
          limit,
        });
        if (!res.ok) {
          throw new Error("campaign-dispatch failed (" + res.status + "): " + JSON.stringify(res.data).slice(0, 500));
        }

        // campaign-dispatch returns { more: boolean }. If more, keep job queued; else complete.
        const more = Boolean((res.data as any)?.more);
        if (more) {
          const nextRun = new Date(Date.now() + 10_000).toISOString();
          await markJobFailed(jobId, "more_work", nextRun);
          processed.push({ id: jobId, type: jobType, status: "queued", next_run_at: nextRun });
        } else {
          await markJobCompleted(jobId);
          processed.push({ id: jobId, type: jobType, status: "completed" });
        }
        continue;
      }

      // Unknown job type
      await markJobDead(jobId, `Unknown job_type: ${jobType}`);
      processed.push({ id: jobId, type: jobType, status: "dead" });
    } catch (err: any) {
      const attempts = typeof job.attempts === "number" ? job.attempts : 1;
      const maxAttempts = typeof job.max_attempts === "number" ? job.max_attempts : 5;
      const msg = err?.message ?? String(err);

      if (attempts >= maxAttempts) {
        await markJobDead(jobId, msg);
        processed.push({ id: jobId, type: jobType, status: "dead", error: msg });
      } else {
        const backoff = computeBackoffSeconds(attempts);
        const nextRun = new Date(Date.now() + backoff * 1000).toISOString();
        await markJobFailed(jobId, msg, nextRun);
        processed.push({ id: jobId, type: jobType, status: "queued", next_run_at: nextRun, error: msg });
      }
    }
  }

  return json(200, {
    ok: true,
    claimed: (jobs ?? []).length,
    processed,
    request_id,
  });
});