-- Phase 1: AI Intent Tagging + Conversation Search foundation
-- Adds intent columns to conversations for routing + search.

alter table public.conversations
  add column if not exists intent text;

comment on column public.conversations.intent is
  'AI classified intent: sales | service | finance | accessories | general';

alter table public.conversations
  add column if not exists intent_source text not null default 'ai';

comment on column public.conversations.intent_source is
  'ai | manual';

alter table public.conversations
  add column if not exists intent_update_count integer not null default 0;

comment on column public.conversations.intent_update_count is
  'How many times intent was updated by AI (caps intent churn).';

create index if not exists idx_conversations_intent
  on public.conversations (intent);

create index if not exists idx_conversations_org_intent
  on public.conversations (organization_id, intent);
