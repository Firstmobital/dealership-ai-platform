-- Validation bundle for Phase 0 / 1 / 2 invariants

-- Phase 0: tenant-owned tables must not contain NULL organization_id
select 'messages' as table, count(*) as null_org from public.messages where organization_id is null
union all select 'conversations', count(*) from public.conversations where organization_id is null
union all select 'contacts', count(*) from public.contacts where organization_id is null
union all select 'knowledge_articles', count(*) from public.knowledge_articles where organization_id is null
union all select 'knowledge_chunks', count(*) from public.knowledge_chunks where organization_id is null
union all select 'campaigns', count(*) from public.campaigns where organization_id is null
union all select 'campaign_messages', count(*) from public.campaign_messages where organization_id is null
union all select 'workflows', count(*) from public.workflows where organization_id is null
union all select 'workflow_steps', count(*) from public.workflow_steps where organization_id is null
union all select 'workflow_logs', count(*) from public.workflow_logs where organization_id is null;

-- Phase 0: knowledge_chunks RLS enabled
select relrowsecurity as knowledge_chunks_rls
from pg_class
where relname = 'knowledge_chunks';

-- Phase 0: detect orphan rows
select count(*) as orphan_workflow_steps
from public.workflow_steps ws
left join public.workflows w on w.id = ws.workflow_id
where ws.workflow_id is not null and w.id is null;

select count(*) as orphan_workflow_logs
from public.workflow_logs wl
left join public.workflows w on w.id = wl.workflow_id
where wl.workflow_id is not null and w.id is null;

-- Phase 1: ensure internal-only functions are not callable without internal key
-- (manual test required; run curl without x-internal-api-key and expect 403)

-- Phase 2: ensure KB chunk isolation by tenant
select count(*) as kb_cross_tenant
from public.knowledge_chunks kc
join public.knowledge_articles ka on ka.id = kc.article_id
where kc.organization_id <> ka.organization_id;
