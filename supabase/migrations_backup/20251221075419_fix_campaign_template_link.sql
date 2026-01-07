-- campaigns: ensure correct column usage
ALTER TABLE public.campaigns
DROP COLUMN IF EXISTS template_id;

-- optional but recommended (snapshot for analytics/history)
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS template_name text;

-- store variable order for templates {{1}}, {{2}}
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS template_variables text[] DEFAULT '{}';
