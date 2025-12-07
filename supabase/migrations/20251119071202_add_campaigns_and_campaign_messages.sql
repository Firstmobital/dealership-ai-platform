-- =============================================================
-- 1) ENUMS FOR CAMPAIGN + MESSAGE STATUS
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_status'
  ) THEN
    CREATE TYPE public.campaign_status AS ENUM (
      'draft',
      'scheduled',
      'sending',
      'completed',
      'cancelled',
      'failed'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_message_status'
  ) THEN
    CREATE TYPE public.campaign_message_status AS ENUM (
      'pending',
      'queued',
      'sent',
      'delivered',
      'failed',
      'cancelled'
    );
  END IF;
END$$;

-- =============================================================
-- 2) CAMPAIGNS TABLE (FINAL SCHEMA)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  name text NOT NULL,
  description text,

  channel text NOT NULL DEFAULT 'whatsapp',

  status public.campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  template_body text NOT NULL,
  template_variables text[],

  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org
  ON public.campaigns (organization_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_org_status
  ON public.campaigns (organization_id, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns'
      AND column_name = 'scheduled_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at
      ON public.campaigns (status, scheduled_at);
  END IF;
END$$;

-- =============================================================
-- 3) CAMPAIGN_MESSAGES TABLE
-- =============================================================
CREATE TABLE IF NOT EXISTS public.campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,

  phone text NOT NULL,
  variables jsonb,

  status public.campaign_message_status NOT NULL DEFAULT 'pending',
  error text,
  whatsapp_message_id text,

  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign
  ON public.campaign_messages (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_messages_org_status
  ON public.campaign_messages (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_messages_send_queue
  ON public.campaign_messages (status, campaign_id, created_at);

-- =============================================================
-- 4) RLS POLICIES
-- =============================================================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;

-- Only org members can read/write campaign data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaigns'
      AND policyname = 'org_members_can_manage_campaigns'
  ) THEN
    CREATE POLICY org_members_can_manage_campaigns
    ON public.campaigns
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.organization_users ou
        WHERE ou.organization_id = campaigns.organization_id
        AND ou.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.organization_users ou
        WHERE ou.organization_id = campaigns.organization_id
        AND ou.user_id = auth.uid()
      )
    );
  END IF;
END$$;

-- Only org members can manage campaign_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaign_messages'
      AND policyname = 'org_members_can_manage_campaign_messages'
  ) THEN
    CREATE POLICY org_members_can_manage_campaign_messages
    ON public.campaign_messages
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.organization_users ou
        WHERE ou.organization_id = campaign_messages.organization_id
        AND ou.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.organization_users ou
        WHERE ou.organization_id = campaign_messages.organization_id
        AND ou.user_id = auth.uid()
      )
    );
  END IF;
END$$;

