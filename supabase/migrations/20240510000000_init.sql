-- Enable pgvector
create extension if not exists vector;

-- Clean up existing tables (idempotent for local dev)
drop table if exists organization_users cascade;
drop table if exists organizations cascade;
drop table if exists contacts cascade;
drop table if exists conversations cascade;
drop table if exists messages cascade;
drop table if exists knowledge_articles cascade;
drop table if exists knowledge_chunks cascade;
drop table if exists unanswered_questions cascade;
drop table if exists bot_personality cascade;
drop table if exists bot_instructions cascade;
drop table if exists workflows cascade;
drop table if exists workflow_steps cascade;
drop table if exists workflow_logs cascade;
drop table if exists campaigns cascade;
drop table if exists campaign_contacts cascade;
drop table if exists campaign_logs cascade;
drop table if exists whatsapp_settings cascade;
drop table if exists campaign_messages cascade;

-- -------------------------------------------------------------
-- ORGANIZATIONS & USERS
-- -------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  type text,
  created_at timestamptz default now()
);

create table organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid not null,
  role text check (role in ('owner','admin','agent')) default 'agent',
  created_at timestamptz default now()
);

-- -------------------------------------------------------------
-- CONTACTS & CONVERSATIONS
-- -------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  phone text not null,
  name text,
  labels jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- we support web, whatsapp, internal channels
create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  assigned_to uuid,
  ai_enabled boolean default true,
  channel text not null default 'web' check (channel in ('web','whatsapp','internal')),
  last_message_at timestamptz,
  created_at timestamptz default now()
);

create type message_sender as enum ('user','bot','customer');

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender message_sender not null,
  message_type text not null default 'text',
  text text,
  media_url text,
  channel text not null default 'web' check (channel in ('web','whatsapp','internal')),
  created_at timestamptz default now()
);

-- -------------------------------------------------------------
-- KNOWLEDGE BASE + RAG
-- -------------------------------------------------------------
create table knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  title text not null,
  description text,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references knowledge_articles(id) on delete cascade,
  chunk text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create table unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  question text not null,
  occurrences int default 1,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------
-- BOT PERSONALITY & INSTRUCTIONS
-- -------------------------------------------------------------
create table bot_personality (
  organization_id uuid primary key references organizations(id) on delete cascade,
  tone text not null default 'Professional',
  language text not null default 'English',
  short_responses boolean default false,
  emoji_usage boolean default true,
  gender_voice text not null default 'Neutral',
  fallback_message text not null default 'Let me connect you with an advisor.'
);

create table bot_instructions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade unique,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------
-- WORKFLOWS
-- -------------------------------------------------------------
create table workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  description text,
  trigger jsonb,
  created_at timestamptz default now()
);

create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  step_order int not null,
  action jsonb not null,
  created_at timestamptz default now()
);

create table workflow_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  step_id uuid references workflow_steps(id) on delete set null,
  data jsonb,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------
-- BULK CAMPAIGNS (base cleanup only)
-- -------------------------------------------------------------
-- NOTE: We intentionally do NOT create the old campaigns / campaign_contacts /
-- campaign_logs schema here. The NEW campaigns + campaign_messages schema
-- is created in the later migration 20251119071202_add_campaigns_and_campaign_messages.sql.

-- -------------------------------------------------------------
-- WHATSAPP SETTINGS (FINAL SCHEMA)
-- -------------------------------------------------------------
create table whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  phone_number text,
  api_token text,
  verify_token text,
  whatsapp_phone_id text,
  whatsapp_business_id text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -------------------------------------------------------------
-- SIMILARITY SEARCH FUNCTION
-- -------------------------------------------------------------
create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int,
  match_threshold float
)
returns table(
  id uuid,
  article_id uuid,
  chunk text,
  similarity float
)
language sql stable as $$
  select
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.embedding <=> query_embedding < match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

