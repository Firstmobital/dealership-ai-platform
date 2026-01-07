-- =====================================================================
-- Stage 6D – Idempotency & metadata for WhatsApp inbound messages
-- =====================================================================

alter table public.messages
  add column if not exists whatsapp_message_id text,
  add column if not exists wa_received_at timestamptz;

-- Prevent duplicate processing of the same WA message
create unique index if not exists uniq_messages_whatsapp_message_id
  on public.messages (whatsapp_message_id)
  where whatsapp_message_id is not null;
