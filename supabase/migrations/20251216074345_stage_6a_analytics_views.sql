create or replace view campaign_analytics_summary as
select
  c.id as campaign_id,
  c.organization_id,
  c.sub_organization_id,

  c.name as campaign_name,
  c.template_name,

  c.total_recipients,

  count(cm.id) filter (
    where cm.status in ('sent', 'delivered')
  ) as sent_count,

  count(cm.id) filter (
    where cm.status = 'delivered'
  ) as delivered_count,

  count(cm.id) filter (
    where cm.status = 'failed'
  ) as failed_count,

  round(
    (count(cm.id) filter (where cm.status = 'delivered')::numeric
      / nullif(c.total_recipients, 0)) * 100,
    2
  ) as delivery_percent,

  round(
    (count(cm.id) filter (where cm.status = 'failed')::numeric
      / nullif(c.total_recipients, 0)) * 100,
    2
  ) as failure_percent,

  c.created_at,
  c.started_at,
  c.completed_at

from campaigns c
left join campaign_messages cm
  on cm.campaign_id = c.id

group by
  c.id;

create or replace view template_analytics_summary as
select
  c.organization_id,
  c.sub_organization_id,

  c.template_name,

  count(cm.id) as total_messages,

  count(cm.id) filter (
    where cm.status = 'delivered'
  ) as delivered_count,

  count(cm.id) filter (
    where cm.status = 'failed'
  ) as failed_count,

  round(
    (count(cm.id) filter (where cm.status = 'delivered')::numeric
      / nullif(count(cm.id), 0)) * 100,
    2
  ) as delivery_percent,

  round(
    (count(cm.id) filter (where cm.status = 'failed')::numeric
      / nullif(count(cm.id), 0)) * 100,
    2
  ) as failure_percent

from campaigns c
join campaign_messages cm
  on cm.campaign_id = c.id

where c.template_name is not null

group by
  c.organization_id,
  c.sub_organization_id,
  c.template_name;


create or replace view model_analytics_summary as
select
  c.organization_id,
  c.sub_organization_id,

  ct.model,

  count(cm.id) as total_messages,

  count(cm.id) filter (
    where cm.status = 'delivered'
  ) as delivered_count,

  count(cm.id) filter (
    where cm.status = 'failed'
  ) as failed_count,

  round(
    (count(cm.id) filter (where cm.status = 'delivered')::numeric
      / nullif(count(cm.id), 0)) * 100,
    2
  ) as delivery_percent

from campaign_messages cm
join contacts ct
  on ct.id = cm.contact_id
join campaigns c
  on c.id = cm.campaign_id

where ct.model is not null

group by
  c.organization_id,
  c.sub_organization_id,
  ct.model;


create or replace view failure_reason_summary as
select
  c.organization_id,
  c.sub_organization_id,

  coalesce(cm.error, 'Unknown') as failure_reason,

  count(*) as failure_count

from campaign_messages cm
join campaigns c
  on c.id = cm.campaign_id

where cm.status = 'failed'

group by
  c.organization_id,
  c.sub_organization_id,
  failure_reason

order by
  failure_count desc;
