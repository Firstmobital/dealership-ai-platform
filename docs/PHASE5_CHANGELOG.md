# Phase 5 — Scale & Reliability

Gaps fixed: #10, #45, #46, #47

## DB changes
- Added hot-path indexes for inbox, messages, campaigns, and knowledge base.
- Added `ai_embeddings_cache` (service-role only) to reuse embeddings per org.
- Added per-org AI rate limits with RPC `consume_ai_quota`.
- Added background job primitives: `background_jobs` table + RPC `claim_background_jobs`.

## Edge function changes
- `ai-handler`:
  - Best-effort embedding cache lookup/insert.
  - Per-org rate limit enforcement for non-greeting messages (HTTP 429 on limit).

## Notes
- Background job worker is not enabled automatically. The primitives are added so you can add a scheduled worker later.
