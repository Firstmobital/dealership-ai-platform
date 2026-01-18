begin;

-- =========================
-- 1) HOT-PATH INDEXES (#10, #46)
-- =========================

create index if not exists conversations_org_last_message_at_idx
on public.conversations (organization_id, last_message_at desc);

create index if not exists messages_org_conversation_order_at_idx
on public.messages (organization_id, conversation_id, order_at desc);

create index if not exists messages_org_created_at_idx
on public.messages (organization_id, created_at desc);

create index if not exists campaign_messages_claim_idx
on public.campaign_messages (campaign_id, status, next_retry_at, locked_at);

create index if not exists knowledge_articles_org_updated_at_idx
on public.knowledge_articles (organization_id, updated_at desc);

-- =========================
-- 2) EMBEDDING CACHE (#45)
-- =========================

create table if not exists public.ai_embeddings_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model text not null,
  text_hash text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (organization_id, model, text_hash)
);

alter table public.ai_embeddings_cache enable row level security;

drop policy if exists ai_embeddings_cache_service_only on public.ai_embeddings_cache;
create policy ai_embeddings_cache_service_only
on public.ai_embeddings_cache
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- =========================
-- 3) PER-ORG RATE LIMITS (#45)
-- =========================

create table if not exists public.ai_org_rate_limits (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  window_seconds int not null default 60,
  max_requests int not null default 120,
  max_tokens int not null default 60000,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_org_rate_limit_usage (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  window_start timestamptz not null,
  request_count int not null default 0,
  token_count int not null default 0,
  primary key (organization_id, window_start)
);

alter table public.ai_org_rate_limits enable row level security;
alter table public.ai_org_rate_limit_usage enable row level security;

drop policy if exists ai_org_rate_limits_read_org on public.ai_org_rate_limits;
create policy ai_org_rate_limits_read_org
on public.ai_org_rate_limits
for select
to public
using (
  exists (
    select 1 from public.organization_users ou
    where ou.user_id = auth.uid()
      and ou.organization_id = ai_org_rate_limits.organization_id
  )
);

drop policy if exists ai_org_rate_limits_write_service_only on public.ai_org_rate_limits;
create policy ai_org_rate_limits_write_service_only
on public.ai_org_rate_limits
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists ai_org_rate_limit_usage_service_only on public.ai_org_rate_limit_usage;
create policy ai_org_rate_limit_usage_service_only
on public.ai_org_rate_limit_usage
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.consume_ai_quota(
  p_organization_id uuid,
  p_estimated_tokens int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  limits record;
  win_start timestamptz;
  rowrec record;
begin
  select * into limits
  from public.ai_org_rate_limits
  where organization_id = p_organization_id;

  -- If there is no limits row, allow by default (can be configured later).
  if limits is null or limits.enabled = false then
    return jsonb_build_object('allowed', true, 'window_start', null);
  end if;

  win_start := to_timestamp(
    floor(extract(epoch from now()) / limits.window_seconds) * limits.window_seconds
  );

  insert into public.ai_org_rate_limit_usage (organization_id, window_start, request_count, token_count)
  values (p_organization_id, win_start, 1, greatest(p_estimated_tokens, 0))
  on conflict (organization_id, window_start)
  do update set
    request_count = public.ai_org_rate_limit_usage.request_count + 1,
    token_count   = public.ai_org_rate_limit_usage.token_count + greatest(p_estimated_tokens, 0)
  returning request_count, token_count into rowrec;

  if rowrec.request_count > limits.max_requests or rowrec.token_count > limits.max_tokens then
    raise exception 'ai_rate_limit_exceeded' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'window_start', win_start,
    'request_count', rowrec.request_count,
    'token_count', rowrec.token_count
  );
end;
$$;

revoke all on function public.consume_ai_quota(uuid, int) from public;
grant execute on function public.consume_ai_quota(uuid, int) to public;

-- =========================
-- 4) BACKGROUND JOB QUEUE PRIMITIVES (#47)
-- =========================

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,

  status text not null default 'queued',
  run_at timestamptz not null default now(),

  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists background_jobs_status_run_at_idx
on public.background_jobs (status, run_at asc);

create index if not exists background_jobs_org_status_run_at_idx
on public.background_jobs (organization_id, status, run_at asc);

alter table public.background_jobs enable row level security;

drop policy if exists background_jobs_service_only on public.background_jobs;
create policy background_jobs_service_only
on public.background_jobs
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.claim_background_jobs(
  p_limit int,
  p_worker_id text,
  p_lock_ttl_seconds int default 300
) returns setof public.background_jobs
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.background_jobs
    where status = 'queued'
      and run_at <= now()
      and (locked_at is null or locked_at < now() - (p_lock_ttl_seconds || ' seconds')::interval)
    order by run_at asc
    for update skip locked
    limit p_limit
  )
  update public.background_jobs bj
  set
    status = 'running',
    locked_at = now(),
    locked_by = p_worker_id,
    attempts = attempts + 1,
    updated_at = now()
  where bj.id in (select id from picked)
  returning *;
$$;

revoke all on function public.claim_background_jobs(int, text, int) from public;
grant execute on function public.claim_background_jobs(int, text, int) to public;

commit;
