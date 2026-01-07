-- Phase 2B.1: Template Variable Mapping & Rendered Text

alter table public.campaigns
add column if not exists variable_mapping jsonb default '{}'::jsonb;

comment on column public.campaigns.variable_mapping is
'Maps WhatsApp template variables to contact fields. Example: { "1": "first_name", "2": "model" }';

alter table public.campaign_messages
add column if not exists rendered_text text;

comment on column public.campaign_messages.rendered_text is
'Final resolved message text sent to customer (human readable)';
