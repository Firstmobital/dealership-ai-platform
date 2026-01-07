-- 2026-01-07
-- P0: Enable RLS on tables that had policies/grants but no RLS.
-- Production-safe: idempotent guards + minimal policies.

-- ---------------------------------------------------------------------
-- conversation_state
-- ---------------------------------------------------------------------

ALTER TABLE public.whatsapp_bulk_logs
ADD COLUMN organization_id uuid NOT NULL;

ALTER TABLE public.whatsapp_bulk_logs
ADD CONSTRAINT whatsapp_bulk_logs_org_fk
FOREIGN KEY (organization_id)
REFERENCES public.organizations(id);

ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_state_select_org ON public.conversation_state;
CREATE POLICY conversation_state_select_org
ON public.conversation_state
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations conv
    JOIN public.organization_users ou
      ON ou.organization_id = conv.organization_id
    WHERE conv.id = conversation_id
      AND ou.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS conversation_state_write_service_role ON public.conversation_state;
CREATE POLICY conversation_state_write_service_role
ON public.conversation_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------------
-- wallet_alert_logs
-- ---------------------------------------------------------------------
ALTER TABLE public.wallet_alert_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_alert_logs_select_org ON public.wallet_alert_logs;
CREATE POLICY wallet_alert_logs_select_org
ON public.wallet_alert_logs
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS wallet_alert_logs_update_org ON public.wallet_alert_logs;
CREATE POLICY wallet_alert_logs_update_org
ON public.wallet_alert_logs
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS wallet_alert_logs_write_service_role ON public.wallet_alert_logs;
CREATE POLICY wallet_alert_logs_write_service_role
ON public.wallet_alert_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------------
-- whatsapp_bulk_logs
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_bulk_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_bulk_logs_select_org ON public.whatsapp_bulk_logs;
CREATE POLICY whatsapp_bulk_logs_select_org
ON public.whatsapp_bulk_logs
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS whatsapp_bulk_logs_write_service_role ON public.whatsapp_bulk_logs;
CREATE POLICY whatsapp_bulk_logs_write_service_role
ON public.whatsapp_bulk_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------------
-- contact_uploads
-- ---------------------------------------------------------------------
ALTER TABLE public.contact_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_uploads_members_all ON public.contact_uploads;
CREATE POLICY contact_uploads_members_all
ON public.contact_uploads
FOR ALL
TO authenticated
USING (
  organization_id IN (
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS contact_uploads_service_role_all ON public.contact_uploads;
CREATE POLICY contact_uploads_service_role_all
ON public.contact_uploads
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ---------------------------------------------------------------------
-- campaign_delivery_import (staging) - lock down to service_role only
-- ---------------------------------------------------------------------
ALTER TABLE public.campaign_delivery_import ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_delivery_import_service_role_all ON public.campaign_delivery_import;
CREATE POLICY campaign_delivery_import_service_role_all
ON public.campaign_delivery_import
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
