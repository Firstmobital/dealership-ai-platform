-- supabase/migrations/20260223120000_can_access_assigned_user_lead_manager.sql

create or replace function public.can_access_assigned_user(org_id uuid, assigned_user_id uuid)
returns boolean
language sql
stable
as $$
  select
    (
      (select ou.role in ('admin','team_leader','lead_manager')
       from public.organization_users ou
       where ou.organization_id = org_id
         and ou.user_id = auth.uid())
    )
    or
    (assigned_user_id is not null and assigned_user_id = auth.uid());
$$;
