-- Enable pgvector
create extension if not exists vector;

-- Organizations & Users
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

-- Contacts & Conversations
create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  phone text not null,
  name text,
  labels jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  assigned_to uuid,
  ai_enabled boolean default true,
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
  created_at timestamptz default now()
);

-- Knowledge Base
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

-- Bot Personality
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

-- Workflows
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

-- Bulk Campaigns
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  template_id text,
  total_contacts int default 0,
  sent_count int default 0,
  status text not null default 'draft',
  created_at timestamptz default now()
);

create table campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  variables jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  status text not null,
  response jsonb,
  created_at timestamptz default now()
);

-- Similarity Search Helper
create or replace function match_knowledge_chunks(query_embedding vector(1536), match_count int, match_threshold float)
returns table(id uuid, article_id uuid, chunk text, similarity float)
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
