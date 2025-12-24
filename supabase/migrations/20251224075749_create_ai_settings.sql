-- =========================================================
-- Phase 4 — AI Configuration
-- Table: ai_settings
-- =========================================================

create table if not exists public.ai_settings (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  sub_organization_id uuid
    references public.sub_organizations(id) on delete cascade,

  ai_enabled boolean not null default true,

  provider text not null
    check (provider in ('openai', 'gemini')),

  model text not null,

  kb_search_type text not null
    check (kb_search_type in ('default', 'hybrid', 'title')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, sub_organization_id)
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index if not exists idx_ai_settings_org
  on public.ai_settings (organization_id);

create index if not exists idx_ai_settings_org_suborg
  on public.ai_settings (organization_id, sub_organization_id);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.ai_settings enable row level security;

-- Org members can read settings
create policy "ai_settings_read"
on public.ai_settings
for select
using (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = ai_settings.organization_id
      and ou.user_id = auth.uid()
  )
);

-- Org admins can update settings
create policy "ai_settings_update"
on public.ai_settings
for update
using (
  exists (
    select 1 from public.organization_users ou
    where ou.organization_id = ai_settings.organization_id
      and ou.user_id = auth.uid()
  )
);
