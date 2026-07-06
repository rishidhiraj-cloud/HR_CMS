-- supabase/migrations/014_companies_master.sql

-- Companies master
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_companies" ON companies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));

-- Allow employees to read companies (for future use, matches departments/levels)
CREATE POLICY "employees_read_companies" ON companies
  FOR SELECT TO authenticated
  USING (TRUE);

INSERT INTO companies (name) VALUES ('Modicare Ltd.'), ('Colorbar Cosmetics');
