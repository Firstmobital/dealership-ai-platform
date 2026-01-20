-- 1) Enable extensions (usually already enabled; safe if repeated)
create extension if not exists pg_trgm;

-- 2) Add generated tsvector column for chunk text
alter table public.knowledge_chunks
add column if not exists chunk_tsv tsvector
generated always as (
  to_tsvector('english', coalesce(chunk, ''))
) stored;

-- 3) GIN index for fast lexical search
create index if not exists knowledge_chunks_chunk_tsv_gin
on public.knowledge_chunks using gin (chunk_tsv);

-- 4) Lexical scoped RPC (published-only optional)
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
    ts_rank_cd(kc.chunk_tsv, websearch_to_tsquery('english', p_query)) as rank
  from public.knowledge_chunks kc
  join public.knowledge_articles ka on ka.id = kc.article_id
  where
    ka.organization_id = p_organization_id
    and (not p_only_published or ka.status = 'published')
    and kc.chunk_tsv @@ websearch_to_tsquery('english', p_query)
  order by rank desc
  limit match_count;
$$;
