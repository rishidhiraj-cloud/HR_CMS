-- supabase/migrations/020_document_ocr_pages.sql

CREATE TABLE document_ocr_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  page_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE document_ocr_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_users can manage document_ocr_pages" ON document_ocr_pages
  FOR ALL USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));
