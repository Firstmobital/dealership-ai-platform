-- Add JSON metadata to contacts for flexible CSV/Excel uploads

alter table public.contacts
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_contacts_org_metadata
on public.contacts using gin (metadata);

