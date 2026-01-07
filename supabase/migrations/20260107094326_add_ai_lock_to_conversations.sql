alter table public.conversations
add column if not exists ai_locked boolean not null default false,
add column if not exists ai_locked_by uuid null,
add column if not exists ai_locked_at timestamptz null,
add column if not exists ai_lock_reason text null;

create index if not exists conversations_ai_locked_idx
on public.conversations (organization_id, ai_locked);

-- optional: FK if your "users" table exists in public (only add if you have it)
-- alter table public.conversations
-- add constraint conversations_ai_locked_by_fkey
-- foreign key (ai_locked_by) references public.users(id) on delete set null;
