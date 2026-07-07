-- supabase/migrations/017_poll_company_targeting.sql

-- Widen the employee-read RLS policy on polls to include company targeting.
-- No CHECK constraint exists on polls.target_type (unlike messages), so only
-- the RLS policy needs to change.
DROP POLICY "employees_read_polls" ON polls;
CREATE POLICY "employees_read_polls" ON polls
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND (
      target_type = 'all'
      OR (target_type = 'level' AND target_value = (SELECT role FROM employees WHERE id = auth.uid()))
      OR (target_type = 'company' AND target_value = (SELECT company FROM employees WHERE id = auth.uid()))
    )
  );
