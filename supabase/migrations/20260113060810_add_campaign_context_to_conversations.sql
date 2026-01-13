-- 2026-01-13
-- Persist campaign/workflow context at the conversation level so inbound replies
-- can reliably continue the correct flow (workflow + Google Sheets routing).

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_context jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS campaign_reply_sheet_tab text;

CREATE INDEX IF NOT EXISTS idx_conversations_campaign_id
  ON public.conversations (campaign_id);

CREATE INDEX IF NOT EXISTS idx_conversations_workflow_id
  ON public.conversations (workflow_id);
