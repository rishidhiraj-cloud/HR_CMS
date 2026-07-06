-- supabase/migrations/016_message_company_targeting.sql

-- Widen target_type to allow 'company'.
-- NOTE: if this DROP CONSTRAINT fails with "constraint does not exist", run
--   SELECT conname FROM pg_constraint WHERE conrelid = 'messages'::regclass AND contype = 'c';
-- to find the actual check-constraint name and substitute it below (Postgres names
-- unnamed column-level CHECK constraints '<table>_<column>_check' by default).
ALTER TABLE messages DROP CONSTRAINT messages_target_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_target_type_check
  CHECK (target_type IN ('all', 'dept', 'role', 'company'));

-- Widen the employee-read RLS policy to include company targeting.
DROP POLICY "messages: employee read" ON messages;
CREATE POLICY "messages: employee read" ON messages
  FOR SELECT USING (
    published_at IS NOT NULL
    AND (
      target_type = 'all'
      OR (target_type = 'dept' AND target_value = (SELECT department FROM employees WHERE id = auth.uid()))
      OR (target_type = 'role' AND target_value = (SELECT role FROM employees WHERE id = auth.uid()))
      OR (target_type = 'company' AND target_value = (SELECT company FROM employees WHERE id = auth.uid()))
    )
  );
