# Phase 3 — Messaging & Campaign Stability (2026-01-18)

## Gaps fixed

### #38 Canonical message ordering
- DB: added `public.messages.order_at`.
- DB: trigger `trg_messages_set_order_at` maintains `order_at` from `wa_received_at/sent_at/created_at`.
- DB: index `messages_conversation_order_at_idx (conversation_id, order_at)`.
- App: updated message ordering:
  - `src/state/useChatStore.ts` now orders by `order_at`.
  - `supabase/functions/ai-handler/index.ts` now orders history by `order_at`.

### #39 Outbound idempotency
- DB: unique index `messages_org_outbound_dedupe_key_uniq` on `(organization_id, outbound_dedupe_key)` where not null.

### #40 Campaign dispatch claim + idempotency
- DB: RPC `public.claim_campaign_messages(...)` uses `FOR UPDATE SKIP LOCKED` to atomically claim work.
- DB: added claim/retry columns on `public.campaign_messages`:
  - `send_attempts`, `next_retry_at`, `locked_at`, `locked_by`, `last_attempt_at`.
- Edge: `supabase/functions/campaign-dispatch/index.ts` uses claim + retries.

### #41 Bounded retries
- Edge: `campaign-dispatch` schedules retries with exponential backoff and respects `MAX_SEND_ATTEMPTS`.

### #44 DLQ (dead-letter)
- DB: `public.message_delivery_dlq` table for permanently failed delivery items.
- Edge: `campaign-dispatch` writes to DLQ when `MAX_SEND_ATTEMPTS` is exceeded.

## Migration
- `supabase/migrations/20260118100000_phase3_messaging_campaign_stability.sql`
