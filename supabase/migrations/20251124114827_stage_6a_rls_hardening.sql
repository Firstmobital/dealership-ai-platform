-- =====================================================================
-- Stage 6A – RLS Hardening for Techwheels
-- Multi-org + sub-org isolation
-- =====================================================================

-----------------------------
-- Helper note:
-- We assume membership via organization_users (organization_id, user_id).
-- All policies use auth.uid() as the current app user.
-----------------------------


-- =====================================================================
-- Enable RLS on core tables
-- =====================================================================

alter table organizations enable row level security;
alter table organization_users enable row level security;
alter table sub_organizations enable row level security;
alter table sub_organization_users enable row level security;

alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

alter table whatsapp_settings enable row level security;

alter table knowledge_articles enable row level security;
alter table knowledge_chunks enable row level security;

alter table unanswered_questions enable row level security;

alter table campaigns enable row level security;
alter table campaign_messages enable row level security;

alter table bot_personality enable row level security;
alter table workflows enable row level security;


-- =====================================================================
-- organizations
-- =====================================================================

drop policy if exists "org_members_select_organizations" on organizations;

create policy "org_members_select_organizations"
on organizations
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = organizations.id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- organization_users
-- =====================================================================

drop policy if exists "user_select_own_org_membership" on organization_users;
drop policy if exists "user_insert_own_org_membership" on organization_users;
drop policy if exists "user_update_own_org_membership" on organization_users;
drop policy if exists "user_delete_own_org_membership" on organization_users;

create policy "user_select_own_org_membership"
on organization_users
for select
using (organization_users.user_id = auth.uid());

-- Optional: allow self-join via invite flows; adjust later if needed
create policy "user_insert_own_org_membership"
on organization_users
for insert
with check (organization_users.user_id = auth.uid());

create policy "user_update_own_org_membership"
on organization_users
for update
using (organization_users.user_id = auth.uid())
with check (organization_users.user_id = auth.uid());

create policy "user_delete_own_org_membership"
on organization_users
for delete
using (organization_users.user_id = auth.uid());


-- =====================================================================
-- sub_organizations
-- =====================================================================

drop policy if exists "org_members_select_sub_orgs" on sub_organizations;

create policy "org_members_select_sub_orgs"
on sub_organizations
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = sub_organizations.organization_id
      and ou.user_id = auth.uid()
  )
);

-- Writes for sub_organizations will usually be via admin UI; allow any org member.
drop policy if exists "org_members_modify_sub_orgs" on sub_organizations;

create policy "org_members_modify_sub_orgs"
on sub_organizations
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = sub_organizations.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = sub_organizations.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- sub_organization_users
-- =====================================================================

drop policy if exists "user_select_own_sub_org_membership" on sub_organization_users;
drop policy if exists "user_modify_own_sub_org_membership" on sub_organization_users;

create policy "user_select_own_sub_org_membership"
on sub_organization_users
for select
using (sub_organization_users.user_id = auth.uid());

create policy "user_modify_own_sub_org_membership"
on sub_organization_users
for all
using (sub_organization_users.user_id = auth.uid())
with check (sub_organization_users.user_id = auth.uid());


-- =====================================================================
-- contacts (per-organization)
-- =====================================================================

drop policy if exists "org_members_select_contacts" on contacts;
drop policy if exists "org_members_modify_contacts" on contacts;

create policy "org_members_select_contacts"
on contacts
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = contacts.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_contacts"
on contacts
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = contacts.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = contacts.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- conversations
-- =====================================================================

drop policy if exists "org_members_select_conversations" on conversations;
drop policy if exists "org_members_modify_conversations" on conversations;

create policy "org_members_select_conversations"
on conversations
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = conversations.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_conversations"
on conversations
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = conversations.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = conversations.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- messages
-- =====================================================================

drop policy if exists "org_members_select_messages" on messages;
drop policy if exists "org_members_modify_messages" on messages;

create policy "org_members_select_messages"
on messages
for select
using (
  exists (
    select 1
    from conversations c
    join organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_messages"
on messages
for all
using (
  exists (
    select 1
    from conversations c
    join organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from conversations c
    join organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = messages.conversation_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- whatsapp_settings
-- =====================================================================

drop policy if exists "org_members_select_wa_settings" on whatsapp_settings;
drop policy if exists "org_members_modify_wa_settings" on whatsapp_settings;

create policy "org_members_select_wa_settings"
on whatsapp_settings
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = whatsapp_settings.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_wa_settings"
on whatsapp_settings
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = whatsapp_settings.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = whatsapp_settings.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- knowledge_articles
-- =====================================================================

drop policy if exists "org_members_select_kb_articles" on knowledge_articles;
drop policy if exists "org_members_modify_kb_articles" on knowledge_articles;

create policy "org_members_select_kb_articles"
on knowledge_articles
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = knowledge_articles.organization_id
      and ou.user_id = auth.uid()
  )
);

-- Insert/update/delete via UI + edge functions (service_role bypasses RLS)
create policy "org_members_modify_kb_articles"
on knowledge_articles
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = knowledge_articles.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = knowledge_articles.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- knowledge_chunks
-- =====================================================================

drop policy if exists "service_role_only_knowledge_chunks" on knowledge_chunks;

-- Only service_role (edge functions) should read/write chunks.
create policy "service_role_only_knowledge_chunks"
on knowledge_chunks
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');


-- =====================================================================
-- unanswered_questions
-- =====================================================================

drop policy if exists "org_members_select_unanswered" on unanswered_questions;
drop policy if exists "org_members_modify_unanswered" on unanswered_questions;

create policy "org_members_select_unanswered"
on unanswered_questions
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = unanswered_questions.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_unanswered"
on unanswered_questions
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = unanswered_questions.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = unanswered_questions.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- campaigns
-- =====================================================================

drop policy if exists "org_members_select_campaigns" on campaigns;
drop policy if exists "org_members_modify_campaigns" on campaigns;

create policy "org_members_select_campaigns"
on campaigns
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = campaigns.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_campaigns"
on campaigns
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = campaigns.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = campaigns.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- campaign_messages
-- =====================================================================

drop policy if exists "org_members_select_campaign_messages" on campaign_messages;
drop policy if exists "org_members_modify_campaign_messages" on campaign_messages;

create policy "org_members_select_campaign_messages"
on campaign_messages
for select
using (
  exists (
    select 1
    from campaigns c
    join organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_campaign_messages"
on campaign_messages
for all
using (
  exists (
    select 1
    from campaigns c
    join organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from campaigns c
    join organization_users ou
      on ou.organization_id = c.organization_id
    where c.id = campaign_messages.campaign_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- bot_personality
-- =====================================================================

drop policy if exists "org_members_select_bot_personality" on bot_personality;
drop policy if exists "org_members_modify_bot_personality" on bot_personality;

create policy "org_members_select_bot_personality"
on bot_personality
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = bot_personality.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_bot_personality"
on bot_personality
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = bot_personality.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = bot_personality.organization_id
      and ou.user_id = auth.uid()
  )
);


-- =====================================================================
-- workflows
-- =====================================================================

drop policy if exists "org_members_select_workflows" on workflows;
drop policy if exists "org_members_modify_workflows" on workflows;

create policy "org_members_select_workflows"
on workflows
for select
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = workflows.organization_id
      and ou.user_id = auth.uid()
  )
);

create policy "org_members_modify_workflows"
on workflows
for all
using (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = workflows.organization_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from organization_users ou
    where ou.organization_id = workflows.organization_id
      and ou.user_id = auth.uid()
  )
);

