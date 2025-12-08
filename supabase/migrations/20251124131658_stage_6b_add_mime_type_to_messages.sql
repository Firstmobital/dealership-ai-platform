-- =====================================================================
-- Stage 6B – Add mime_type to messages for WhatsApp media
-- =====================================================================

alter table public.messages
  add column if not exists mime_type text;
