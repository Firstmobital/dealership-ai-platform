-- supabase/migrations/20260223121000_allow_lead_manager_org_users_role_check.sql

alter table public.organization_users
  drop constraint if exists organization_users_role_check;

alter table public.organization_users
  add constraint organization_users_role_check
  check (
    role = any (array['owner'::text, 'admin'::text, 'agent'::text, 'team_leader'::text, 'lead_manager'::text])
  );
