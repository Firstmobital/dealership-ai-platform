// supabase/functions/_shared/auth.ts
// PHASE 1 — AUTH & TENANT HARDENING HELPERS
// - Edge functions often use service_role (bypasses RLS). Never trust inputs.
// - This module provides: internal-key gating and user+org membership checks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

export type AuthedUser = {
  id: string;
  email: string | null;
};

export function getRequestId(req: Request): string {
  return (
    req.headers.get("x-request-id") ||
    req.headers.get("x-sb-request-id") ||
    crypto.randomUUID()
  );
}

export function getAuthHeader(req: Request): string {
  return req.headers.get("Authorization") ?? "";
}

export function getInternalKey(req: Request): string {
  // Accept either explicit internal header or Authorization: Bearer <key>
  const h = req.headers.get("x-internal-api-key") ?? "";
  if (h) return h;
  const auth = getAuthHeader(req);
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

export function isInternalRequest(req: Request): boolean {
  const expected = Deno.env.get("INTERNAL_API_KEY") || "";
  if (!expected) return false;
  const got = getInternalKey(req);
  return !!got && got === expected;
}

export function createUserClient(req: Request) {
  if (!PROJECT_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing PROJECT_URL or SUPABASE_ANON_KEY");
  }

  const authHeader = getAuthHeader(req);
  return createClient(PROJECT_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}

export async function requireUser(req: Request): Promise<AuthedUser> {
  const client = createUserClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return {
    id: data.user.id,
    email: (data.user.email as string | null) ?? null,
  };
}

export async function requireOrgMembership(params: {
  supabaseAdmin: any;
  userId: string;
  organizationId: string;
}): Promise<void> {
  const { data, error } = await params.supabaseAdmin
    .from("organization_users")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("FORBIDDEN_ORG");
}

export async function requireOrgRole(params: {
  supabaseAdmin: any;
  userId: string;
  organizationId: string;
  allowedRoles: string[];
}): Promise<void> {
  const { data, error } = await params.supabaseAdmin
    .from("organization_users")
    .select("role")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const role = (data as any)?.role;
  if (!role || !params.allowedRoles.includes(role)) {
    throw new Error("FORBIDDEN_ROLE");
  }
}
