-- ============================================================
-- FULL RLS PACK FOR MULTI-TENANT DEALERSHIP PLATFORM
-- Assumes organization_users(user_id, organization_id)
-- and that user_id = auth.uid()
-- ============================================================

-- -------------------------------
-- CONTACTS
-- -------------------------------
alter table public.contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contacts'
      and policyname = 'org_members_manage_contacts'
  ) then
    create policy org_members_manage_contacts
    on public.contacts
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = contacts.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = contacts.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- CONVERSATIONS
-- -------------------------------
alter table public.conversations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversations'
      and policyname = 'org_members_manage_conversations'
  ) then
    create policy org_members_manage_conversations
    on public.conversations
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = conversations.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = conversations.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- MESSAGES
-- -------------------------------
alter table public.messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'org_members_manage_messages'
  ) then
    create policy org_members_manage_messages
    on public.messages
    for all
    using (
      exists (
        select 1
        from public.conversations c
        join public.organization_users ou
          on ou.organization_id = c.organization_id
       where c.id = messages.conversation_id
         and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.conversations c
        join public.organization_users ou
          on ou.organization_id = c.organization_id
       where c.id = messages.conversation_id
         and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- WHATSAPP SETTINGS
-- -------------------------------
alter table public.whatsapp_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_settings'
      and policyname = 'org_members_manage_whatsapp_settings'
  ) then
    create policy org_members_manage_whatsapp_settings
    on public.whatsapp_settings
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = whatsapp_settings.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = whatsapp_settings.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- KNOWLEDGE ARTICLES
-- -------------------------------
alter table public.knowledge_articles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'knowledge_articles'
      and policyname = 'org_members_manage_knowledge_articles'
  ) then
    create policy org_members_manage_knowledge_articles
    on public.knowledge_articles
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = knowledge_articles.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = knowledge_articles.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- KNOWLEDGE CHUNKS
-- -------------------------------
alter table public.knowledge_chunks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'knowledge_chunks'
      and policyname = 'org_members_manage_knowledge_chunks'
  ) then
    create policy org_members_manage_knowledge_chunks
    on public.knowledge_chunks
    for all
    using (
      exists (
        select 1
        from public.knowledge_articles ka
        join public.organization_users ou
          on ou.organization_id = ka.organization_id
       where ka.id = knowledge_chunks.article_id
         and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.knowledge_articles ka
        join public.organization_users ou
          on ou.organization_id = ka.organization_id
       where ka.id = knowledge_chunks.article_id
         and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- UNANSWERED QUESTIONS
-- -------------------------------
alter table public.unanswered_questions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'unanswered_questions'
      and policyname = 'org_members_manage_unanswered_questions'
  ) then
    create policy org_members_manage_unanswered_questions
    on public.unanswered_questions
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = unanswered_questions.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = unanswered_questions.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- BOT PERSONALITY
-- -------------------------------
alter table public.bot_personality enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bot_personality'
      and policyname = 'org_members_manage_bot_personality'
  ) then
    create policy org_members_manage_bot_personality
    on public.bot_personality
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = bot_personality.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = bot_personality.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- BOT INSTRUCTIONS
-- -------------------------------
alter table public.bot_instructions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bot_instructions'
      and policyname = 'org_members_manage_bot_instructions'
  ) then
    create policy org_members_manage_bot_instructions
    on public.bot_instructions
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = bot_instructions.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = bot_instructions.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- WORKFLOWS
-- -------------------------------
alter table public.workflows enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workflows'
      and policyname = 'org_members_manage_workflows'
  ) then
    create policy org_members_manage_workflows
    on public.workflows
    for all
    using (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = workflows.organization_id
          and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_users ou
        where ou.organization_id = workflows.organization_id
          and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- WORKFLOW STEPS
-- -------------------------------
alter table public.workflow_steps enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workflow_steps'
      and policyname = 'org_members_manage_workflow_steps'
  ) then
    create policy org_members_manage_workflow_steps
    on public.workflow_steps
    for all
    using (
      exists (
        select 1
        from public.workflows w
        join public.organization_users ou
          on ou.organization_id = w.organization_id
       where w.id = workflow_steps.workflow_id
         and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.workflows w
        join public.organization_users ou
          on ou.organization_id = w.organization_id
       where w.id = workflow_steps.workflow_id
         and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- -------------------------------
-- WORKFLOW LOGS
-- -------------------------------
alter table public.workflow_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workflow_logs'
      and policyname = 'org_members_manage_workflow_logs'
  ) then
    create policy org_members_manage_workflow_logs
    on public.workflow_logs
    for all
    using (
      exists (
        select 1
        from public.workflows w
        join public.organization_users ou
          on ou.organization_id = w.organization_id
       where w.id = workflow_logs.workflow_id
         and ou.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.workflows w
        join public.organization_users ou
          on ou.organization_id = w.organization_id
       where w.id = workflow_logs.workflow_id
         and ou.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- NOTE: Campaign RLS is already defined in 20251119071202_add_campaigns_and_campaign_messages.sql
