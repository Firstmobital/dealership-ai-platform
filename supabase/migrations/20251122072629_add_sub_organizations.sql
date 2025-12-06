-- 1) Sub organizations (Sales, Service, etc)
create table public.sub_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default now(),

  constraint sub_org_slug_unique_per_org
    unique (organization_id, slug)
);

comment on table public.sub_organizations is
  'Sub-units of an organization, e.g. Sales / Service / Finance for a dealership.';


-- 2) Mapping users to sub-organizations (for fine-grained access)
create table public.sub_organization_users (
  id uuid primary key default gen_random_uuid(),
  sub_organization_id uuid not null references public.sub_organizations(id) on delete cascade,
  user_id uuid not null, -- maps to auth.users.id (and indirectly to your users table)
  role text not null default 'agent', -- e.g. admin/agent/viewer
  created_at timestamptz not null default now(),

  constraint sub_org_users_unique
    unique (sub_organization_id, user_id)
);

comment on table public.sub_organization_users is
  'Links users to sub-organizations with a role (admin / agent / etc).';
