-- Add target_level (NULL = All Levels) and file_url to policy_documents
ALTER TABLE policy_documents ADD COLUMN target_level TEXT NULL;
ALTER TABLE policy_documents ADD COLUMN file_url TEXT NULL;

-- Storage bucket for original document files
INSERT INTO storage.buckets (id, name, public)
VALUES ('policy-documents', 'policy-documents', true)
ON CONFLICT DO NOTHING;

-- HR can upload to the bucket
CREATE POLICY "hr_upload_policy_documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'policy-documents'
    AND EXISTS (SELECT 1 FROM public.hr_users WHERE id = auth.uid())
  );

-- Authenticated users can read (employees only see what their level allows at query time)
CREATE POLICY "auth_read_policy_documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'policy-documents');

-- Update employee RLS policy to enforce level-based visibility
DROP POLICY IF EXISTS "employees can view policy_documents" ON policy_documents;
CREATE POLICY "employees can view policy_documents" ON policy_documents
  FOR SELECT USING (
    status = 'ready'
    AND (
      EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid())
      OR (
        EXISTS (SELECT 1 FROM employees WHERE id = auth.uid())
        AND (
          target_level IS NULL
          OR target_level = (SELECT role FROM employees WHERE id = auth.uid())
        )
      )
    )
  );

-- Replace match_document_chunks with level-aware version
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(512),
  match_count integer DEFAULT 5,
  employee_level TEXT DEFAULT NULL
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
    AND (
      employee_level IS NULL
      OR pd.target_level IS NULL
      OR pd.target_level = employee_level
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;
