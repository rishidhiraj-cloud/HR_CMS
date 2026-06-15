-- HR users (can publish messages)
create table hr_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique
);

-- Employees (receive messages)
create table employees (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  department text not null,
  role text not null
);

-- Messages published by HR
create table messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content_html text not null default '',
  target_type text not null check (target_type in ('all', 'dept', 'role')),
  target_value text,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references hr_users(id),
  created_at timestamptz not null default now(),
  constraint target_value_required check (
    target_type = 'all' or target_value is not null
  )
);

-- RLS: enable on all tables
alter table hr_users enable row level security;
alter table employees enable row level security;
alter table messages enable row level security;

-- hr_users: HR can read their own row
create policy "hr_users: own row" on hr_users
  for select using (auth.uid() = id);

-- employees: employees read their own row
create policy "employees: own row" on employees
  for select using (auth.uid() = id);

-- messages: HR can do everything
create policy "messages: hr full access" on messages
  for all using (
    exists (select 1 from hr_users where id = auth.uid())
  );

-- messages: employees can read published messages targeted to them
create policy "messages: employee read" on messages
  for select using (
    published_at is not null
    and (
      target_type = 'all'
      or (
        target_type = 'dept'
        and target_value = (select department from employees where id = auth.uid())
      )
      or (
        target_type = 'role'
        and target_value = (select role from employees where id = auth.uid())
      )
    )
  );
