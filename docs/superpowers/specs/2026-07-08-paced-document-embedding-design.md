# Paced Document Embedding — Design

## Problem

Document uploads embed all chunks in a single synchronous request. Voyage AI accounts without a payment method on file are capped at 3 requests/minute and 10K tokens/minute. This app's Vercel deployment is on the Hobby plan, which hard-caps every serverless function invocation at 60 seconds regardless of any `maxDuration` setting. A document needing more than ~2 embedding batches (roughly 40+ chunks, ~30KB+ of extracted text) cannot possibly finish within one request — no amount of in-request retrying can outrun a 3-requests-per-minute cap inside a 60-second window. This was confirmed by directly reproducing the failure against the real Voyage API with a 56-chunk document.

## Goals

- Large documents succeed without requiring the Voyage billing fix, by pacing embedding requests to stay under 3/minute.
- HR sees a real progress bar while this happens (potentially several minutes for large documents), instead of a single opaque "Processing…" spinner or an outright failure.
- Works within Vercel Hobby's 60-second-per-invocation constraint.

## Non-goals

- No auto-resume for uploads interrupted by closing the browser tab mid-process — the document stays in `processing` with partial chunks, same category of gap as today's single-shot failure mode, just spread over a longer window. Not building resume-from-CMS in this pass.
- No Vercel Cron-based background processing — ruled out during brainstorming in favor of client-paced batches, since Hobby-tier Cron frequency limits were an open question and client-paced batches directly match the requested UX ("show a progress bar so he waits").
- No dynamic detection of Voyage's actual current rate limit (e.g., after a future billing fix) — pacing stays fixed at the conservative free-tier-safe interval regardless of billing status, since the app has no way to query Voyage's live rate limit.
- No schema migration — `document_chunks.embedding` (`vector(512)`) is already nullable.

## Design

### Database

No migration. `document_chunks.embedding` is already nullable (`alter table document_chunks add column embedding vector(512);`, no `NOT NULL`). Progress for a document is computed as `COUNT(*) FILTER (WHERE embedding IS NOT NULL)` vs. `COUNT(*)` total chunk rows for that `document_id` — no new columns needed.

### API: `POST /api/policies/upload` (modified)

Keeps its existing auth, file validation, text extraction, and `policy_documents` insert (`status: 'processing'`) exactly as today. The change: after chunking the text, insert **all** chunk rows immediately with `embedding: null` (previously chunk rows were only inserted after every embedding was already computed). Returns immediately once chunk rows are inserted — no embedding happens in this request:

```typescript
const chunks = chunkText(text)
const chunkRows = chunks.map((chunk, i) => ({ document_id: doc.id, chunk_text: chunk, chunk_index: i }))
const { error: chunkErr } = await svc.from('document_chunks').insert(chunkRows)
if (chunkErr) {
  await svc.from('policy_documents').update({ status: 'error' }).eq('id', doc.id)
  return NextResponse.json({ error: 'Failed to save document chunks' }, { status: 500 })
}
return NextResponse.json({ success: true, documentId: doc.id, totalChunks: chunks.length })
```

### API: `POST /api/policies/upload/embed-batch` (new)

Body: `{ documentId: string }`. Same HR-only auth as the upload route. Selects up to 20 chunk rows for `documentId` where `embedding IS NULL`, calls the existing `getEmbeddings()` (already has retry-on-429 from the prior fix) on their `chunk_text`, writes each embedding back via an update keyed by chunk `id`. After writing, re-counts remaining `NULL`-embedding rows for that document: if zero, sets `policy_documents.status = 'ready'` and `chunk_count = <total chunks>` in the same call. Returns `{ embedded: number, remaining: number, total: number }`.

If the Voyage call fails for a non-recoverable reason (after `getEmbeddings()`'s internal retries are exhausted), the route sets `policy_documents.status = 'error'` and returns a 500 with the real error message, matching the existing upload route's error-surfacing convention.

### Client: `app/documents/upload/page.tsx`

`UploadState` widens from `'idle' | 'uploading' | 'processing' | 'done' | 'error'` to include `'embedding'`. New state: `embeddedCount`, `totalChunks`.

Flow after a successful `POST /api/policies/upload` response:
1. Store `totalChunks`, set state to `embedding`, `embeddedCount = 0`.
2. Call `POST /api/policies/upload/embed-batch` with the returned `documentId`.
3. On success: add `embedded` to `embeddedCount`. If `remaining > 0`, wait ~22 seconds (comfortably under Voyage's 3/min cap), then repeat step 2. If `remaining === 0`, move to `done`.
4. On failure: move to `error`, show the returned message.

UI: replace the current generic busy spinner (for this new `embedding` state) with a progress bar showing `embeddedCount / totalChunks`, plus a caption: "Large documents can take a few minutes — keep this tab open."

### Error handling

- Chunk-insert failure (Step 1): document marked `error` immediately, matches existing pattern.
- Embedding batch failure (Step 2, after internal retries exhausted): document marked `error` by the route itself; client stops its loop and shows the error.
- Browser tab closed mid-`embedding`: no special handling — document remains `processing` with partial chunks. Documented limitation, not a regression from today's behavior.

### Testing

No automated test convention for these files (consistent with every other sub-project this session). Manual verification, **local only for now** — do not deploy until confirmed working:
1. Run the CMS locally (`npm run dev` in `cms-panel`) against the existing local `.env.local` pointing at the real Supabase project.
2. Re-upload `Employee_Handbook_for_All.pdf` (56 chunks, 3 batches) through the local upload page.
3. Confirm the progress bar advances in ~22-second steps and reaches 56/56 without any billing fix.
4. Confirm the document ends in `status: 'ready'` with the correct `chunk_count`, and that Ask AI can retrieve answers sourced from it afterward.
5. Confirm a small (single-batch) document still uploads correctly and quickly, unaffected by the new pacing.

## Open questions

None — all decisions (client-paced vs. Cron, no schema migration, no resume-on-close, fixed conservative pacing) were resolved during brainstorming.
