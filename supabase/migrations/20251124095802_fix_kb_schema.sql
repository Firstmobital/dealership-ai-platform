create table if not exists knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sub_organization_id uuid references sub_organizations(id) on delete cascade,
  title text not null,
  content text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create extension if not exists vector;

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references knowledge_articles(id) on delete cascade,
  chunk text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);


-- =====================================================================
-- 1) Ensure pgvector is enabled
-- =====================================================================
create extension if not exists vector;


-- =====================================================================
-- 2) knowledge_articles fixes (safe, idempotent)
-- =====================================================================

-- Ensure columns exist
alter table knowledge_articles
  add column if not exists sub_organization_id uuid references sub_organizations(id);

alter table knowledge_articles
  add column if not exists description text;

-- Fix NULL values BEFORE applying NOT NULL constraints
update knowledge_articles
  set content = 'No summary available.'
  where content is null;

update knowledge_articles
  set title = 'Untitled Article'
  where title is null;

-- Enforce NOT NULL
alter table knowledge_articles
  alter column content set not null;

alter table knowledge_articles
  alter column title set not null;


-- =====================================================================
-- 3) knowledge_chunks fixes (safe, idempotent)
-- =====================================================================

-- Ensure embedding column exists with correct type
do $$
begin
  -- If embedding column does not exist → create it
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'knowledge_chunks'
    and column_name = 'embedding'
  ) then
    alter table knowledge_chunks
      add column embedding vector(1536);
  end if;

  -- If embedding exists but dimension is wrong → drop + recreate
  if exists (
    select 1
    from information_schema.columns 
    where table_name = 'knowledge_chunks'
    and column_name = 'embedding'
    and data_type = 'USER-DEFINED'
    and udt_name = 'vector'
    and numeric_precision <> 1536
  ) then
    alter table knowledge_chunks
      drop column embedding;
    alter table knowledge_chunks
      add column embedding vector(1536);
  end if;

end $$;


-- Remove old or deprecated embedding columns safely
alter table knowledge_chunks
  drop column if exists embedding_vector,
  drop column if exists embeddings;


-- =====================================================================
-- 4) Foreign Key Fix (idempotent)
-- =====================================================================
-- Drop ANY existing conflicting FK first
alter table knowledge_chunks
  drop constraint if exists knowledge_chunks_article_id_fkey,
  drop constraint if exists fk_chunks_article;

-- Recreate correct FK
alter table knowledge_chunks
  add constraint fk_chunks_article
  foreign key (article_id)
  references knowledge_articles(id)
  on delete cascade;


-- =====================================================================
-- 5) Performance Indexes
-- =====================================================================

create index if not exists idx_chunks_embedding
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists idx_chunks_article
  on knowledge_chunks (article_id);


-- =====================================================================
-- 6) RPC Function: match_knowledge_chunks
-- =====================================================================

create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int default 20,
  match_threshold float default 0.3
)
returns table (
  id uuid,
  article_id uuid,
  chunk text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
end;
$$;
