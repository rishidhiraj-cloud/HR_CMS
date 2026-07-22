-- supabase/migrations/022_increase_hnsw_ef_search.sql

-- pgvector's HNSW index defaults hnsw.ef_search to 40 — the approximate search
-- only ever considers ~40 candidate rows before ranking, regardless of the
-- match_count/LIMIT requested. With the whole document_chunks corpus still in
-- the low hundreds of rows, that default silently excludes relevant chunks
-- from small/narrow documents (e.g. a 2-chunk Paternity Leave Policy) from
-- ever being found, no matter how high match_count is set. Raising ef_search
-- makes the search effectively exhaustive at this corpus size, at negligible
-- cost — this is a per-function search-time setting, not an index rebuild.
-- A function-level `SET hnsw.ef_search` clause needs elevated (superuser-like)
-- privilege on Supabase's hosted `postgres` role. Setting it at runtime via
-- SET LOCAL inside the function body only needs ordinary session privilege,
-- so this uses plpgsql instead of a plain sql function.
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(512),
  match_count integer DEFAULT 5,
  employee_level TEXT DEFAULT NULL,
  employee_company TEXT DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  document_name text,
  similarity float
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL hnsw.ef_search = 1000;
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    pd.name AS document_name,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN policy_documents pd ON dc.document_id = pd.id
  WHERE pd.status = 'ready'
    AND dc.embedding IS NOT NULL
    AND (employee_company IS NULL OR pd.company = employee_company)
    AND (
      employee_level IS NULL
      OR pd.target_level IS NULL
      OR pd.target_level = employee_level
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
