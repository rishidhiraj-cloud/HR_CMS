-- Run this after creating the HR user in Supabase Auth → Authentication → Users
-- Replace <HR_USER_UUID> with the actual UUID from the Auth panel
insert into hr_users (id, name, email)
values ('<HR_USER_UUID>', 'HR Admin', 'hr@yourcompany.com')
on conflict do nothing;
