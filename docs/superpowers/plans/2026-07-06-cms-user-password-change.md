# CMS User Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in CMS admin change any CMS user's password from the `/admin/users` page.

**Architecture:** A new `PATCH /api/admin/users/[id]/password` route calls Supabase's `auth.admin.updateUserById`. A new client-side modal component collects the new password and calls that route; a new `UsersTable` client component (replacing the inline table currently in `page.tsx`) renders a "Change Password" button per row and owns which user's modal is open.

**Tech Stack:** Next.js 16 App Router API routes, `@supabase/supabase-js` service-role admin client, React 19 client components, Jest + React Testing Library.

## Global Constraints

- Password minimum length: 6 characters (client- and server-side), matching the existing create-user form.
- Any user in `hr_users` can change any other user's password — no additional role/permission tiers.
- Single password field only — no confirm/repeat-password field.
- The action is a modal opened per-row from the existing users table, not an inline row expansion.
- No audit logging, no email/self-service reset flow — this is admin-initiated only.
- Follow the codebase's existing inline-style Tailwind + rgba glassmorphism convention exactly (no new UI library, no shared `Modal` abstraction — every modal in this codebase is hand-rolled per file).

---

### Task 1: Backend route — `PATCH /api/admin/users/[id]/password`

**Files:**
- Create: `cms-panel/app/api/admin/users/[id]/password/route.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase-server` (existing helper, already used in `cms-panel/app/api/employees/[id]/route.ts`); `createClient as createServiceClient` from `@supabase/supabase-js`; env vars `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `PATCH` handler at `/api/admin/users/{id}/password` accepting JSON body `{ password: string }`, returning `{ ok: true }` on success or `{ error: string }` with a non-2xx status on failure. This is the endpoint Task 2's modal will call.

This codebase has no established pattern for automated tests against Next.js API route handlers (`cms-panel/app/api/employees/[id]/route.ts` and `cms-panel/app/api/admin/users/route.ts` have no corresponding test files — only React components and type helpers are unit tested, e.g. `__tests__/EmployeeForm.test.tsx`). This task follows that existing convention: verify by inspection and a manual unauthenticated-request check, not a new test file.

- [ ] **Step 1: Write the route handler**

```typescript
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireHr() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: hr } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  return hr ? user : null
}

// PATCH /api/admin/users/[id]/password — change a CMS user's password
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireHr()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { password } = await req.json()

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const { error } = await adminClient().auth.admin.updateUserById(id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd cms-panel && npx tsc --noEmit && npm run lint`
Expected: both complete with no errors related to the new file.

- [ ] **Step 3: Manual check — unauthenticated request is rejected**

With the dev server running (`npm run dev` in `cms-panel/`), from a shell with no Supabase session cookie:

Run: `curl -i -X PATCH http://localhost:3000/api/admin/users/00000000-0000-0000-0000-000000000000/password -H "Content-Type: application/json" -d '{"password":"whatever123"}'`
Expected: `HTTP/1.1 401` and body `{"error":"Unauthorized"}`.

- [ ] **Step 4: Commit**

```bash
git add cms-panel/app/api/admin/users/[id]/password/route.ts
git commit -m "feat(cms): add password change API route for CMS users"
```

---

### Task 2: `ChangePasswordModal` component

**Files:**
- Create: `cms-panel/components/ChangePasswordModal.tsx`
- Test: `cms-panel/__tests__/ChangePasswordModal.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/users/{id}/password` from Task 1 (called via `fetch`).
- Produces: `export default function ChangePasswordModal({ user, onClose }: { user: { id: string; name: string }; onClose: () => void })` — a modal overlay. Task 3 renders this component and supplies `user`/`onClose`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordModal from '@/components/ChangePasswordModal'

describe('ChangePasswordModal', () => {
  const user = { id: 'user-1', name: 'HR Admin' }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the password field and user name', () => {
    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    expect(screen.getByText('Change password for HR Admin')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Min 6 characters')).toBeInTheDocument()
  })

  it('shows a validation error for a short password', async () => {
    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Min 6 characters'), '123')
    await userEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument()
  })

  it('calls the password API and shows success on submit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch

    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Min 6 characters'), 'newpassword123')
    await userEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Password updated successfully')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/users/user-1/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'newpassword123' }),
    })
  })

  it('shows an inline error when the API call fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Something went wrong' }),
    }) as unknown as typeof fetch

    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Min 6 characters'), 'newpassword123')
    await userEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cms-panel && npx jest ChangePasswordModal -v`
Expected: FAIL — `Cannot find module '@/components/ChangePasswordModal'`

- [ ] **Step 3: Write the component**

```typescript
'use client'
import { useState } from 'react'

export default function ChangePasswordModal({
  user,
  onClose,
}: {
  user: { id: string; name: string }
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError('')
    setSuccess('')
    setSaving(true)

    const res = await fetch(`/api/admin/users/${user.id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Failed to change password'); return }

    setSuccess('Password updated successfully')
    setTimeout(onClose, 1200)
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'white',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5"
        style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <h2 className="text-base font-semibold text-white">Change password for {user.name}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(13,148,136,0.15)', border: '1px solid rgba(13,148,136,0.30)', color: '#5eead4' }}>
              {success}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>New Password</label>
            <input
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all flex items-center gap-2"
              style={{
                background: saving ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
              ) : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cms-panel && npx jest ChangePasswordModal -v`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add cms-panel/components/ChangePasswordModal.tsx cms-panel/__tests__/ChangePasswordModal.test.tsx
git commit -m "feat(cms): add ChangePasswordModal component"
```

---

### Task 3: `UsersTable` component (Change Password button per row)

**Files:**
- Create: `cms-panel/app/admin/users/UsersTable.tsx`
- Test: `cms-panel/__tests__/UsersTable.test.tsx`

**Interfaces:**
- Consumes: `HrUser` type from `@/lib/types` (`{ id: string; name: string; email: string }`); `ChangePasswordModal` from Task 2.
- Produces: `export default function UsersTable({ users }: { users: HrUser[] })`. Task 4 renders this in place of the inline table currently in `page.tsx`, passing the server-fetched `hrUsers` array.

- [ ] **Step 1: Write the failing tests**

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UsersTable from '@/app/admin/users/UsersTable'

const users = [
  { id: 'user-1', name: 'HR Admin', email: 'rishi.dhiraj@gmail.com' },
]

describe('UsersTable', () => {
  it('renders each user with a Change Password button', () => {
    render(<UsersTable users={users} />)
    expect(screen.getByText('HR Admin')).toBeInTheDocument()
    expect(screen.getByText('rishi.dhiraj@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Change Password')).toBeInTheDocument()
  })

  it('shows the empty state when there are no users', () => {
    render(<UsersTable users={[]} />)
    expect(screen.getByText('No CMS users yet')).toBeInTheDocument()
  })

  it('opens the change-password modal for the clicked user', async () => {
    render(<UsersTable users={users} />)
    await userEvent.click(screen.getByText('Change Password'))
    expect(screen.getByText('Change password for HR Admin')).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', async () => {
    render(<UsersTable users={users} />)
    await userEvent.click(screen.getByText('Change Password'))
    await userEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Change password for HR Admin')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cms-panel && npx jest UsersTable -v`
Expected: FAIL — `Cannot find module '@/app/admin/users/UsersTable'`

- [ ] **Step 3: Write the component**

```typescript
'use client'
import { useState } from 'react'
import type { HrUser } from '@/lib/types'
import ChangePasswordModal from '@/components/ChangePasswordModal'

export default function UsersTable({ users }: { users: HrUser[] }) {
  const [changingUser, setChangingUser] = useState<HrUser | null>(null)

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Name</th>
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Email</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {users.map((u, i, arr) => (
            <tr key={u.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <td className="px-5 py-3.5 font-medium text-white">{u.name}</td>
              <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.50)' }}>{u.email}</td>
              <td className="px-5 py-3.5 text-right">
                <button
                  onClick={() => setChangingUser(u)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.70)' }}
                >
                  Change Password
                </button>
              </td>
            </tr>
          ))}
          {!users.length && (
            <tr>
              <td colSpan={3} className="px-5 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.30)' }}>
                No CMS users yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {changingUser && (
        <ChangePasswordModal user={changingUser} onClose={() => setChangingUser(null)} />
      )}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cms-panel && npx jest UsersTable -v`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add cms-panel/app/admin/users/UsersTable.tsx cms-panel/__tests__/UsersTable.test.tsx
git commit -m "feat(cms): add UsersTable component with Change Password action"
```

---

### Task 4: Wire `UsersTable` into the admin users page

**Files:**
- Modify: `cms-panel/app/admin/users/page.tsx:17-56` (replace the inline `<table>` block with `<UsersTable users={hrUsers as HrUser[] ?? []} />`)

**Interfaces:**
- Consumes: `UsersTable` from Task 3.
- Produces: the fully wired `/admin/users` page — no further tasks depend on this one.

- [ ] **Step 1: Replace the inline table with `UsersTable`**

Replace this block in `cms-panel/app/admin/users/page.tsx` (currently lines 17-56, the `<div>` containing `<h2>Existing Users</h2>` and the `<table>`):

```typescript
        {/* Existing users table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.70)' }}>Existing Users</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {(hrUsers as HrUser[] ?? []).map((u, i, arr) => (
                <tr key={u.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <td className="px-5 py-3.5 font-medium text-white">{u.name}</td>
                  <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.50)' }}>{u.email}</td>
                </tr>
              ))}
              {!hrUsers?.length && (
                <tr>
                  <td colSpan={2} className="px-5 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.30)' }}>
                    No CMS users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
```

with:

```typescript
        {/* Existing users table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.70)' }}>Existing Users</h2>
          </div>
          <UsersTable users={hrUsers as HrUser[] ?? []} />
        </div>
```

And add the import near the top of the file (alongside the existing `AdminUsersClient` import):

```typescript
import UsersTable from './UsersTable'
```

- [ ] **Step 2: Run the full test suite**

Run: `cd cms-panel && npx jest -v`
Expected: PASS — all existing tests plus the new `ChangePasswordModal` and `UsersTable` tests are green.

- [ ] **Step 3: Typecheck and lint**

Run: `cd cms-panel && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual end-to-end verification**

With the dev server running and logged in to `/admin/users` in a real browser:
1. Click "Change Password" next to the `HR Admin` row.
2. Confirm the modal opens with the heading "Change password for HR Admin".
3. Enter a new password (≥6 characters) and click "Save".
4. Confirm the green "Password updated successfully" message appears and the modal auto-closes shortly after.
5. Log out and log back in at `/login` using the new password to confirm it actually took effect in Supabase.

Expected: all 5 steps behave as described.

- [ ] **Step 5: Commit**

```bash
git add cms-panel/app/admin/users/page.tsx
git commit -m "feat(cms): wire Change Password action into admin users page"
```
