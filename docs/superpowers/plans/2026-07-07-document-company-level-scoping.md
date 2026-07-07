# Document Company + Level Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every document require a company, and enforce that an employee can only view/search a document when it matches both their company (always) and their level (when the document restricts by level).

**Architecture:** `company` becomes a mandatory `TEXT NOT NULL` column on `policy_documents`, backfilled and enforced the same way `employees.company` was. It's applied as an always-on AND-filter everywhere the existing (optional) level filter already applies: the RLS policy, the widget's document-list API, and the Ask AI semantic-search RPC — company is a hard gate, level stays an independent optional secondary filter.

**Tech Stack:** Next.js App Router (cms-panel), Supabase (Postgres + RLS + pgvector RPC), Electron main process (widget), TypeScript.

## Global Constraints

- Company is **mandatory** everywhere it's set (upload form, insert payload) — no "all companies" option, unlike the optional Level field.
- Company is **editable** in the admin Edit modal, the same way Level already is.
- Existing document rows are backfilled to `'Modicare Ltd.'` before the column becomes `NOT NULL`.
- "Search for it" from the original ask refers to the existing Ask AI semantic-search tab (`match_document_chunks()` RPC) — no new search UI is introduced anywhere.
- No company badge/display added to any UI — confirmed out of scope during brainstorming, matching the "raw value, no extra UI" precedent from prior sub-projects (here, no UI at all, since it wasn't requested).
- This repo has no Supabase CLI/DB connection available to any agent — the migration file is committed but must be applied manually via the Supabase Dashboard's SQL Editor.
- No automated test convention exists for any of the files this plan touches — verified via typecheck + manual testing.

---

### Task 1: Database migration — schema, RLS, and RPC

**Files:**
- Create: `supabase/migrations/018_document_company_scoping.sql`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a `policy_documents.company TEXT NOT NULL` column; an RLS policy enforcing company-AND-level visibility; a `match_document_chunks()` RPC with a new `employee_company TEXT DEFAULT NULL` parameter. Tasks 2-5 all depend on this schema/RPC shape being applied to the live DB (via the human) before they work end-to-end, but none of them depend on it to compile/typecheck.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/018_document_company_scoping.sql

-- Add mandatory company to policy_documents, backfilling existing rows.
ALTER TABLE policy_documents ADD COLUMN company TEXT;
UPDATE policy_documents SET company = 'Modicare Ltd.' WHERE company IS NULL;
ALTER TABLE policy_documents ALTER COLUMN company SET NOT NULL;

-- Widen the employee-read RLS policy to also require a company match.
DROP POLICY IF EXISTS "employees can view policy_documents" ON policy_documents;
CREATE POLICY "employees can view policy_documents" ON policy_documents
  FOR SELECT USING (
    status = 'ready'
    AND (
      EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid())
      OR (
        EXISTS (SELECT 1 FROM employees WHERE id = auth.uid())
        AND company = (SELECT company FROM employees WHERE id = auth.uid())
        AND (
          target_level IS NULL
          OR target_level = (SELECT role FROM employees WHERE id = auth.uid())
        )
      )
    )
  );

-- Add company-aware filtering to the Ask AI semantic search RPC.
-- employee_company IS NULL preserves the existing HR-sees-everything behavior
-- (HR callers aren't in the employees table, so their lookup returns null for
-- both level and company — same convention as the existing employee_level param).
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(512),
  match_count integer DEFAULT 5,
  employee_level TEXT DEFAULT NULL,
  employee_company TEXT DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  document_name text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    pd.name AS document_name,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN policy_documents pd ON dc.document_id = pd.id
  WHERE pd.status = 'ready'
    AND dc.embedding IS NOT NULL
    AND (employee_company IS NULL OR pd.company = employee_company)
    AND (
      employee_level IS NULL
      OR pd.target_level IS NULL
      OR pd.target_level = employee_level
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/018_document_company_scoping.sql
git commit -m "feat: add mandatory company scoping to documents (schema, RLS, RPC)"
```

---

### Task 2: Upload form — mandatory Company field

**Files:**
- Modify: `cms-panel/app/documents/upload/page.tsx`
- Modify: `cms-panel/app/api/policies/upload/route.ts`

**Interfaces:**
- Consumes: nothing from other tasks at compile time.
- Produces: nothing further downstream — this task is self-contained (upload flow only).

- [ ] **Step 1: Add a `Company` interface, `companies` state, and mandatory field**

In `cms-panel/app/documents/upload/page.tsx`, replace:

```typescript
interface Level {
  id: string
  name: string
}

export default function UploadDocumentPage() {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [level, setLevel] = useState<string>('')
  const [levels, setLevels] = useState<Level[]>([])
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ chunks: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getBrowserClient()
      .from('levels')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Level[] | null }) => { if (data) setLevels(data) })
  }, [])
```

with:

```typescript
interface Level {
  id: string
  name: string
}

interface Company {
  id: string
  name: string
}

export default function UploadDocumentPage() {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [level, setLevel] = useState<string>('')
  const [levels, setLevels] = useState<Level[]>([])
  const [company, setCompany] = useState<string>('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ chunks: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getBrowserClient()
      .from('levels')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Level[] | null }) => { if (data) setLevels(data) })
    getBrowserClient()
      .from('companies')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Company[] | null }) => { if (data) setCompanies(data) })
  }, [])
```

- [ ] **Step 2: Include `company` in the upload form submission**

Replace:

```typescript
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      formData.append('level', level)
```

with:

```typescript
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      formData.append('level', level)
      formData.append('company', company)
```

- [ ] **Step 3: Reset `company` in the "Upload Another" handler**

Replace:

```typescript
                onClick={() => { setFile(null); setName(''); setLevel(''); setState('idle'); setResult(null); if (inputRef.current) inputRef.current.value = '' }}
```

with:

```typescript
                onClick={() => { setFile(null); setName(''); setLevel(''); setCompany(''); setState('idle'); setResult(null); if (inputRef.current) inputRef.current.value = '' }}
```

- [ ] **Step 4: Add the mandatory Company dropdown, before the existing Level dropdown**

Replace:

```typescript
            {/* Level */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Visible To</label>
```

with:

```typescript
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
                Only employees of this company will be able to see this document or get answers from it.
              </p>
            </div>

            {/* Level */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Visible To</label>
```

- [ ] **Step 5: Require `company` before enabling submit**

Replace:

```typescript
            <button
              type="submit"
              disabled={!file || !name.trim() || busy}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: (!file || !name.trim() || busy) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                boxShadow: (!file || !name.trim() || busy) ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
                cursor: (!file || !name.trim() || busy) ? 'not-allowed' : 'pointer',
              }}
            >
```

with:

```typescript
            <button
              type="submit"
              disabled={!file || !name.trim() || !company || busy}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: (!file || !name.trim() || !company || busy) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                boxShadow: (!file || !name.trim() || !company || busy) ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
                cursor: (!file || !name.trim() || !company || busy) ? 'not-allowed' : 'pointer',
              }}
            >
```

- [ ] **Step 6: Require and store `company` in the upload API route**

In `cms-panel/app/api/policies/upload/route.ts`, replace:

```typescript
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string | null)?.trim()
  const levelRaw = (formData.get('level') as string | null)?.trim()
  const targetLevel = levelRaw || null

  if (!file || !name) {
    return NextResponse.json({ error: 'File and name are required' }, { status: 400 })
  }
```

with:

```typescript
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string | null)?.trim()
  const levelRaw = (formData.get('level') as string | null)?.trim()
  const targetLevel = levelRaw || null
  const company = (formData.get('company') as string | null)?.trim()

  if (!file || !name || !company) {
    return NextResponse.json({ error: 'File, name, and company are required' }, { status: 400 })
  }
```

Then replace:

```typescript
  const { data: doc, error: docErr } = await svc
    .from('policy_documents')
    .insert({ name, file_type: ext, status: 'processing', uploaded_by: user.id, target_level: targetLevel })
    .select()
    .single()
```

with:

```typescript
  const { data: doc, error: docErr } = await svc
    .from('policy_documents')
    .insert({ name, file_type: ext, status: 'processing', uploaded_by: user.id, target_level: targetLevel, company })
    .select()
    .single()
```

- [ ] **Step 7: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add cms-panel/app/documents/upload/page.tsx cms-panel/app/api/policies/upload/route.ts
git commit -m "feat(cms): require Company on document upload"
```

---

### Task 3: Admin edit modal — editable Company field

**Files:**
- Modify: `cms-panel/app/documents/DocumentsClient.tsx`
- Modify: `cms-panel/app/documents/page.tsx`
- Modify: `cms-panel/app/api/documents/[id]/route.ts`

**Interfaces:**
- Consumes: nothing from other tasks at compile time.
- Produces: nothing further downstream — this task is self-contained (admin edit flow only).

- [ ] **Step 1: Add `company` to the `PolicyDocument` interface and a `companies` prop**

In `cms-panel/app/documents/DocumentsClient.tsx`, replace:

```typescript
interface PolicyDocument {
  id: string
  name: string
  file_type: string
  status: string
  chunk_count: number
  uploaded_at: string
  target_level: string | null
  file_url: string | null
}

interface Level {
  id: string
  name: string
}

interface Props {
  initialDocuments: PolicyDocument[]
  levels: Level[]
}
```

with:

```typescript
interface PolicyDocument {
  id: string
  name: string
  file_type: string
  status: string
  chunk_count: number
  uploaded_at: string
  target_level: string | null
  file_url: string | null
  company: string
}

interface Level {
  id: string
  name: string
}

interface Company {
  id: string
  name: string
}

interface Props {
  initialDocuments: PolicyDocument[]
  levels: Level[]
  companies: Company[]
}
```

- [ ] **Step 2: Destructure `companies` and add edit state**

Replace:

```typescript
export default function DocumentsClient({ initialDocuments, levels }: Props) {
  const [documents, setDocuments] = useState<PolicyDocument[]>(initialDocuments)

  // Filters
  const [searchName, setSearchName] = useState('')
  const [searchLevel, setSearchLevel] = useState('')

  // Edit state
  const [editDoc, setEditDoc] = useState<PolicyDocument | null>(null)
  const [editName, setEditName] = useState('')
  const [editLevel, setEditLevel] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
```

with:

```typescript
export default function DocumentsClient({ initialDocuments, levels, companies }: Props) {
  const [documents, setDocuments] = useState<PolicyDocument[]>(initialDocuments)

  // Filters
  const [searchName, setSearchName] = useState('')
  const [searchLevel, setSearchLevel] = useState('')

  // Edit state
  const [editDoc, setEditDoc] = useState<PolicyDocument | null>(null)
  const [editName, setEditName] = useState('')
  const [editLevel, setEditLevel] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
```

- [ ] **Step 3: Initialize `editCompany` when opening the edit modal**

Replace:

```typescript
  function openEdit(doc: PolicyDocument) {
    setEditDoc(doc)
    setEditName(doc.name)
    setEditLevel(doc.target_level ?? '')
    setEditError('')
  }
```

with:

```typescript
  function openEdit(doc: PolicyDocument) {
    setEditDoc(doc)
    setEditName(doc.name)
    setEditLevel(doc.target_level ?? '')
    setEditCompany(doc.company)
    setEditError('')
  }
```

- [ ] **Step 4: Include `company` in the save PATCH request and local state update**

Replace:

```typescript
  async function handleSaveEdit() {
    if (!editDoc || !editName.trim()) return
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/documents/${editDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), target_level: editLevel || null }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Save failed')
      }
      setDocuments(prev => prev.map(d =>
        d.id === editDoc.id ? { ...d, name: editName.trim(), target_level: editLevel || null } : d
      ))
      setEditDoc(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }
```

with:

```typescript
  async function handleSaveEdit() {
    if (!editDoc || !editName.trim() || !editCompany) return
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/documents/${editDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), target_level: editLevel || null, company: editCompany }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Save failed')
      }
      setDocuments(prev => prev.map(d =>
        d.id === editDoc.id ? { ...d, name: editName.trim(), target_level: editLevel || null, company: editCompany } : d
      ))
      setEditDoc(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }
```

- [ ] **Step 5: Add the Company field to the Edit modal, and require it on the Save button**

Replace:

```typescript
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Visible To</label>
              <select
                value={editLevel}
                onChange={e => setEditLevel(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="">All Levels (everyone)</option>
                {levels.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>

            {editError && (
```

with:

```typescript
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
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Visible To</label>
              <select
                value={editLevel}
                onChange={e => setEditLevel(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="">All Levels (everyone)</option>
                {levels.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>

            {editError && (
```

Then replace:

```typescript
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || editSaving}
```

with:

```typescript
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || !editCompany || editSaving}
```

- [ ] **Step 6: Thread `companies` through `app/documents/page.tsx`**

Replace:

```typescript
  const [{ data: hrUser }, { data: documents }, { data: levels }] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    supabase.from('policy_documents').select('*').order('uploaded_at', { ascending: false }),
    supabase.from('levels').select('id, name').order('name'),
  ])

  if (!hrUser) redirect('/login')

  return (
    <AppLayout title="Documents" userName={hrUser.name}>
      <DocumentsClient
        initialDocuments={documents ?? []}
        levels={levels ?? []}
      />
    </AppLayout>
  )
```

with:

```typescript
  const [{ data: hrUser }, { data: documents }, { data: levels }, { data: companies }] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    supabase.from('policy_documents').select('*').order('uploaded_at', { ascending: false }),
    supabase.from('levels').select('id, name').order('name'),
    supabase.from('companies').select('id, name').order('name'),
  ])

  if (!hrUser) redirect('/login')

  return (
    <AppLayout title="Documents" userName={hrUser.name}>
      <DocumentsClient
        initialDocuments={documents ?? []}
        levels={levels ?? []}
        companies={companies ?? []}
      />
    </AppLayout>
  )
```

- [ ] **Step 7: Accept and store `company` in the PATCH route**

In `cms-panel/app/api/documents/[id]/route.ts`, replace:

```typescript
  const body = await req.json() as { name?: string; target_level?: string | null }

  const update: Record<string, string | null> = {}
  if (body.name !== undefined) update.name = body.name.trim()
  if (body.target_level !== undefined) update.target_level = body.target_level || null
```

with:

```typescript
  const body = await req.json() as { name?: string; target_level?: string | null; company?: string }

  const update: Record<string, string | null> = {}
  if (body.name !== undefined) update.name = body.name.trim()
  if (body.target_level !== undefined) update.target_level = body.target_level || null
  if (body.company !== undefined) update.company = body.company
```

- [ ] **Step 8: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add cms-panel/app/documents/DocumentsClient.tsx cms-panel/app/documents/page.tsx cms-panel/app/api/documents/[id]/route.ts
git commit -m "feat(cms): make Company editable in the document Edit modal"
```

---

### Task 4: Widget document list — company scoping

**Files:**
- Modify: `cms-panel/app/api/documents/route.ts`
- Modify: `widget/src/shared/types.ts`

**Interfaces:**
- Consumes: nothing from other tasks at compile time.
- Produces: nothing further downstream — this task is self-contained (widget document-list fetch only).

- [ ] **Step 1: Widen the employee lookup and scope the query by company**

Replace:

```typescript
export async function GET(req: NextRequest) {
  const admin = svc()
  let employeeRole: string | null = null

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('role').eq('id', user.id).single()
    employeeRole = emp?.role ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id, role').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeRole = emp.role ?? null
  }

  // Return documents targeted at all employees or specifically at this employee's level
  const query = admin
    .from('policy_documents')
    .select('id, name, file_type, file_url, target_level')
    .eq('status', 'ready')
    .order('name', { ascending: true })

  const { data, error } = employeeRole
    ? await query.or(`target_level.is.null,target_level.eq.${employeeRole}`)
    : await query.is('target_level', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

with:

```typescript
export async function GET(req: NextRequest) {
  const admin = svc()
  let employeeRole: string | null = null
  let employeeCompany: string | null = null

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('role, company').eq('id', user.id).single()
    employeeRole = emp?.role ?? null
    employeeCompany = emp?.company ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id, role, company').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeRole = emp.role ?? null
    employeeCompany = emp.company ?? null
  }

  // Company is mandatory on every document — if we don't know the caller's
  // company, there is no sensible "unrestricted" bucket to fall back to
  // (unlike level), so return nothing rather than guessing.
  if (!employeeCompany) return NextResponse.json([])

  // Return documents belonging to this employee's company, targeted at all
  // employees or specifically at this employee's level.
  const query = admin
    .from('policy_documents')
    .select('id, name, file_type, file_url, target_level, company')
    .eq('status', 'ready')
    .eq('company', employeeCompany)
    .order('name', { ascending: true })

  const { data, error } = employeeRole
    ? await query.or(`target_level.is.null,target_level.eq.${employeeRole}`)
    : await query.is('target_level', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: Add `company` to the widget's `HrDocument` type**

In `widget/src/shared/types.ts`, replace:

```typescript
export interface HrDocument {
  id: string
  name: string
  file_type: string
  file_url: string | null
  target_level: string | null
}
```

with:

```typescript
export interface HrDocument {
  id: string
  name: string
  file_type: string
  file_url: string | null
  target_level: string | null
  company: string
}
```

- [ ] **Step 3: Typecheck both projects**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

Run: `cd widget && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add cms-panel/app/api/documents/route.ts widget/src/shared/types.ts
git commit -m "feat: scope widget document list by employee company"
```

---

### Task 5: Ask AI — company-aware semantic search

**Files:**
- Modify: `cms-panel/app/api/policies/ask/route.ts`

**Interfaces:**
- Consumes: the `employee_company` parameter added to `match_document_chunks()` in Task 1's migration (must be applied to the live DB for this to work end-to-end — not a compile-time dependency).
- Produces: nothing further downstream — this is the last task in this plan.

- [ ] **Step 1: Widen the employee lookup**

Replace:

```typescript
  let userId: string
  let employeeLevel: string | null = null

  if (token) {
    const { data: { user }, error: userErr } = await svc.auth.getUser(token)
    if (userErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    userId = user.id
    // Get the employee's role for level-based document filtering.
    // HR users won't be in the employees table — they get null (sees all docs).
    const { data: emp } = await svc.from('employees').select('role').eq('id', userId).single()
    employeeLevel = emp?.role ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await svc.from('employees').select('id, role').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    userId = emp.id
    employeeLevel = emp.role ?? null
  }
```

with:

```typescript
  let userId: string
  let employeeLevel: string | null = null
  let employeeCompany: string | null = null

  if (token) {
    const { data: { user }, error: userErr } = await svc.auth.getUser(token)
    if (userErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    userId = user.id
    // Get the employee's role/company for level- and company-based document filtering.
    // HR users won't be in the employees table — they get null (sees all docs).
    const { data: emp } = await svc.from('employees').select('role, company').eq('id', userId).single()
    employeeLevel = emp?.role ?? null
    employeeCompany = emp?.company ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await svc.from('employees').select('id, role, company').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    userId = emp.id
    employeeLevel = emp.role ?? null
    employeeCompany = emp.company ?? null
  }
```

- [ ] **Step 2: Pass `employee_company` to the RPC call**

Replace:

```typescript
  const { data: chunks, error: searchErr } = await svc.rpc('match_document_chunks', {
    query_embedding: JSON.stringify(questionEmbedding),
    match_count: 5,
    employee_level: employeeLevel,
  })
```

with:

```typescript
  const { data: chunks, error: searchErr } = await svc.rpc('match_document_chunks', {
    query_embedding: JSON.stringify(questionEmbedding),
    match_count: 5,
    employee_level: employeeLevel,
    employee_company: employeeCompany,
  })
```

- [ ] **Step 3: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run existing test suites (regression check)**

Run: `cd cms-panel && npx jest`
Expected: same pre-existing, unrelated failures as before this task (the stale `MessageForm.test.tsx` assertion, if not yet fixed) — no new failures.

Run: `cd widget && npx jest`
Expected: same pre-existing, unrelated failures as before this task (the `better-sqlite3` native-binary mismatch in `seen-store.test.ts`, if not yet fixed) — no new failures. `theme.test.ts` and `auth-store.test.ts` remain green.

- [ ] **Step 5: Manual verification**

This requires the migration from Task 1 to be applied first via the Supabase Dashboard's SQL Editor.

1. Upload a document with Company = "Colorbar Cosmetics" and no level restriction.
2. Confirm a Colorbar employee sees it in the widget's Documents tab; confirm a Modicare employee does NOT.
3. Ask the AI (in the widget) a question whose answer only exists in that document. Confirm a Colorbar employee gets an answer sourced from it, and a Modicare employee gets a "couldn't find relevant information" response instead.
4. Repeat steps 1-3 with a level restriction also set on the document, confirming both company AND level must match.
5. Confirm HR (in the CMS) continues to see and manage all documents regardless of company, and can edit a document's company via the Edit modal.

Expected: all 5 steps behave as described.

- [ ] **Step 6: Commit**

```bash
git add cms-panel/app/api/policies/ask/route.ts
git commit -m "feat: scope Ask AI semantic search by employee company"
```
