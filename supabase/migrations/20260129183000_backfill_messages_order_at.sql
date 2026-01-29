-- P1 RELIABILITY
-- Backfill messages.order_at for any legacy rows where trigger didn't populate it.
-- Safe and backward compatible.

begin;

update public.messages
set order_at = coalesce(wa_received_at, sent_at, created_at, now())
where order_at is null;

commit;
