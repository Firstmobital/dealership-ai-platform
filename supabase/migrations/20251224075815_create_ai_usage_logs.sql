-- =========================================================
-- Phase 4 — AI Usage Logging
-- Table: ai_usage_logs
-- =========================================================

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  sub_organization_id uuid
    references public.sub_organizations(id) on delete cascade,

  conversation_id uuid
    references public.conversations(id) on delete set null,

  message_id uuid
    references public.messages(id) on delete set null,

  provider text not null,
  model text not null,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,

  estimated_cost numeric(10,4) not null default 0,

  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index if not exists idx_ai_usage_logs_org
  on public.ai_usage_logs (organization_id);

create index if not exists idx_ai_usage_logs_created
  on public.ai_usage_logs (created_at);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.ai_usage_logs enable row level security;

-- Org users can read usage logs
create policy "ai_usage_logs_read"
on public.ai_usage_logs
for select
using (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = ai_usage_logs.organization_id
      and ou.user_id = auth.uid()
  )
);

-- Inserts allowed ONLY via service role (Edge Functions)
-- (No insert policy for authenticated users)
