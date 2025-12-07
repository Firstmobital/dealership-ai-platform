-- Stage 6 Fix – Add sub_organization_id to whatsapp_settings

alter table whatsapp_settings
  add column if not exists sub_organization_id uuid references sub_organizations(id);

-- Create the unique hybrid constraint:
-- One settings row per (organization_id, sub_organization_id)
create unique index if not exists uniq_whatsapp_settings_scope
  on whatsapp_settings (organization_id, sub_organization_id);

