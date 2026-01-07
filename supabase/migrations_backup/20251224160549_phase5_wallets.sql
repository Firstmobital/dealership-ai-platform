-- =========================================================
-- Phase 5 — Wallet / Pay-As-You-Go Billing (Step 5.1)
-- Tables:
--   - wallets (1 per organization)
--   - wallet_transactions (append-only ledger)
-- Changes:
--   - ai_usage_logs.wallet_transaction_id FK
-- Guarantees:
--   - No negative balance (enforced by trigger)
--   - Wallet auto-created for every new organization
--   - Ledger is append-only (no update/delete policies)
-- =========================================================

-- -----------------------------
-- 1) WALLETS
-- -----------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,

  balance numeric(12,4) not null default 0,
  total_credited numeric(12,4) not null default 0,
  total_debited numeric(12,4) not null default 0,

  currency text not null default 'INR',

  status text not null default 'active'
    check (status in ('active','suspended')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wallets_org
  on public.wallets (organization_id);

-- -----------------------------
-- 2) WALLET TRANSACTIONS (LEDGER)
-- -----------------------------
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),

  wallet_id uuid not null
    references public.wallets(id) on delete cascade,

  type text not null
    check (type in ('credit','debit','adjustment')),

  direction text not null
    check (direction in ('in','out')),

  amount numeric(12,4) not null
    check (amount > 0),

  reference_type text,
  reference_id uuid,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  -- Enforce semantic consistency:
  -- - credit must be direction=in
  -- - debit must be direction=out
  -- - adjustment may be in or out
  constraint wallet_txn_type_direction_check check (
    (type = 'credit' and direction = 'in')
    or (type = 'debit' and direction = 'out')
    or (type = 'adjustment' and direction in ('in','out'))
  ),

  -- Enforce debits are tied to AI usage
  constraint wallet_txn_debit_requires_ai_usage check (
    (type <> 'debit')
    or (reference_type = 'ai_usage' and reference_id is not null)
  )
);

create index if not exists idx_wallet_transactions_wallet
  on public.wallet_transactions (wallet_id);

create index if not exists idx_wallet_transactions_created
  on public.wallet_transactions (created_at);

create index if not exists idx_wallet_transactions_reference
  on public.wallet_transactions (reference_type, reference_id);

-- -----------------------------
-- 3) LINK AI USAGE LOGS → WALLET TXN
-- -----------------------------
alter table public.ai_usage_logs
add column if not exists wallet_transaction_id uuid
  references public.wallet_transactions(id) on delete set null;

create unique index if not exists uq_ai_usage_logs_wallet_transaction_id
  on public.ai_usage_logs (wallet_transaction_id)
  where wallet_transaction_id is not null;

-- =========================================================
-- 4) TRIGGERS: AUTO WALLET + NO NEGATIVE BALANCE + APPLY TXN
-- =========================================================

-- Auto-create wallet for each new organization
create or replace function public.phase5_create_wallet_for_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_phase5_create_wallet_for_org on public.organizations;
create trigger trg_phase5_create_wallet_for_org
after insert on public.organizations
for each row
execute function public.phase5_create_wallet_for_org();


-- Prevent negative balance BEFORE inserting an outgoing transaction
create or replace function public.phase5_wallet_prevent_negative_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12,4);
begin
  if new.direction = 'out' then
    select w.balance
      into v_balance
    from public.wallets w
    where w.id = new.wallet_id
    for update;

    if v_balance is null then
      raise exception 'Wallet not found for wallet_id=%', new.wallet_id;
    end if;

    if v_balance < new.amount then
      raise exception 'Insufficient wallet balance. Required=%, Available=%', new.amount, v_balance;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_phase5_wallet_prevent_negative_balance on public.wallet_transactions;
create trigger trg_phase5_wallet_prevent_negative_balance
before insert on public.wallet_transactions
for each row
execute function public.phase5_wallet_prevent_negative_balance();


-- Apply the transaction to wallet balance/totals AFTER insert
create or replace function public.phase5_wallet_apply_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'in' then
    update public.wallets
      set balance = balance + new.amount,
          total_credited = total_credited + new.amount,
          updated_at = now()
    where id = new.wallet_id;
  else
    update public.wallets
      set balance = balance - new.amount,
          total_debited = total_debited + new.amount,
          updated_at = now()
    where id = new.wallet_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_phase5_wallet_apply_transaction on public.wallet_transactions;
create trigger trg_phase5_wallet_apply_transaction
after insert on public.wallet_transactions
for each row
execute function public.phase5_wallet_apply_transaction();

-- =========================================================
-- 5) RLS
-- =========================================================
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

-- Org users can read wallets
drop policy if exists wallets_read on public.wallets;
create policy wallets_read
on public.wallets
for select
using (
  exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = wallets.organization_id
      and ou.user_id = auth.uid()
  )
);

-- Org users can read wallet transactions (via wallet → org)
drop policy if exists wallet_transactions_read on public.wallet_transactions;
create policy wallet_transactions_read
on public.wallet_transactions
for select
using (
  exists (
    select 1
    from public.wallets w
    join public.organization_users ou
      on ou.organization_id = w.organization_id
    where w.id = wallet_transactions.wallet_id
      and ou.user_id = auth.uid()
  )
);

-- Inserts/updates/deletes are intentionally NOT granted to authenticated users.
-- Service role (Edge Functions) bypasses RLS and can write.
