-- ===================================================================
-- DROP BROKEN TABLE
-- ===================================================================
DROP TABLE IF EXISTS knowledge_chunks CASCADE;

-- ===================================================================
-- RECREATE TABLE WITH CORRECT STRUCTURE
-- ===================================================================
CREATE TABLE knowledge_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id uuid NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    chunk text NOT NULL,
    embedding vector(1536) NOT NULL
);

-- ===================================================================
-- RLS (SERVICE ROLE ONLY)
-- ===================================================================
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_kb_chunks" ON knowledge_chunks;

CREATE POLICY "service_role_kb_chunks"
ON knowledge_chunks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===================================================================
-- VECTOR INDEX (for fast RAG search)
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
ON knowledge_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
