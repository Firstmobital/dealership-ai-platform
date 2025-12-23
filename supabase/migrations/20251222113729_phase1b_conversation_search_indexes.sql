-- Fast search indexes for Phase 1B

create index if not exists idx_contacts_org_phone
on public.contacts (organization_id, phone);

create index if not exists idx_contacts_org_name
on public.contacts (organization_id, name);

create index if not exists idx_conversations_org_last_message_at
on public.conversations (organization_id, last_message_at desc);

create index if not exists idx_conversations_org_assigned
on public.conversations (organization_id, assigned_to);
