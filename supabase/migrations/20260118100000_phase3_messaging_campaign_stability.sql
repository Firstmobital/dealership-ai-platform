/*
PHASE 3 — MESSAGING & CAMPAIGN STABILITY

Scope (locked):
1) Canonical message ordering key: messages.order_at
2) DB-level idempotency: unique (organization_id, outbound_dedupe_key) WHERE outbound_dedupe_key IS NOT NULL
3) Campaign dispatch claim + bounded retries: claim columns + claim_campaign_messages RPC
4) DLQ: public.message_delivery_dlq
*/

begin;

/* =====================================================================
   1) Canonical message ordering key
   ===================================================================== */

alter table public.messages
  add column if not exists order_at timestamp with time zone;

update public.messages
set order_at = coalesce(wa_received_at, sent_at, created_at)
where order_at is null;

create or replace function public.set_message_order_at()
returns trigger
language plpgsql
as $$
begin
  new.order_at := coalesce(new.wa_received_at, new.sent_at, new.created_at, now());
  return new;
end;
$$;

drop trigger if exists trg_messages_set_order_at on public.messages;
create trigger trg_messages_set_order_at
before insert or update of wa_received_at, sent_at, created_at
on public.messages
for each row
execute function public.set_message_order_at();

create index if not exists messages_conversation_order_at_idx
on public.messages (conversation_id, order_at);

/* =====================================================================
   2) Outbound idempotency
   ===================================================================== */

create unique index if not exists messages_org_outbound_dedupe_key_uniq
on public.messages (organization_id, outbound_dedupe_key)
where outbound_dedupe_key is not null;

/* =====================================================================
   3) Campaign dispatch claim + bounded retries
   ===================================================================== */

alter table public.campaign_messages
  add column if not exists send_attempts integer not null default 0,
  add column if not exists next_retry_at timestamp with time zone,
  add column if not exists locked_at timestamp with time zone,
  add column if not exists locked_by text,
  add column if not exists last_attempt_at timestamp with time zone;

alter table public.campaign_messages
  drop constraint if exists campaign_messages_send_attempts_nonnegative;
alter table public.campaign_messages
  add constraint campaign_messages_send_attempts_nonnegative check (send_attempts >= 0);

create index if not exists campaign_messages_claim_idx
on public.campaign_messages (campaign_id, status, next_retry_at, created_at);

create or replace function public.claim_campaign_messages(
  p_campaign_id uuid,
  p_limit integer,
  p_worker_id text,
  p_lock_ttl_seconds integer default 300
)
returns setof public.campaign_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ttl interval := make_interval(secs => greatest(p_lock_ttl_seconds, 30));
begin
  return query
  with candidates as (
    select cm.id
    from public.campaign_messages cm
    where cm.campaign_id = p_campaign_id
      and cm.status in ('pending', 'queued')
      and (cm.next_retry_at is null or cm.next_retry_at <= now())
      and (cm.locked_at is null or cm.locked_at <= now() - v_ttl)
    order by cm.created_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.campaign_messages cm
  set
    status = 'queued',
    locked_at = now(),
    locked_by = p_worker_id,
    send_attempts = cm.send_attempts + 1,
    last_attempt_at = now()
  where cm.id in (select id from candidates)
  returning cm.*;
end;
$$;

revoke all on function public.claim_campaign_messages(uuid, integer, text, integer) from public;

/* =====================================================================
   4) DLQ for delivery failures
   ===================================================================== */

create table if not exists public.message_delivery_dlq (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null,
  entity_type text not null,
  entity_id uuid not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists message_delivery_dlq_org_created_at_idx
on public.message_delivery_dlq (organization_id, created_at desc);

alter table public.message_delivery_dlq enable row level security;

drop policy if exists message_delivery_dlq_service_only on public.message_delivery_dlq;
create policy message_delivery_dlq_service_only
on public.message_delivery_dlq
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

commit;
