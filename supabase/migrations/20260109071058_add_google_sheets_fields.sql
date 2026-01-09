-- STEP 1 — Google Sheets logging fields
-- Adds:
--   organizations.google_sheet_id (one sheet per org)
--   campaigns.reply_sheet_tab (which tab replies should be logged into)

alter table public.organizations
  add column if not exists google_sheet_id text;

alter table public.campaigns
  add column if not exists reply_sheet_tab text;
