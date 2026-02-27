// supabase/functions/_shared/audit.ts
// PHASE 9.2 — AUDIT LOGGER (NON-BLOCKING)

// NOTE: We intentionally avoid importing SupabaseClient from the esm.sh build.
// In some Deno/esm.sh configurations the type export is not available, which
// breaks `deno check`. This module only needs a tiny slice of the client API.

type SupabaseLike = {
  from(table: string): {
    // Postgrest insert returns a builder object; we only `await` it and ignore the value.
    // Keep as `unknown` to stay structurally compatible with real SupabaseClient typings.
    insert(values: unknown): unknown;
  };
};

export type AuditLogParams = {
  organization_id: string;

  action: string;
  entity_type: string;
  entity_id?: string | null;

  actor_user_id?: string | null;
  actor_email?: string | null;

  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;

  metadata?: Record<string, unknown>;
};

/**
 * Fire-and-forget audit logger.
 * NEVER throws.
 * NEVER blocks main logic.
 */
export async function logAuditEvent(
  supabase: SupabaseLike,
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
