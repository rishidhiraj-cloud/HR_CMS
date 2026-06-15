# HR Widget — Plan 1: Supabase Backend + HR CMS Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Supabase database, auth, and cron job, then build the Next.js CMS web app that HR staff use to write, schedule, and target messages to employees.

**Architecture:** Supabase provides Postgres (schema + RLS), Auth (HR login + employee invite), Storage (images), Realtime, and pg_cron (scheduled delivery). The CMS is a Next.js 14 app using App Router and server components — HR staff log in via Supabase Auth email+password, then manage messages and employees.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + Auth + Storage + pg_cron), TipTap (rich text editor), Tailwind CSS, React Testing Library + Jest, Playwright (e2e)

**Prerequisite:** Node.js 20+, a Supabase project created at supabase.com (free tier is fine). Have `SUPABASE_URL` and `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API.

---

## File Map

```
HRWidget/
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql       # tables, RLS policies
│       └── 002_cron.sql         # pg_cron scheduled delivery job
├── cms-panel/                   # Next.js 14 app
│   ├── app/
│   │   ├── layout.tsx           # root layout, font, globals
│   │   ├── login/
│   │   │   └── page.tsx         # HR login form
│   │   ├── dashboard/
│   │   │   └── page.tsx         # message list (server component)
│   │   ├── messages/
│   │   │   ├── new/page.tsx     # compose new message
│   │   │   └── [id]/page.tsx    # edit existing message
│   │   └── employees/
│   │       └── page.tsx         # employee list + add/edit
│   ├── components/
│   │   ├── MessageForm.tsx      # TipTap editor, targeting, scheduling
│   │   ├── MessageTable.tsx     # dashboard rows with status badges
│   │   └── EmployeeForm.tsx     # add/edit employee + invite
│   ├── lib/
│   │   ├── supabase-server.ts   # createServerClient (cookies)
│   │   ├── supabase-browser.ts  # createBrowserClient (singleton)
│   │   └── types.ts             # shared TypeScript types
│   ├── middleware.ts             # protect /dashboard, /messages, /employees
│   ├── __tests__/
│   │   ├── MessageForm.test.tsx
│   │   ├── MessageTable.test.tsx
│   │   └── EmployeeForm.test.tsx
│   ├── e2e/
│   │   ├── auth.spec.ts         # login flow
│   │   ├── messages.spec.ts     # create/schedule/target message
│   │   └── employees.spec.ts    # add employee + invite
│   ├── jest.config.ts
│   ├── jest.setup.ts
│   ├── playwright.config.ts
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── package.json
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
```

---

## Task 1: Git init + project skeleton

**Files:**
- Create: `HRWidget/.gitignore`
- Create: `HRWidget/README.md`

- [ ] **Step 1: Init git repo**

```bash
cd /Users/dhiraj/Documents/HRWidget
git init
```

Expected: `Initialized empty Git repository in .../HRWidget/.git/`

- [ ] **Step 2: Create .gitignore**

Create `/Users/dhiraj/Documents/HRWidget/.gitignore`:

```
node_modules/
.env
.env.local
.next/
dist/
out/
.DS_Store
*.log
supabase/.temp/
```

- [ ] **Step 3: First commit**

```bash
git add .gitignore
git commit -m "chore: init repo"
```

---

## Task 2: Supabase schema migration

**Files:**
- Create: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Create migrations directory**

```bash
mkdir -p /Users/dhiraj/Documents/HRWidget/supabase/migrations
```

- [ ] **Step 2: Write schema migration**

Create `supabase/migrations/001_schema.sql`:

```sql
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
```

- [ ] **Step 3: Apply migration in Supabase dashboard**

Go to your Supabase project → SQL Editor → paste the contents of `001_schema.sql` → click Run.

Verify: Table Editor should now show `hr_users`, `employees`, `messages`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat: add supabase schema with RLS"
```

---

## Task 3: Supabase pg_cron for scheduled delivery

**Files:**
- Create: `supabase/migrations/002_cron.sql`

- [ ] **Step 1: Enable pg_cron extension**

In Supabase SQL Editor, run:

```sql
create extension if not exists pg_cron;
```

- [ ] **Step 2: Write cron migration**

Create `supabase/migrations/002_cron.sql`:

```sql
-- Runs every minute; publishes messages whose scheduled time has passed
select cron.schedule(
  'publish-scheduled-messages',
  '* * * * *',
  $$
    update messages
    set published_at = now()
    where scheduled_at <= now()
      and published_at is null;
  $$
);
```

- [ ] **Step 3: Apply in Supabase SQL Editor**

Paste and run `002_cron.sql`. Verify with:

```sql
select * from cron.job;
```

Expected: one row with `jobname = 'publish-scheduled-messages'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_cron.sql
git commit -m "feat: add pg_cron job for scheduled message delivery"
```

---

## Task 4: Seed initial HR user

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create HR auth user in Supabase dashboard**

Go to Supabase → Authentication → Users → Add user. Enter:
- Email: `hr@yourcompany.com`
- Password: choose a strong password

Copy the UUID shown for this user.

- [ ] **Step 2: Write seed file**

Create `supabase/seed.sql` (replace `<HR_USER_UUID>` with the actual UUID):

```sql
insert into hr_users (id, name, email)
values ('<HR_USER_UUID>', 'HR Admin', 'hr@yourcompany.com')
on conflict do nothing;
```

- [ ] **Step 3: Run seed in SQL Editor**

Paste into Supabase SQL Editor and run. Verify with `select * from hr_users;` — should return 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore: add supabase seed for initial HR user"
```

---

## Task 5: Next.js project setup

**Files:**
- Create: `cms-panel/package.json` (via scaffold)
- Create: `cms-panel/.env.local`
- Create: `cms-panel/next.config.ts`
- Create: `cms-panel/tailwind.config.ts`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /Users/dhiraj/Documents/HRWidget
npx create-next-app@latest cms-panel \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

- [ ] **Step 2: Install dependencies**

```bash
cd cms-panel
npm install @supabase/supabase-js @supabase/ssr
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom ts-jest @types/jest
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 3: Create .env.local**

Create `cms-panel/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Replace the values from Supabase → Project Settings → API.

- [ ] **Step 4: Create Jest config**

Create `cms-panel/jest.config.ts`:

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts'],
}

export default createJestConfig(config)
```

- [ ] **Step 5: Create Jest setup**

Create `cms-panel/jest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Create Playwright config**

Create `cms-panel/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 7: Add scripts to package.json**

Edit `cms-panel/package.json` — add to `"scripts"`:

```json
"test": "jest",
"test:watch": "jest --watch",
"test:e2e": "playwright test"
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Open http://localhost:3000 — should show default Next.js page.

- [ ] **Step 9: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/
git commit -m "chore: scaffold next.js cms-panel with supabase + tiptap + jest + playwright"
```

---

## Task 6: Supabase client helpers + types

**Files:**
- Create: `cms-panel/lib/supabase-server.ts`
- Create: `cms-panel/lib/supabase-browser.ts`
- Create: `cms-panel/lib/types.ts`

- [ ] **Step 1: Write shared types**

Create `cms-panel/lib/types.ts`:

```typescript
export type TargetType = 'all' | 'dept' | 'role'

export interface Message {
  id: string
  title: string
  content_html: string
  target_type: TargetType
  target_value: string | null
  scheduled_at: string | null
  published_at: string | null
  created_by: string
  created_at: string
}

export interface Employee {
  id: string
  name: string
  email: string
  department: string
  role: string
}

export interface HrUser {
  id: string
  name: string
  email: string
}

export type MessageStatus = 'draft' | 'scheduled' | 'live' | 'archived'

export function getMessageStatus(msg: Pick<Message, 'published_at' | 'scheduled_at'>): MessageStatus {
  if (msg.published_at) {
    const published = new Date(msg.published_at)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return published < thirtyDaysAgo ? 'archived' : 'live'
  }
  if (msg.scheduled_at) return 'scheduled'
  return 'draft'
}
```

- [ ] **Step 2: Write server-side Supabase client**

Create `cms-panel/lib/supabase-server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Write browser-side Supabase client**

Create `cms-panel/lib/supabase-browser.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
```

- [ ] **Step 4: Write unit tests for getMessageStatus**

Create `cms-panel/__tests__/types.test.ts`:

```typescript
import { getMessageStatus } from '@/lib/types'

describe('getMessageStatus', () => {
  it('returns live for recently published message', () => {
    const msg = { published_at: new Date().toISOString(), scheduled_at: null }
    expect(getMessageStatus(msg)).toBe('live')
  })

  it('returns archived for message published over 30 days ago', () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const msg = { published_at: old, scheduled_at: null }
    expect(getMessageStatus(msg)).toBe('archived')
  })

  it('returns scheduled when only scheduled_at is set', () => {
    const msg = { published_at: null, scheduled_at: new Date().toISOString() }
    expect(getMessageStatus(msg)).toBe('scheduled')
  })

  it('returns draft when neither date is set', () => {
    const msg = { published_at: null, scheduled_at: null }
    expect(getMessageStatus(msg)).toBe('draft')
  })
})
```

- [ ] **Step 5: Run tests**

```bash
cd cms-panel
npm test -- --testPathPattern=types
```

Expected: 4 passing tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/lib/ cms-panel/__tests__/types.test.ts
git commit -m "feat: add supabase clients and shared types"
```

---

## Task 7: Auth — login page + middleware

**Files:**
- Create: `cms-panel/app/login/page.tsx`
- Create: `cms-panel/middleware.ts`
- Create: `cms-panel/app/layout.tsx` (replace scaffold default)

- [ ] **Step 1: Write root layout**

Replace `cms-panel/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HR Broadcast',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Write login page**

Create `cms-panel/app/login/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = getBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow w-80 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">HR Broadcast</h1>
        <p className="text-sm text-gray-500">Sign in to manage messages</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Write middleware to protect routes**

Create `cms-panel/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/messages') ||
    request.nextUrl.pathname.startsWith('/employees')

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (request.nextUrl.pathname === '/' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Manual test — login flow**

```bash
npm run dev
```

1. Open http://localhost:3000 — should redirect to `/login`
2. Enter the HR user email + password created in Task 4
3. Should redirect to `/dashboard` (404 is fine — page not built yet)
4. Visiting http://localhost:3000/dashboard without login should redirect to `/login`

- [ ] **Step 5: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/app/layout.tsx cms-panel/app/login/page.tsx cms-panel/middleware.ts
git commit -m "feat: add login page and auth middleware"
```

---

## Task 8: MessageTable component

**Files:**
- Create: `cms-panel/components/MessageTable.tsx`
- Create: `cms-panel/__tests__/MessageTable.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `cms-panel/__tests__/MessageTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import MessageTable from '@/components/MessageTable'
import type { Message } from '@/lib/types'

const base: Message = {
  id: '1',
  title: 'Test Message',
  content_html: '<p>Hello</p>',
  target_type: 'all',
  target_value: null,
  scheduled_at: null,
  published_at: new Date().toISOString(),
  created_by: 'hr-1',
  created_at: new Date().toISOString(),
}

describe('MessageTable', () => {
  it('renders message title', () => {
    render(<MessageTable messages={[base]} />)
    expect(screen.getByText('Test Message')).toBeInTheDocument()
  })

  it('shows Live badge for published message', () => {
    render(<MessageTable messages={[base]} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows Scheduled badge for scheduled message', () => {
    const msg = { ...base, published_at: null, scheduled_at: new Date().toISOString() }
    render(<MessageTable messages={[msg]} />)
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
  })

  it('shows All Employees when target_type is all', () => {
    render(<MessageTable messages={[base]} />)
    expect(screen.getByText('All Employees')).toBeInTheDocument()
  })

  it('shows department name when target_type is dept', () => {
    const msg = { ...base, target_type: 'dept' as const, target_value: 'Sales' }
    render(<MessageTable messages={[msg]} />)
    expect(screen.getByText('Sales')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -- --testPathPattern=MessageTable
```

Expected: FAIL — `Cannot find module '@/components/MessageTable'`

- [ ] **Step 3: Write MessageTable component**

Create `cms-panel/components/MessageTable.tsx`:

```tsx
import Link from 'next/link'
import type { Message, MessageStatus } from '@/lib/types'
import { getMessageStatus } from '@/lib/types'

const STATUS_STYLES: Record<MessageStatus, string> = {
  live: 'bg-green-100 text-green-700',
  scheduled: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-100 text-gray-400',
}

function TargetLabel({ type, value }: { type: string; value: string | null }) {
  if (type === 'all') return <span>All Employees</span>
  return <span>{value}</span>
}

export default function MessageTable({ messages }: { messages: Message[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Audience</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {messages.map(msg => {
            const status = getMessageStatus(msg)
            const date = msg.published_at ?? msg.scheduled_at ?? msg.created_at
            return (
              <tr key={msg.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{msg.title}</td>
                <td className="px-4 py-3 text-gray-600">
                  <TargetLabel type={msg.target_type} value={msg.target_value} />
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
                    {status === 'live' ? 'Live' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/messages/${msg.id}`} className="text-indigo-600 hover:underline text-xs">
                    Edit
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {messages.length === 0 && (
        <p className="text-center text-gray-400 py-10 text-sm">No messages yet</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
npm test -- --testPathPattern=MessageTable
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/components/MessageTable.tsx cms-panel/__tests__/MessageTable.test.tsx
git commit -m "feat: add MessageTable component with status badges"
```

---

## Task 9: Dashboard page

**Files:**
- Create: `cms-panel/app/dashboard/page.tsx`

- [ ] **Step 1: Write dashboard page**

Create `cms-panel/app/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MessageTable from '@/components/MessageTable'
import type { Message } from '@/lib/types'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const filter = searchParams.filter ?? 'all'

  let query = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })

  if (filter === 'scheduled') query = query.is('published_at', null).not('scheduled_at', 'is', null)
  if (filter === 'live') query = query.not('published_at', 'is', null)

  const { data: messages } = await query
  const tabs = ['all', 'live', 'scheduled']

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">HR Announcements</h1>
        <Link
          href="/messages/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
        >
          + New Message
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        {tabs.map(tab => (
          <Link
            key={tab}
            href={`/dashboard?filter=${tab}`}
            className={`px-3 py-1.5 rounded text-sm capitalize ${
              filter === tab
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab}
          </Link>
        ))}
        <Link
          href="/employees"
          className="ml-auto px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Employees
        </Link>
      </div>

      <MessageTable messages={(messages as Message[]) ?? []} />
    </div>
  )
}
```

- [ ] **Step 2: Manual test**

```bash
npm run dev
```

Log in at http://localhost:3000/login → should land on `/dashboard` showing an empty table and "+ New Message" button.

- [ ] **Step 3: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/app/dashboard/page.tsx
git commit -m "feat: add dashboard page with message list and filter tabs"
```

---

## Task 10: MessageForm component (TipTap + targeting + scheduling)

**Files:**
- Create: `cms-panel/components/MessageForm.tsx`
- Create: `cms-panel/__tests__/MessageForm.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `cms-panel/__tests__/MessageForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageForm from '@/components/MessageForm'

jest.mock('@/lib/supabase-browser', () => ({
  getBrowserClient: () => ({
    from: () => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
      eq: jest.fn().mockReturnThis(),
    }),
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test.png' }, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://example.com/test.png' } }),
      }),
    },
  }),
}))

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

describe('MessageForm', () => {
  it('renders title input', () => {
    render(<MessageForm />)
    expect(screen.getByPlaceholderText('Message title')).toBeInTheDocument()
  })

  it('shows department input when By Department is selected', async () => {
    render(<MessageForm />)
    await userEvent.click(screen.getByText('By Department'))
    expect(screen.getByPlaceholderText('e.g. Sales')).toBeInTheDocument()
  })

  it('shows date-time picker when Schedule is selected', async () => {
    render(<MessageForm />)
    await userEvent.click(screen.getByText('Schedule'))
    expect(screen.getByLabelText('Scheduled date and time')).toBeInTheDocument()
  })

  it('shows validation error when title is empty on submit', async () => {
    render(<MessageForm />)
    await userEvent.click(screen.getByText('Publish Now'))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -- --testPathPattern=MessageForm
```

Expected: FAIL — `Cannot find module '@/components/MessageForm'`

- [ ] **Step 3: Write MessageForm component**

Create `cms-panel/components/MessageForm.tsx`:

```tsx
'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { getBrowserClient } from '@/lib/supabase-browser'
import type { Message, TargetType } from '@/lib/types'

type DeliveryMode = 'now' | 'schedule'

interface Props {
  initial?: Partial<Message>
  messageId?: string
}

export default function MessageForm({ initial, messageId }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [targetType, setTargetType] = useState<TargetType>(initial?.target_type ?? 'all')
  const [targetValue, setTargetValue] = useState(initial?.target_value ?? '')
  const [delivery, setDelivery] = useState<DeliveryMode>('now')
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduled_at?.slice(0, 16) ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit, Image, Link],
    content: initial?.content_html ?? '',
    editorProps: {
      attributes: { class: 'min-h-[120px] p-3 focus:outline-none prose prose-sm max-w-none' },
    },
  })

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const supabase = getBrowserClient()
    const path = `messages/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('message-images').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('message-images').getPublicUrl(path)
    return data.publicUrl
  }, [])

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const url = await uploadImage(file)
    editor.chain().focus().setImage({ src: url }).run()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (targetType !== 'all' && !targetValue.trim()) { setError('Please specify a target value'); return }
    if (delivery === 'schedule' && !scheduledAt) { setError('Please pick a scheduled date and time'); return }
    setError('')
    setSaving(true)

    const supabase = getBrowserClient()
    const payload = {
      title: title.trim(),
      content_html: editor?.getHTML() ?? '',
      target_type: targetType,
      target_value: targetType === 'all' ? null : targetValue.trim(),
      scheduled_at: delivery === 'schedule' ? new Date(scheduledAt).toISOString() : null,
      published_at: delivery === 'now' ? new Date().toISOString() : null,
    }

    let dbError
    if (messageId) {
      const { error } = await supabase.from('messages').update(payload).eq('id', messageId)
      dbError = error
    } else {
      const { error } = await supabase.from('messages').insert(payload)
      dbError = error
    }

    if (dbError) { setError(dbError.message); setSaving(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Title</label>
        <input
          type="text"
          placeholder="Message title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Message Body</label>
        <div className="border rounded overflow-hidden">
          <div className="flex gap-2 px-2 py-1.5 border-b bg-gray-50 text-sm">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className="font-bold px-1">B</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className="italic px-1">I</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className="px-1">• List</button>
            <label className="cursor-pointer px-1">
              🖼
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Send To</label>
        <div className="flex gap-2 mb-2">
          {(['all', 'dept', 'role'] as TargetType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTargetType(t)}
              className={`px-3 py-1.5 rounded-full text-sm ${targetType === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t === 'all' ? 'All Employees' : t === 'dept' ? 'By Department' : 'By Role'}
            </button>
          ))}
        </div>
        {targetType === 'dept' && (
          <input
            placeholder="e.g. Sales"
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
        {targetType === 'role' && (
          <input
            placeholder="e.g. Manager"
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Delivery</label>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setDelivery('now')} className={`px-3 py-1.5 rounded-full text-sm ${delivery === 'now' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Publish Now
          </button>
          <button type="button" onClick={() => setDelivery('schedule')} className={`px-3 py-1.5 rounded-full text-sm ${delivery === 'schedule' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Schedule
          </button>
        </div>
        {delivery === 'schedule' && (
          <input
            type="datetime-local"
            aria-label="Scheduled date and time"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="bg-indigo-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : delivery === 'schedule' ? 'Schedule Message' : 'Publish Now'}
        </button>
        <button type="button" onClick={() => router.push('/dashboard')} className="px-4 py-2 rounded text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
npm test -- --testPathPattern=MessageForm
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/components/MessageForm.tsx cms-panel/__tests__/MessageForm.test.tsx
git commit -m "feat: add MessageForm with TipTap editor, targeting, and scheduling"
```

---

## Task 11: New message page + Edit message page

**Files:**
- Create: `cms-panel/app/messages/new/page.tsx`
- Create: `cms-panel/app/messages/[id]/page.tsx`

- [ ] **Step 1: Write new message page**

Create `cms-panel/app/messages/new/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MessageForm from '@/components/MessageForm'

export default async function NewMessagePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-bold text-gray-900">New Message</h1>
      </div>
      <MessageForm />
    </div>
  )
}
```

- [ ] **Step 2: Write edit message page**

Create `cms-panel/app/messages/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MessageForm from '@/components/MessageForm'
import type { Message } from '@/lib/types'

export default async function EditMessagePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: message } = await supabase
    .from('messages')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!message) notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-bold text-gray-900">Edit Message</h1>
      </div>
      <MessageForm initial={message as Message} messageId={params.id} />
    </div>
  )
}
```

- [ ] **Step 3: Manual test — create a message**

```bash
npm run dev
```

1. Log in → Dashboard → click "+ New Message"
2. Enter a title, write some body text, set target to "All Employees", click "Publish Now"
3. Should redirect to Dashboard and show the new message with a "Live" badge

- [ ] **Step 4: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/app/messages/
git commit -m "feat: add new and edit message pages"
```

---

## Task 12: EmployeeForm component + Employees page

**Files:**
- Create: `cms-panel/components/EmployeeForm.tsx`
- Create: `cms-panel/__tests__/EmployeeForm.test.tsx`
- Create: `cms-panel/app/employees/page.tsx`
- Create: `cms-panel/app/api/employees/invite/route.ts`

- [ ] **Step 1: Write failing tests**

Create `cms-panel/__tests__/EmployeeForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmployeeForm from '@/components/EmployeeForm'

describe('EmployeeForm', () => {
  it('renders all fields', () => {
    render(<EmployeeForm onSuccess={jest.fn()} />)
    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('work@company.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Sales')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Manager')).toBeInTheDocument()
  })

  it('shows error if name is empty on submit', async () => {
    render(<EmployeeForm onSuccess={jest.fn()} />)
    await userEvent.click(screen.getByText('Send Invite'))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -- --testPathPattern=EmployeeForm
```

Expected: FAIL

- [ ] **Step 3: Create invite API route (uses service role key to bypass RLS)**

Create `cms-panel/app/api/employees/invite/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { name, email, department, role } = await req.json()
  if (!name || !email || !department || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Invite user via Supabase Auth (sends email)
  const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email)
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })

  // Insert into employees table
  const { error: dbError } = await supabase.from('employees').insert({
    id: authData.user.id,
    name,
    email,
    department,
    role,
  })
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Write EmployeeForm component**

Create `cms-panel/components/EmployeeForm.tsx`:

```tsx
'use client'
import { useState } from 'react'

interface Props {
  onSuccess: () => void
}

export default function EmployeeForm({ onSuccess }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (!department.trim()) { setError('Department is required'); return }
    if (!role.trim()) { setError('Role is required'); return }
    setError('')
    setSaving(true)

    const res = await fetch('/api/employees/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), department: department.trim(), role: role.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <input type="email" placeholder="work@company.com" value={email} onChange={e => setEmail(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <input placeholder="e.g. Sales" value={department} onChange={e => setDepartment(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <input placeholder="e.g. Manager" value={role} onChange={e => setRole(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <button type="submit" disabled={saving}
        className="w-full bg-indigo-600 text-white py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {saving ? 'Sending invite…' : 'Send Invite'}
      </button>
    </form>
  )
}
```

- [ ] **Step 5: Write employees page**

Create `cms-panel/app/employees/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { Employee } from '@/lib/types'
import EmployeesClient from './client'

export default async function EmployeesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employees } = await supabase.from('employees').select('*').order('name')

  return <EmployeesClient employees={(employees as Employee[]) ?? []} />
}
```

Create `cms-panel/app/employees/client.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EmployeeForm from '@/components/EmployeeForm'
import type { Employee } from '@/lib/types'

export default function EmployeesClient({ employees }: { employees: Employee[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-lg font-bold text-gray-900">Employees</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
        >
          + Add Employee
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">New Employee</h2>
          <EmployeeForm onSuccess={() => { setShowForm(false); router.refresh() }} />
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                <td className="px-4 py-3 text-gray-600">{emp.email}</td>
                <td className="px-4 py-3 text-gray-600">{emp.department}</td>
                <td className="px-4 py-3 text-gray-600">{emp.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.length === 0 && (
          <p className="text-center text-gray-400 py-10 text-sm">No employees yet — add one above</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --testPathPattern=EmployeeForm
```

Expected: 2 passing.

- [ ] **Step 7: Create Supabase Storage bucket for images**

In Supabase dashboard → Storage → New bucket → name: `message-images` → Public: ON → Create.

- [ ] **Step 8: Manual test — add an employee**

1. Go to http://localhost:3000/employees
2. Click "+ Add Employee", fill in name/email/department/role → "Send Invite"
3. Employee should receive an invite email from Supabase
4. Verify the employee row appears in the table

- [ ] **Step 9: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add cms-panel/components/EmployeeForm.tsx cms-panel/__tests__/EmployeeForm.test.tsx
git add cms-panel/app/employees/ cms-panel/app/api/
git commit -m "feat: add employee management page with invite flow"
```

---

## Task 13: Run full test suite + deploy CMS panel

**Files:** none new

- [ ] **Step 1: Run all unit tests**

```bash
cd cms-panel
npm test
```

Expected: all tests pass (types, MessageTable, MessageForm, EmployeeForm).

- [ ] **Step 2: Deploy to Vercel**

```bash
npx vercel --cwd /Users/dhiraj/Documents/HRWidget/cms-panel
```

Follow the prompts. When asked for environment variables, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 3: Update Supabase Auth settings**

In Supabase → Authentication → URL Configuration:
- Site URL: `https://your-vercel-url.vercel.app`
- Redirect URLs: add `https://your-vercel-url.vercel.app/**`

- [ ] **Step 4: Smoke test on production**

1. Open the Vercel URL → login with HR credentials
2. Create a message targeted to "All Employees" → Publish Now
3. Create a scheduled message for 2 minutes from now → verify it appears as "Scheduled"
4. Wait 2 minutes → verify it flips to "Live" (pg_cron fired)
5. Add a test employee → verify invite email arrives

- [ ] **Step 5: Final commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add -A
git commit -m "feat: cms-panel complete — messages, employees, supabase integration"
```

---

## What's Next

Plan 1 is complete. The Supabase backend is live and the HR CMS panel is deployed. HR can now:
- Write rich messages with images
- Target by department or role
- Publish immediately or schedule for later
- Add employees and send invite emails

**Plan 2** covers the Electron desktop widget that employees install — it connects to the same Supabase project, logs in with the employee's credentials, and shows the startup popup + tray icon.
