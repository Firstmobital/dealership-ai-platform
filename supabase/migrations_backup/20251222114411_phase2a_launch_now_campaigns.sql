-- Phase 2A: Launch Now Campaign Support

alter table public.campaigns
add column if not exists status text not null default 'draft';

comment on column public.campaigns.status is
'draft | scheduled | sending | completed | failed';

alter table public.campaigns
add column if not exists launched_at timestamptz;

comment on column public.campaigns.launched_at is
'Timestamp when campaign was manually launched (Launch Now)';
