-- ============================================================
-- Phase 3A — WhatsApp Analytics (DB + Views)
-- ============================================================

-- ------------------------------------------------------------
-- 0) Ensure reply tracking columns exist (used for reply rate)
-- ------------------------------------------------------------
alter table public.campaign_messages
  add column if not exists replied_at timestamptz null,
  add column if not exists reply_whatsapp_message_id text null,
  add column if not exists reply_text text null;

create index if not exists idx_campaign_messages_campaign_status
  on public.campaign_messages (campaign_id, status);

create index if not exists idx_campaign_messages_dispatched_at
  on public.campaign_messages (dispatched_at);

create index if not exists idx_campaign_messages_delivered_at
  on public.campaign_messages (delivered_at);

create index if not exists idx_campaign_messages_replied_at
  on public.campaign_messages (replied_at);

-- Helpful for response-time calculations
create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at);

create index if not exists idx_conversations_org_channel_last
  on public.conversations (organization_id, channel, last_message_at);


-- ============================================================
-- 1) CAMPAIGN PERFORMANCE (per campaign)
-- ============================================================
create or replace view public.campaign_analytics_summary_v2
with (security_invoker = true)
as
select
  c.id as campaign_id,
  c.organization_id,
  c.sub_organization_id,

  c.name as campaign_name,
  c.status,
  c.scheduled_at,
  c.started_at,
  c.completed_at,
  c.created_at,

  c.whatsapp_template_id,
  coalesce(c.template_name, wt.name) as template_name,
  wt.language as template_language,

  c.total_recipients,

  count(cm.id) filter (where cm.status in ('sent','delivered')) as sent_count,
  count(cm.id) filter (where cm.status = 'delivered') as delivered_count,
  count(cm.id) filter (where cm.status = 'failed') as failed_count,

  count(cm.id) filter (where cm.replied_at is not null) as replied_count,

  round(
    (count(cm.id) filter (where cm.status = 'delivered')::numeric
      / nullif(c.total_recipients, 0)) * 100,
    2
  ) as delivery_percent,

  round(
    (count(cm.id) filter (where cm.replied_at is not null)::numeric
      / nullif(c.total_recipients, 0)) * 100,
    2
  ) as reply_percent,

  -- avg time to first reply (seconds) for campaign messages that got a reply
  round(
    avg(
      extract(epoch from (cm.replied_at - cm.dispatched_at))
    ) filter (where cm.replied_at is not null and cm.dispatched_at is not null)
  , 2) as avg_reply_seconds

from public.campaigns c
left join public.campaign_messages cm
  on cm.campaign_id = c.id
left join public.whatsapp_templates wt
  on wt.id = c.whatsapp_template_id
group by
  c.id, wt.name, wt.language;


-- ============================================================
-- 2) TEMPLATE PERFORMANCE (grouped across campaigns)
-- ============================================================
create or replace view public.template_analytics_summary_v2
with (security_invoker = true)
as
select
  c.organization_id,
  c.sub_organization_id,

  c.whatsapp_template_id,
  coalesce(c.template_name, wt.name) as template_name,
  wt.language as template_language,

  count(cm.id) as total_messages,
  count(cm.id) filter (where cm.status in ('sent','delivered')) as sent_count,
  count(cm.id) filter (where cm.status = 'delivered') as delivered_count,
  count(cm.id) filter (where cm.status = 'failed') as failed_count,
  count(cm.id) filter (where cm.replied_at is not null) as replied_count,

  round(
    (count(cm.id) filter (where cm.status = 'delivered')::numeric
      / nullif(count(cm.id), 0)) * 100,
    2
  ) as delivery_percent,

  round(
    (count(cm.id) filter (where cm.replied_at is not null)::numeric
      / nullif(count(cm.id), 0)) * 100,
    2
  ) as reply_percent,

  round(
    avg(extract(epoch from (cm.replied_at - cm.dispatched_at)))
      filter (where cm.replied_at is not null and cm.dispatched_at is not null)
  , 2) as avg_reply_seconds

from public.campaigns c
join public.campaign_messages cm
  on cm.campaign_id = c.id
left join public.whatsapp_templates wt
  on wt.id = c.whatsapp_template_id
where c.channel = 'whatsapp'
group by
  c.organization_id,
  c.sub_organization_id,
  c.whatsapp_template_id,
  coalesce(c.template_name, wt.name),
  wt.language;


-- ============================================================
-- 3) WHATSAPP OVERVIEW (daily rollup)
--    Includes:
--      - campaign outbound stats (campaign_messages)
--      - inbound/outbound chat stats (messages + conversations)
--      - active conversations
--      - avg first response time
-- ============================================================
create or replace view public.whatsapp_overview_daily_v1
with (security_invoker = true)
as
with
-- campaign outbound (per day by dispatched_at)
campaign_daily as (
  select
    c.organization_id,
    c.sub_organization_id,
    (cm.dispatched_at::date) as day,

    count(cm.id) filter (where cm.status in ('sent','delivered')) as campaign_sent,
    count(cm.id) filter (where cm.status = 'delivered') as campaign_delivered,
    count(cm.id) filter (where cm.status = 'failed') as campaign_failed,
    count(cm.id) filter (where cm.replied_at is not null) as campaign_replied
  from public.campaign_messages cm
  join public.campaigns c on c.id = cm.campaign_id
  where cm.dispatched_at is not null
    and c.channel = 'whatsapp'
  group by c.organization_id, c.sub_organization_id, (cm.dispatched_at::date)
),

-- chat inbound/outbound (per day by message created_at)
chat_daily as (
  select
    c.organization_id,
    c.sub_organization_id,
    (m.created_at::date) as day,

    count(*) filter (where m.sender = 'customer') as inbound_messages,
    count(*) filter (where m.sender in ('user','bot')) as outbound_messages,
    count(distinct m.conversation_id) as active_conversations
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where c.channel = 'whatsapp'
    and m.created_at is not null
  group by c.organization_id, c.sub_organization_id, (m.created_at::date)
),

-- avg first response time per conversation (seconds), grouped by day of first inbound
first_response as (
  with convo_first as (
    select
      c.organization_id,
      c.sub_organization_id,
      c.id as conversation_id,

      -- first inbound time
      (
        select m1.created_at
        from public.messages m1
        where m1.conversation_id = c.id
          and m1.sender = 'customer'
        order by m1.created_at asc
        limit 1
      ) as first_inbound_at
    from public.conversations c
    where c.channel = 'whatsapp'
  )
  select
    cf.organization_id,
    cf.sub_organization_id,
    (cf.first_inbound_at::date) as day,

    round(avg(extract(epoch from (r.first_response_at - cf.first_inbound_at))), 2) as avg_first_response_seconds
  from convo_first cf
  join lateral (
    select m2.created_at as first_response_at
    from public.messages m2
    where m2.conversation_id = cf.conversation_id
      and m2.sender in ('user','bot')
      and cf.first_inbound_at is not null
      and m2.created_at > cf.first_inbound_at
    order by m2.created_at asc
    limit 1
  ) r on true
  where cf.first_inbound_at is not null
  group by cf.organization_id, cf.sub_organization_id, (cf.first_inbound_at::date)
)

select
  coalesce(cd.organization_id, ch.organization_id, fr.organization_id) as organization_id,
  coalesce(cd.sub_organization_id, ch.sub_organization_id, fr.sub_organization_id) as sub_organization_id,
  coalesce(cd.day, ch.day, fr.day) as day,

  -- Campaign outbound
  coalesce(cd.campaign_sent, 0) as campaign_sent,
  coalesce(cd.campaign_delivered, 0) as campaign_delivered,
  coalesce(cd.campaign_failed, 0) as campaign_failed,
  coalesce(cd.campaign_replied, 0) as campaign_replied,

  -- Chat messages (inbound/outbound)
  coalesce(ch.inbound_messages, 0) as inbound_messages,
  coalesce(ch.outbound_messages, 0) as outbound_messages,
  coalesce(ch.active_conversations, 0) as active_conversations,

  -- First response time
  coalesce(fr.avg_first_response_seconds, 0) as avg_first_response_seconds,

  -- Derived % (campaign)
  case
    when coalesce(cd.campaign_sent, 0) = 0 then 0
    else round((coalesce(cd.campaign_delivered, 0)::numeric / nullif(cd.campaign_sent, 0)) * 100, 2)
  end as campaign_delivery_percent,

  case
    when coalesce(cd.campaign_sent, 0) = 0 then 0
    else round((coalesce(cd.campaign_replied, 0)::numeric / nullif(cd.campaign_sent, 0)) * 100, 2)
  end as campaign_reply_percent

from campaign_daily cd
full join chat_daily ch
  on cd.organization_id = ch.organization_id
 and coalesce(cd.sub_organization_id,'00000000-0000-0000-0000-000000000000'::uuid)
     = coalesce(ch.sub_organization_id,'00000000-0000-0000-0000-000000000000'::uuid)
 and cd.day = ch.day
full join first_response fr
  on coalesce(cd.organization_id, ch.organization_id) = fr.organization_id
 and coalesce(coalesce(cd.sub_organization_id, ch.sub_organization_id),'00000000-0000-0000-0000-000000000000'::uuid)
     = coalesce(fr.sub_organization_id,'00000000-0000-0000-0000-000000000000'::uuid)
 and coalesce(cd.day, ch.day) = fr.day;


-- ------------------------------------------------------------
-- Grants (views)
-- ------------------------------------------------------------
grant select on public.campaign_analytics_summary_v2 to authenticated;
grant select on public.template_analytics_summary_v2 to authenticated;
grant select on public.whatsapp_overview_daily_v1 to authenticated;
