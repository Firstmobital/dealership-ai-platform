-- 2026-01-07
-- P1-A: Outbound idempotency for WhatsApp sends

alter table public.messages
add column if not exists outbound_dedupe_key text;

-- Ensure a conversation cannot have duplicate sends with the same key
create unique index if not exists uniq_messages_outbound_dedupe_key
on public.messages (conversation_id, outbound_dedupe_key)
where outbound_dedupe_key is not null;
