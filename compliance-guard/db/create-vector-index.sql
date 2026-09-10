CREATE INDEX ON policy_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);