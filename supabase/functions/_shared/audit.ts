// supabase/functions/_shared/audit.ts
// PHASE 9.2 — AUDIT LOGGER (NON-BLOCKING)

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

export type AuditLogParams = {
  organization_id: string;

  action: string;
  entity_type: string;
  entity_id?: string | null;

  actor_user_id?: string | null;
  actor_email?: string | null;

  before_state?: Record<string, any> | null;
  after_state?: Record<string, any> | null;

  metadata?: Record<string, any>;
};

/**
 * Fire-and-forget audit logger.
 * NEVER throws.
 * NEVER blocks main logic.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  params: AuditLogParams
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      organization_id: params.organization_id,

      actor_user_id: params.actor_user_id ?? null,
      actor_email: params.actor_email ?? null,

      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,

      before_state: params.before_state ?? null,
      after_state: params.after_state ?? null,

      metadata: params.metadata ?? {},
    });
  } catch (err) {
    // Intentionally swallow errors
    console.error("[audit] failed to write audit log", {
      action: params.action,
      entity_type: params.entity_type,
      error: String(err),
    });
  }
}
