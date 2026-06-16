-- Tracks which employees have read which messages
CREATE TABLE message_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, employee_id)
);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- Employees can record their own reads
CREATE POLICY "employees_insert_own_reads" ON message_reads
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- Employees can view their own reads (for dedup on re-open)
CREATE POLICY "employees_view_own_reads" ON message_reads
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

-- HR can view all reads
CREATE POLICY "hr_view_all_reads" ON message_reads
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));
