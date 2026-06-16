-- Run this after creating the HR user in Supabase Auth → Authentication → Users
-- Replace <HR_USER_UUID> with the actual UUID from the Auth panel
insert into hr_users (id, name, email)
values ('4b820fad-4cf4-4510-8a7e-ca1ab86f97cb', 'HR Admin', rishi.dhiraj@gmail.com')
on conflict do nothing;

