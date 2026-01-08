-- Adds organization_id to wallet_transactions so the frontend can query by organization.
-- Required by /settings/wallet which filters wallet_transactions by organization_id.

alter table public.wallet_transactions
  add column if not exists organization_id uuid;

-- Backfill existing rows using wallet_id -> wallets.organization_id
update public.wallet_transactions wt
set organization_id = w.organization_id
from public.wallets w
where w.id = wt.wallet_id
  and wt.organization_id is null;

-- Ensure future inserts always have organization_id
alter table public.wallet_transactions
  alter column organization_id set not null;

-- Helpful indexes
create index if not exists idx_wallet_transactions_org_created
  on public.wallet_transactions (organization_id, created_at desc);

-- Optional FK (safe for tenancy)
alter table public.wallet_transactions
  add constraint wallet_transactions_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete cascade;
