BEGIN;

-- 1. DROP RLS POLICIES (sub-org related)
DROP POLICY IF EXISTS org_members_insert_sub_orgs ON public.organizations;
DROP POLICY IF EXISTS org_members_view_sub_orgs ON public.organizations;

-- 2. DROP SUB-ORG FOREIGN KEYS
ALTER TABLE public.knowledge_articles
  DROP CONSTRAINT IF EXISTS knowledge_articles_sub_organization_id_fkey;

ALTER TABLE public.whatsapp_settings
  DROP CONSTRAINT IF EXISTS whatsapp_settings_sub_organization_id_fkey;

-- 3. DROP SUB-ORG INDEXES
DROP INDEX IF EXISTS public.unique_whatsapp_settings_org_sub;
DROP INDEX IF EXISTS public.unique_wa_settings_per_org_or_suborg;

-- 4. DROP SUB-ORG COLUMNS
ALTER TABLE public.knowledge_articles
  DROP COLUMN IF EXISTS sub_organization_id;

ALTER TABLE public.whatsapp_settings
  DROP COLUMN IF EXISTS sub_organization_id;

-- 5. REMOVE ORG HIERARCHY (VERY IMPORTANT)
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_parent_org_id_fkey;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS parent_org_id;

COMMIT;
