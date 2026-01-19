/* ============================================================================
   SQL CHECK (BEFORE)
============================================================================ */
-- messages table exists and column exists
select column_name
from information_schema.columns
where table_schema='public'
  and table_name='messages'
  and column_name in ('campaign_message_id','campaign_id','message_type','text');

-- confirm no existing index
select indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename='messages'
  and indexname='idx_messages_campaign_message_id';

/* ============================================================================
   CHANGE
============================================================================ */
create index if not exists idx_messages_campaign_message_id
  on public.messages (campaign_message_id)
  where campaign_message_id is not null;

/* ============================================================================
   SQL CHECK (AFTER)
============================================================================ */
select indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename='messages'
  and indexname='idx_messages_campaign_message_id';
