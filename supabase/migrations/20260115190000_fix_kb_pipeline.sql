-- Fix KB pipeline (2026-01-15)
-- 1) Align knowledge_chunks schema with embed-article / ai-generate-kb / kb-save-from-unanswered
-- 2) Make semantic retrieval org-scoped + published-only
-- 3) Lock down KB storage bucket by organization path prefix

/* --------------------------------------------------------------------------
   1) knowledge_chunks schema alignment
-------------------------------------------------------------------------- */

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS organization_id uuid;

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS chunk_index integer;

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Backfill organization_id from the parent article
UPDATE public.knowledge_chunks kc
SET organization_id = ka.organization_id
FROM public.knowledge_articles ka
WHERE ka.id = kc.article_id
  AND kc.organization_id IS NULL;

-- Backfill chunk_index for legacy rows (we cannot reconstruct true order)
UPDATE public.knowledge_chunks
SET chunk_index = 0
WHERE chunk_index IS NULL;

-- Enforce NOT NULL now that legacy rows are filled
ALTER TABLE public.knowledge_chunks
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN chunk_index SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kb_chunks_org_article
  ON public.knowledge_chunks (organization_id, article_id);

/* --------------------------------------------------------------------------
   2) Semantic retrieval (RAG) — org-scoped + published-only
-------------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding public.vector,
  match_count integer DEFAULT 20,
  match_threshold double precision DEFAULT 0.3,
  p_organization_id uuid DEFAULT NULL,
  p_only_published boolean DEFAULT TRUE
)
RETURNS TABLE(
  id uuid,
  article_id uuid,
  chunk text,
  similarity double precision,
  article_title text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    ka.title AS article_title
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_articles ka ON ka.id = kc.article_id
  WHERE (p_organization_id IS NULL OR ka.organization_id = p_organization_id)
    AND (NOT p_only_published OR ka.status = 'published')
    AND kc.embedding <=> query_embedding < 1 - match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$function$;

/* --------------------------------------------------------------------------
   3) Storage: tenant-isolate knowledge-base bucket
   Path convention: kb/<organization_id>/...
-------------------------------------------------------------------------- */

-- Remove permissive policies
DROP POLICY IF EXISTS "kb_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "kb_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "kb_auth_read" ON storage.objects;
DROP POLICY IF EXISTS "kb_auth_update" ON storage.objects;

-- Service role must be able to read uploaded PDFs for extraction
DROP POLICY IF EXISTS "Service role can access knowledge base" ON storage.objects;

CREATE POLICY "Service role can access knowledge base"
ON storage.objects
AS PERMISSIVE
FOR ALL
TO service_role
USING (bucket_id = 'knowledge-base')
WITH CHECK (bucket_id = 'knowledge-base');

-- Authenticated users can only access objects under their org prefix
CREATE POLICY "kb_auth_read_scoped"
ON storage.objects
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  bucket_id = 'knowledge-base'
  AND name LIKE 'kb/%'
  AND EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id::text = split_part(name, '/', 2)
  )
);

CREATE POLICY "kb_auth_insert_scoped"
ON storage.objects
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-base'
  AND name LIKE 'kb/%'
  AND EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id::text = split_part(name, '/', 2)
  )
);

CREATE POLICY "kb_auth_update_scoped"
ON storage.objects
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'knowledge-base'
  AND name LIKE 'kb/%'
  AND EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id::text = split_part(name, '/', 2)
  )
)
WITH CHECK (
  bucket_id = 'knowledge-base'
  AND name LIKE 'kb/%'
  AND EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id::text = split_part(name, '/', 2)
  )
);

CREATE POLICY "kb_auth_delete_scoped"
ON storage.objects
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  bucket_id = 'knowledge-base'
  AND name LIKE 'kb/%'
  AND EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id::text = split_part(name, '/', 2)
  )
);
