-- supabase/migrations/20260228120000_media_assets.sql
-- Multi-tenant media library for car images + brochures

begin;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_type text not null check (asset_type in ('image','brochure')),
  model text null,
  variant text null,
  title text not null,
  storage_bucket text not null default 'media',
  storage_path text not null,
  mime_type text null,
  filename text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_assets_org_type_active
  on public.media_assets (organization_id, asset_type, is_active);

create index if not exists idx_media_assets_org_model_variant
  on public.media_assets (organization_id, model, variant);

-- updated_at trigger
-- Reuse shared function public.set_updated_at() (already present in schema dumps/migrations).
drop trigger if exists set_media_assets_updated_at on public.media_assets;
create trigger set_media_assets_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

alter table public.media_assets enable row level security;

-- RLS: org members can read/write their org media assets
-- Match existing org membership pattern (organization_users with auth.uid()).
-- Service role convention: some tables in this repo include explicit auth.role() = 'service_role' bypass.

drop policy if exists "media_assets_select_org" on public.media_assets;
create policy "media_assets_select_org"
on public.media_assets
as permissive
for select
to public
using (
  auth.role() = 'service_role'
  or organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
);

drop policy if exists "media_assets_insert_org" on public.media_assets;
create policy "media_assets_insert_org"
on public.media_assets
as permissive
for insert
to public
with check (
  auth.role() = 'service_role'
  or organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
);

drop policy if exists "media_assets_update_org" on public.media_assets;
create policy "media_assets_update_org"
on public.media_assets
as permissive
for update
to public
using (
  auth.role() = 'service_role'
  or organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
)
with check (
  auth.role() = 'service_role'
  or organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
);

drop policy if exists "media_assets_delete_org" on public.media_assets;
create policy "media_assets_delete_org"
on public.media_assets
as permissive
for delete
to public
using (
  auth.role() = 'service_role'
  or organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
);

commit;
