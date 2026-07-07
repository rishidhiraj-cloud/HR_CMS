# Company Master + Employee Company Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Company master (Modicare Ltd. / Colorbar Cosmetics, HR-managed via the existing Masters page) and a mandatory Company field on every employee, positioned before Department on the employee form.

**Architecture:** Companies are a new master table following the exact existing Department/Level pattern (own migration, own API routes, another `<MasterTable>` on the Masters page). `employees.company` is a plain `TEXT NOT NULL` column storing the company name (matching how `department`/`role` are stored today — no foreign key). The employee form, its API routes, and the page-level data fetch all thread `company` through exactly the way `department` already flows today.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), React 19 client components, Jest + React Testing Library.

## Global Constraints

- `employees.company` is plain text matching the company's `name` — not a foreign key to `companies.id`.
- Existing employee rows are backfilled to `'Modicare Ltd.'` before the column becomes `NOT NULL`.
- Seed companies: exactly `'Modicare Ltd.'` and `'Colorbar Cosmetics'`.
- Company dropdown is positioned immediately before Department in the employee form's field order.
- No FK, no company-scoped RLS changes beyond what's needed for HR to manage companies and employees to read them (matching Department/Level's existing RLS shape exactly).
- This repo has no Supabase CLI configured (no `supabase/config.toml`, no `supabase` binary, no direct Postgres connection string in `.env.local` — only the REST/Auth API + service role key). Migration `.sql` files are committed to the repo but must be applied to the live Supabase project manually via the Supabase Dashboard's SQL Editor — no task in this plan can run migrations programmatically. Each task that depends on a migration having been applied says so explicitly in its manual verification step.
- No automated test convention exists for API routes in this codebase (confirmed across Masters, Employees, and the password-change feature) — routes are verified via typecheck + manual checks, not new test files. Component-level tests (EmployeeForm) do follow TDD.

---

### Task 1: Companies master (migration + API routes + Masters page)

**Files:**
- Create: `supabase/migrations/014_companies_master.sql`
- Create: `cms-panel/app/api/masters/companies/route.ts`
- Create: `cms-panel/app/api/masters/companies/[id]/route.ts`
- Modify: `cms-panel/app/masters/page.tsx`

**Interfaces:**
- Consumes: `supabase-server`'s `createClient()` (existing helper); `MasterTable` component (existing, fully generic, no changes needed — takes `title`, `noun`, `initialItems`, `apiPath` props).
- Produces: a `companies` table (columns `id`, `name`, `created_at`) queryable via `supabase.from('companies')`; REST endpoints `GET/POST /api/masters/companies` and `PUT/DELETE /api/masters/companies/[id]`. Task 3 will read from the `companies` table (via the employees page's parallel fetch) and this task's API routes are not used by Task 3 (Task 3 fetches `companies` directly via Supabase, same as it already does for `departments`/`levels`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/014_companies_master.sql

-- Companies master
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

-- Allow employees to read companies (for future use, matches departments/levels)
CREATE POLICY "employees_read_companies" ON companies
  FOR SELECT TO authenticated
  USING (TRUE);

INSERT INTO companies (name) VALUES ('Modicare Ltd.'), ('Colorbar Cosmetics');
```

- [ ] **Step 2: Write the list/create API route**

```typescript
// cms-panel/app/api/masters/companies/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function getHrUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }
  const { data: hrUser } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  return { supabase, user: hrUser ? user : null }
}

export async function GET() {
  const { supabase, user } = await getHrUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('companies').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { supabase, user } = await getHrUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('companies')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Company already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 3: Write the update/delete API route**

```typescript
// cms-panel/app/api/masters/companies/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function getHrUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }
  const { data: hrUser } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  return { supabase, user: hrUser ? user : null }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getHrUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('companies')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Company already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getHrUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Wire a third MasterTable into the Masters page**

In `cms-panel/app/masters/page.tsx`, change the parallel fetch from 2 to 3 queries, and the grid from 2 to 3 columns. Replace:

```typescript
  // Parallel fetch both masters
  const [{ data: departments }, { data: levels }] = await Promise.all([
    supabase.from('departments').select('*').order('name'),
    supabase.from('levels').select('*').order('name'),
  ])

  return (
    <AppLayout title="Masters" userName={hrUser.name}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MasterTable
          title="Departments"
          noun="Department"
          initialItems={departments ?? []}
          apiPath="/api/masters/departments"
        />
        <MasterTable
          title="Levels"
          noun="Level"
          initialItems={levels ?? []}
          apiPath="/api/masters/levels"
        />
      </div>
    </AppLayout>
  )
```

with:

```typescript
  // Parallel fetch all masters
  const [{ data: departments }, { data: levels }, { data: companies }] = await Promise.all([
    supabase.from('departments').select('*').order('name'),
    supabase.from('levels').select('*').order('name'),
    supabase.from('companies').select('*').order('name'),
  ])

  return (
    <AppLayout title="Masters" userName={hrUser.name}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MasterTable
          title="Departments"
          noun="Department"
          initialItems={departments ?? []}
          apiPath="/api/masters/departments"
        />
        <MasterTable
          title="Levels"
          noun="Level"
          initialItems={levels ?? []}
          apiPath="/api/masters/levels"
        />
        <MasterTable
          title="Companies"
          noun="Company"
          initialItems={companies ?? []}
          apiPath="/api/masters/companies"
        />
      </div>
    </AppLayout>
  )
```

- [ ] **Step 5: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

This step requires the migration to be applied first — apply `supabase/migrations/014_companies_master.sql` to the live Supabase project via the Dashboard's SQL Editor (Supabase Dashboard → SQL Editor → paste the file contents → Run). This repo has no CLI/migration-runner configured, so this is a manual step.

With the dev server running and logged in to `/masters`:
1. Confirm a third "Companies" card appears, already listing "Colorbar Cosmetics" and "Modicare Ltd." (seeded, alphabetical).
2. Click "+ Add Company", create a test company, confirm it appears in the list.
3. Edit the test company's name, confirm it updates.
4. Delete the test company, confirm it's removed.

Expected: all 4 steps behave as described, matching how Departments/Levels already work.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/014_companies_master.sql cms-panel/app/api/masters/companies cms-panel/app/masters/page.tsx
git commit -m "feat(cms): add Company master (table, API routes, Masters page)"
```

---

### Task 2: EmployeeForm Company field (component-level)

**Files:**
- Modify: `cms-panel/components/EmployeeForm.tsx`
- Modify: `cms-panel/lib/types.ts:15-25` (the `Employee` interface)
- Modify: `cms-panel/__tests__/EmployeeForm.test.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 at the component level — `EmployeeForm` takes a plain `companies: string[]` prop (a new prop, same shape as the existing `departments`/`levels` props), supplied by whatever renders it. This task does not touch the real employees page (that's Task 3) — the test renders `EmployeeForm` directly with an in-memory `companies` array.
- Produces: `EmployeeForm`'s `Props` interface gains `companies: string[]`; its submit payload gains a `company` field alongside `department`/`role`. Task 3 wires the real `companies` prop (fetched from Supabase) into this component and updates the API routes to accept/store `company`.

This task also fixes two pre-existing, unrelated-to-this-feature broken assertions in `EmployeeForm.test.tsx` (confirmed stale: a `'Password'` placeholder check — no password field exists on this form, since employees authenticate via Microsoft SSO with a randomly generated internal password — and placeholder-based checks for Department/Level, which are `<select>` dropdowns and don't support placeholder text). Fixing them was an explicit choice (not silently decided) since this task must touch this exact file anyway.

- [ ] **Step 1: Write the updated/failing tests**

Replace the full contents of `cms-panel/__tests__/EmployeeForm.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmployeeForm from '@/components/EmployeeForm'

describe('EmployeeForm', () => {
  it('renders all fields', () => {
    render(<EmployeeForm companies={[]} departments={[]} levels={[]} onSuccess={jest.fn()} />)
    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('work@company.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mobile number')).toBeInTheDocument()
    expect(screen.getByText('Select Company')).toBeInTheDocument()
    expect(screen.getByText('Select Department')).toBeInTheDocument()
    expect(screen.getByText('Select Level')).toBeInTheDocument()
  })

  it('shows error if name is empty on submit', async () => {
    render(<EmployeeForm companies={[]} departments={[]} levels={[]} onSuccess={jest.fn()} />)
    await userEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })

  it('renders company options and shows a validation error when none is selected', async () => {
    render(<EmployeeForm companies={['Modicare Ltd.', 'Colorbar Cosmetics']} departments={['Sales']} levels={['Manager']} onSuccess={jest.fn()} />)
    expect(screen.getByText('Modicare Ltd.')).toBeInTheDocument()
    expect(screen.getByText('Colorbar Cosmetics')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Full name'), 'Jane Smith')
    await userEvent.type(screen.getByPlaceholderText('work@company.com'), 'jane@company.com')
    await userEvent.type(screen.getByPlaceholderText('Mobile number'), '9999999999')
    await userEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Please select a company')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cms-panel && npx jest EmployeeForm -v`
Expected: FAIL — the first two tests fail because `EmployeeForm` doesn't accept a `companies` prop yet and has no "Select Company" option; the third test fails for the same reason (no Company field exists yet to select or validate).

- [ ] **Step 3: Update the Employee type**

In `cms-panel/lib/types.ts`, update the `Employee` interface (currently lines 15-25):

```typescript
export interface Employee {
  id: string
  name: string
  email: string
  mobile: string
  password: string
  company: string
  department: string
  role: string
  is_active: boolean
  last_seen_at?: string | null
}
```

- [ ] **Step 4: Update EmployeeForm.tsx**

Replace the full contents of `cms-panel/components/EmployeeForm.tsx`:

```typescript
'use client'
import { useState } from 'react'
import type { Employee } from '@/lib/types'

interface Props {
  companies: string[]
  departments: string[]
  levels: string[]
  initial?: Employee
  employeeId?: string
  onSuccess: () => void
}

export default function EmployeeForm({ companies, departments, levels, initial, employeeId, onSuccess }: Props) {
  const isEdit = !!employeeId

  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [mobile, setMobile] = useState(initial?.mobile ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [level, setLevel] = useState(initial?.role ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (!mobile.trim()) { setError('Mobile is required'); return }
    if (!company) { setError('Please select a company'); return }
    if (!department) { setError('Please select a department'); return }
    if (!level) { setError('Please select a level'); return }
    setError('')
    setSaving(true)

    const body: Record<string, string> = {
      name: name.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      company,
      department,
      role: level,
    }

    const res = await fetch(
      isEdit ? `/api/employees/${employeeId}` : '/api/employees',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok) { setError(typeof data.error === 'string' && data.error ? data.error : 'Failed to save. Please try again.'); setSaving(false); return }
    onSuccess()
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'white',
  }

  const selectStyle = {
    ...inputStyle,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(255,255,255,0.4)'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '16px',
    paddingRight: '36px',
    cursor: 'pointer',
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.border = '1px solid rgba(13,148,136,0.60)'
    e.target.style.background = 'rgba(255,255,255,0.10)'
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.border = '1px solid rgba(255,255,255,0.14)'
    e.target.style.background = 'rgba(255,255,255,0.08)'
  }

  const baseInputCls = 'w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Full name"
          value={name}
          onChange={e => setName(e.target.value)}
          className={baseInputCls}
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <input
          type="email"
          placeholder="work@company.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={baseInputCls}
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <input
          type="tel"
          placeholder="Mobile number"
          value={mobile}
          onChange={e => setMobile(e.target.value)}
          className={baseInputCls}
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        <div className="relative">
          <select
            value={company}
            onChange={e => setCompany(e.target.value)}
            className={baseInputCls}
            style={selectStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Company</option>
            {companies.length === 0 && (
              <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No companies — add in Masters</option>
            )}
            {companies.map(c => (
              <option key={c} value={c} style={{ background: '#0b2d3d', color: 'white' }}>{c}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <select
            value={department}
            onChange={e => setDepartment(e.target.value)}
            className={baseInputCls}
            style={selectStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Department</option>
            {departments.length === 0 && (
              <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No departments — add in Masters</option>
            )}
            {departments.map(d => (
              <option key={d} value={d} style={{ background: '#0b2d3d', color: 'white' }}>{d}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            className={baseInputCls}
            style={selectStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Level</option>
            {levels.length === 0 && (
              <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No levels — add in Masters</option>
            )}
            {levels.map(l => (
              <option key={l} value={l} style={{ background: '#0b2d3d', color: 'white' }}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 mt-1"
        style={{
          background: saving ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
          boxShadow: saving ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? (
          <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
        ) : isEdit ? 'Save Changes' : 'Save Employee'}
      </button>
    </form>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cms-panel && npx jest EmployeeForm -v`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: errors in `app/employees/page.tsx` and `app/employees/client.tsx` are EXPECTED at this point (they don't pass a `companies` prop yet — Task 3 fixes this). Confirm there are no OTHER type errors beyond those two files.

- [ ] **Step 7: Commit**

```bash
git add cms-panel/components/EmployeeForm.tsx cms-panel/lib/types.ts cms-panel/__tests__/EmployeeForm.test.tsx
git commit -m "feat(cms): add Company field to EmployeeForm, fix stale form tests"
```

---

### Task 3: Employee schema + API + page wiring

**Files:**
- Create: `supabase/migrations/015_employee_company.sql`
- Modify: `cms-panel/app/api/employees/route.ts`
- Modify: `cms-panel/app/api/employees/[id]/route.ts`
- Modify: `cms-panel/app/employees/page.tsx`
- Modify: `cms-panel/app/employees/client.tsx`

**Interfaces:**
- Consumes: `EmployeeForm`'s `companies: string[]` prop from Task 2; the `companies` table from Task 1.
- Produces: the fully wired employees flow — no further tasks depend on this one.

- [ ] **Step 1: Write the employee schema migration**

```sql
-- supabase/migrations/015_employee_company.sql
ALTER TABLE employees ADD COLUMN company TEXT;
UPDATE employees SET company = 'Modicare Ltd.' WHERE company IS NULL;
ALTER TABLE employees ALTER COLUMN company SET NOT NULL;
```

- [ ] **Step 2: Update the employee create API route**

In `cms-panel/app/api/employees/route.ts`, update the `POST` handler's destructuring, validation, and insert payload. Replace:

```typescript
  const { name, email, mobile, department, role } = await req.json()
  if (!name || !email || !mobile || !department || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }
```

with:

```typescript
  const { name, email, mobile, company, department, role } = await req.json()
  if (!name || !email || !mobile || !company || !department || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }
```

And replace:

```typescript
  const { error: dbError } = await adminSupabase.from('employees').insert({
    id: authData.user.id,
    name,
    email,
    mobile,
    department,
    role,
  })
```

with:

```typescript
  const { error: dbError } = await adminSupabase.from('employees').insert({
    id: authData.user.id,
    name,
    email,
    mobile,
    company,
    department,
    role,
  })
```

- [ ] **Step 3: Update the employee edit API route**

In `cms-panel/app/api/employees/[id]/route.ts`, update the `PUT` handler. Replace:

```typescript
  const { id } = await params
  const { name, email, mobile, department, role } = await req.json()
```

with:

```typescript
  const { id } = await params
  const { name, email, mobile, company, department, role } = await req.json()
```

And replace:

```typescript
  const { error } = await admin.from('employees').update({ name, email, mobile, department, role }).eq('id', id)
```

with:

```typescript
  const { error } = await admin.from('employees').update({ name, email, mobile, company, department, role }).eq('id', id)
```

- [ ] **Step 4: Thread `companies` through the employees page**

In `cms-panel/app/employees/page.tsx`, update the parallel fetch and the props passed to `EmployeesClient`. Replace:

```typescript
  const [{ data: employees }, { data: departments }, { data: levels }, { data: presence }] = await Promise.all([
    supabase.from('employees').select('*').order('name'),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('levels').select('id, name').order('name'),
    supabase.from('employee_presence').select('employee_id, last_seen_at'),
  ])
```

with:

```typescript
  const [{ data: employees }, { data: departments }, { data: levels }, { data: companies }, { data: presence }] = await Promise.all([
    supabase.from('employees').select('*').order('name'),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('levels').select('id, name').order('name'),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('employee_presence').select('employee_id, last_seen_at'),
  ])
```

And replace:

```typescript
  return (
    <EmployeesClient
      employees={employeesWithPresence}
      departments={(departments ?? []).map(d => d.name)}
      levels={(levels ?? []).map(l => l.name)}
    />
  )
```

with:

```typescript
  return (
    <EmployeesClient
      employees={employeesWithPresence}
      departments={(departments ?? []).map(d => d.name)}
      levels={(levels ?? []).map(l => l.name)}
      companies={(companies ?? []).map(c => c.name)}
    />
  )
```

- [ ] **Step 5: Thread `companies` through EmployeesClient into EmployeeForm**

In `cms-panel/app/employees/client.tsx`, update the `Props` interface and the destructured props. Replace:

```typescript
interface Props {
  employees: Employee[]
  departments: string[]
  levels: string[]
}
```

with:

```typescript
interface Props {
  employees: Employee[]
  departments: string[]
  levels: string[]
  companies: string[]
}
```

And replace:

```typescript
export default function EmployeesClient({ employees: initial, departments, levels }: Props) {
```

with:

```typescript
export default function EmployeesClient({ employees: initial, departments, levels, companies }: Props) {
```

Then find every place in this file where `<EmployeeForm departments={departments} levels={levels} ... />` is rendered (there are two: the "add" form and the "edit" form) and add `companies={companies}` alongside the existing `departments`/`levels` props on both.

- [ ] **Step 6: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors (the two expected errors from Task 2's Step 6 are now resolved).

- [ ] **Step 7: Run the full test suite**

Run: `cd cms-panel && npx jest`
Expected: `EmployeeForm` and all other previously-passing suites are green. `MessageForm.test.tsx` may still show pre-existing, unrelated failures if they haven't been fixed by other work — do not attempt to fix that file; it's out of scope here.

- [ ] **Step 8: Manual verification**

This requires both migrations applied first, in order: apply `supabase/migrations/014_companies_master.sql` (if not already applied in Task 1) and then `supabase/migrations/015_employee_company.sql` via the Supabase Dashboard's SQL Editor.

With the dev server running and logged in to `/employees`:
1. Click "Add Employee" — confirm the field order is Name, Email, Mobile, **Company**, Department, Level, and that Company is a required dropdown listing "Modicare Ltd." and "Colorbar Cosmetics".
2. Create a new employee, selecting "Colorbar Cosmetics" as their company. Confirm it saves successfully.
3. Edit an existing employee — confirm their Company dropdown is pre-filled (existing rows should show "Modicare Ltd." per the backfill), change it, and save.
4. Try submitting the add-employee form without selecting a company — confirm "Please select a company" appears and the request is blocked client-side.

Expected: all 4 steps behave as described.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/015_employee_company.sql cms-panel/app/api/employees cms-panel/app/employees/page.tsx cms-panel/app/employees/client.tsx
git commit -m "feat(cms): wire Company field through employee create/edit flow"
```
