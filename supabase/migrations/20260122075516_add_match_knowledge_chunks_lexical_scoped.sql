-- Adds lexical (keyword) search for KB chunks, scoped by organization and publication status.
-- Keeps security as INVOKER so RLS still applies for non-service callers.

create or replace function public.match_knowledge_chunks_lexical_scoped(
  p_query text,
  p_organization_id uuid,
  match_count integer,
  p_only_published boolean
)
returns table (
  id uuid,
  article_id uuid,
  article_title text,
  chunk text,
  rank double precision
)
language sql
stable
as $$
  select
    kc.id,
    kc.article_id,
    ka.title as article_title,
    kc.chunk,
    ts_rank_cd(
      to_tsvector('simple', coalesce(kc.chunk, '')),
      websearch_to_tsquery('simple', coalesce(p_query, ''))
    ) as rank
  from public.knowledge_chunks kc
  join public.knowledge_articles ka on ka.id = kc.article_id
  where
    ka.organization_id = p_organization_id
    and (not p_only_published or ka.status = 'published')
    and to_tsvector('simple', coalesce(kc.chunk, '')) @@ websearch_to_tsquery('simple', coalesce(p_query, ''))
  order by rank desc
  limit match_count;
$$;

-- Performance index for lexical search
create index if not exists knowledge_chunks_chunk_tsv_gin
on public.knowledge_chunks
using gin (to_tsvector('simple', coalesce(chunk, '')));
