alter table employees add column password text not null default '';
alter table employees alter column password drop default;
