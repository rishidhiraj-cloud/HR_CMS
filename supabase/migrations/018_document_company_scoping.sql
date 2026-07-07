-- supabase/migrations/018_document_company_scoping.sql

-- Add mandatory company to policy_documents, backfilling existing rows.
ALTER TABLE policy_documents ADD COLUMN company TEXT;
UPDATE policy_documents SET company = 'Modicare Ltd.' WHERE company IS NULL;
ALTER TABLE policy_documents ALTER COLUMN company SET NOT NULL;

-- Widen the employee-read RLS policy to also require a company match.
DROP POLICY IF EXISTS "employees can view policy_documents" ON policy_documents;
CREATE POLICY "employees can view policy_documents" ON policy_documents
  FOR SELECT USING (
    status = 'ready'
    AND (
      EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid())
      OR (
        EXISTS (SELECT 1 FROM employees WHERE id = auth.uid())
        AND company = (SELECT company FROM employees WHERE id = auth.uid())
        AND (
          target_level IS NULL
          OR target_level = (SELECT role FROM employees WHERE id = auth.uid())
        )
      )
    )
  );

-- Add company-aware filtering to the Ask AI semantic search RPC.
-- employee_company IS NULL preserves the existing HR-sees-everything behavior
-- (HR callers aren't in the employees table, so their lookup returns null for
-- both level and company — same convention as the existing employee_level param).
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
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
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
$$;
