-- supabase/migrations/021_drop_employee_password.sql
--
-- Migration 005 added employees.password NOT NULL for an earlier feature
-- that stored/displayed employee passwords for HR admins. Commit 713c6da
-- ("remove exposed employee passwords, add SSO presence heartbeat") moved
-- employee auth to Microsoft SSO only and stopped writing this column, but
-- never added a corresponding migration to relax the NOT NULL constraint —
-- leaving employees.password required with no default and nothing in the
-- application ever supplying a value, silently breaking every new employee
-- creation since. Confirmed unused anywhere in cms-panel or widget (grep for
-- `.password` / `password:` near employee code returns nothing). Drop it.

ALTER TABLE employees DROP COLUMN password;
