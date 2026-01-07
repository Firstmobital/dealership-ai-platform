-- 2026-01-07
-- P1-B: Log unmatched campaign delivery receipts (dead-letter)

create table if not exists public.campaign_delivery_receipt_failures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  whatsapp_message_id text,
  status text,
  error_title text,
  received_at timestamptz not null default now(),
  raw_status jsonb not null default '{}'::jsonb,
  raw_value jsonb not null default '{}'::jsonb
);

alter table public.campaign_delivery_receipt_failures enable row level security;

-- org members can read
drop policy if exists cdrf_select_org on public.campaign_delivery_receipt_failures;
create policy cdrf_select_org
on public.campaign_delivery_receipt_failures
for select
to authenticated
using (
  organization_id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
);

-- service role can write
drop policy if exists cdrf_service_role_all on public.campaign_delivery_receipt_failures;
create policy cdrf_service_role_all
on public.campaign_delivery_receipt_failures
for all
to service_role
using (true)
with check (true);

create index if not exists cdrf_org_received_idx
on public.campaign_delivery_receipt_failures (organization_id, received_at desc);
