# Poll Targeting by Company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR target a poll at a specific company ("By Company"), in addition to the existing All Employees / Specific Level options, and have every widget-side eligibility check correctly scope it.

**Architecture:** `target_type` widens from a 2-value to a 3-value set (`'all' | 'level' | 'company'`), applied identically at every layer that already handles `level`: the RLS policy, the CMS's poll creation form, and the widget's two independent eligibility checks (`GET /api/polls/active` and `handleRealtimePoll`). No new abstractions — a 3rd parallel case added everywhere the 2nd case already exists.

**Tech Stack:** Next.js App Router (cms-panel), Supabase (Postgres + RLS), Electron main process (widget), TypeScript.

## Global Constraints

- `polls` has no `target_type` CHECK constraint today (unlike `messages`) — this migration touches ONLY the RLS policy, no constraint drop/recreate.
- Company target display uses the raw value everywhere — `PollsClient.tsx`'s `levelName()` already falls through to the raw `target_value` for any non-null value, so no display-code changes are needed there.
- No shared `isPollTargetedAtEmployee()`-style helper is introduced — the two eligibility-filter call sites stay independent, each gets the company branch added in its own existing inline style.
- `Poll.target_type` stays a plain `string` in the widget — no typed union introduced.
- This repo has no Supabase CLI/DB connection available to any agent — the migration file is committed but must be applied manually via the Supabase Dashboard's SQL Editor by the human.
- No automated test convention exists for `app/polls/create/page.tsx` or the widget's poll-handling code — verified via typecheck + manual testing.

---

### Task 1: RLS migration for poll company targeting

**Files:**
- Create: `supabase/migrations/017_poll_company_targeting.sql`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a DB that accepts/enforces `target_type = 'company'` reads on `polls` via RLS. Tasks 2 and 3 don't depend on this at compile time (no shared TypeScript types change), but the feature only works end-to-end once this migration is applied.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/017_poll_company_targeting.sql

-- Widen the employee-read RLS policy on polls to include company targeting.
-- No CHECK constraint exists on polls.target_type (unlike messages), so only
-- the RLS policy needs to change.
DROP POLICY "employees_read_polls" ON polls;
CREATE POLICY "employees_read_polls" ON polls
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND (
      target_type = 'all'
      OR (target_type = 'level' AND target_value = (SELECT role FROM employees WHERE id = auth.uid()))
      OR (target_type = 'company' AND target_value = (SELECT company FROM employees WHERE id = auth.uid()))
    )
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/017_poll_company_targeting.sql
git commit -m "feat: widen poll RLS policy to support company targeting"
```

---

### Task 2: Poll creation form — By Company pill + dropdown

**Files:**
- Modify: `cms-panel/app/polls/create/page.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 at compile time.
- Produces: nothing further downstream — Task 3 is independent of this file.

- [ ] **Step 1: Add a `Company` interface and `companies` state, fetched the same way `levels` is**

Replace:

```typescript
interface Level { id: string; name: string }
```

with:

```typescript
interface Level { id: string; name: string }
interface Company { id: string; name: string }
```

Replace:

```typescript
  const [levels, setLevels] = useState<Level[]>([])
  const [question, setQuestion] = useState('')
  const [pollType, setPollType] = useState<'yes_no' | 'mcq'>('yes_no')
  const [options, setOptions] = useState(['Yes', 'No'])
  const [targetType, setTargetType] = useState<'all' | 'level'>('all')
  const [targetValue, setTargetValue] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getBrowserClient().from('levels').select('id, name').order('name')
      .then(({ data }: { data: Level[] | null }) => { if (data) setLevels(data) })
  }, [])
```

with:

```typescript
  const [levels, setLevels] = useState<Level[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [question, setQuestion] = useState('')
  const [pollType, setPollType] = useState<'yes_no' | 'mcq'>('yes_no')
  const [options, setOptions] = useState(['Yes', 'No'])
  const [targetType, setTargetType] = useState<'all' | 'level' | 'company'>('all')
  const [targetValue, setTargetValue] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getBrowserClient().from('levels').select('id, name').order('name')
      .then(({ data }: { data: Level[] | null }) => { if (data) setLevels(data) })
    getBrowserClient().from('companies').select('id, name').order('name')
      .then(({ data }: { data: Company[] | null }) => { if (data) setCompanies(data) })
  }, [])
```

- [ ] **Step 2: Widen the submit payload's `target_value`**

Replace:

```typescript
        target_type: targetType,
        target_value: targetType === 'level' ? targetValue : null,
```

with:

```typescript
        target_type: targetType,
        target_value: targetType !== 'all' ? targetValue : null,
```

- [ ] **Step 3: Add the "By Company" pill and dropdown**

Replace:

```typescript
                {(['all', 'level'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTargetType(t)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={targetType === t
                      ? { background: 'rgba(13,148,136,0.25)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.40)' }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.10)' }}>
                    {t === 'all' ? '👥 All Employees' : '🎯 Specific Level'}
                  </button>
                ))}
              </div>
              {targetType === 'level' && (
                <select value={targetValue} onChange={e => setTargetValue(e.target.value)} required
                  className="appearance-none" style={inputStyle}>
                  <option value="">Select level…</option>
                  {levels.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              )}
            </div>
```

with:

```typescript
                {(['all', 'level', 'company'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTargetType(t)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={targetType === t
                      ? { background: 'rgba(13,148,136,0.25)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.40)' }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.10)' }}>
                    {t === 'all' ? '👥 All Employees' : t === 'level' ? '🎯 Specific Level' : '🏢 By Company'}
                  </button>
                ))}
              </div>
              {targetType === 'level' && (
                <select value={targetValue} onChange={e => setTargetValue(e.target.value)} required
                  className="appearance-none" style={inputStyle}>
                  <option value="">Select level…</option>
                  {levels.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              )}
              {targetType === 'company' && (
                <select value={targetValue} onChange={e => setTargetValue(e.target.value)} required
                  className="appearance-none" style={inputStyle}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </div>
```

- [ ] **Step 4: Widen the submit-button disabled condition**

Replace:

```typescript
          <button type="submit" disabled={submitting || !question.trim() || (targetType === 'level' && !targetValue)}
```

with:

```typescript
          <button type="submit" disabled={submitting || !question.trim() || (targetType !== 'all' && !targetValue)}
```

- [ ] **Step 5: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add cms-panel/app/polls/create/page.tsx
git commit -m "feat(cms): add By Company targeting option to poll creation"
```

---

### Task 3: Widget-side eligibility filtering

**Files:**
- Modify: `cms-panel/app/api/polls/active/route.ts`
- Modify: `widget/src/main/index.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1/2 at compile time.
- Produces: the fully wired feature — no further tasks depend on this one.

- [ ] **Step 1: Widen the employee lookup and filter in `GET /api/polls/active`**

Replace:

```typescript
  const admin = svc()
  let employeeId: string
  let employeeRole: string | null = null

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    employeeId = user.id
    const { data: emp } = await admin.from('employees').select('role').eq('id', employeeId).single()
    employeeRole = emp?.role ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id, role').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeId = emp.id
    employeeRole = emp.role ?? null
  }
```

with:

```typescript
  const admin = svc()
  let employeeId: string
  let employeeRole: string | null = null
  let employeeCompany: string | null = null

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    employeeId = user.id
    const { data: emp } = await admin.from('employees').select('role, company').eq('id', employeeId).single()
    employeeRole = emp?.role ?? null
    employeeCompany = emp?.company ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id, role, company').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeId = emp.id
    employeeRole = emp.role ?? null
    employeeCompany = emp.company ?? null
  }
```

- [ ] **Step 2: Widen the filter predicate**

Replace:

```typescript
  const filtered = (polls ?? []).filter((p: Record<string, unknown>) =>
    p.target_type === 'all' ||
    (p.target_type === 'level' && p.target_value === employeeRole)
  )
```

with:

```typescript
  const filtered = (polls ?? []).filter((p: Record<string, unknown>) =>
    p.target_type === 'all' ||
    (p.target_type === 'level' && p.target_value === employeeRole) ||
    (p.target_type === 'company' && p.target_value === employeeCompany)
  )
```

- [ ] **Step 3: Widen the real-time poll eligibility check**

In `widget/src/main/index.ts`, replace:

```typescript
  if (poll.target_type !== 'all' && !(poll.target_type === 'level' && poll.target_value === currentEmployee.role)) return
```

with:

```typescript
  if (
    poll.target_type !== 'all' &&
    !(poll.target_type === 'level' && poll.target_value === currentEmployee.role) &&
    !(poll.target_type === 'company' && poll.target_value === currentEmployee.company)
  ) return
```

- [ ] **Step 4: Typecheck both projects**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

Run: `cd widget && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run existing test suites (regression check)**

Run: `cd cms-panel && npx jest`
Expected: same pre-existing, unrelated failures as before this task (the stale `MessageForm.test.tsx` placeholder assertion, if not yet fixed) — no new failures.

Run: `cd widget && npx jest`
Expected: same pre-existing, unrelated failures as before this task (the `better-sqlite3` native-binary mismatch in `seen-store.test.ts`, if not yet fixed) — no new failures. `theme.test.ts` and `auth-store.test.ts` remain green.

- [ ] **Step 6: Manual verification**

This requires the migration from Task 1 to be applied first via the Supabase Dashboard's SQL Editor.

1. Create a poll targeted "By Company" → "Colorbar Cosmetics".
2. Confirm it appears and is votable in the widget for a Colorbar Cosmetics employee.
3. Confirm it does NOT appear for a Modicare Ltd. employee.
4. If feasible, confirm a real-time-pushed company-targeted poll correctly triggers the popup notification for a matching-company employee and not for a non-matching one.
5. Confirm an existing `all`/`level`-targeted poll still behaves correctly for all employees.

Expected: all steps behave as described.

- [ ] **Step 7: Commit**

```bash
git add cms-panel/app/api/polls/active/route.ts widget/src/main/index.ts
git commit -m "feat: wire company targeting through poll active-fetch and realtime filter"
```
