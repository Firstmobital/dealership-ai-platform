-- P0-A: WhatsApp delivery/read receipts for inbox messages

alter table public.messages
  add column if not exists whatsapp_status text;

alter table public.messages
  add column if not exists sent_at timestamp with time zone;

alter table public.messages
  add column if not exists delivered_at timestamp with time zone;

alter table public.messages
  add column if not exists read_at timestamp with time zone;

create index if not exists idx_messages_whatsapp_receipts
  on public.messages (whatsapp_status)
  where whatsapp_status is not null;
