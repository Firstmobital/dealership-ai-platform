-- Add conversations.customer_reply_count and keep it updated.
-- Also add indexes for fast org-scoped list queries.

begin;

alter table public.conversations
  add column if not exists customer_reply_count integer not null default 0;

-- Backfill from existing messages (counts only customer/inbound)
-- Assumes messages.sender uses 'customer' for inbound. If your schema uses another value,
-- adjust the predicate accordingly.
with counts as (
  select
    m.conversation_id,
    count(*)::int as customer_reply_count
  from public.messages m
  where coalesce(m.sender, '') in ('customer', 'lead', 'inbound')
  group by m.conversation_id
)
update public.conversations c
set customer_reply_count = coalesce(ct.customer_reply_count, 0)
from counts ct
where c.id = ct.conversation_id;

-- Trigger function: increment on INSERT of a customer message
create or replace function public.bump_conversation_customer_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is null then
    return new;
  end if;

  -- Count only inbound/customer messages.
  if coalesce(new.sender, '') in ('customer', 'lead', 'inbound') then
    update public.conversations
      set customer_reply_count = customer_reply_count + 1
    where id = new.conversation_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_bump_customer_reply_count on public.messages;
create trigger trg_messages_bump_customer_reply_count
after insert
on public.messages
for each row
execute function public.bump_conversation_customer_reply_count();

-- Indexes
-- 1) Sidebar pagination: org + last_message ordering
create index if not exists idx_conversations_org_last_message_at_desc
  on public.conversations (organization_id, last_message_at desc, id desc);

-- 2) Reply-count filter
create index if not exists idx_conversations_org_customer_reply_count
  on public.conversations (organization_id, customer_reply_count);

-- 3) Search helpers (if you also denormalize phone/name onto conversations)
-- NOTE: current UI search joins contacts; these indexes apply only if these columns exist in conversations.
-- If your conversations table doesn't have phone/name columns, you can omit these.
create index if not exists idx_conversations_org_phone
  on public.conversations (organization_id, phone);

create index if not exists idx_conversations_org_name
  on public.conversations (organization_id, name);

commit;
