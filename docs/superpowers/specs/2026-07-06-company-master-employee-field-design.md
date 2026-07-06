# Company Master + Employee Company Field — Design

## Problem

This is sub-project #1 of a larger initiative to introduce a "Company" dimension across the HR CMS/widget system (multi-tenant-style segmentation between Modicare Ltd. and Colorbar Cosmetics). The larger initiative also covers widget theming, announcement/poll targeting, and document scoping by company — those are separate sub-projects, each with their own spec/plan, built on top of this one.

This sub-project lays the foundation: a Company master (so HR can manage the list of companies) and a mandatory Company field on every employee (so every employee is tagged with exactly one company). Nothing downstream (widget theming, announcements, polls, documents) can be built until this exists.

## Goals

- HR can create/edit/delete companies via the existing Masters page, following the exact same pattern as Department and Level.
- Every employee has exactly one company, selected from a dropdown positioned immediately before the Department dropdown on the employee form.
- Two companies exist from day one: "Modicare Ltd." and "Colorbar Cosmetics".
- Existing employees (if any) are backfilled to "Modicare Ltd." so the field can be `NOT NULL` immediately.

## Non-goals (deferred to later sub-projects)

- Widget theming based on company (sub-project #2).
- Announcement/poll targeting by company (sub-projects #3/#4).
- Document scoping by company (sub-project #5).
- Any change to the Electron widget's `Employee` TypeScript type or widget-side UI — the widget already does `select('*')` against `employees`, so `company` will already be present in the raw fetched object once this ships; the widget just won't have a typed field for it until sub-project #2 touches it.
- Any FK relationship between `employees.company` and `companies.id` — see Design below.

## Design

### Data model

**Storage model:** `employees.company` is a plain `TEXT NOT NULL` column storing the company name as a string, matching exactly how `department` and `role` are stored today (both are free text matching a master's `name`, not foreign keys). This was an explicit choice to stay consistent with the existing convention rather than introduce a new FK-based pattern. Trade-off (accepted): renaming a company in Masters won't retroactively update already-assigned employees, identical to today's behavior for Department renames.

**New `companies` table** (migration, structurally identical to `departments`/`levels` in `supabase/migrations/007_masters.sql`):

```sql
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_companies" ON companies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));

CREATE POLICY "employees_read_companies" ON companies
  FOR SELECT TO authenticated
  USING (TRUE);

INSERT INTO companies (name) VALUES ('Modicare Ltd.'), ('Colorbar Cosmetics');
```

**`employees.company` column** (separate migration, or combined with the above — implementation plan decides):

```sql
ALTER TABLE employees ADD COLUMN company TEXT;
UPDATE employees SET company = 'Modicare Ltd.' WHERE company IS NULL;
ALTER TABLE employees ALTER COLUMN company SET NOT NULL;
```

### Masters UI (`cms-panel/app/masters/page.tsx`)

Add a third parallel fetch (`companies`) and a third `<MasterTable>`:

```tsx
<MasterTable
  title="Companies"
  noun="Company"
  initialItems={companies ?? []}
  apiPath="/api/masters/companies"
/>
```

`MasterTable` is already fully generic (title/noun/initialItems/apiPath props) and provides create, inline edit, and delete — no new component code needed. The page's grid changes from `lg:grid-cols-2` to `lg:grid-cols-3` so all three masters sit evenly at the wider breakpoint (stacks to 1 column on smaller screens, unchanged).

### Masters API routes

New files, structural copies of the existing departments/levels routes (same auth check, same shape):
- `cms-panel/app/api/masters/companies/route.ts` (POST — create)
- `cms-panel/app/api/masters/companies/[id]/route.ts` (PUT — rename, DELETE — remove)

### Employee form (`cms-panel/components/EmployeeForm.tsx`)

New field order: Name, Email, Mobile, **Company**, Department, Level (Company inserted immediately before Department). This also means the 2-column field grid now holds 6 fields (3 full rows) instead of today's 5 (which left Level alone in a half-empty row).

- New `company` state (`useState(initial?.company ?? '')`), a `<select>` styled identically to the Department/Level dropdowns, sourced from a new `companies: string[]` prop.
- Validation: `if (!company) { setError('Please select a company'); return }`, inserted in the same position in the validation chain as the Department check (i.e., before the Department check, matching the new field order).
- `handleSubmit`'s request body includes `company` alongside `department`/`role`.
- Empty-list fallback option ("No companies — add in Masters") matching the existing Department/Level empty-state pattern.

### Prop threading

`cms-panel/app/employees/page.tsx` adds a third parallel fetch (`companies`) alongside `departments`/`levels`, and passes `companies={(companies ?? []).map(c => c.name)}` down to `EmployeesClient`, which passes it straight through to `EmployeeForm` — identical to how `departments`/`levels` already flow through both components today.

### API validation (`cms-panel/app/api/employees/route.ts`, `cms-panel/app/api/employees/[id]/route.ts`)

Both routes add `company` to their destructured request body and their required-fields check (`if (!name || !email || !mobile || !company || !department || !role)`), and include `company` in the `.insert()` / `.update()` payload to `employees` — identical treatment to `department`/`role` today.

### Types (`cms-panel/lib/types.ts`)

`Employee` interface gains `company: string`.

### Error handling

No new error classes are introduced. Missing/invalid company follows the exact same path as a missing department today: client-side validation blocks submit with an inline message; server-side validation returns 400 with `{ error: 'All fields required' }` if a request bypasses the client (defense in depth, matching existing convention).

### Testing

- `cms-panel/__tests__/EmployeeForm.test.tsx`: add a test asserting the Company field renders (placeholder/label) and that submitting without selecting a company shows a validation error, following the existing "shows error if name is empty on submit" test shape.
- No automated tests exist today for the Masters API routes or the employees API routes (departments/levels/employees POST/PUT have no test files) — this sub-project follows that same established convention: verify the new/changed API routes via `tsc --noEmit` and a manual browser check (create a company in Masters, create/edit an employee with it) rather than introducing a new route-testing pattern.
- Manual verification: after the migration runs, confirm an existing employee row (if any exist) shows "Modicare Ltd." as its company, and that the employee form's Company dropdown lists both seeded companies.

## Open questions

None — both architecture decisions (plain-text storage vs. FK; backfill vs. nullable) were resolved during brainstorming:
- `employees.company` is plain text matching the company name, not a foreign key.
- Existing employees are backfilled to "Modicare Ltd." and the column is then `NOT NULL`.
