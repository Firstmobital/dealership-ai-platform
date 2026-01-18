-- Phase 6: DB validation queries (read-only)

-- 1) Prove tenant-owned tables do not contain NULL organization_id
select 'messages' as table_name, count(*) as null_org_rows from public.messages where organization_id is null
union all
select 'conversation_state', count(*) from public.conversation_state where organization_id is null
union all
select 'workflow_steps', count(*) from public.workflow_steps where organization_id is null
union all
select 'workflow_logs', count(*) from public.workflow_logs where organization_id is null
union all
select 'wallet_transactions', count(*) from public.wallet_transactions where organization_id is null;

-- 2) Prove knowledge_chunks has RLS enabled
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'knowledge_chunks';

-- 3) Surface views that do NOT expose organization_id (review for tenant safety)
-- NOTE: some global views may be safe, but this flags candidates.
select table_schema, table_name
from information_schema.views
where table_schema = 'public'
  and table_name not in (
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'organization_id'
      and table_name in (select table_name from information_schema.views where table_schema='public')
  );
