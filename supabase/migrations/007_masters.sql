-- Departments master
CREATE TABLE departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_departments" ON departments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));

-- Allow employees to read departments (for future use)
CREATE POLICY "employees_read_departments" ON departments
  FOR SELECT TO authenticated
  USING (TRUE);

-- Levels master
CREATE TABLE levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_levels" ON levels
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));

-- Allow employees to read levels (for future use)
CREATE POLICY "employees_read_levels" ON levels
  FOR SELECT TO authenticated
  USING (TRUE);
