-- =========================================
-- Phase 2: Add sub_org columns everywhere
-- =========================================

-- 1) conversations
alter table public.conversations
  add column if not exists sub_organization_id uuid references public.sub_organizations(id);

-- 2) messages
alter table public.messages
  add column if not exists sub_organization_id uuid references public.sub_organizations(id);


-- ---- CONDITIONAL TABLES ----

-- 3) knowledge_articles (exists in your cloud database)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
    and table_name = 'knowledge_articles'
  ) then
    alter table public.knowledge_articles
      add column if not exists sub_organization_id uuid references public.sub_organizations(id);
  end if;
end $$;

-- 4) knowledge_chunks (does NOT exist in cloud)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
    and table_name = 'knowledge_chunks'
  ) then
    alter table public.knowledge_chunks
      add column if not exists sub_organization_id uuid references public.sub_organizations(id);
  end if;
end $$;


-- ---- ALWAYS PRESENT TABLES ----

alter table public.bot_personality
  add column if not exists sub_organization_id uuid references public.sub_organizations(id);

alter table public.bot_instructions
  add column if not exists sub_organization_id uuid references public.sub_organizations(id);

alter table public.campaigns
  add column if not exists sub_organization_id uuid references public.sub_organizations(id);

alter table public.campaign_messages
  add column if not exists sub_organization_id uuid references public.sub_organizations(id);

alter table public.whatsapp_settings
  add column if not exists sub_organization_id uuid references public.sub_organizations(id);


-- =========================================
-- Create "General" sub-org per organization
-- =========================================

insert into public.sub_organizations (organization_id, name, slug, description)
select o.id, 'General', 'general', 'Default division'
from public.organizations o
where not exists (
  select 1
  from public.sub_organizations so
  where so.organization_id = o.id
    and so.slug = 'general'
);


-- =========================================
-- Backfill all existing data into General
-- =========================================

-- Conversations → General
update public.conversations c
set sub_organization_id = so.id
from public.sub_organizations so
where c.organization_id = so.organization_id
  and so.slug = 'general'
  and c.sub_organization_id is null;


-- Messages → General (via conversations)
update public.messages m
set sub_organization_id = c.sub_organization_id
from public.conversations c
where m.conversation_id = c.id
  and m.sub_organization_id is null;


-- Campaigns → General
update public.campaigns c
set sub_organization_id = so.id
from public.sub_organizations so
where c.organization_id = so.organization_id
  and so.slug = 'general'
  and c.sub_organization_id is null;


-- Campaign messages → General (via campaigns)
update public.campaign_messages cm
set sub_organization_id = c.sub_organization_id
from public.campaigns c
where cm.campaign_id = c.id
  and cm.sub_organization_id is null;


-- KB Articles → General
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public'
    and table_name='knowledge_articles'
  ) then
    update public.knowledge_articles ka
    set sub_organization_id = so.id
    from public.sub_organizations so
    where ka.organization_id = so.organization_id
      and so.slug = 'general'
      and ka.sub_organization_id is null;
  end if;
end $$;


-- KB Chunks → General (only if table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public'
    and table_name='knowledge_chunks'
  ) then
    update public.knowledge_chunks kc
    set sub_organization_id = ka.sub_organization_id
    from public.knowledge_articles ka
    where kc.article_id = ka.id
      and kc.sub_organization_id is null;
  end if;
end $$;


-- Bot personality → General
update public.bot_personality bp
set sub_organization_id = so.id
from public.sub_organizations so
where bp.organization_id = so.organization_id
  and so.slug = 'general'
  and bp.sub_organization_id is null;


-- Bot instructions → General
update public.bot_instructions bi
set sub_organization_id = so.id
from public.sub_organizations so
where bi.organization_id = so.organization_id
  and so.slug = 'general'
  and bi.sub_organization_id is null;


-- WhatsApp settings → General
update public.whatsapp_settings ws
set sub_organization_id = so.id
from public.sub_organizations so
where ws.organization_id = so.organization_id
  and so.slug = 'general'
  and ws.sub_organization_id is null;

