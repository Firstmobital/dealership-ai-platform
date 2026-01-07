-- 2026-01-07
-- P1-C: Expiring AI takeover lock

alter table public.conversations
add column if not exists ai_locked_until timestamptz null;

create index if not exists conversations_ai_locked_until_idx
on public.conversations (organization_id, ai_locked_until);
