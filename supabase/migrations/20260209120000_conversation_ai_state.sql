-- Adds persistent conversation AI state

begin;

alter table public.conversations add column if not exists ai_state jsonb not null default '{}'::jsonb;
alter table public.conversations add column if not exists funnel_stage text;
alter table public.conversations add column if not exists intent_confidence double precision;
alter table public.conversations add column if not exists intent_updated_at timestamp with time zone;
alter table public.conversations add column if not exists last_workflow_id uuid;
alter table public.conversations add column if not exists last_workflow_run_at timestamp with time zone;
alter table public.conversations add column if not exists last_kb_hit_count integer;
alter table public.conversations add column if not exists last_kb_article_ids uuid[];
alter table public.conversations add column if not exists last_kb_match_confidence text;

create index if not exists conversations_org_intent_updated_at_idx
  on public.conversations (organization_id, intent_updated_at desc);

commit;
