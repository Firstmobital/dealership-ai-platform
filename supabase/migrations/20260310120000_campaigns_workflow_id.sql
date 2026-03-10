-- Phase 5: optional explicit workflow binding for campaigns
-- Adds campaigns.workflow_id (nullable) referencing workflows(id)

alter table public.campaigns
  add column if not exists workflow_id uuid null;

alter table public.campaigns
  add constraint campaigns_workflow_id_fkey
  foreign key (workflow_id)
  references public.workflows(id)
  on delete set null;
