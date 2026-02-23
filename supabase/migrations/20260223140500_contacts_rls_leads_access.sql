-- supabase/migrations/20260223140500_contacts_rls_leads_access.sql
-- Tighten RLS for contacts to match role-based access:
-- - owner/admin/lead_manager/team_leader: org-wide
-- - agent: only assigned_to_user_id = auth.uid()

begin;

-- Ensure RLS is enabled (idempotent)
alter table public.contacts enable row level security;

-- Drop overly-permissive / legacy policies explicitly (safe if they don't exist)
drop policy if exists "contacts_members_all" on public.contacts;
drop policy if exists "contacts_select_org_members" on public.contacts;
drop policy if exists "org_members_select_contacts" on public.contacts;
drop policy if exists "org_members_manage_contacts" on public.contacts;
drop policy if exists "org_members_modify_contacts" on public.contacts;
drop policy if exists "contacts_update_org_members" on public.contacts;

-- Keep existing insert/delete policies untouched in this task.

-- Helper predicate inline: check org membership + role.
-- Note: service_role bypass stays intact via explicit auth.role() checks.

create policy "contacts_select_role_scoped"
on public.contacts
as permissive
for select
to public
using (
  auth.role() = 'service_role'
  or exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = contacts.organization_id
      and ou.user_id = auth.uid()
      and (
        ou.role in ('owner','admin','lead_manager','team_leader')
        or (ou.role = 'agent' and contacts.assigned_to_user_id = auth.uid())
      )
  )
);

create policy "contacts_update_role_scoped"
on public.contacts
as permissive
for update
to public
using (
  auth.role() = 'service_role'
  or exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = contacts.organization_id
      and ou.user_id = auth.uid()
      and (
        ou.role in ('owner','admin','lead_manager','team_leader')
        or (ou.role = 'agent' and contacts.assigned_to_user_id = auth.uid())
      )
  )
)
with check (
  auth.role() = 'service_role'
  or exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = contacts.organization_id
      and ou.user_id = auth.uid()
      and (
        ou.role in ('owner','admin','lead_manager','team_leader')
        or (ou.role = 'agent' and contacts.assigned_to_user_id = auth.uid())
      )
  )
);

commit;
