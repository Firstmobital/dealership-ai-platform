-- Lead management fields for contacts
-- Backward compatible: all new columns are nullable; constraints allow NULL values.

begin;

alter table public.contacts
  add column if not exists lead_status text,
  add column if not exists priority text,
  add column if not exists next_followup_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists last_outcome text,
  add column if not exists lost_reason text;

-- CHECK constraints (NULL permitted)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_lead_status_check'
  ) then
    alter table public.contacts
      add constraint contacts_lead_status_check
      check (
        lead_status is null
        or lead_status in (
          'new',
          'contacted',
          'qualified',
          'visit_scheduled',
          'booked',
          'lost'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_priority_check'
  ) then
    alter table public.contacts
      add constraint contacts_priority_check
      check (
        priority is null
        or priority in ('cold','warm','hot')
      );
  end if;
end $$;

-- Indexes to support lead queues and follow-up views
create index if not exists idx_contacts_org_assigned_next_followup
  on public.contacts (organization_id, assigned_to_user_id, next_followup_at);

create index if not exists idx_contacts_org_lead_status
  on public.contacts (organization_id, lead_status);

commit;
