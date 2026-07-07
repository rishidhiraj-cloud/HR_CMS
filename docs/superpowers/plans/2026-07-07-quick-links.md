# Quick Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a company-scoped "Quick Links" module (CMS CRUD + widget tab) for portals and mobile apps, and restructure the widget's Policies tab to absorb Ask AI as a section.

**Architecture:** A new `quick_links` table (mandatory company, no level dimension) gets a full CRUD CMS page mirroring the Documents page's conventions, plus a company-scoped `/api/quick-links/active` route mirroring `/api/documents`'s auth pattern. The widget adds a new top-level tab that fetches from that route via a new IPC channel, and the existing Ask AI tab is folded into the Policies tab as a continuous-scroll section (Ask AI first, then the document list).

**Tech Stack:** Next.js App Router (cms-panel), Supabase Postgres + RLS, Electron main/renderer/preload (widget), TypeScript.

## Global Constraints

- Company is **mandatory** on every Quick Link — no "All Companies" option, matching Documents' precedent, not Messages/Polls' targeting-mode pattern.
- Quick Links has **no Level dimension** — company is the only scoping filter.
- For `type = 'mobile_app'`, the plain `url` field is **not used at all** — Android App URL and iOS App URL replace it entirely, not add to it. **At least one** of the two is required.
- The widget's Policies tab becomes **one continuous scroll**: Ask AI section first, then the document list below it — no sub-switcher, no fixed-height split.
- The Quick Links card design follows the approved mockup: bold Portal Name + Type badge, normal-weight Purpose below, an "i" icon that opens a popover (Purpose + How to Use) directly beneath it, and on the right an "Open ↗" button (Website) or "Copy Android link" / "Copy iOS link" buttons (Mobile App, shown only for whichever URL is actually set).
- No automated test convention exists for any of the files this plan touches — verified via typecheck + manual testing, matching every prior sub-project this session.

---

### Task 1: Database migration — `quick_links` table + RLS

**Files:**
- Create: `supabase/migrations/019_quick_links.sql`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `quick_links` table and its RLS policies. Tasks 2-7 depend on this shape being applied to the live DB (via the human) before they work end-to-end — not a compile-time dependency for any of them.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/019_quick_links.sql

CREATE TABLE quick_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  portal_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  how_to_use TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('website', 'mobile_app')),
  url TEXT,
  android_app_url TEXT,
  ios_app_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quick_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_quick_links" ON quick_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));

CREATE POLICY "employees_read_own_company_quick_links" ON quick_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid())
    AND company = (SELECT company FROM employees WHERE id = auth.uid())
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/019_quick_links.sql
git commit -m "feat: add quick_links table with company-scoped RLS"
```

---

### Task 2: CMS API routes — CRUD + widget-facing active route

**Files:**
- Create: `cms-panel/app/api/quick-links/validate.ts`
- Create: `cms-panel/app/api/quick-links/route.ts`
- Create: `cms-panel/app/api/quick-links/[id]/route.ts`
- Create: `cms-panel/app/api/quick-links/active/route.ts`

**Interfaces:**
- Consumes: nothing from other tasks at compile time.
- Produces: `QuickLinkBody` type, `validateQuickLink()`, `buildQuickLinkRow()` (used by Task 3's edit modal and Task 4's create form only as the HTTP contract, not imported directly — those are client components hitting these routes over `fetch`). `GET /api/quick-links`, `POST /api/quick-links`, `PATCH/DELETE /api/quick-links/[id]`, `GET /api/quick-links/active` are the produced endpoints Task 3, 4, and 5 rely on.

- [ ] **Step 1: Write the shared validation module**

```typescript
// cms-panel/app/api/quick-links/validate.ts

export interface QuickLinkBody {
  company: string
  portal_name: string
  purpose: string
  how_to_use: string
  type: 'website' | 'mobile_app'
  url?: string | null
  android_app_url?: string | null
  ios_app_url?: string | null
}

export function validateQuickLink(body: Partial<QuickLinkBody>): string | null {
  if (!body.company?.trim()) return 'Company is required'
  if (!body.portal_name?.trim()) return 'Portal name is required'
  if (!body.purpose?.trim()) return 'Purpose is required'
  if (!body.how_to_use?.trim()) return 'How to Use is required'
  if (body.type !== 'website' && body.type !== 'mobile_app') return 'Type must be Website or Mobile App'
  if (body.type === 'website' && !body.url?.trim()) return 'URL is required for Website links'
  if (body.type === 'mobile_app' && !body.android_app_url?.trim() && !body.ios_app_url?.trim()) {
    return 'At least one of Android App URL or iOS App URL is required for Mobile App links'
  }
  return null
}

export function buildQuickLinkRow(body: QuickLinkBody) {
  return {
    company: body.company.trim(),
    portal_name: body.portal_name.trim(),
    purpose: body.purpose.trim(),
    how_to_use: body.how_to_use.trim(),
    type: body.type,
    url: body.type === 'website' ? body.url!.trim() : null,
    android_app_url: body.type === 'mobile_app' ? (body.android_app_url?.trim() || null) : null,
    ios_app_url: body.type === 'mobile_app' ? (body.ios_app_url?.trim() || null) : null,
  }
}
```

- [ ] **Step 2: Write the list/create route**

```typescript
// cms-panel/app/api/quick-links/route.ts

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { validateQuickLink, buildQuickLinkRow, QuickLinkBody } from './validate'

function svc() {
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

// GET /api/quick-links — list all (HR only)
export async function GET() {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await svc().from('quick_links').select('*').order('portal_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/quick-links — create (HR only)
export async function POST(req: NextRequest) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Partial<QuickLinkBody>
  const validationError = validateQuickLink(body)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const row = buildQuickLinkRow(body as QuickLinkBody)
  const { data, error } = await svc().from('quick_links').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Write the update/delete route**

```typescript
// cms-panel/app/api/quick-links/[id]/route.ts

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { validateQuickLink, buildQuickLinkRow, QuickLinkBody } from '../validate'

function svc() {
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

// PATCH /api/quick-links/[id] — update (HR only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as Partial<QuickLinkBody>
  const validationError = validateQuickLink(body)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const update = buildQuickLinkRow(body as QuickLinkBody)
  const { error } = await svc().from('quick_links').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/quick-links/[id] — remove (HR only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await svc().from('quick_links').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Write the widget-facing company-scoped route**

```typescript
// cms-panel/app/api/quick-links/active/route.ts

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/quick-links/active — called by widget with Bearer token or X-Employee-Id header
export async function GET(req: NextRequest) {
  const admin = svc()
  let employeeCompany: string | null = null

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('company').eq('id', user.id).single()
    employeeCompany = emp?.company ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id, company').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeCompany = emp.company ?? null
  }

  // Company is mandatory on every quick link — if we don't know the caller's
  // company, there is no sensible "unrestricted" bucket to fall back to, so
  // return nothing rather than guessing.
  if (!employeeCompany) return NextResponse.json([])

  const { data, error } = await admin
    .from('quick_links')
    .select('id, company, portal_name, purpose, how_to_use, type, url, android_app_url, ios_app_url')
    .eq('company', employeeCompany)
    .order('portal_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 5: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add cms-panel/app/api/quick-links
git commit -m "feat(cms): add Quick Links CRUD and company-scoped active routes"
```

---

### Task 3: CMS — nav item + list page

**Files:**
- Modify: `cms-panel/components/AppLayout.tsx`
- Create: `cms-panel/app/quick-links/page.tsx`
- Create: `cms-panel/app/quick-links/QuickLinksClient.tsx`

**Interfaces:**
- Consumes: `GET /api/quick-links` (list), `PATCH /api/quick-links/[id]` (edit), `DELETE /api/quick-links/[id]` (delete) from Task 2.
- Produces: nothing further downstream — Task 4 (create page) links here but doesn't depend on this task's internals.

- [ ] **Step 1: Add the "Quick Links" nav item**

In `cms-panel/components/AppLayout.tsx`, replace:

```typescript
  {
    label: 'Analytics',
    href: '/analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
```

with:

```typescript
  {
    label: 'Analytics',
    href: '/analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Quick Links',
    href: '/quick-links',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
      </svg>
    ),
  },
```

- [ ] **Step 2: Write the server component page**

```typescript
// cms-panel/app/quick-links/page.tsx

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'
import QuickLinksClient from './QuickLinksClient'

export default async function QuickLinksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: hrUser }, { data: quickLinks }, { data: companies }] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    supabase.from('quick_links').select('*').order('portal_name', { ascending: true }),
    supabase.from('companies').select('id, name').order('name'),
  ])

  if (!hrUser) redirect('/login')

  return (
    <AppLayout title="Quick Links" userName={hrUser.name}>
      <QuickLinksClient
        initialQuickLinks={quickLinks ?? []}
        companies={companies ?? []}
      />
    </AppLayout>
  )
}
```

- [ ] **Step 3: Write the client component**

```typescript
// cms-panel/app/quick-links/QuickLinksClient.tsx

'use client'

import { useState } from 'react'
import Link from 'next/link'

type LinkType = 'website' | 'mobile_app'

interface QuickLink {
  id: string
  company: string
  portal_name: string
  purpose: string
  how_to_use: string
  type: LinkType
  url: string | null
  android_app_url: string | null
  ios_app_url: string | null
}

interface Company {
  id: string
  name: string
}

interface Props {
  initialQuickLinks: QuickLink[]
  companies: Company[]
}

const glass = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.09)',
} as React.CSSProperties

const inputStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: 'white',
  outline: 'none',
  borderRadius: '0.75rem',
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  width: '100%',
} as React.CSSProperties

export default function QuickLinksClient({ initialQuickLinks, companies }: Props) {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(initialQuickLinks)

  // Filters
  const [searchName, setSearchName] = useState('')
  const [searchCompany, setSearchCompany] = useState('')
  const [searchType, setSearchType] = useState('')

  // Edit state
  const [editLink, setEditLink] = useState<QuickLink | null>(null)
  const [editCompany, setEditCompany] = useState('')
  const [editPortalName, setEditPortalName] = useState('')
  const [editPurpose, setEditPurpose] = useState('')
  const [editType, setEditType] = useState<LinkType>('website')
  const [editUrl, setEditUrl] = useState('')
  const [editAndroidAppUrl, setEditAndroidAppUrl] = useState('')
  const [editIosAppUrl, setEditIosAppUrl] = useState('')
  const [editHowToUse, setEditHowToUse] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete state
  const [deleteLink, setDeleteLink] = useState<QuickLink | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = quickLinks.filter(link => {
    const nameMatch = !searchName.trim() || link.portal_name.toLowerCase().includes(searchName.toLowerCase())
    const companyMatch = !searchCompany || link.company === searchCompany
    const typeMatch = !searchType || link.type === searchType
    return nameMatch && companyMatch && typeMatch
  })

  const editCanSave = Boolean(
    editCompany && editPortalName.trim() && editPurpose.trim() && editHowToUse.trim() &&
    (editType === 'website' ? editUrl.trim() : (editAndroidAppUrl.trim() || editIosAppUrl.trim()))
  )

  function openEdit(link: QuickLink) {
    setEditLink(link)
    setEditCompany(link.company)
    setEditPortalName(link.portal_name)
    setEditPurpose(link.purpose)
    setEditType(link.type)
    setEditUrl(link.url ?? '')
    setEditAndroidAppUrl(link.android_app_url ?? '')
    setEditIosAppUrl(link.ios_app_url ?? '')
    setEditHowToUse(link.how_to_use)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!editLink || !editCanSave) return
    setEditSaving(true)
    setEditError('')
    try {
      const body = {
        company: editCompany,
        portal_name: editPortalName.trim(),
        purpose: editPurpose.trim(),
        how_to_use: editHowToUse.trim(),
        type: editType,
        url: editType === 'website' ? editUrl.trim() : null,
        android_app_url: editType === 'mobile_app' ? editAndroidAppUrl.trim() : null,
        ios_app_url: editType === 'mobile_app' ? editIosAppUrl.trim() : null,
      }
      const res = await fetch(`/api/quick-links/${editLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Save failed')
      }
      setQuickLinks(prev => prev.map(l => l.id === editLink.id ? { ...l, ...body } : l))
      setEditLink(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteLink) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/quick-links/${deleteLink.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setQuickLinks(prev => prev.filter(l => l.id !== deleteLink.id))
      setDeleteLink(null)
    } catch {
      // keep modal open on error — user can retry
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Info box */}
      <div
        className="rounded-xl p-4 mb-5 text-sm"
        style={{ background: 'rgba(13,148,136,0.10)', border: '1px solid rgba(13,148,136,0.25)', color: '#99f6e4' }}
      >
        <strong className="text-teal-300">How it works:</strong> Add portals and mobile apps for employees to find in the widget. Every link is scoped to one company — only employees of that company will see it.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by portal name…"
          value={searchName}
          onChange={e => setSearchName(e.target.value)}
          style={{ ...inputStyle, maxWidth: 280 }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        />
        <select
          value={searchCompany}
          onChange={e => setSearchCompany(e.target.value)}
          style={{ ...inputStyle, maxWidth: 200, cursor: 'pointer' }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        >
          <option value="">All Companies</option>
          {companies.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={searchType}
          onChange={e => setSearchType(e.target.value)}
          style={{ ...inputStyle, maxWidth: 160, cursor: 'pointer' }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        >
          <option value="">All Types</option>
          <option value="website">Website</option>
          <option value="mobile_app">Mobile App</option>
        </select>
        {(searchName || searchCompany || searchType) && (
          <button
            onClick={() => { setSearchName(''); setSearchCompany(''); setSearchType('') }}
            className="text-xs px-3 py-1 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            Clear
          </button>
        )}
        <div className="ml-auto">
          <Link
            href="/quick-links/new"
            className="text-white text-sm font-medium px-4 py-2 rounded-xl transition-all inline-block"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)', boxShadow: '0 4px 14px rgba(13,148,136,0.30)' }}
          >
            + New Quick Link
          </Link>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.30)' }}>
          <p className="text-5xl mb-4">🔗</p>
          <p className="font-medium text-white/60 text-base">
            {quickLinks.length === 0 ? 'No quick links yet' : 'No quick links match your filters'}
          </p>
          {quickLinks.length === 0 && <p className="text-sm mt-2">Add your first quick link to get started</p>}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={glass}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                {['Portal Name', 'Company', 'Type', 'Purpose', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((link, i) => (
                <tr key={link.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate">{link.portal_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(8,145,178,0.20)', color: '#67e8f9', border: '1px solid rgba(8,145,178,0.35)' }}
                    >
                      {link.company}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)' }}
                    >
                      {link.type === 'website' ? 'Website' : 'Mobile App'}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[280px] truncate" style={{ color: 'rgba(255,255,255,0.60)' }}>{link.purpose}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(link)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.30)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteLink(link)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditLink(null) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <h2 className="text-base font-semibold text-white">Edit Quick Link</h2>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Company</label>
              <select
                value={editCompany}
                onChange={e => setEditCompany(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                {companies.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Portal Name</label>
              <input
                type="text"
                value={editPortalName}
                onChange={e => setEditPortalName(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Purpose</label>
              <textarea
                value={editPurpose}
                onChange={e => setEditPurpose(e.target.value)}
                rows={2}
                className="resize-none"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Type</label>
              <select
                value={editType}
                onChange={e => setEditType(e.target.value as LinkType)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="website">Website</option>
                <option value="mobile_app">Mobile App</option>
              </select>
            </div>

            {editType === 'website' && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>URL</label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  style={inputStyle}
                  onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                />
              </div>
            )}

            {editType === 'mobile_app' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Android App URL</label>
                  <input
                    type="text"
                    value={editAndroidAppUrl}
                    onChange={e => setEditAndroidAppUrl(e.target.value)}
                    style={inputStyle}
                    onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                    onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>iOS App URL</label>
                  <input
                    type="text"
                    value={editIosAppUrl}
                    onChange={e => setEditIosAppUrl(e.target.value)}
                    style={inputStyle}
                    onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                    onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>How to Use</label>
              <textarea
                value={editHowToUse}
                onChange={e => setEditHowToUse(e.target.value)}
                rows={3}
                className="resize-none"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            {editError && (
              <p className="text-sm rounded-xl px-4 py-2" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}>
                {editError}
              </p>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setEditLink(null)}
                className="px-4 py-2 text-sm rounded-xl"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editCanSave || editSaving}
                className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all"
                style={{
                  background: (!editCanSave || editSaving) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                  cursor: (!editCanSave || editSaving) ? 'not-allowed' : 'pointer',
                }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) setDeleteLink(null) }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <div className="text-center">
              <p className="text-3xl mb-3">🗑️</p>
              <h2 className="text-base font-semibold text-white mb-1">Delete Quick Link?</h2>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.50)' }}>
                <span className="text-white font-medium">&quot;{deleteLink.portal_name}&quot;</span> will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-1">
              <button
                onClick={() => setDeleteLink(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-xl"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white rounded-xl"
                style={{ background: deleting ? 'rgba(239,68,68,0.40)' : 'rgba(239,68,68,0.80)', cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add cms-panel/components/AppLayout.tsx cms-panel/app/quick-links/page.tsx cms-panel/app/quick-links/QuickLinksClient.tsx
git commit -m "feat(cms): add Quick Links nav item and list page"
```

---

### Task 4: CMS — create page

**Files:**
- Create: `cms-panel/app/quick-links/new/page.tsx`

**Interfaces:**
- Consumes: `POST /api/quick-links` from Task 2.
- Produces: nothing further downstream.

- [ ] **Step 1: Write the create form page**

```typescript
// cms-panel/app/quick-links/new/page.tsx

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase-browser'
import AppLayout from '@/components/AppLayout'

type LinkType = 'website' | 'mobile_app'

interface Company {
  id: string
  name: string
}

export default function NewQuickLinkPage() {
  const router = useRouter()
  const [company, setCompany] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [portalName, setPortalName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [type, setType] = useState<LinkType>('website')
  const [url, setUrl] = useState('')
  const [androidAppUrl, setAndroidAppUrl] = useState('')
  const [iosAppUrl, setIosAppUrl] = useState('')
  const [howToUse, setHowToUse] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getBrowserClient()
      .from('companies')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Company[] | null }) => { if (data) setCompanies(data) })
  }, [])

  const canSubmit = Boolean(
    company && portalName.trim() && purpose.trim() && howToUse.trim() &&
    (type === 'website' ? url.trim() : (androidAppUrl.trim() || iosAppUrl.trim()))
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/quick-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          portal_name: portalName.trim(),
          purpose: purpose.trim(),
          how_to_use: howToUse.trim(),
          type,
          url: type === 'website' ? url.trim() : null,
          android_app_url: type === 'mobile_app' ? androidAppUrl.trim() : null,
          ios_app_url: type === 'mobile_app' ? iosAppUrl.trim() : null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Save failed')
      router.push('/quick-links')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
  }

  const glassCard = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
  }

  return (
    <AppLayout title="New Quick Link">
      <div className="max-w-xl">
        <Link
          href="/quick-links"
          className="text-sm mb-6 flex items-center gap-1 transition-colors"
          style={{ color: '#5eead4' }}
        >
          ← Back to Quick Links
        </Link>

        <form onSubmit={handleSubmit} className="rounded-2xl p-6 space-y-5" style={glassCard}>
          {/* Company */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Company *</label>
            <select
              value={company}
              onChange={e => setCompany(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all appearance-none cursor-pointer"
              style={{ ...inputStyle, backgroundImage: 'none' }}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            >
              <option value="" disabled>Select a company…</option>
              {companies.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Only employees of this company will see this link.
            </p>
          </div>

          {/* Portal Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Portal Name *</label>
            <input
              type="text"
              value={portalName}
              onChange={e => setPortalName(e.target.value)}
              placeholder="e.g. Employee Self-Service"
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Purpose *</label>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Apply for leave & view payslips"
              required
              rows={2}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all resize-none"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Shown to employees under the &quot;i&quot; info icon.</p>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Type *</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as LinkType)}
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all appearance-none cursor-pointer"
              style={{ ...inputStyle, backgroundImage: 'none' }}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            >
              <option value="website">Website</option>
              <option value="mobile_app">Mobile App</option>
            </select>
          </div>

          {/* URL (Website only) */}
          {type === 'website' && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>URL *</label>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://…"
                required
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>
          )}

          {/* Android/iOS App URL (Mobile App only) */}
          {type === 'mobile_app' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Android App URL</label>
                <input
                  type="text"
                  value={androidAppUrl}
                  onChange={e => setAndroidAppUrl(e.target.value)}
                  placeholder="https://play.google.com/…"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
                  style={inputStyle}
                  onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>iOS App URL</label>
                <input
                  type="text"
                  value={iosAppUrl}
                  onChange={e => setIosAppUrl(e.target.value)}
                  placeholder="https://apps.apple.com/…"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
                  style={inputStyle}
                  onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                />
              </div>
              <p className="text-xs -mt-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
                At least one of Android or iOS App URL is required.
              </p>
            </>
          )}

          {/* How to Use */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>How to Use *</label>
            <textarea
              value={howToUse}
              onChange={e => setHowToUse(e.target.value)}
              placeholder="e.g. Log in with your employee ID, no separate password needed."
              required
              rows={3}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all resize-none"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
            style={{
              background: (!canSubmit || saving) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
              boxShadow: (!canSubmit || saving) ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
              cursor: (!canSubmit || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
            ) : 'Create Quick Link'}
          </button>
        </form>
      </div>
    </AppLayout>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add cms-panel/app/quick-links/new/page.tsx
git commit -m "feat(cms): add Quick Link creation form"
```

---

### Task 5: Widget — types, IPC handlers, preload bridge

**Files:**
- Modify: `widget/src/shared/types.ts`
- Modify: `widget/src/main/index.ts`
- Modify: `widget/src/preload/index.ts`
- Modify: `widget/src/renderer/global.d.ts`

**Interfaces:**
- Consumes: `GET /api/quick-links/active` from Task 2 (not a compile-time dependency).
- Produces: `QuickLink` type, `window.hrWidget.getQuickLinks()`, `window.hrWidget.openQuickLinkUrl(url)`, `window.hrWidget.copyToClipboard(text)` — all three are consumed by Task 7.

- [ ] **Step 1: Add the `QuickLink` type**

In `widget/src/shared/types.ts`, replace:

```typescript
export interface Poll {
```

with:

```typescript
export interface QuickLink {
  id: string
  company: string
  portal_name: string
  purpose: string
  how_to_use: string
  type: 'website' | 'mobile_app'
  url: string | null
  android_app_url: string | null
  ios_app_url: string | null
}

export interface Poll {
```

- [ ] **Step 2: Add the `clipboard` import**

In `widget/src/main/index.ts`, replace:

```typescript
import { app, ipcMain, shell, BrowserWindow, screen, net } from 'electron'
```

with:

```typescript
import { app, ipcMain, shell, BrowserWindow, screen, net, clipboard } from 'electron'
```

- [ ] **Step 3: Add the three new IPC handlers**

In `widget/src/main/index.ts`, replace:

```typescript
ipcMain.handle('documents:logAccess', async (_event, documentId: string) => {
  if (!currentEmployee) return
  await supabase.from('document_access_logs').insert({
    document_id: documentId,
    employee_id: currentEmployee.id,
  })
})
```

with:

```typescript
ipcMain.handle('documents:logAccess', async (_event, documentId: string) => {
  if (!currentEmployee) return
  await supabase.from('document_access_logs').insert({
    document_id: documentId,
    employee_id: currentEmployee.id,
  })
})

ipcMain.handle('quickLinks:getAll', async () => {
  if (!currentEmployee) return []
  try {
    const res = await fetch(`${CMS_BASE_URL}/api/quick-links/active`, {
      headers: await widgetAuthHeaders(),
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
})

ipcMain.handle('quickLinks:openUrl', async (_event, url: string) => {
  if (url) await shell.openExternal(url)
})

ipcMain.handle('quickLinks:copyToClipboard', async (_event, text: string) => {
  if (text) clipboard.writeText(text)
})
```

Note: `quickLinks:openUrl` is a deliberate duplicate of the existing `documents:openUrl` handler (also just `shell.openExternal(url)`) rather than a shared/renamed handler — this matches the codebase's existing convention of one small handler per feature domain (e.g. `app:openReleasePage` also calls `shell.openExternal` independently rather than reusing `documents:openUrl`), and avoids touching `documents:openUrl`'s existing call site.

- [ ] **Step 4: Add the preload bridge methods**

In `widget/src/preload/index.ts`, replace:

```typescript
  askHr: (question: string) => ipcRenderer.invoke('hr:ask', question),
  getDocuments: () => ipcRenderer.invoke('documents:getAll'),
  openDocumentUrl: (url: string) => ipcRenderer.invoke('documents:openUrl', url),
  logDocumentAccess: (documentId: string) => ipcRenderer.invoke('documents:logAccess', documentId),
```

with:

```typescript
  askHr: (question: string) => ipcRenderer.invoke('hr:ask', question),
  getDocuments: () => ipcRenderer.invoke('documents:getAll'),
  openDocumentUrl: (url: string) => ipcRenderer.invoke('documents:openUrl', url),
  logDocumentAccess: (documentId: string) => ipcRenderer.invoke('documents:logAccess', documentId),
  getQuickLinks: () => ipcRenderer.invoke('quickLinks:getAll'),
  openQuickLinkUrl: (url: string) => ipcRenderer.invoke('quickLinks:openUrl', url),
  copyToClipboard: (text: string) => ipcRenderer.invoke('quickLinks:copyToClipboard', text),
```

- [ ] **Step 5: Add the TypeScript declarations**

In `widget/src/renderer/global.d.ts`, replace:

```typescript
import type { Message, Employee, HrDocument, Poll } from '../shared/types'
```

with:

```typescript
import type { Message, Employee, HrDocument, Poll, QuickLink } from '../shared/types'
```

Then replace:

```typescript
  getDocuments(): Promise<HrDocument[]>
  openDocumentUrl(url: string): Promise<void>
  logDocumentAccess(documentId: string): Promise<void>
```

with:

```typescript
  getDocuments(): Promise<HrDocument[]>
  openDocumentUrl(url: string): Promise<void>
  logDocumentAccess(documentId: string): Promise<void>
  getQuickLinks(): Promise<QuickLink[]>
  openQuickLinkUrl(url: string): Promise<void>
  copyToClipboard(text: string): Promise<void>
```

- [ ] **Step 6: Typecheck**

Run: `cd widget && npx tsc --noEmit`
Expected: no errors. (This covers `main/index.ts`, `preload/index.ts`, and `global.d.ts`/`shared/types.ts` against their respective tsconfigs — if the project uses separate configs for main vs. renderer, run both: `npx tsc -p tsconfig.main.json --noEmit` in addition to the default.)

- [ ] **Step 7: Commit**

```bash
git add widget/src/shared/types.ts widget/src/main/index.ts widget/src/preload/index.ts widget/src/renderer/global.d.ts
git commit -m "feat(widget): add Quick Links type, IPC handlers, and preload bridge"
```

---

### Task 6: Widget — merge Ask AI into the Policies tab

**Files:**
- Modify: `widget/src/renderer/feed/Feed.tsx`

**Interfaces:**
- Consumes: nothing from other tasks at compile time.
- Produces: the `ActiveTab` type narrows to `'announcements' | 'documents' | 'polls'` (temporarily — Task 7 widens it back to include `'quick-links'`). Task 7 depends on this task's merged Policies content being in place first.

- [ ] **Step 1: Remove `ai-search` from the `ActiveTab` type**

Replace:

```typescript
type ActiveTab = 'announcements' | 'documents' | 'polls' | 'ai-search'
```

with:

```typescript
type ActiveTab = 'announcements' | 'documents' | 'polls'
```

- [ ] **Step 2: Remove the "ASK AI" entry from the tab bar**

Replace:

```typescript
        {([
          { id: 'announcements', label: 'MESSAGES',  badge: unseenIds.size },
          { id: 'documents',     label: 'POLICIES',  badge: 0 },
          { id: 'polls',         label: 'POLLS',     badge: newPollAlert ? 1 : 0 },
          { id: 'ai-search',     label: 'ASK AI',    badge: 0 },
        ] as { id: ActiveTab; label: string; badge: number }[]).map(tab => (
```

with:

```typescript
        {([
          { id: 'announcements', label: 'MESSAGES',  badge: unseenIds.size },
          { id: 'documents',     label: 'POLICIES',  badge: 0 },
          { id: 'polls',         label: 'POLLS',     badge: newPollAlert ? 1 : 0 },
        ] as { id: ActiveTab; label: string; badge: number }[]).map(tab => (
```

- [ ] **Step 3: Merge Ask AI and the document list into one continuous-scroll Policies tab**

Replace the entire existing Documents block:

```typescript
      {/* ── Documents ── */}
      {activeTab === 'documents' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {docsLoading && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.50)', fontSize: 12, padding: '40px 0' }}>Loading…</p>
          )}
          {!docsLoading && documents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 14px' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📂</p>
              <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>No documents available</p>
              <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 11, marginTop: 4 }}>HR will upload documents here for your reference.</p>
            </div>
          )}
          {documents.map(doc => (
            <div
              key={doc.id}
              onClick={() => handleOpenDocument(doc)}
              style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: doc.file_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s' }}
              onMouseEnter={e => { if (doc.file_url) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>
                {doc.file_type === 'pdf' ? '📕' : doc.file_type === 'docx' ? '📘' : '📄'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.60)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ textTransform: 'uppercase' }}>{doc.file_type}</span>
                  {doc.target_level && (
                    <span style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 600 }}>
                      {doc.target_level}
                    </span>
                  )}
                </div>
              </div>
              {doc.file_url && (
                <span style={{ fontSize: 10, color: theme.lightAccentText, flexShrink: 0 }}>Open ↗</span>
              )}
            </div>
          ))}
        </div>
      )}
```

with:

```typescript
      {/* ── Policies (Ask AI + Documents) ── */}
      {activeTab === 'documents' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Ask AI section */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {qaHistory.length === 0 && !asking && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>🤖</p>
                <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>Ask about company policies</p>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 }}>
                  Ask about leave, payroll, benefits, conduct, and more.
                </p>
              </div>
            )}
            {qaHistory.map((qa, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <div style={{ background: theme.primaryGradient, color: 'white', borderRadius: '12px 12px 2px 12px', padding: '7px 11px', fontSize: 12, maxWidth: '85%', lineHeight: 1.4 }}>
                    {qa.question}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '2px 12px 12px 12px', padding: '10px 12px', maxWidth: '92%' }}>
                  {qa.error ? (
                    <span style={{ color: '#f87171', fontSize: 12 }}>{qa.answerHtml}</span>
                  ) : (
                    <>
                      <div dangerouslySetInnerHTML={{ __html: qa.answerHtml }} />
                      {qa.sources.length > 0 && (
                        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.55)', fontSize: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                          📄 {qa.sources.join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {asking && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '2px 12px 12px 12px', padding: '10px 12px', maxWidth: '92%', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${theme.lightAccentText}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: theme.lightAccentText, fontSize: 12 }}>Thinking…</span>
              </div>
            )}
            <div ref={qaEndRef} />
            <form onSubmit={handleAsk} style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask about a policy…"
                disabled={asking}
                style={{ ...S.input, flex: 1, fontSize: 12, padding: '7px 10px' }}
              />
              <button
                type="submit"
                disabled={!question.trim() || asking}
                style={{ ...S.primaryBtn, background: theme.primaryGradient, padding: '7px 16px', fontSize: 12, opacity: (!question.trim() || asking) ? 0.5 : 1 }}
              >
                Ask
              </button>
            </form>
          </div>

          {/* Documents section */}
          <div>
            {docsLoading && (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.50)', fontSize: 12, padding: '40px 0' }}>Loading…</p>
            )}
            {!docsLoading && documents.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 14px' }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>📂</p>
                <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>No documents available</p>
                <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 11, marginTop: 4 }}>HR will upload documents here for your reference.</p>
              </div>
            )}
            {documents.map(doc => (
              <div
                key={doc.id}
                onClick={() => handleOpenDocument(doc)}
                style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: doc.file_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s' }}
                onMouseEnter={e => { if (doc.file_url) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>
                  {doc.file_type === 'pdf' ? '📕' : doc.file_type === 'docx' ? '📘' : '📄'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.60)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ textTransform: 'uppercase' }}>{doc.file_type}</span>
                    {doc.target_level && (
                      <span style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 600 }}>
                        {doc.target_level}
                      </span>
                    )}
                  </div>
                </div>
                {doc.file_url && (
                  <span style={{ fontSize: 10, color: theme.lightAccentText, flexShrink: 0 }}>Open ↗</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Delete the standalone Ask AI block**

Replace:

```typescript
      {/* ── AI Search ── */}
      {activeTab === 'ai-search' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
            {qaHistory.length === 0 && !asking && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>🤖</p>
                <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>Ask about company policies</p>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 }}>
                  Ask about leave, payroll, benefits, conduct, and more.
                </p>
              </div>
            )}
            {qaHistory.map((qa, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                {/* Question */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <div style={{ background: theme.primaryGradient, color: 'white', borderRadius: '12px 12px 2px 12px', padding: '7px 11px', fontSize: 12, maxWidth: '85%', lineHeight: 1.4 }}>
                    {qa.question}
                  </div>
                </div>
                {/* Answer */}
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '2px 12px 12px 12px', padding: '10px 12px', maxWidth: '92%' }}>
                  {qa.error ? (
                    <span style={{ color: '#f87171', fontSize: 12 }}>{qa.answerHtml}</span>
                  ) : (
                    <>
                      <div dangerouslySetInnerHTML={{ __html: qa.answerHtml }} />
                      {qa.sources.length > 0 && (
                        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.55)', fontSize: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                          📄 {qa.sources.join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {asking && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '2px 12px 12px 12px', padding: '10px 12px', maxWidth: '92%', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${theme.lightAccentText}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: theme.lightAccentText, fontSize: 12 }}>Thinking…</span>
              </div>
            )}
            <div ref={qaEndRef} />
          </div>

          <form onSubmit={handleAsk} style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask about a policy…"
              disabled={asking}
              style={{ ...S.input, flex: 1, fontSize: 12, padding: '7px 10px' }}
            />
            <button
              type="submit"
              disabled={!question.trim() || asking}
              style={{ ...S.primaryBtn, background: theme.primaryGradient, padding: '7px 16px', fontSize: 12, opacity: (!question.trim() || asking) ? 0.5 : 1 }}
            >
              Ask
            </button>
          </form>
        </div>
      )}
```

with nothing (delete this entire block — its content now lives inside the merged Policies block from Step 3).

- [ ] **Step 5: Typecheck**

Run: `cd widget && npx tsc --noEmit`
Expected: no errors. Specifically confirm no remaining reference to `'ai-search'` anywhere in `Feed.tsx` (a leftover reference would be a type error now that `ActiveTab` no longer includes it).

- [ ] **Step 6: Commit**

```bash
git add widget/src/renderer/feed/Feed.tsx
git commit -m "feat(widget): merge Ask AI into the Policies tab as a continuous-scroll section"
```

---

### Task 7: Widget — new Quick Links tab

**Files:**
- Modify: `widget/src/renderer/feed/Feed.tsx`

**Interfaces:**
- Consumes: `window.hrWidget.getQuickLinks()`, `window.hrWidget.openQuickLinkUrl(url)`, `window.hrWidget.copyToClipboard(text)` from Task 5; the merged Policies tab layout from Task 6 (this task only adds a new, independent tab alongside it).
- Produces: nothing further downstream — this is the last task in this plan.

- [ ] **Step 1: Import the `QuickLink` type and widen `ActiveTab`**

Replace:

```typescript
import type { Employee, Message, HrDocument, Poll } from '../../shared/types'
```

with:

```typescript
import type { Employee, Message, HrDocument, Poll, QuickLink } from '../../shared/types'
```

Then replace:

```typescript
type ActiveTab = 'announcements' | 'documents' | 'polls'
```

with:

```typescript
type ActiveTab = 'announcements' | 'documents' | 'polls' | 'quick-links'
```

- [ ] **Step 2: Add Quick Links state**

Replace:

```typescript
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [pollsLoaded, setPollsLoaded] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [newPollAlert, setNewPollAlert] = useState(false)
```

with:

```typescript
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [pollsLoaded, setPollsLoaded] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [newPollAlert, setNewPollAlert] = useState(false)

  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([])
  const [quickLinksLoading, setQuickLinksLoading] = useState(false)
  const [quickLinksLoaded, setQuickLinksLoaded] = useState(false)
  const [openInfoId, setOpenInfoId] = useState<string | null>(null)
  const [copiedButton, setCopiedButton] = useState<string | null>(null)
```

- [ ] **Step 3: Add the load function and wire it into `handleTabChange`**

Replace:

```typescript
  async function loadPolls(force = false) {
    if ((pollsLoaded && !force) || pollsLoading) return
    setPollsLoading(true)
    const p = await window.hrWidget.getPolls()
    setPolls(p)
    setPollsLoaded(true)
    setPollsLoading(false)
  }

  function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab)
    if (tab === 'documents') loadDocuments()
    if (tab === 'polls') {
      setNewPollAlert(false)
      window.hrWidget.clearPollBadge()
      loadPolls(true)
    }
  }
```

with:

```typescript
  async function loadPolls(force = false) {
    if ((pollsLoaded && !force) || pollsLoading) return
    setPollsLoading(true)
    const p = await window.hrWidget.getPolls()
    setPolls(p)
    setPollsLoaded(true)
    setPollsLoading(false)
  }

  async function loadQuickLinks() {
    if (quickLinksLoaded || quickLinksLoading) return
    setQuickLinksLoading(true)
    const links = await window.hrWidget.getQuickLinks()
    setQuickLinks(links)
    setQuickLinksLoaded(true)
    setQuickLinksLoading(false)
  }

  function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab)
    if (tab === 'documents') loadDocuments()
    if (tab === 'quick-links') loadQuickLinks()
    if (tab === 'polls') {
      setNewPollAlert(false)
      window.hrWidget.clearPollBadge()
      loadPolls(true)
    }
  }
```

- [ ] **Step 4: Add the Open/Copy handlers**

Replace:

```typescript
  async function handleOpenDocument(doc: HrDocument) {
    if (!doc.file_url) return
    window.hrWidget.logDocumentAccess(doc.id)
    await window.hrWidget.openDocumentUrl(doc.file_url)
  }
```

with:

```typescript
  async function handleOpenDocument(doc: HrDocument) {
    if (!doc.file_url) return
    window.hrWidget.logDocumentAccess(doc.id)
    await window.hrWidget.openDocumentUrl(doc.file_url)
  }

  async function handleOpenQuickLink(url: string) {
    await window.hrWidget.openQuickLinkUrl(url)
  }

  async function handleCopyQuickLink(link: QuickLink, platform: 'android' | 'ios') {
    const url = platform === 'android' ? link.android_app_url : link.ios_app_url
    if (!url) return
    await window.hrWidget.copyToClipboard(url)
    const key = `${link.id}-${platform}`
    setCopiedButton(key)
    setTimeout(() => setCopiedButton(prev => (prev === key ? null : prev)), 1500)
  }
```

- [ ] **Step 5: Add the "QUICK LINKS" tab bar entry**

Replace:

```typescript
        {([
          { id: 'announcements', label: 'MESSAGES',  badge: unseenIds.size },
          { id: 'documents',     label: 'POLICIES',  badge: 0 },
          { id: 'polls',         label: 'POLLS',     badge: newPollAlert ? 1 : 0 },
        ] as { id: ActiveTab; label: string; badge: number }[]).map(tab => (
```

with:

```typescript
        {([
          { id: 'announcements', label: 'MESSAGES',     badge: unseenIds.size },
          { id: 'documents',     label: 'POLICIES',     badge: 0 },
          { id: 'polls',         label: 'POLLS',        badge: newPollAlert ? 1 : 0 },
          { id: 'quick-links',   label: 'QUICK LINKS',  badge: 0 },
        ] as { id: ActiveTab; label: string; badge: number }[]).map(tab => (
```

- [ ] **Step 6: Add the Quick Links tab content**

Replace (this comment line is unique in the file — it marks the start of the existing Polls block, immediately after the merged Policies block from Task 6):

```typescript
      {/* ── Polls ── */}
```

with:

```typescript
      {/* ── Quick Links ── */}
      {activeTab === 'quick-links' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
          {quickLinksLoading && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.50)', fontSize: 12, padding: '40px 0' }}>Loading…</p>
          )}
          {!quickLinksLoading && quickLinks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 14px' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>🔗</p>
              <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>No quick links yet</p>
              <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 11, marginTop: 4 }}>HR will add portals and apps here.</p>
            </div>
          )}
          {quickLinks.map(link => (
            <div key={link.id} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 14px', marginBottom: 10, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{link.portal_name}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}>
                      {link.type === 'website' ? 'Website' : 'Mobile App'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{link.purpose}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setOpenInfoId(prev => prev === link.id ? null : link.id)}
                    style={{ width: 20, height: 20, borderRadius: '50%', background: rgba(theme.primary, 0.20), color: theme.lightAccentText, border: `1px solid ${rgba(theme.primary, 0.35)}`, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    i
                  </button>
                  {link.type === 'website' && link.url && (
                    <button
                      onClick={() => handleOpenQuickLink(link.url!)}
                      style={{ background: theme.primaryGradient, color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Open ↗
                    </button>
                  )}
                  {link.type === 'mobile_app' && link.android_app_url && (
                    <button
                      onClick={() => handleCopyQuickLink(link, 'android')}
                      style={{ background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 10px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {copiedButton === `${link.id}-android` ? 'Copied!' : '📋 Copy Android link'}
                    </button>
                  )}
                  {link.type === 'mobile_app' && link.ios_app_url && (
                    <button
                      onClick={() => handleCopyQuickLink(link, 'ios')}
                      style={{ background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 10px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {copiedButton === `${link.id}-ios` ? 'Copied!' : '📋 Copy iOS link'}
                    </button>
                  )}
                </div>
              </div>
              {openInfoId === link.id && (
                <div style={{ position: 'absolute', top: 40, right: 14, width: 220, background: '#10202a', border: `1px solid ${rgba(theme.primary, 0.35)}`, borderRadius: 12, padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 5 }}>
                  <div style={{ color: theme.lightAccentText, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Purpose</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginBottom: 10 }}>{link.purpose}</div>
                  <div style={{ color: theme.lightAccentText, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>How to Use</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5 }}>{link.how_to_use}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Polls ── */}
```

- [ ] **Step 7: Typecheck**

Run: `cd widget && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Run existing test suites (regression check)**

Run: `cd widget && npx jest`
Expected: same pre-existing, unrelated failures as before this task (the `better-sqlite3` native-binary mismatch in `seen-store.test.ts`) — no new failures. `theme.test.ts` and `auth-store.test.ts` remain green.

- [ ] **Step 9: Manual verification**

This requires migration 019 applied via the Supabase Dashboard, and at least one Quick Link created via the CMS first.

1. In the CMS, create a Website Quick Link for Colorbar Cosmetics (e.g. "Employee Self-Service", purpose "Apply for leave", URL any valid link, How to Use any text).
2. In the widget, sign in as a Colorbar employee, open the new "QUICK LINKS" tab, confirm the card appears with bold Portal Name + "Website" badge + normal Purpose text.
3. Click "Open ↗" — confirm it launches the URL in the system's default browser.
4. Click the "i" icon — confirm a popover appears below it showing Purpose and How to Use; click it again to confirm it closes.
5. Sign in as a Modicare employee, confirm this Colorbar-only link does NOT appear.
6. In the CMS, create a Mobile App Quick Link with only an Android App URL set (leave iOS blank). Confirm the form and API accept it (at least one required, not both).
7. In the widget, confirm only "📋 Copy Android link" appears for this link (no iOS button, no generic Open button). Click it, confirm the button briefly shows "Copied!" and the URL is on the system clipboard (paste it somewhere to check).
8. Confirm the Policies tab now shows Ask AI at the top (ask a question, confirm it still answers correctly) and the document list below it, in one continuous scroll, with no "ASK AI" tab in the tab bar anymore.
9. Edit a Quick Link's Company in the CMS; confirm it moves to the new company's employees in the widget. Delete a Quick Link; confirm it disappears from the widget.

- [ ] **Step 10: Commit**

```bash
git add widget/src/renderer/feed/Feed.tsx
git commit -m "feat(widget): add Quick Links tab with Open/Copy actions and info popover"
```
