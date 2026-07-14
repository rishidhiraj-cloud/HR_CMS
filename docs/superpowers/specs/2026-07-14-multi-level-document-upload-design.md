# Multi-Level Document Upload — Design

## Problem

The Documents upload form (`cms-panel/app/documents/upload/page.tsx`) lets HR pick exactly one level (or leave it blank for "everyone") via a single `<select>`. When the same policy applies to several levels — e.g. both "Manager" and "AGM" need to see the "Travel Policy" — HR currently has to run the entire upload flow separately for each level: pick the file, wait for OCR (if scanned), wait for embedding, then repeat from scratch for the next level. This is tedious and error-prone for a document that's identical across levels.

## Goals

- Let HR select one, several, or all levels in a single upload action for the same file.
- Each selected level still produces its own independent, fully-formed `policy_documents` row — identical in shape to what a manual single-level upload produces today.
- No backend, schema, or RLS changes. The upload/OCR/embed pipeline that was just stabilized stays untouched; this is a client-side UI change only.

## Non-goals

- No document-editing-after-upload feature. Levels are still chosen only at upload time, matching today.
- No changes to Polls, Messages, or any other feature's targeting logic — this is scoped to the Documents upload form only.
- No deduplication of OCR/chunking/embedding work across the per-level uploads. Each level runs the full pipeline independently, exactly as a manual repeat upload does today. This trades some redundant compute for zero backend risk.
- No parallel/concurrent per-level uploads — sequential only, to avoid overloading the existing OCR/embedding pacing and Vercel's concurrency.

## Design

### A. Level selection UI

Replace the current single `<select>` "Visible To" control with:
- An "All Levels (everyone)" checkbox/toggle at the top.
- A checkbox list of individual levels below it, populated from the same `levels` table query already used today.
- The two are mutually exclusive: checking "All Levels" clears any individually-checked levels and disables the individual checkboxes; checking any individual level unchecks "All Levels".
- At least one selection (either "All Levels" or ≥1 individual level) is required before the Upload button is enabled — matching today's existing `disabled={!file || !name.trim() || !company || busy}` pattern, extended with a level-selection check.

### B. Submit flow

On submit, branch on the selection:

- **"All Levels" selected**: call the existing upload flow exactly once, with the level field empty — byte-for-byte identical to today's "leave the dropdown blank" behavior (`target_level` ends up `NULL`).
- **One or more specific levels selected**: loop through the selected levels **sequentially** (never in parallel). For each level, call the exact same existing upload → (OCR if needed) → embed pipeline that a single-level upload already uses today, reusing the same file bytes, document name, and company each time, varying only the level field. Each iteration is a fully independent run of today's flow, including its own `POST /api/policies/upload` call and its own paced OCR-batch/embed-batch polling loop if needed.

The UI shows an overall progress indicator ("Level 2 of 3: Manager") with the existing per-document phase progress (uploading → processing → OCR page X of Y → embedding chunk X of Y) nested underneath it, reusing the exact same visual components that already render for a single upload today.

### C. Result summary & error handling

Per the earlier decision: a failure on one level does not stop the batch. The loop continues to the next level regardless of whether the current one succeeded or failed, and each outcome (success, or the specific error message) is recorded per level.

Once the loop finishes (whether all-success or partial-failure), show a per-level summary list — one line per selected level, each with a success checkmark or the error message for that level — instead of the current single pass/fail message. This means a partial failure only requires retrying the specific failed level(s), not restarting the whole batch. The existing "Upload Another" reset action remains, now resetting the full multi-level selection state too.

### D. Data/backend impact

None. `policy_documents`, `document_chunks`, `document_ocr_pages`, all RLS policies, and all three upload API routes (`/api/policies/upload`, `/api/policies/upload/ocr-batch`, `/api/policies/upload/embed-batch`) are completely unmodified. Each level in a batch produces its own independent `policy_documents` row with a single `target_level`, exactly matching today's schema and semantics — nothing about how documents are filtered/matched for employees changes.

### Testing

Manual verification, matching this project's established testing posture for this area:
1. Upload a normal (non-scanned) PDF with "All Levels" selected — confirm exactly one document row is created with `target_level = NULL`, and behavior is identical to today's single-upload flow.
2. Upload a normal PDF with 3 specific levels selected — confirm 3 separate `policy_documents` rows are created, each with the correct single `target_level`, each fully chunked and embedded (`status: ready`).
3. Upload a scanned (OCR-needed) PDF with 2 specific levels selected — confirm the OCR progress bar and embedding progress bar both render correctly for each level in sequence, and both resulting documents reach `status: ready` with accurate OCR'd text.
4. Simulate a mid-batch failure (e.g. by disconnecting network mid-way, or reviewing the code path directly) and confirm the batch continues through the remaining levels and the final summary correctly reflects which level(s) failed.
5. Confirm the Upload button stays disabled until at least one level (or "All Levels") is selected, alongside the existing file/name/company requirements.

## Open questions

None — all decisions (client-side loop over the existing single-upload flow vs. a new batch endpoint vs. deduplicated backend work; "All Levels" as a distinct, mutually-exclusive option; continue-and-summarize vs. stop-on-first-failure) were resolved during brainstorming.
