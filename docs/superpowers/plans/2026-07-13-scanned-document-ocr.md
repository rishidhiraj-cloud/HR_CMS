# Scanned Document OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paced, page-by-page OCR fallback (Tesseract.js) for scanned/image-only PDFs, so documents like `Bereavment Leave Policy.pdf` (0 extractable characters, confirmed by direct reproduction) become uploadable instead of failing with "Document appears to be empty or unreadable."

**Architecture:** When normal text extraction yields too little text on a PDF, the upload route returns `needsOcr: true` instead of erroring. A new paced route OCRs one page per call (render via `unpdf` + recognize via Tesseract.js), mirroring the existing `embed-batch` pattern exactly. Once every page is OCR'd, the assembled text flows into the *existing* chunking + paced-embedding pipeline unchanged.

**Tech Stack:** Next.js App Router (cms-panel), `unpdf` (already a dependency, used here for page rendering), Tesseract.js (new), `@napi-rs/canvas` (new, required by `unpdf` for Node-side rendering), `pdfjs-dist` (new explicit dependency — already present transitively via `unpdf`, added directly for reliable resolution).

## Global Constraints

- OCR only applies to PDFs. DOCX/TXT keep today's exact behavior: an empty/unreadable file returns a 422 with **no document row created** — this must not change.
- Documents with a working text layer (the vast majority) see **zero behavior change** — same speed, same response shape, no OCR phase ever triggered.
- No artificial delay between OCR page calls (unlike the embedding loop's ~22s pacing) — Tesseract.js is self-hosted with no external rate limit to respect. The OCR loop calls the next page immediately once the previous response returns.
- No page-count cap.
- `document_ocr_pages` mirrors `document_chunks`'s existing RLS shape (HR-only access).
- Same manual-testing-only posture as every other feature this session — no automated test convention for these files. Test locally against the real `Bereavment Leave Policy.pdf` at `/Users/dhiraj/Downloads/Bereavment Leave Policy.pdf` (confirmed: 1 page, 0 extracted characters) before considering this done.

---

### Task 1: Database migration — `document_ocr_pages` table + RLS

**Files:**
- Create: `supabase/migrations/020_document_ocr_pages.sql`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `document_ocr_pages` table and its RLS policy. Tasks 2-5 depend on this shape being applied to the live DB (via the human) before they work end-to-end — not a compile-time dependency for any of them.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/020_document_ocr_pages.sql

CREATE TABLE document_ocr_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  page_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE document_ocr_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_users can manage document_ocr_pages" ON document_ocr_pages
  FOR ALL USING (EXISTS (SELECT 1 FROM hr_users WHERE id = auth.uid()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/020_document_ocr_pages.sql
git commit -m "feat: add document_ocr_pages table for paced OCR"
```

---

### Task 2: OCR helper library

**Files:**
- Create: `cms-panel/lib/ocr.ts`
- Modify: `cms-panel/package.json` (new dependencies)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `getPageCount(pdfBuffer: Uint8Array): Promise<number>` and `ocrPage(pdfBuffer: Uint8Array, pageIndex: number): Promise<string>` (0-indexed `pageIndex`, matching the existing `document_chunks.chunk_index` convention) — both consumed by Task 3 and Task 4.

- [ ] **Step 1: Install the new dependencies**

```bash
cd cms-panel && npm install tesseract.js @napi-rs/canvas pdfjs-dist
```

Expected: `package.json` and `package-lock.json` update with these three new entries. `@napi-rs/canvas` is required by `unpdf`'s `renderPageAsImage` for rendering in Node.js (confirmed via `unpdf`'s own README: "Install the `@napi-rs/canvas` package if you are using Node.js. This package is required to render the PDF page as an image."). `pdfjs-dist` is added as an explicit direct dependency for reliable resolution, even though it's already present transitively via `unpdf`.

- [ ] **Step 2: Write the OCR helper**

```typescript
// cms-panel/lib/ocr.ts

import { definePDFJSModule, getDocumentProxy, renderPageAsImage } from 'unpdf'
import { createWorker } from 'tesseract.js'

let pdfjsModuleDefined = false

async function ensurePDFJSModule() {
  if (pdfjsModuleDefined) return
  await definePDFJSModule(() => import('pdfjs-dist'))
  pdfjsModuleDefined = true
}

export async function getPageCount(pdfBuffer: Uint8Array): Promise<number> {
  await ensurePDFJSModule()
  const pdf = await getDocumentProxy(pdfBuffer)
  return pdf.numPages
}

// pageIndex is 0-indexed (matches document_chunks.chunk_index convention);
// unpdf/pdf.js page numbers are 1-indexed, so we convert when calling renderPageAsImage.
export async function ocrPage(pdfBuffer: Uint8Array, pageIndex: number): Promise<string> {
  await ensurePDFJSModule()
  const pdf = await getDocumentProxy(pdfBuffer)
  const imageBuffer = await renderPageAsImage(pdf, pageIndex + 1, {
    canvasImport: () => import('@napi-rs/canvas'),
    scale: 2,
  })

  const worker = await createWorker('eng')
  try {
    const { data: { text } } = await worker.recognize(Buffer.from(imageBuffer))
    return text
  } finally {
    await worker.terminate()
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add cms-panel/lib/ocr.ts cms-panel/package.json cms-panel/package-lock.json
git commit -m "feat(cms): add Tesseract.js OCR helper for scanned PDF pages"
```

---

### Task 3: Shared chunk-and-insert helper + upload route OCR fallback

**Files:**
- Modify: `cms-panel/lib/embeddings.ts`
- Modify: `cms-panel/app/api/policies/upload/route.ts`

**Interfaces:**
- Consumes: `getPageCount()` from `@/lib/ocr` (Task 2).
- Produces: `chunkAndInsertDocument(svc, documentId, text): Promise<{ totalChunks: number } | { error: string }>` in `lib/embeddings.ts` — consumed by both this task's upload route and Task 4's `ocr-batch` route. Produces the upload route's new response shape: `{ success: true, documentId, needsOcr: true, totalPages }` for the OCR-fallback case — consumed by Task 5's client code.

- [ ] **Step 1: Add the shared `chunkAndInsertDocument` helper**

Replace:

```typescript
export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const chunks: string[] = []
  let start = 0
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length)
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 80) chunks.push(chunk)
    if (end === cleaned.length) break
    start += chunkSize - overlap
  }
  return chunks
}
```

with:

```typescript
export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const chunks: string[] = []
  let start = 0
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length)
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 80) chunks.push(chunk)
    if (end === cleaned.length) break
    start += chunkSize - overlap
  }
  return chunks
}

type ServiceClient = ReturnType<typeof import('@supabase/supabase-js').createClient>

export async function chunkAndInsertDocument(
  svc: ServiceClient,
  documentId: string,
  text: string
): Promise<{ totalChunks: number } | { error: string }> {
  const chunks = chunkText(text)
  const chunkRows = chunks.map((chunk, i) => ({
    document_id: documentId,
    chunk_text: chunk,
    chunk_index: i,
  }))

  const { error: chunkErr } = await svc.from('document_chunks').insert(chunkRows)
  if (chunkErr) {
    console.error('[chunkAndInsertDocument] chunk insert failed:', chunkErr.message)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', documentId)
    return { error: 'Failed to save document chunks' }
  }

  return { totalChunks: chunks.length }
}
```

- [ ] **Step 2: Update the upload route's import**

Replace:

```typescript
import { chunkText } from '@/lib/embeddings'
```

with:

```typescript
import { chunkAndInsertDocument } from '@/lib/embeddings'
import { getPageCount } from '@/lib/ocr'
```

- [ ] **Step 3: Move the empty-text check to only apply to non-PDF files, and route PDFs to the OCR fallback**

Replace:

```typescript
  text = text.replace(/\s+/g, ' ').trim()
  if (text.length < 100) {
    return NextResponse.json({ error: 'Document appears to be empty or unreadable' }, { status: 422 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
```

with:

```typescript
  text = text.replace(/\s+/g, ' ').trim()

  // Non-PDF files have no OCR fallback — an empty/unreadable DOCX or TXT is
  // genuinely unreadable, so fail exactly as before with no document row
  // created. PDFs with too little text fall through to the OCR path below.
  if (ext !== 'pdf' && text.length < 100) {
    return NextResponse.json({ error: 'Document appears to be empty or unreadable' }, { status: 422 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
```

- [ ] **Step 4: Branch to OCR or the existing chunk-and-insert path**

Replace:

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

with:

```typescript
  // PDF with too little embedded text: fall back to page-by-page OCR, paced
  // from the client via POST /api/policies/upload/ocr-batch.
  if (text.length < 100) {
    const totalPages = await getPageCount(new Uint8Array(fileBuffer))
    return NextResponse.json({ success: true, documentId: doc.id, needsOcr: true, totalPages })
  }

  // Chunk and insert rows now; embeddings are filled in incrementally by
  // POST /api/policies/upload/embed-batch, paced from the client to respect
  // Voyage's rate limit and Vercel's function duration limit.
  const result = await chunkAndInsertDocument(svc, doc.id, text)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, documentId: doc.id, totalChunks: result.totalChunks })
}
```

- [ ] **Step 5: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add cms-panel/lib/embeddings.ts cms-panel/app/api/policies/upload/route.ts
git commit -m "feat(cms): extract chunk-and-insert helper, add OCR fallback for scanned PDFs"
```

---

### Task 4: New ocr-batch route

**Files:**
- Create: `cms-panel/app/api/policies/upload/ocr-batch/route.ts`

**Interfaces:**
- Consumes: `ocrPage()`/`getPageCount()` from `@/lib/ocr` (Task 2), `chunkAndInsertDocument()` from `@/lib/embeddings` (Task 3).
- Produces: `POST /api/policies/upload/ocr-batch` accepting `{ documentId: string }`, returning either `{ pagesDone, totalPages, complete: false }` or `{ pagesDone, totalPages, complete: true, totalChunks }` — consumed by Task 5's client code.

- [ ] **Step 1: Write the route**

```typescript
// cms-panel/app/api/policies/upload/ocr-batch/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { ocrPage, getPageCount } from '@/lib/ocr'
import { chunkAndInsertDocument } from '@/lib/embeddings'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  const { data: doc, error: docErr } = await svc
    .from('policy_documents')
    .select('file_type')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const storagePath = `documents/${documentId}.${doc.file_type}`
  const { data: fileBlob, error: downloadErr } = await svc.storage
    .from('policy-documents')
    .download(storagePath)

  if (downloadErr || !fileBlob) {
    return NextResponse.json({ error: 'Failed to load stored file' }, { status: 500 })
  }

  const pdfBuffer = new Uint8Array(await fileBlob.arrayBuffer())
  const totalPages = await getPageCount(pdfBuffer)

  const { count: pagesDone, error: countErr } = await svc
    .from('document_ocr_pages')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 })
  }

  const nextPageIndex = pagesDone ?? 0

  if (nextPageIndex >= totalPages) {
    return NextResponse.json({ pagesDone: totalPages, totalPages, complete: true })
  }

  try {
    const pageText = await ocrPage(pdfBuffer, nextPageIndex)
    const { error: insertErr } = await svc
      .from('document_ocr_pages')
      .insert({ document_id: documentId, page_index: nextPageIndex, page_text: pageText })
    if (insertErr) throw insertErr
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ocr-batch] OCR failed:', msg)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', documentId)
    return NextResponse.json({ error: `Failed to OCR page: ${msg}` }, { status: 500 })
  }

  const newPagesDone = nextPageIndex + 1

  if (newPagesDone === totalPages) {
    const { data: pages, error: pagesErr } = await svc
      .from('document_ocr_pages')
      .select('page_text')
      .eq('document_id', documentId)
      .order('page_index', { ascending: true })

    if (pagesErr || !pages) {
      return NextResponse.json({ error: 'Failed to assemble OCR text' }, { status: 500 })
    }

    const fullText = pages.map(p => p.page_text).join(' ').replace(/\s+/g, ' ').trim()
    const result = await chunkAndInsertDocument(svc, documentId, fullText)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ pagesDone: newPagesDone, totalPages, complete: true, totalChunks: result.totalChunks })
  }

  return NextResponse.json({ pagesDone: newPagesDone, totalPages, complete: false })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd cms-panel && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add cms-panel/app/api/policies/upload/ocr-batch/route.ts
git commit -m "feat(cms): add ocr-batch route for paced page-by-page OCR"
```

---

### Task 5: Client OCR loop + progress bar, manual verification

**Files:**
- Modify: `cms-panel/app/documents/upload/page.tsx`

**Interfaces:**
- Consumes: the upload route's `needsOcr`/`totalPages` response shape (Task 3) and the `ocr-batch` route's `{ pagesDone, totalPages, complete, totalChunks? }` response shape (Task 4). Calls the existing `runEmbedBatchLoop()` once OCR completes — unchanged from the prior paced-embedding feature.
- Produces: nothing further downstream — this is the last task in this plan.

- [ ] **Step 1: Widen `UploadState` and add OCR progress state**

Replace:

```typescript
type UploadState = 'idle' | 'uploading' | 'processing' | 'embedding' | 'done' | 'error'
```

with:

```typescript
type UploadState = 'idle' | 'uploading' | 'processing' | 'ocr' | 'embedding' | 'done' | 'error'
```

Then replace:

```typescript
  const [embeddedCount, setEmbeddedCount] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
```

with:

```typescript
  const [embeddedCount, setEmbeddedCount] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [ocrPagesDone, setOcrPagesDone] = useState(0)
  const [ocrTotalPages, setOcrTotalPages] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Branch to the OCR loop when the upload response says `needsOcr`, and add `runOcrBatchLoop`**

Replace:

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
```

with:

```typescript
      setState('processing')
      const res = await fetch('/api/policies/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Upload failed')
      if (json.needsOcr) {
        await runOcrBatchLoop(json.documentId, json.totalPages)
      } else {
        await runEmbedBatchLoop(json.documentId, json.totalChunks)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }

  async function runOcrBatchLoop(documentId: string, totalPagesCount: number) {
    setOcrTotalPages(totalPagesCount)
    setOcrPagesDone(0)
    setState('ocr')

    let pagesDoneSoFar = 0
    while (pagesDoneSoFar < totalPagesCount) {
      const res = await fetch('/api/policies/upload/ocr-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'OCR failed')

      pagesDoneSoFar = json.pagesDone
      setOcrPagesDone(pagesDoneSoFar)

      if (json.complete) {
        await runEmbedBatchLoop(documentId, json.totalChunks)
        return
      }
    }
  }
```

- [ ] **Step 3: Add the `ocr` label and widen `busy`**

Replace:

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

with:

```typescript
  const stateLabel: Record<UploadState, string> = {
    idle: 'Upload & Index Document',
    uploading: 'Uploading…',
    processing: 'Processing & indexing with AI…',
    ocr: 'Reading scanned pages…',
    embedding: 'Embedding chunks…',
    done: 'Done!',
    error: 'Try Again',
  }

  const busy = state === 'uploading' || state === 'processing' || state === 'ocr' || state === 'embedding'
```

- [ ] **Step 4: Reset the new state on "Upload Another"**

Replace:

```typescript
                onClick={() => { setFile(null); setName(''); setLevel(''); setCompany(''); setState('idle'); setResult(null); setEmbeddedCount(0); setTotalChunks(0); if (inputRef.current) inputRef.current.value = '' }}
```

with:

```typescript
                onClick={() => { setFile(null); setName(''); setLevel(''); setCompany(''); setState('idle'); setResult(null); setEmbeddedCount(0); setTotalChunks(0); setOcrPagesDone(0); setOcrTotalPages(0); if (inputRef.current) inputRef.current.value = '' }}
```

- [ ] **Step 5: Add the OCR progress bar, and exclude it from the generic spinner**

Replace:

```typescript
            {/* Progress */}
            {busy && state !== 'embedding' && (
              <div className="flex items-center gap-3 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)', color: '#5eead4' }}>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                {stateLabel[state]}
              </div>
            )}
```

with:

```typescript
            {/* Progress */}
            {busy && state !== 'embedding' && state !== 'ocr' && (
              <div className="flex items-center gap-3 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)', color: '#5eead4' }}>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                {stateLabel[state]}
              </div>
            )}

            {/* OCR progress bar */}
            {state === 'ocr' && (
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)' }}>
                <div className="flex items-center justify-between text-sm mb-2" style={{ color: '#5eead4' }}>
                  <span>Reading page {ocrPagesDone} / {ocrTotalPages}…</span>
                  <span>{ocrTotalPages > 0 ? Math.round((ocrPagesDone / ocrTotalPages) * 100) : 0}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.10)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${ocrTotalPages > 0 ? (ocrPagesDone / ocrTotalPages) * 100 : 0}%`, background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  This looks like a scanned document — reading its text before indexing. Keep this tab open.
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
git commit -m "feat(cms): OCR progress bar on the upload page"
```

- [ ] **Step 8: Manual verification — LOCAL ONLY, do not deploy**

Per the established pattern for this session's document-processing work: do not deploy to production until the user has confirmed this works locally.

1. Start the CMS locally: `cd cms-panel && npm run dev` (uses the existing `.env.local`, pointing at the real Supabase project).
2. Log in as HR, go to Documents → Upload, and upload `/Users/dhiraj/Downloads/Bereavment Leave Policy.pdf` (confirmed: 1 page, 0 extractable characters via normal extraction).
3. Confirm the page moves from "Uploading…" → "Processing & indexing with AI…" → an OCR progress bar reading "Reading page 0 / 1…", advancing to "1 / 1", then transitions into the existing embedding progress bar, then to "Document indexed successfully!".
4. Confirm the document ends at `status: ready` with a sensible `chunk_count`.
5. Confirm the OCR'd text is accurate enough to be useful: ask the widget's Ask AI "How many days of bereavement leave am I entitled to?" and confirm it answers "5 days" (matching the visually-confirmed page content), correctly sourced from this document.
6. Re-upload a normal, already-text-layer PDF (e.g., one of the existing working policy documents) and confirm it's completely unaffected — same speed, no OCR phase ever shown, `needsOcr` never present in the response.
7. Upload an empty/unreadable `.txt` file (e.g., a file with a few words) and confirm the existing 422 "Document appears to be empty or unreadable" behavior is unchanged, with no document row created (verify directly via a Supabase query if needed: `select * from policy_documents where name = '<test file name>'` should return zero rows).
8. Report back with results before any deploy is considered.
