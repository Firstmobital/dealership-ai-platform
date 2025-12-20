-- ============================================================
-- Step 1: WhatsApp Templates (DB)
-- ============================================================

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references public.organizations(id) on delete cascade,
  sub_organization_id uuid null references public.sub_organizations(id) on delete cascade,

  name text not null,
  category text not null default 'MARKETING',
  language text not null default 'en',

  header_type text null,         -- TEXT | IMAGE | VIDEO | DOCUMENT | null
  header_text text null,
  body text not null,
  footer text null,

  status text not null default 'draft', -- draft | pending | approved | rejected
  meta_template_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique per scope (org + optional suborg + template name + language)
create unique index if not exists uniq_whatsapp_templates_scope_name_lang
on public.whatsapp_templates (organization_id, sub_organization_id, name, language);

create index if not exists idx_whatsapp_templates_org
on public.whatsapp_templates (organization_id);

create index if not exists idx_whatsapp_templates_suborg
on public.whatsapp_templates (sub_organization_id);

-- RLS
alter table public.whatsapp_templates enable row level security;

-- Org members can read templates in their org
drop policy if exists "org_members_select_whatsapp_templates" on public.whatsapp_templates;
create policy "org_members_select_whatsapp_templates"
on public.whatsapp_templates
for select
using (
  exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = whatsapp_templates.organization_id
      and ou.user_id = auth.uid()
  )
);

-- Org members can manage templates in their org
drop policy if exists "org_members_modify_whatsapp_templates" on public.whatsapp_templates;
create policy "org_members_modify_whatsapp_templates"
on public.whatsapp_templates
for all
using (
  exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = whatsapp_templates.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = whatsapp_templates.organization_id
      and ou.user_id = auth.uid()
  )
);
