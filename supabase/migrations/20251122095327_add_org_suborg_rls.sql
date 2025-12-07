-- =========================================
-- RLS: Multi-tenant + Sub-organization model
-- =========================================

-- 0) Enable RLS on all relevant tables
alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.sub_organizations enable row level security;
alter table public.sub_organization_users enable row level security;

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

alter table public.campaigns enable row level security;
alter table public.campaign_messages enable row level security;

alter table public.knowledge_articles enable row level security;
-- knowledge_chunks might not exist in your cloud DB – skip for now or add later if you create it

alter table public.bot_personality enable row level security;
alter table public.bot_instructions enable row level security;

alter table public.whatsapp_settings enable row level security;


-- =========================================
-- 1) Helper: membership check expressions
-- (we inline these into policies below)
-- =========================================
-- NOTE: auth.role() = 'service_role' is always allowed (edge functions).
-- Frontend uses anon/authed, so RLS applies there.


-- =========================================
-- 2) organizations
-- =========================================

-- Org visible to its members (and service_role)
create policy "org_select_visible_to_members"
on public.organizations
for select
using (
  auth.role() = 'service_role'
  OR id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
);

-- You usually won't allow arbitrary insert/update/delete on organizations
-- from the frontend, so we can skip or lock tightly.
-- For now, allow only service_role:
create policy "org_mod_service_role_only"
on public.organizations
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


-- =========================================
-- 3) organization_users
-- =========================================

-- Each user can see their own org memberships
create policy "org_users_select_self"
on public.organization_users
for select
using (
  auth.role() = 'service_role'
  OR user_id = auth.uid()
);

-- Only service_role can modify this (you can later add an admin UI)
create policy "org_users_mod_service_role_only"
on public.organization_users
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


-- =========================================
-- 4) sub_organizations
-- =========================================

-- Visible if user is a member of the parent org
create policy "suborg_select_org_members"
on public.sub_organizations
for select
using (
  auth.role() = 'service_role'
  OR organization_id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
);

-- Insert: allow only service_role for now (later you can loosen if needed)
create policy "suborg_insert_service_role_only"
on public.sub_organizations
for insert
with check (auth.role() = 'service_role');

-- Update/delete: service_role only
create policy "suborg_mod_service_role_only"
on public.sub_organizations
for update using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "suborg_delete_service_role_only"
on public.sub_organizations
for delete using (auth.role() = 'service_role');


-- =========================================
-- 5) sub_organization_users
-- =========================================

-- User can see rows where they are assigned
create policy "suborg_users_select_self"
on public.sub_organization_users
for select
using (
  auth.role() = 'service_role'
  OR user_id = auth.uid()
);

-- Modify via backend only
create policy "suborg_users_mod_service_role_only"
on public.sub_organization_users
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


-- =========================================
-- 6) contacts (has organization_id only)
-- =========================================

create policy "contacts_select_org_members"
on public.contacts
for select
using (
  auth.role() = 'service_role'
  OR organization_id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
);

create policy "contacts_insert_org_members"
on public.contacts
for insert
with check (
  auth.role() = 'service_role'
  OR organization_id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
);

create policy "contacts_update_org_members"
on public.contacts
for update
using (
  auth.role() = 'service_role'
  OR organization_id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
)
with check (
  auth.role() = 'service_role'
  OR organization_id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
);

create policy "contacts_delete_org_members"
on public.contacts
for delete
using (
  auth.role() = 'service_role'
  OR organization_id in (
    select ou.organization_id
    from public.organization_users ou
    where ou.user_id = auth.uid()
  )
);


-- =========================================
-- 7) conversations (org + sub_org)
-- =========================================

create policy "conversations_select_org_suborg"
on public.conversations
for select
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "conversations_insert_org_suborg"
on public.conversations
for insert
with check (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "conversations_update_org_suborg"
on public.conversations
for update
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
)
with check (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "conversations_delete_org_suborg"
on public.conversations
for delete
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);


-- =========================================
-- 8) messages (no organization_id; join on conversations)
-- =========================================

create policy "messages_select_via_conversations"
on public.messages
for select
using (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.conversations c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);

create policy "messages_insert_via_conversations"
on public.messages
for insert
with check (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.conversations c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);

create policy "messages_update_via_conversations"
on public.messages
for update
using (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.conversations c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
)
with check (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.conversations c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);

create policy "messages_delete_via_conversations"
on public.messages
for delete
using (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.conversations c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);


-- =========================================
-- 9) campaigns (org + sub_org)
-- =========================================

create policy "campaigns_select_org_suborg"
on public.campaigns
for select
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "campaigns_insert_org_suborg"
on public.campaigns
for insert
with check (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "campaigns_update_org_suborg"
on public.campaigns
for update
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
)
with check (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "campaigns_delete_org_suborg"
on public.campaigns
for delete
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);


-- =========================================
-- 10) campaign_messages (via campaigns)
-- =========================================

create policy "campaign_messages_select_via_campaigns"
on public.campaign_messages
for select
using (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.campaigns c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);

create policy "campaign_messages_insert_via_campaigns"
on public.campaign_messages
for insert
with check (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.campaigns c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);

create policy "campaign_messages_update_via_campaigns"
on public.campaign_messages
for update
using (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.campaigns c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
)
with check (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.campaigns c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);

create policy "campaign_messages_delete_via_campaigns"
on public.campaign_messages
for delete
using (
  auth.role() = 'service_role'
  OR exists (
    select 1
    from public.campaigns c
    join public.organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
      and (
        c.sub_organization_id is null
        or c.sub_organization_id in (
          select sou.sub_organization_id
          from public.sub_organization_users sou
          where sou.user_id = auth.uid()
        )
      )
  )
);


-- =========================================
-- 11) knowledge_articles (org + sub_org)
-- =========================================

create policy "kb_articles_select_org_suborg"
on public.knowledge_articles
for select
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "kb_articles_insert_org_suborg"
on public.knowledge_articles
for insert
with check (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "kb_articles_update_org_suborg"
on public.knowledge_articles
for update
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
)
with check (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "kb_articles_delete_org_suborg"
on public.knowledge_articles
for delete
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);


-- =========================================
-- 12) bot_personality / bot_instructions (org + sub_org)
-- =========================================

create policy "bot_personality_select_org_suborg"
on public.bot_personality
for select
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "bot_personality_mod_service_role_only"
on public.bot_personality
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


create policy "bot_instructions_select_org_suborg"
on public.bot_instructions
for select
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "bot_instructions_mod_service_role_only"
on public.bot_instructions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


-- =========================================
-- 13) whatsapp_settings (org + sub_org)
-- =========================================

create policy "wa_settings_select_org_suborg"
on public.whatsapp_settings
for select
using (
  auth.role() = 'service_role'
  OR (
    organization_id in (
      select ou.organization_id
      from public.organization_users ou
      where ou.user_id = auth.uid()
    )
    AND (
      sub_organization_id is null
      OR sub_organization_id in (
        select sou.sub_organization_id
        from public.sub_organization_users sou
        where sou.user_id = auth.uid()
      )
    )
  )
);

create policy "wa_settings_mod_service_role_only"
on public.whatsapp_settings
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

