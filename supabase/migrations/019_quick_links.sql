-- supabase/migrations/019_quick_links.sql

CREATE TABLE quick_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  portal_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  how_to_use TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('website', 'mobile_app')),
  url TEXT,
  android_app_url TEXT,
  ios_app_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quick_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_quick_links" ON quick_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));

CREATE POLICY "employees_read_own_company_quick_links" ON quick_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid())
    AND company = (SELECT company FROM employees WHERE id = auth.uid())
  );
