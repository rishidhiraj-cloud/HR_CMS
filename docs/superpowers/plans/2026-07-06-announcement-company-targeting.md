# Announcement Targeting by Company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR target an announcement at a specific company ("By Company"), in addition to the existing All Employees / By Department / By Role options, and have the widget correctly show it only to matching-company employees.

**Architecture:** `target_type` widens from a 3-value to a 4-value enum, applied identically at every layer that already handles `dept`/`role`: the DB check constraint + RLS policy, the CMS's `MessageForm.tsx` targeting UI, and the widget's client-side `isTargetedAtEmployee()` filter. No new abstractions — this is a parallel 4th case added to existing 3-case logic everywhere it appears.

**Tech Stack:** Next.js App Router (cms-panel), Supabase (Postgres + RLS), Electron main process (widget), TypeScript.

## Global Constraints

- `target_type` becomes `'all' | 'dept' | 'role' | 'company'` everywhere it's typed (`cms-panel/lib/types.ts`, `widget/src/shared/types.ts`).
- Company target display uses the **raw value** everywhere (e.g. "Modicare Ltd."), matching exactly how Department/Role already display today — no "Company:" prefix, no changes needed to `MessageTable.tsx` or `Feed.tsx` display code.
- No changes to delivery/scheduling logic, Message CRUD shape, or multi-dimension targeting — company is a targeting mode parallel to department/role, not layered on top of them.
- This repo has no Supabase CLI/DB connection available to any agent — migration `.sql` files are committed but must be applied manually via the Supabase Dashboard's SQL Editor by the human.
- No automated test convention exists for `MessageForm.tsx` (confirmed — no test file exists for it today) — verified via typecheck + manual testing, matching established convention.

---

### Task 1: Database migration + type widening

**Files:**
- Create: `supabase/migrations/016_message_company_targeting.sql`
- Modify: `cms-panel/lib/types.ts:1`
- Modify: `widget/src/shared/types.ts:1`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a widened `TargetType = 'all' | 'dept' | 'role' | 'company'` in both `cms-panel/lib/types.ts` and `widget/src/shared/types.ts`, and a DB that accepts/enforces `target_type = 'company'`. Tasks 2 and 3 both depend on this type widening to compile.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/016_message_company_targeting.sql

-- Widen target_type to allow 'company'.
-- NOTE: if this DROP CONSTRAINT fails with "constraint does not exist", run
--   SELECT conname FROM pg_constraint WHERE conrelid = 'messages'::regclass AND contype = 'c';
-- to find the actual check-constraint name and substitute it below (Postgres names
-- unnamed column-level CHECK constraints '<table>_<column>_check' by default).
ALTER TABLE messages DROP CONSTRAINT messages_target_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_target_type_check
  CHECK (target_type IN ('all', 'dept', 'role', 'company'));

-- Widen the employee-read RLS policy to include company targeting.
DROP POLICY "messages: employee read" ON messages;
CREATE POLICY "messages: employee read" ON messages
  FOR SELECT USING (
    published_at IS NOT NULL
    AND (
      target_type = 'all'
      OR (target_type = 'dept' AND target_value = (SELECT department FROM employees WHERE id = auth.uid()))
      OR (target_type = 'role' AND target_value = (SELECT role FROM employees WHERE id = auth.uid()))
      OR (target_type = 'company' AND target_value = (SELECT company FROM employees WHERE id = auth.uid()))
    )
  );
```

- [ ] **Step 2: Widen the CMS `TargetType`**

In `cms-panel/lib/types.ts`, replace:

```typescript
export type TargetType = 'all' | 'dept' | 'role'
```

with:

```typescript
export type TargetType = 'all' | 'dept' | 'role' | 'company'
```

- [ ] **Step 3: Widen the widget `TargetType`**

In `widget/src/shared/types.ts`, replace:

```typescript
export type TargetType = 'all' | 'dept' | 'role'
```

with:

```typescript
export type TargetType = 'all' | 'dept' | 'role' | 'company'
```

- [ ] **Step 4: Typecheck both projects**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

Run: `cd widget && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/016_message_company_targeting.sql cms-panel/lib/types.ts widget/src/shared/types.ts
git commit -m "feat: widen message target_type to support company targeting"
```

---

### Task 2: `MessageForm.tsx` — By Company pill + dropdown

**Files:**
- Modify: `cms-panel/components/MessageForm.tsx`

**Interfaces:**
- Consumes: the widened `TargetType` from Task 1.
- Produces: `MessageForm`'s `Props` interface gains `companies?: string[]` (optional, default `[]`, matching the existing `departments?`/`levels?` pattern). Task 3 supplies the real `companies` array from the page-level fetch.

- [ ] **Step 1: Add `companies` to `Props` and the component signature**

Replace:

```typescript
interface Props {
  initial?: Partial<Message>
  messageId?: string
  departments?: string[]
  levels?: string[]
}

export default function MessageForm({ initial, messageId, departments = [], levels = [] }: Props) {
```

with:

```typescript
interface Props {
  initial?: Partial<Message>
  messageId?: string
  departments?: string[]
  levels?: string[]
  companies?: string[]
}

export default function MessageForm({ initial, messageId, departments = [], levels = [], companies = [] }: Props) {
```

- [ ] **Step 2: Add the "By Company" pill and dropdown**

Replace:

```typescript
              {(['all', 'dept', 'role'] as TargetType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => { setTargetType(t); setTargetValue('') }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={pillBtn(targetType === t)}
                >
                  {t === 'all' ? 'All Employees' : t === 'dept' ? 'By Department' : 'By Role'}
                </button>
              ))}
            </div>
            {targetType === 'dept' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Department</option>
                {departments.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No departments — add in Masters</option>}
                {departments.map(d => <option key={d} value={d} style={{ background: '#0b2d3d', color: 'white' }}>{d}</option>)}
              </select>
            )}
            {targetType === 'role' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Level</option>
                {levels.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No levels — add in Masters</option>}
                {levels.map(l => <option key={l} value={l} style={{ background: '#0b2d3d', color: 'white' }}>{l}</option>)}
              </select>
            )}
          </div>
```

with:

```typescript
              {(['all', 'dept', 'role', 'company'] as TargetType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => { setTargetType(t); setTargetValue('') }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={pillBtn(targetType === t)}
                >
                  {t === 'all' ? 'All Employees' : t === 'dept' ? 'By Department' : t === 'role' ? 'By Role' : 'By Company'}
                </button>
              ))}
            </div>
            {targetType === 'dept' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Department</option>
                {departments.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No departments — add in Masters</option>}
                {departments.map(d => <option key={d} value={d} style={{ background: '#0b2d3d', color: 'white' }}>{d}</option>)}
              </select>
            )}
            {targetType === 'role' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Level</option>
                {levels.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No levels — add in Masters</option>}
                {levels.map(l => <option key={l} value={l} style={{ background: '#0b2d3d', color: 'white' }}>{l}</option>)}
              </select>
            )}
            {targetType === 'company' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Company</option>
                {companies.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No companies — add in Masters</option>}
                {companies.map(c => <option key={c} value={c} style={{ background: '#0b2d3d', color: 'white' }}>{c}</option>)}
              </select>
            )}
          </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add cms-panel/components/MessageForm.tsx
git commit -m "feat(cms): add By Company targeting option to MessageForm"
```

---

### Task 3: Page wiring + widget filter

**Files:**
- Modify: `cms-panel/app/messages/new/page.tsx`
- Modify: `cms-panel/app/messages/[id]/page.tsx`
- Modify: `widget/src/main/index.ts`

**Interfaces:**
- Consumes: `MessageForm`'s `companies?: string[]` prop from Task 2; the widened `TargetType` from Task 1.
- Produces: the fully wired feature — no further tasks depend on this one.

- [ ] **Step 1: Thread `companies` through the new-message page**

In `cms-panel/app/messages/new/page.tsx`, replace:

```typescript
  const [{ data: departments }, { data: levels }] = await Promise.all([
    supabase.from('departments').select('name').order('name'),
    supabase.from('levels').select('name').order('name'),
  ])

  return (
    <AppLayout title="New Message">
      <MessageForm
        departments={(departments ?? []).map(d => d.name)}
        levels={(levels ?? []).map(l => l.name)}
      />
    </AppLayout>
  )
```

with:

```typescript
  const [{ data: departments }, { data: levels }, { data: companies }] = await Promise.all([
    supabase.from('departments').select('name').order('name'),
    supabase.from('levels').select('name').order('name'),
    supabase.from('companies').select('name').order('name'),
  ])

  return (
    <AppLayout title="New Message">
      <MessageForm
        departments={(departments ?? []).map(d => d.name)}
        levels={(levels ?? []).map(l => l.name)}
        companies={(companies ?? []).map(c => c.name)}
      />
    </AppLayout>
  )
```

- [ ] **Step 2: Thread `companies` through the edit-message page**

In `cms-panel/app/messages/[id]/page.tsx`, replace:

```typescript
  const [{ data: message }, { data: departments }, { data: levels }] = await Promise.all([
    supabase.from('messages').select('*').eq('id', id).single(),
    supabase.from('departments').select('name').order('name'),
    supabase.from('levels').select('name').order('name'),
  ])

  if (!message) notFound()

  return (
    <AppLayout title="Edit Message">
      <MessageForm
        initial={message as Message}
        messageId={id}
        departments={(departments ?? []).map(d => d.name)}
        levels={(levels ?? []).map(l => l.name)}
      />
    </AppLayout>
  )
```

with:

```typescript
  const [{ data: message }, { data: departments }, { data: levels }, { data: companies }] = await Promise.all([
    supabase.from('messages').select('*').eq('id', id).single(),
    supabase.from('departments').select('name').order('name'),
    supabase.from('levels').select('name').order('name'),
    supabase.from('companies').select('name').order('name'),
  ])

  if (!message) notFound()

  return (
    <AppLayout title="Edit Message">
      <MessageForm
        initial={message as Message}
        messageId={id}
        departments={(departments ?? []).map(d => d.name)}
        levels={(levels ?? []).map(l => l.name)}
        companies={(companies ?? []).map(c => c.name)}
      />
    </AppLayout>
  )
```

- [ ] **Step 3: Add the company branch to the widget's targeting filter**

In `widget/src/main/index.ts`, replace:

```typescript
function isTargetedAtEmployee(msg: Message, emp: Employee | null): boolean {
  if (!emp) return false
  if (msg.target_type === 'all') return true
  if (msg.target_type === 'dept') return msg.target_value === emp.department
  if (msg.target_type === 'role') return msg.target_value === emp.role
  return false
}
```

with:

```typescript
function isTargetedAtEmployee(msg: Message, emp: Employee | null): boolean {
  if (!emp) return false
  if (msg.target_type === 'all') return true
  if (msg.target_type === 'dept') return msg.target_value === emp.department
  if (msg.target_type === 'role') return msg.target_value === emp.role
  if (msg.target_type === 'company') return msg.target_value === emp.company
  return false
}
```

- [ ] **Step 4: Typecheck both projects**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

Run: `cd widget && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run existing test suites (regression check)**

Run: `cd cms-panel && npx jest`
Expected: same pre-existing, unrelated failures as before this task (if any) — no new failures caused by this change. `MessageForm.tsx` has no test file, so nothing new to run there.

Run: `cd widget && npx jest`
Expected: same pre-existing, unrelated failures as before this task (e.g. the `better-sqlite3` native-binary version mismatch in `seen-store.test.ts`, if not fixed by then) — no new failures. `theme.test.ts` and `auth-store.test.ts` remain green.

- [ ] **Step 6: Manual verification**

This requires the migration from Task 1 to be applied first via the Supabase Dashboard's SQL Editor.

1. In the CMS, go to "New Message", select "By Company", pick "Colorbar Cosmetics", fill in a title, and publish ("Send Now").
2. Confirm the message appears in the widget Feed for a Colorbar Cosmetics employee.
3. Confirm it does NOT appear for a Modicare Ltd. employee.
4. Confirm an existing `all`/`dept`/`role`-targeted announcement still displays correctly for all employees as before.
5. In the CMS's message list, confirm the company-targeted message shows the raw company name (e.g. "Colorbar Cosmetics") in its target column, same as Department/Role values do.

Expected: all 5 steps behave as described.

- [ ] **Step 7: Commit**

```bash
git add cms-panel/app/messages/new/page.tsx cms-panel/app/messages/\[id\]/page.tsx widget/src/main/index.ts
git commit -m "feat: wire company targeting through message pages and widget filter"
```
