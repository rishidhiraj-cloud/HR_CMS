alter table employees add column mobile text not null default '';
alter table employees alter column mobile drop default;
