# Phase 3 Validation Checklist

## A) Canonical message ordering
1. DB: verify `messages.order_at` exists and is populated:
   ```sql
   select count(*) as null_order_at from public.messages where order_at is null;
   ```
2. DB: verify trigger exists:
   ```sql
   select tgname from pg_trigger where tgname = 'trg_messages_set_order_at';
   ```
3. UI: open a conversation with both inbound/outbound messages and confirm message list ordering matches WhatsApp timeline.

## B) Outbound idempotency
1. DB: verify unique index exists:
   ```sql
   select indexname from pg_indexes where indexname = 'messages_org_outbound_dedupe_key_uniq';
   ```
2. Send a campaign message twice (rerun dispatch) and confirm only one outbound message is created for the same dedupe material.

## C) Campaign claim + bounded retries
1. DB: verify RPC exists:
   ```sql
   select proname from pg_proc where proname = 'claim_campaign_messages';
   ```
2. Trigger concurrent runs (two dispatch invocations) and confirm a campaign message is claimed by only one run.
3. Force WhatsApp API failure and confirm:
   - attempts increase
   - `next_retry_at` set
   - after max attempts, message moves to `failed` and DLQ row exists.

## D) DLQ
1. DB: verify table exists:
   ```sql
   select to_regclass('public.message_delivery_dlq');
   ```
2. Confirm DLQ rows are only writable by service_role.
