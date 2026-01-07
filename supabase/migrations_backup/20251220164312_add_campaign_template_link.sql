-- Step 3: Link campaigns to whatsapp_templates

alter table public.campaigns
  add column if not exists whatsapp_template_id uuid;

alter table public.campaigns
  add column if not exists template_name text;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='whatsapp_templates'
  ) then
    if not exists (
      select 1 from pg_constraint
      where conname = 'campaigns_whatsapp_template_id_fkey'
    ) then
      alter table public.campaigns
        add constraint campaigns_whatsapp_template_id_fkey
        foreign key (whatsapp_template_id)
        references public.whatsapp_templates(id)
        on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_campaigns_whatsapp_template_id
  on public.campaigns(whatsapp_template_id);
