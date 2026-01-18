begin;

-- PHASE 4 - OBSERVABILITY AND DEBUGGING

-- 1) AI TURN TRACES
create table if not exists public.ai_turn_traces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  request_id text,
  channel text,
  caller_type text,
  input_message_id uuid references public.messages(id) on delete set null,
  output_message_id uuid references public.messages(id) on delete set null,
  user_text text,
  intent text,
  workflow_id uuid references public.workflows(id) on delete set null,
  kb_used boolean not null default false,
  kb_reason text,
  kb_threshold numeric,
  kb_top_score numeric,
  kb_chunks jsonb not null default '[]'::jsonb,
  model_provider text,
  model_name text,
  prompt_hash text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric,
  decision jsonb not null default '{}'::jsonb,
  error_stage text,
  error jsonb,
  status text not null default 'started',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ai_turn_traces_org_started_at_idx
on public.ai_turn_traces (organization_id, started_at desc);

create index if not exists ai_turn_traces_conv_started_at_idx
on public.ai_turn_traces (conversation_id, started_at desc);

alter table public.ai_turn_traces enable row level security;

drop policy if exists ai_turn_traces_read_org on public.ai_turn_traces;
create policy ai_turn_traces_read_org
on public.ai_turn_traces
for select
to public
using (
  exists (
    select 1
    from public.organization_users ou
    where ou.user_id = auth.uid()
      and ou.organization_id = ai_turn_traces.organization_id
  )
);

drop policy if exists ai_turn_traces_write_service_only on public.ai_turn_traces;
create policy ai_turn_traces_write_service_only
on public.ai_turn_traces
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- 2) MESSAGE DELIVERY EVENTS
create table if not exists public.message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  campaign_message_id uuid references public.campaign_messages(id) on delete set null,
  event_type text not null,
  source text not null,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists message_delivery_events_org_event_at_idx
on public.message_delivery_events (organization_id, event_at desc);

create index if not exists message_delivery_events_message_idx
on public.message_delivery_events (message_id, event_at desc);

create index if not exists message_delivery_events_campaign_message_idx
on public.message_delivery_events (campaign_message_id, event_at desc);

alter table public.message_delivery_events enable row level security;

drop policy if exists message_delivery_events_read_org on public.message_delivery_events;
create policy message_delivery_events_read_org
on public.message_delivery_events
for select
to public
using (
  exists (
    select 1
    from public.organization_users ou
    where ou.user_id = auth.uid()
      and ou.organization_id = message_delivery_events.organization_id
  )
);

drop policy if exists message_delivery_events_write_service_only on public.message_delivery_events;
create policy message_delivery_events_write_service_only
on public.message_delivery_events
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- 3) REPLAY REQUESTS
create table if not exists public.replay_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  requested_by uuid default auth.uid(),
  requested_at timestamptz not null default now(),
  status text not null default 'queued',
  last_error text,
  result jsonb not null default '{}'::jsonb
);

create index if not exists replay_requests_org_requested_at_idx
on public.replay_requests (organization_id, requested_at desc);

alter table public.replay_requests enable row level security;

drop policy if exists replay_requests_read_org on public.replay_requests;
create policy replay_requests_read_org
on public.replay_requests
for select
to public
using (
  exists (
    select 1
    from public.organization_users ou
    where ou.user_id = auth.uid()
      and ou.organization_id = replay_requests.organization_id
  )
);

drop policy if exists replay_requests_insert_org on public.replay_requests;
create policy replay_requests_insert_org
on public.replay_requests
for insert
to public
with check (
  exists (
    select 1
    from public.organization_users ou
    where ou.user_id = auth.uid()
      and ou.organization_id = replay_requests.organization_id
  )
);

drop policy if exists replay_requests_update_service_only on public.replay_requests;
create policy replay_requests_update_service_only
on public.replay_requests
for update
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- 4) DEBUGGING VIEWS
create or replace view public.ai_failures_last_24h_view as
select *
from public.ai_turn_traces
where started_at >= now() - interval '24 hours'
  and status = 'failed'
order by started_at desc;

create or replace view public.delivery_failures_last_24h_view as
select *
from public.message_delivery_events
where event_at >= now() - interval '24 hours'
  and event_type = 'failed'
order by event_at desc;

create or replace view public.stuck_campaign_messages_view as
select cm.*
from public.campaign_messages cm
where cm.status in ('pending','queued')
  and (
    (cm.locked_at is not null and cm.locked_at < now() - interval '10 minutes')
    or (cm.next_retry_at is not null and cm.next_retry_at < now() - interval '10 minutes')
  )
order by cm.created_at asc;

commit;
