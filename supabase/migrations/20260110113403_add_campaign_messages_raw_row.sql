
alter table contacts
add column if not exists metadata jsonb default '{}'::jsonb;

alter table campaign_messages
add column if not exists raw_row jsonb;