# Paced Document Embedding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split document embedding out of the single-shot upload request into client-paced batches, so large documents succeed within Voyage AI's free-tier rate limit and Vercel Hobby's 60-second function timeout, with a real progress bar.

**Architecture:** The upload route inserts all chunk rows immediately with `embedding: null` and returns right away. A new `embed-batch` route processes up to 20 pending chunks per call. The upload page drives a loop calling `embed-batch` repeatedly with a ~22-second delay between calls, updating a progress bar, until no chunks remain.

**Tech Stack:** Next.js App Router (cms-panel), Supabase Postgres (pgvector), Voyage AI embeddings API, TypeScript.

## Global Constraints

- No DB migration — `document_chunks.embedding` (`vector(512)`) is already nullable.
- Batch size stays at 20 chunks per embedding call (matches the existing rate-limit-safe value from the prior fix).
- Pacing between batches is a fixed ~22 seconds, regardless of Voyage billing status — the app has no way to query Voyage's live rate limit, so this stays conservative.
- No auto-resume for interrupted uploads (tab closed mid-embedding) — documented limitation, not in scope.
- **Do not deploy to production until the user has tested locally and confirmed it.** This is an explicit instruction — the last task's manual verification step happens against the local dev server only.

---

### Task 1: Upload route — insert chunk rows immediately, no embedding

**Files:**
- Modify: `cms-panel/app/api/policies/upload/route.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the new response shape `{ success: true, documentId: string, totalChunks: number }` (replacing the old `{ success: true, documentId, chunks }`) — Task 3 consumes this exact shape. Also produces the on-disk state Task 2 depends on: `document_chunks` rows already exist for a document with `chunk_text`/`chunk_index` set and `embedding` null.

- [ ] **Step 1: Remove the now-unused `getEmbeddings` import**

Replace:

```typescript
import { chunkText, getEmbeddings } from '@/lib/embeddings'
```

with:

```typescript
import { chunkText } from '@/lib/embeddings'
```

- [ ] **Step 2: Replace the chunk-and-embed block with chunk-insert-only**

Replace:

```typescript
  // Chunk and embed
  const chunks = chunkText(text)

  try {
    const BATCH = 20
    const allEmbeddings: number[][] = []
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH)
      const embs = await getEmbeddings(batch)
      allEmbeddings.push(...embs)
    }

    const rows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      chunk_text: chunk,
      chunk_index: i,
      embedding: JSON.stringify(allEmbeddings[i]),
    }))

    const { error: chunkErr } = await svc.from('document_chunks').insert(rows)
    if (chunkErr) throw chunkErr

    await svc.from('policy_documents')
      .update({ status: 'ready', chunk_count: chunks.length })
      .eq('id', doc.id)

    return NextResponse.json({ success: true, documentId: doc.id, chunks: chunks.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload] embedding/insert failed:', msg)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', doc.id)
    return NextResponse.json({ error: `Failed to process document embeddings: ${msg}` }, { status: 500 })
  }
}
```

with:

```typescript
  // Chunk and insert rows now; embeddings are filled in incrementally by
  // POST /api/policies/upload/embed-batch, paced from the client to respect
  // Voyage's rate limit and Vercel's function duration limit.
  const chunks = chunkText(text)
  const chunkRows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    chunk_text: chunk,
    chunk_index: i,
  }))

  const { error: chunkErr } = await svc.from('document_chunks').insert(chunkRows)
  if (chunkErr) {
    console.error('[upload] chunk insert failed:', chunkErr.message)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', doc.id)
    return NextResponse.json({ error: 'Failed to save document chunks' }, { status: 500 })
  }

  return NextResponse.json({ success: true, documentId: doc.id, totalChunks: chunks.length })
}
```

- [ ] **Step 3: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add cms-panel/app/api/policies/upload/route.ts
git commit -m "feat(cms): upload route inserts chunk rows without embedding them"
```

---

### Task 2: New embed-batch route

**Files:**
- Create: `cms-panel/app/api/policies/upload/embed-batch/route.ts`

**Interfaces:**
- Consumes: `document_chunks` rows with `embedding: null` created by Task 1. Uses the existing `getEmbeddings()` from `@/lib/embeddings` (already has retry-on-429 from the prior session fix — no changes needed to that function).
- Produces: `POST /api/policies/upload/embed-batch` accepting `{ documentId: string }`, returning `{ embedded: number, remaining: number, total: number }` — Task 3 consumes this exact shape.

- [ ] **Step 1: Write the route**

```typescript
// cms-panel/app/api/policies/upload/embed-batch/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { getEmbeddings } from '@/lib/embeddings'

export const runtime = 'nodejs'
export const maxDuration = 60

const BATCH = 20

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: hrUser } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  if (!hrUser) return NextResponse.json({ error: 'HR access required' }, { status: 403 })

  const { documentId } = await req.json() as { documentId?: string }
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: pending, error: pendingErr } = await svc
    .from('document_chunks')
    .select('id, chunk_text')
    .eq('document_id', documentId)
    .is('embedding', null)
    .order('chunk_index', { ascending: true })
    .limit(BATCH)

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  }

  if (pending.length === 0) {
    return NextResponse.json({ embedded: 0, remaining: 0, total: 0 })
  }

  try {
    const embeddings = await getEmbeddings(pending.map(p => p.chunk_text))

    for (let i = 0; i < pending.length; i++) {
      const { error: updateErr } = await svc
        .from('document_chunks')
        .update({ embedding: JSON.stringify(embeddings[i]) })
        .eq('id', pending[i].id)
      if (updateErr) throw updateErr
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[embed-batch] embedding failed:', msg)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', documentId)
    return NextResponse.json({ error: `Failed to embed chunks: ${msg}` }, { status: 500 })
  }

  const { count: total } = await svc
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)

  const { count: remaining } = await svc
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .is('embedding', null)

  if (remaining === 0) {
    await svc.from('policy_documents')
      .update({ status: 'ready', chunk_count: total ?? 0 })
      .eq('id', documentId)
  }

  return NextResponse.json({ embedded: pending.length, remaining: remaining ?? 0, total: total ?? 0 })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add cms-panel/app/api/policies/upload/embed-batch/route.ts
git commit -m "feat(cms): add embed-batch route for paced chunk embedding"
```

---

### Task 3: Upload page — paced embedding loop with progress bar

**Files:**
- Modify: `cms-panel/app/documents/upload/page.tsx`

**Interfaces:**
- Consumes: `POST /api/policies/upload`'s new `{ documentId, totalChunks }` response shape from Task 1, and `POST /api/policies/upload/embed-batch`'s `{ embedded, remaining, total }` response shape from Task 2.
- Produces: nothing further downstream — this is the last task in this plan.

- [ ] **Step 1: Widen `UploadState` and add progress state**

Replace:

```typescript
type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'
```

with:

```typescript
type UploadState = 'idle' | 'uploading' | 'processing' | 'embedding' | 'done' | 'error'
```

Then replace:

```typescript
  const [result, setResult] = useState<{ chunks: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
```

with:

```typescript
  const [result, setResult] = useState<{ chunks: number } | null>(null)
  const [embeddedCount, setEmbeddedCount] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Replace `handleSubmit`'s tail and add the batch loop**

Replace:

```typescript
      setState('processing')
      const res = await fetch('/api/policies/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Upload failed')
      setResult({ chunks: json.chunks })
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }
```

with:

```typescript
      setState('processing')
      const res = await fetch('/api/policies/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Upload failed')
      await runEmbedBatchLoop(json.documentId, json.totalChunks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }

  async function runEmbedBatchLoop(documentId: string, totalChunksCount: number) {
    setTotalChunks(totalChunksCount)
    setEmbeddedCount(0)
    setState('embedding')

    let embeddedSoFar = 0
    while (embeddedSoFar < totalChunksCount) {
      const res = await fetch('/api/policies/upload/embed-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Embedding failed')

      embeddedSoFar += json.embedded
      setEmbeddedCount(embeddedSoFar)

      if (json.remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, 22_000))
      } else {
        break
      }
    }

    setResult({ chunks: totalChunksCount })
    setState('done')
  }
```

- [ ] **Step 3: Add the `embedding` label and widen `busy`**

Replace:

```typescript
  const stateLabel: Record<UploadState, string> = {
    idle: 'Upload & Index Document',
    uploading: 'Uploading…',
    processing: 'Processing & indexing with AI…',
    done: 'Done!',
    error: 'Try Again',
  }

  const busy = state === 'uploading' || state === 'processing'
```

with:

```typescript
  const stateLabel: Record<UploadState, string> = {
    idle: 'Upload & Index Document',
    uploading: 'Uploading…',
    processing: 'Processing & indexing with AI…',
    embedding: 'Embedding chunks…',
    done: 'Done!',
    error: 'Try Again',
  }

  const busy = state === 'uploading' || state === 'processing' || state === 'embedding'
```

- [ ] **Step 4: Reset the new state on "Upload Another"**

Replace:

```typescript
                onClick={() => { setFile(null); setName(''); setLevel(''); setCompany(''); setState('idle'); setResult(null); if (inputRef.current) inputRef.current.value = '' }}
```

with:

```typescript
                onClick={() => { setFile(null); setName(''); setLevel(''); setCompany(''); setState('idle'); setResult(null); setEmbeddedCount(0); setTotalChunks(0); if (inputRef.current) inputRef.current.value = '' }}
```

- [ ] **Step 5: Add the progress bar, keeping the existing spinner for the other busy states**

Replace:

```typescript
            {/* Progress */}
            {busy && (
              <div className="flex items-center gap-3 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)', color: '#5eead4' }}>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                {stateLabel[state]}
              </div>
            )}
```

with:

```typescript
            {/* Progress */}
            {busy && state !== 'embedding' && (
              <div className="flex items-center gap-3 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)', color: '#5eead4' }}>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                {stateLabel[state]}
              </div>
            )}

            {/* Embedding progress bar */}
            {state === 'embedding' && (
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)' }}>
                <div className="flex items-center justify-between text-sm mb-2" style={{ color: '#5eead4' }}>
                  <span>Embedding {embeddedCount} / {totalChunks} chunks…</span>
                  <span>{totalChunks > 0 ? Math.round((embeddedCount / totalChunks) * 100) : 0}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.10)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${totalChunks > 0 ? (embeddedCount / totalChunks) * 100 : 0}%`, background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  Large documents can take a few minutes — keep this tab open.
                </p>
              </div>
            )}
```

- [ ] **Step 6: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add cms-panel/app/documents/upload/page.tsx
git commit -m "feat(cms): paced embedding progress bar on the upload page"
```

- [ ] **Step 8: Manual verification — LOCAL ONLY, do not deploy**

Per the global constraint: do not deploy to production for this feature until the user has confirmed it works locally.

1. Start the CMS locally: `cd cms-panel && npm run dev` (uses the existing `.env.local`, pointing at the real Supabase project and real Voyage API).
2. Log in as HR, go to Documents → Upload, and upload `/Users/dhiraj/Downloads/Employee_Handbook_for_All.pdf` (56 chunks, 3 batches of 20/20/16).
3. Confirm the page moves from "Uploading…" → "Processing & indexing with AI…" → a progress bar reading "Embedding 0 / 56 chunks…", advancing in ~22-second steps (20 → 40 → 56).
4. Confirm it reaches 56/56 and shows the "Document indexed successfully!" screen, with no billing fix applied to the Voyage account.
5. In the Documents list, confirm the document shows `status: ready` and `chunk_count: 56`.
6. In the widget (or via a direct Ask AI test), confirm a question whose answer lives in this document returns a correct, sourced answer.
7. Upload a small, single-batch document (e.g., re-upload one of the existing short policy documents) and confirm it still completes quickly (one batch, no extra waiting) and correctly.
8. Report back with results before any deploy is considered.
