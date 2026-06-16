CREATE TABLE employee_presence (
  employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employee_presence ENABLE ROW LEVEL SECURITY;

-- Employees can upsert their own presence
CREATE POLICY "employees_upsert_own_presence" ON employee_presence
  FOR ALL TO authenticated
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());

-- HR can view all presence
CREATE POLICY "hr_view_all_presence" ON employee_presence
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));
