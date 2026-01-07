-- =====================================================
-- PSF ENUMS (SAFE)
-- =====================================================

do $$ begin
  create type psf_sentiment as enum ('positive','neutral','negative','no_reply');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type psf_resolution_status as enum ('open','resolved');
exception when duplicate_object then null;
end $$;

-- =====================================================
-- PSF CASES TABLE (SAFE)
-- =====================================================

create table if not exists psf_cases (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references organizations(id) on delete cascade,

  campaign_id uuid references campaigns(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,

  phone text not null,
  customer_name text,

  uploaded_data jsonb not null default '{}',

  sentiment psf_sentiment not null default 'no_reply',
  ai_summary text,
  action_required boolean not null default false,

  resolution_status psf_resolution_status not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid,

  reminder_count integer not null default 0,
  last_reminder_at timestamptz,

  initial_sent_at timestamptz,
  first_customer_reply_at timestamptz,
  last_customer_reply_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================
-- PATCH EXISTING TABLE (SCHEMA DRIFT SAFE)
-- =====================================================

alter table psf_cases add column if not exists customer_name text;
alter table psf_cases add column if not exists uploaded_data jsonb not null default '{}';
alter table psf_cases add column if not exists sentiment psf_sentiment not null default 'no_reply';
alter table psf_cases add column if not exists ai_summary text;
alter table psf_cases add column if not exists action_required boolean not null default false;
alter table psf_cases add column if not exists resolution_status psf_resolution_status not null default 'open';
alter table psf_cases add column if not exists resolved_at timestamptz;
alter table psf_cases add column if not exists resolved_by uuid;
alter table psf_cases add column if not exists reminder_count integer not null default 0;
alter table psf_cases add column if not exists last_reminder_at timestamptz;
alter table psf_cases add column if not exists initial_sent_at timestamptz;
alter table psf_cases add column if not exists first_customer_reply_at timestamptz;
alter table psf_cases add column if not exists last_customer_reply_at timestamptz;

-- =====================================================
-- INDEXES (SAFE)
-- =====================================================

create index if not exists idx_psf_cases_org_created
  on psf_cases (organization_id, created_at desc);

create index if not exists idx_psf_cases_campaign_phone
  on psf_cases (campaign_id, phone);

create index if not exists idx_psf_cases_conversation
  on psf_cases (conversation_id);

create index if not exists idx_psf_cases_sentiment
  on psf_cases (sentiment);

create index if not exists idx_psf_cases_action_required
  on psf_cases (action_required)
  where action_required = true;

-- =====================================================
-- UPDATED_AT TRIGGER (SAFE)
-- =====================================================

create or replace function update_psf_cases_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_psf_cases_updated_at on psf_cases;

create trigger trg_psf_cases_updated_at
before update on psf_cases
for each row
execute function update_psf_cases_updated_at();

-- =====================================================
-- DROP & RECREATE VIEW (THIS FIXES YOUR ERROR)
-- =====================================================

drop view if exists psf_cases_view;

create view psf_cases_view
with (security_invoker = true)
as
select
  pc.id,
  pc.organization_id,

  pc.phone,
  pc.customer_name,
  pc.uploaded_data,

  pc.sentiment,
  pc.ai_summary,
  pc.action_required,

  pc.resolution_status,
  pc.resolved_at,

  pc.reminder_count,
  pc.last_reminder_at,

  pc.initial_sent_at,
  pc.first_customer_reply_at,
  pc.last_customer_reply_at,

  pc.created_at,

  c.id as conversation_id,
  c.channel,
  c.last_message_at

from psf_cases pc
left join conversations c
  on c.id = pc.conversation_id;

-- =====================================================
-- RLS (SAFE)
-- =====================================================

alter table psf_cases enable row level security;

do $$ begin
  create policy "psf read org"
  on psf_cases for select
  using (
    organization_id in (
      select organization_id
      from organization_users
      where user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "psf insert org"
  on psf_cases for insert
  with check (
    organization_id in (
      select organization_id
      from organization_users
      where user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "psf update org"
  on psf_cases for update
  using (
    organization_id in (
      select organization_id
      from organization_users
      where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id
      from organization_users
      where user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

grant select on psf_cases_view to authenticated;
