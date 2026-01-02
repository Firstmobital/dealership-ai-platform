-- =========================================================
-- Phase 5 — Wallet Completion (Step 5.2)
-- Add audit/commercial fields to wallet_transactions and
-- extend the wallet triggers to populate balance snapshots.
-- =========================================================

-- 1) ADD COLUMNS
alter table public.wallet_transactions
  add column if not exists purpose text not null default 'ai_chat',
  add column if not exists created_by uuid null,
  add column if not exists created_by_role text not null default 'system',
  add column if not exists balance_before numeric(12,4),
  add column if not exists balance_after numeric(12,4);

create index if not exists idx_wallet_transactions_purpose
  on public.wallet_transactions (purpose);

create index if not exists idx_wallet_transactions_created_by
  on public.wallet_transactions (created_by);

-- 2) EXPAND DEBIT REFERENCE CONSTRAINT
alter table public.wallet_transactions
  drop constraint if exists wallet_txn_debit_requires_ai_usage;

alter table public.wallet_transactions
  add constraint wallet_txn_debit_requires_reference
  check (
    (type <> 'debit')
    or (
      reference_type = any (array['ai_usage','campaign','voice'])
      and reference_id is not null
    )
  );

-- 3) ENFORCE BALANCE SNAPSHOTS FOR NEW ROWS
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wallet_txn_balance_snapshots_present'
  ) then
    alter table public.wallet_transactions
      add constraint wallet_txn_balance_snapshots_present
      check (balance_before is not null and balance_after is not null)
      not valid;
  end if;
end $$;


-- 4) UPDATE TRIGGER FUNCTION: prevent negative + set snapshots
create or replace function public.phase5_wallet_prevent_negative_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12,4);
begin
  -- Lock wallet row so snapshots are race-free.
  select w.balance
    into v_balance
  from public.wallets w
  where w.id = new.wallet_id
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for wallet_id=%', new.wallet_id;
  end if;

  if new.direction = 'out' then
    if v_balance < new.amount then
      raise exception 'Insufficient wallet balance. Required=%, Available=%',
        new.amount, v_balance;
    end if;

    new.balance_before := v_balance;
    new.balance_after  := v_balance - new.amount;
  else
    new.balance_before := v_balance;
    new.balance_after  := v_balance + new.amount;
  end if;

  return new;
end;
$$;
