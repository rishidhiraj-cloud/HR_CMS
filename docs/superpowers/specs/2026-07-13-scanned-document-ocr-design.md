# Scanned Document OCR — Design

## Problem

Document upload only extracts *embedded* text from PDFs (via `unpdf`). Scanned/photographed documents — flattened to an image with no text layer, like `Bereavement Leave Policy.pdf` — extract to 0 characters and are rejected with "Document appears to be empty or unreadable," even though the content is perfectly legible to a human. Confirmed by reproducing the extraction locally and visually rendering the page: it's a real, readable policy document, just image-only.

## Goals

- Scanned/image-only PDFs become uploadable: when normal text extraction yields too little text, fall back to OCR (Tesseract.js — free, self-hosted, no new billing account, avoiding a repeat of the Voyage AI billing friction from an earlier fix).
- OCR runs page-by-page, paced from the client exactly like the existing embedding phase, so multi-page scanned documents stay within Vercel Hobby's 60-second-per-invocation limit no matter how many pages they have.
- Documents that already have a text layer (the vast majority) see **zero change** in behavior or speed — OCR is purely a fallback path.
- Once OCR produces the full document text, it flows into the *existing* chunking + paced-embedding pipeline unchanged.

## Non-goals

- No OCR for DOCX/TXT — those formats are already structured text; an empty/unreadable DOCX or TXT keeps today's immediate-error behavior exactly as-is (no document row created, matching current behavior for that case).
- No cloud OCR API (Google Cloud Vision, AWS Textract, etc.) — Tesseract.js chosen specifically to avoid a second external billing setup, per your explicit preference during brainstorming.
- No page-count cap — a large scanned document just takes proportionally longer, same posture as large digital documents already have with embedding.
- No inter-page artificial delay in the OCR loop (unlike the embedding loop's ~22s pacing) — that pacing exists specifically to respect Voyage AI's external requests-per-minute quota. Tesseract.js is self-hosted with no external rate limit, so the OCR loop calls the next page immediately once the previous one's response comes back; the natural OCR processing time is the only pacing.
- No worker-reuse optimization across serverless invocations — each OCR page call pays Tesseract's worker-init cost independently. Accepted tradeoff for a first version in a stateless serverless environment, not a correctness concern.

## Design

### Database (new migration)

```sql
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

Matches `document_chunks`' existing RLS shape — HR-only access; employees never read this table directly (only the final chunked/embedded result via `policy_documents`/`document_chunks`, unaffected by this feature). No new column on `policy_documents` — it stays `status: 'processing'` through both the OCR phase and the embedding phase; the client's own local state distinguishes which phase is showing.

### New dependency

`tesseract.js` added to `cms-panel/package.json`.

### CMS: `app/api/policies/upload/route.ts` (modified)

Restructured so the document row and stored file exist before the text-length branch, since the OCR path needs both:

1. Extract text, normalize — unchanged.
2. **New early-exit** (preserves today's exact behavior for this one case): if `ext !== 'pdf'` and `text.length < 100`, return the existing 422 immediately — no document row created, exactly as today.
3. Create the `policy_documents` row and store the file in Supabase Storage — unchanged logic, just runs unconditionally now (previously only ran after the length check passed).
4. Branch:
   - `text.length >= 100` (any file type): existing chunk-and-insert path, unchanged. Returns `{ success: true, documentId, totalChunks }`.
   - `text.length < 100` **and** `ext === 'pdf'` (the only way to reach here per step 2's guard): determine page count via `unpdf`'s `getDocumentProxy()` on the already-in-memory file buffer. Returns `{ success: true, documentId: doc.id, needsOcr: true, totalPages }` — no chunk rows created yet.

### CMS: `lib/ocr.ts` (new)

`ocrPage(pdfBuffer: Uint8Array, pageIndex: number): Promise<string>` — renders the given page to an image via `unpdf`'s `renderPageAsImage`, runs it through Tesseract.js, returns the extracted text for that page.

### CMS: `lib/embeddings.ts` (modified)

Extracts the existing inline chunk-and-insert logic (currently duplicated conceptually between the upload route and where OCR will need it) into a shared `chunkAndInsertDocument(svc, documentId, text): Promise<{ totalChunks: number } | { error: string }>` helper, used by both the upload route (`text.length >= 100` path) and the new OCR-batch route (once OCR completes). `chunkText()` itself is unchanged.

### CMS: `app/api/policies/upload/ocr-batch/route.ts` (new)

Same HR-only auth as the sibling `embed-batch` route. Takes `{ documentId }`. Each call:
1. Fetches the stored PDF from Supabase Storage (same `documents/${documentId}.pdf` path convention already used elsewhere).
2. Loads it via `unpdf`'s `getDocumentProxy()`, reads total page count.
3. Counts existing `document_ocr_pages` rows for this document — that count is the next page index to process (0-indexed, since pages are always inserted in order by this route).
4. If already fully processed (defensive check, shouldn't normally trigger): returns the completed state without doing anything.
5. Otherwise: OCRs exactly that one page (`ocrPage()`), inserts a `document_ocr_pages` row, re-counts to get the new `pagesDone`.
6. If `pagesDone === totalPages`: concatenates all pages' `page_text` (ordered by `page_index`) into the full document text, calls the shared `chunkAndInsertDocument()` helper, and returns `{ pagesDone, totalPages, complete: true, totalChunks }`.
7. Otherwise: returns `{ pagesDone, totalPages, complete: false }`.

### Client: `app/documents/upload/page.tsx`

`UploadState` widens further to include `'ocr'` (alongside the existing `'embedding'`). When the initial upload response has `needsOcr: true`, a new `runOcrBatchLoop(documentId, totalPages)` function drives a loop calling `ocr-batch` repeatedly (no artificial delay between calls, per the Non-goals section) until `complete: true`, updating a progress bar ("Reading page 2 / 5…") the same visual style as the embedding progress bar. Once OCR reports `complete: true` with a `totalChunks` count, it calls the *existing* `runEmbedBatchLoop(documentId, totalChunks)` unchanged — from that point the two phases share the exact same completion path.

### Error handling

- A failure in any single OCR page call marks `policy_documents.status = 'error'` and surfaces the real error, matching the exact convention already established for `embed-batch` failures.
- The `chunkAndInsertDocument()` helper's failure path (chunk-insert failure) matches the existing convention too — sets `status: 'error'`, returns a clear message.

### Testing

Same posture as every other feature this session — no automated test convention for these files. Manual verification, local only:
1. Re-upload `Bereavment Leave Policy.pdf` (confirmed 1 page, 0 extracted chars) through the local upload form.
2. Confirm the progress bar shows an OCR phase ("Reading page 1 / 1…") before transitioning to the embedding phase.
3. Confirm the document ends at `status: ready` with a sensible `chunk_count`, and that the OCR'd text is accurate enough to be useful (spot-check against the visually-rendered page: "Bereavement Leave," "5 days," "Parents, Parents In Law, Spouse or Children").
4. Confirm Ask AI can retrieve a correct answer sourced from the OCR'd content (e.g., "How many days of bereavement leave am I entitled to?" → "5 days").
5. Re-upload a normal, already-text-layer PDF (e.g., one of the existing working policy documents) and confirm it's completely unaffected — same speed, no OCR phase ever shown.
6. Upload an empty/unreadable `.txt` file and confirm the existing 422 behavior (no document row created) is unchanged.

## Open questions

None — all decisions (Tesseract.js over a cloud API, paced-per-page architecture reusing the embedding pattern, no inter-page delay since there's no external rate limit to respect, OCR scoped to PDF only) were resolved during brainstorming.
