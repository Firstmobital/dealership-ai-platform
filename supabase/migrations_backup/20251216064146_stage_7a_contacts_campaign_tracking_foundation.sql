-- Stage 7A — Contacts + Template Tracking Foundation

-- 1) CONTACTS: add structured fields used by the “Database” UI
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS model text;

-- Optional: helpful indexes for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_org_phone
  ON public.contacts (organization_id, phone);

CREATE INDEX IF NOT EXISTS idx_contacts_org_model
  ON public.contacts (organization_id, model);

-- 2) CAMPAIGNS: add template_name + sub_organization_id (types already expect sub_org)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS sub_organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaigns_sub_organization_id_fkey'
  ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_sub_organization_id_fkey
      FOREIGN KEY (sub_organization_id)
      REFERENCES public.sub_organizations(id)
      ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_campaigns_org_suborg
  ON public.campaigns (organization_id, sub_organization_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_org_template
  ON public.campaigns (organization_id, template_name);

-- 3) CAMPAIGN_MESSAGES: add sub_organization_id for proper multi-tenant scoping
ALTER TABLE public.campaign_messages
  ADD COLUMN IF NOT EXISTS sub_organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaign_messages_sub_organization_id_fkey'
  ) THEN
    ALTER TABLE public.campaign_messages
      ADD CONSTRAINT campaign_messages_sub_organization_id_fkey
      FOREIGN KEY (sub_organization_id)
      REFERENCES public.sub_organizations(id)
      ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_campaign_messages_org_suborg
  ON public.campaign_messages (organization_id, sub_organization_id);

CREATE INDEX IF NOT EXISTS idx_campaign_messages_org_phone_status
  ON public.campaign_messages (organization_id, phone, status);

-- 4) VIEW: one-row-per-phone summary for the Database UI
-- Delivered vs Failed template names (distinct) per contact
CREATE OR REPLACE VIEW public.contact_campaign_summary AS
SELECT
  ct.id                     AS contact_id,
  ct.organization_id,
  ct.first_name,
  ct.last_name,
  ct.phone,
  ct.model,

  -- delivered templates
  COALESCE(
    array_remove(
      array_agg(DISTINCT COALESCE(c.template_name, c.name))
        FILTER (WHERE cm.status = 'delivered'),
      NULL
    ),
    '{}'::text[]
  ) AS delivered_campaigns,

  -- failed templates
  COALESCE(
    array_remove(
      array_agg(DISTINCT COALESCE(c.template_name, c.name))
        FILTER (WHERE cm.status = 'failed'),
      NULL
    ),
    '{}'::text[]
  ) AS failed_campaigns

FROM public.contacts ct
LEFT JOIN public.campaign_messages cm
  ON cm.organization_id = ct.organization_id
 AND cm.phone = ct.phone
LEFT JOIN public.campaigns c
  ON c.id = cm.campaign_id
 AND c.organization_id = ct.organization_id
GROUP BY
  ct.id, ct.organization_id, ct.first_name, ct.last_name, ct.phone, ct.model;
