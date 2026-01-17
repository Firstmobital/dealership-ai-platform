# PHASE 2 — AI Grounding & Knowledge Correctness (Changelog)

## 1) AI Grounding — Knowledge Retrieval
**File:** `supabase/functions/ai-handler/index.ts`

### Semantic KB resolver changes
- Replaced loose semantic retrieval parameters with a **two-pass strict retrieval**:
  - Initial `match_threshold = 0.58`
  - Fallback `match_threshold = 0.50`
- Added **hard minimum similarity** filter (`0.48`) to drop noise.
- Added **soft minimum similarity** requirement (`0.55`) to inject KB context; if best match is weaker, **KB context is not injected**.
- Removed the previous "hard filter" that could drop all chunks when a locked `vehicleModel` was present. Instead:
  - Similarity remains primary.
  - A small deterministic boost is applied when the locked model appears in the KB title/chunk.
- KB context is kept compact and deduped.

**Expected user-visible impact:**
- Short follow-ups like "tell me more" stay on the locked topic/model but **will not answer with unrelated variants**.
- If KB does not strongly match the question, the AI will **avoid guessing** (no weak-context hallucinations).

## 2) Phase 1 Coverage Fixes (Explicitly Requested)
These are **not new product features**. They are Phase-1 boundary completions for previously uncovered service-role edge functions.

### Added user/org enforcement
- `supabase/functions/kb-save-from-unanswered/index.ts`
  - Requires user JWT + org membership + org role in `{owner, admin}`.
- `supabase/functions/contact-bulk-upload/index.ts`
  - Requires user JWT + org membership + org role in `{owner, admin}`.
- `supabase/functions/whatsapp-template-sync/index.ts`
  - Requires user JWT + org membership + org role in `{owner, admin}`.
- `supabase/functions/whatsapp-template-submit/index.ts`
  - Requires user JWT + org membership + org role in `{owner, admin}`.
- `supabase/functions/psf-send-manual-reminder/index.ts`
  - Requires user JWT + org membership (agent/admin/owner).

### Locked to internal key only
- `supabase/functions/psf-create-reminder/index.ts`
  - Requires `x-internal-api-key` header (`INTERNAL_API_KEY`).
- `supabase/functions/whatsapp-test-send/index.ts`
  - Requires `x-internal-api-key` header (`INTERNAL_API_KEY`).

