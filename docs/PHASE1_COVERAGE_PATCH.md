# Phase 1 Coverage Patch (applied with Phase 2 ZIP)

These changes were explicitly requested to cover remaining service-role edge functions that were not gated in the original Phase 1 ZIP.

## Updated functions
- `supabase/functions/kb-save-from-unanswered/index.ts`
  - Requires user JWT + org membership + role in {owner, admin}
- `supabase/functions/contact-bulk-upload/index.ts`
  - Requires user JWT + org membership + role in {owner, admin}
- `supabase/functions/whatsapp-template-sync/index.ts`
  - Requires user JWT + org membership + role in {owner, admin}
- `supabase/functions/whatsapp-template-submit/index.ts`
  - Requires user JWT + org membership + role in {owner, admin}
- `supabase/functions/psf-send-manual-reminder/index.ts`
  - Requires user JWT + org membership (agent/admin/owner)
- `supabase/functions/psf-create-reminder/index.ts`
  - Internal-only (requires `x-internal-api-key`)
- `supabase/functions/whatsapp-test-send/index.ts`
  - Internal-only (requires `x-internal-api-key`)
