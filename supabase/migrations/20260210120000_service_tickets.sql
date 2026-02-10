-- 20260210120000_service_tickets.sql
-- Minimal viable Service Ticket workflow support

create table if not exists public.service_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null default 'web',
  ticket_type text not null default 'general' check (ticket_type in ('booking','status','complaint','general')),
  status text not null default 'open' check (status in ('open','pending','closed')),
  vehicle_number text,
  preferred_slot text,
  description text,
  created_by text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_service_tickets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_service_tickets_updated_at on public.service_tickets;
create trigger trg_service_tickets_updated_at
before update on public.service_tickets
for each row execute function public.set_service_tickets_updated_at();

alter table public.service_tickets enable row level security;

-- RLS: org members can read/write their org tickets
drop policy if exists "service_tickets_select_org" on public.service_tickets;
create policy "service_tickets_select_org"
on public.service_tickets
for select
to authenticated
using (
  organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
);

drop policy if exists "service_tickets_insert_org" on public.service_tickets;
create policy "service_tickets_insert_org"
on public.service_tickets
for insert
to authenticated
with check (
  organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
);

drop policy if exists "service_tickets_update_org" on public.service_tickets;
create policy "service_tickets_update_org"
on public.service_tickets
for update
to authenticated
using (
  organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
)
with check (
  organization_id in (
    select organization_id from public.organization_users where user_id = auth.uid()
  )
);
