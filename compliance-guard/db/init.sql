CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_file TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES policies(id),
  version_number INT NOT NULL,
  effective_date DATE NOT NULL,
  superseded_by UUID REFERENCES policy_versions(id),
  is_active BOOLEAN GENERATED ALWAYS AS (superseded_by IS NULL) STORED,
  raw_markdown TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE policy_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id UUID REFERENCES policy_versions(id),
  chunk_type TEXT CHECK (chunk_type IN ('text', 'table')),
  content TEXT NOT NULL,
  table_json JSONB,
  embedding VECTOR(768),
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  section_path TEXT,
  page_number INT
);

-- IMPORTANT: do NOT add a vector index here, immediately after table
-- creation. An ivfflat index built on an empty table has degenerate
-- cluster centroids and can silently return ZERO results for a query
-- even when matching rows exist — not just "reduced recall" as
-- Postgres's own notice suggests, actual empty result sets, no error
-- thrown. Only add the vector index after real data is loaded — see
-- create-vector-index.sql.
CREATE INDEX ON policy_chunks USING gin (content_tsv);