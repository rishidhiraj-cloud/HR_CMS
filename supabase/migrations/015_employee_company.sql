-- supabase/migrations/015_employee_company.sql
ALTER TABLE employees ADD COLUMN company TEXT;
UPDATE employees SET company = 'Modicare Ltd.' WHERE company IS NULL;
ALTER TABLE employees ALTER COLUMN company SET NOT NULL;
