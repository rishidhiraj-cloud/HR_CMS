create policy "employees: hr can read all" on employees
  for select using (
    exists (select 1 from hr_users where id = auth.uid())
  );
