-- The original "own row" SELECT policy meant an HR admin could only ever see
-- their own row in hr_users, so the CMS Users list never showed other/new
-- HR users. Widen it to match the "any hr_user can read/manage X" pattern
-- used everywhere else in this schema.
--
-- A policy on hr_users can't subquery hr_users directly (Postgres raises
-- "infinite recursion detected in policy for relation hr_users"), so the
-- check goes through a SECURITY DEFINER function, same as match_document_chunks
-- in 006_policy_documents.sql.
create or replace function is_hr_user(uid uuid)
returns boolean
language sql stable security definer
as $$
  select exists (select 1 from hr_users where id = uid);
$$;

drop policy "hr_users: own row" on hr_users;

create policy "hr_users: hr can read all" on hr_users
  for select using (is_hr_user(auth.uid()));
