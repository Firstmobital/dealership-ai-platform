-- Phase 0 Hard Safety Blocks (2026-01-17)
-- 1) Enable RLS on knowledge_chunks (safety net)
-- 2) Restrict semantic KB RPCs to service_role to prevent org_id probing

/* --------------------------------------------------------------------------
   1) RLS: knowledge_chunks
-------------------------------------------------------------------------- */

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Deny by default for client roles
REVOKE ALL ON TABLE public.knowledge_chunks FROM anon;
REVOKE ALL ON TABLE public.knowledge_chunks FROM authenticated;

-- Allow authenticated members to SELECT their own org chunks (optional; UI usually doesn't query chunks directly)
GRANT SELECT ON TABLE public.knowledge_chunks TO authenticated;

DROP POLICY IF EXISTS knowledge_chunks_select_members ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_select_members
ON public.knowledge_chunks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.organization_id = knowledge_chunks.organization_id
      AND ou.user_id = auth.uid()
  )
);

/* --------------------------------------------------------------------------
   2) RPC lockdown: prevent tenant probing via caller-supplied org_id

   NOTE:
   - ai-handler uses service_role key, so it will continue to work.
   - Client-side callers (anon/authenticated) should not call these embedding similarity RPCs directly.
-------------------------------------------------------------------------- */

REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks_scoped(public.vector, uuid, integer, double precision, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks_scoped(public.vector, uuid, integer, double precision, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks_scoped(public.vector, uuid, integer, double precision, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks_scoped(public.vector, uuid, integer, double precision, boolean) TO service_role;

-- If present, also lock down the newer flexible RPC
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'match_knowledge_chunks'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(public.vector, integer, double precision, uuid, boolean) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(public.vector, integer, double precision, uuid, boolean) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(public.vector, integer, double precision, uuid, boolean) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(public.vector, integer, double precision, uuid, boolean) TO service_role;
  END IF;
END $$;
