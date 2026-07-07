# Document Company + Level Scoping — Design

## Problem

This is sub-project #5, the final piece of the Company initiative (sub-project #1: Company master + employee field; #2: widget theming; #3: announcement targeting; #4: poll targeting). Documents currently have an optional "Visible To" Level restriction (`target_level`, nullable = visible to all levels). This sub-project adds a **mandatory** Company scope, so every document belongs to exactly one company, and an employee can only view it — or get Ask-AI answers sourced from it — if it matches both their company (always) and their level (when the document restricts by level).

## Goals

- Every document upload requires selecting a company (no "all companies" option).
- HR can edit a document's company later, the same way Level is already editable.
- The employee-facing RLS policy, the widget's `/api/documents` fetch, and the Ask AI semantic search (`match_document_chunks()` + `/api/policies/ask`) all correctly enforce: visible/searchable only if `document.company === employee.company` AND (`document.target_level IS NULL` OR `document.target_level === employee.role`).
- Existing documents are backfilled to `'Modicare Ltd.'` so the column can become `NOT NULL` immediately (matching the `employees.company` precedent from sub-project #1).

## Non-goals

- No new document search UI in the widget — confirmed during brainstorming that "search for it" refers to the existing Ask AI semantic-search tab (`match_document_chunks()`), not a new search box. No changes to `Feed.tsx`'s Documents-tab list rendering beyond what's already needed (none — it doesn't need a company badge, matching the "no UI display needed" precedent from targeting features).
- Company is a hard, always-enforced gate — unlike Messages/Polls' single-mode targeting (all/dept/role/company as mutually exclusive alternatives), Documents' company and level are two independent, simultaneously-applied filters. This is intentionally different from the targeting-mode pattern used elsewhere in this initiative, not an inconsistency.
- No changes to document upload's file-processing/chunking pipeline beyond passing through the new `company` field alongside existing fields.

## Design

### Database (new migration)

```sql
ALTER TABLE policy_documents ADD COLUMN company TEXT;
UPDATE policy_documents SET company = 'Modicare Ltd.' WHERE company IS NULL;
ALTER TABLE policy_documents ALTER COLUMN company SET NOT NULL;

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

The `employee_company IS NULL` branch preserves the existing HR-sees-everything behavior (HR callers aren't in the `employees` table, so their lookup returns `null` for both level and company — same convention already used for level, extended consistently to company). Documents themselves are never company-`NULL` (mandatory), so — unlike level — there's no `pd.company IS NULL` branch needed on the document side.

### CMS: `app/documents/upload/page.tsx`

- New `companies` state, fetched client-side the same way `levels` already is: `getBrowserClient().from('companies').select('id, name').order('name')`.
- A new mandatory Company `<select>` (no empty/"all" option — always required, `required` attribute set), positioned before the existing Level dropdown.
- Upload submit requires a company selection before allowing submit (client-side validation, matching the pattern of the file/name required checks already present).
- `formData.append('company', company)` added to the existing multipart submission.

### CMS: `app/api/policies/upload/route.ts`

- Extracts `company` from the form data; returns 400 if missing (extending the existing `if (!file || !name)` check to also require `company`).
- Insert statement adds `company` to the `.insert({...})` call.

### CMS: `DocumentsClient.tsx` (admin list + edit modal)

- `PolicyDocument` interface gains `company: string`.
- Edit modal gains a Company `<select>` alongside the existing Level `<select>`, following the identical styling/pattern, editable (per your confirmation).
- `handleSaveEdit()`'s PATCH body includes `company`.
- No change to the table's badge display — confirmed out of scope, matching the "no company badge needed" decision.

### CMS: `app/api/documents/[id]/route.ts` (PATCH)

Accepts and updates `company` alongside the existing `name`/`target_level` handling.

### CMS: `app/api/documents/route.ts` (GET — powers the widget's document list)

- Employee lookup widens from `.select('role')` to `.select('role, company')` in both auth branches (Bearer token and X-Employee-Id), introducing an `employeeCompany` variable.
- Filter logic changes from level-only (`target_level.is.null,target_level.eq.${employeeRole}` OR-clause) to a combined company-AND-level filter: company must always match; level matches the existing OR/null pattern. Since Supabase's query builder doesn't cleanly express this exact AND-of-OR shape via chained `.or()`, the implementation plan will finalize whether this is done via a `.eq('company', employeeCompany)` combined with the existing `.or(...)` for level, or via post-fetch filtering in JS (both are equivalent; the plan picks the one that best matches this route's existing style).

### CMS: `app/api/policies/ask/route.ts` (Ask AI)

- Employee lookup widens from `.select('role')` to `.select('role, company')` in both auth branches, introducing an `employeeCompany` variable (mirroring the existing `employeeLevel` pattern exactly).
- The `match_document_chunks` RPC call adds `employee_company: employeeCompany` to its params object.

### Widget: `widget/src/shared/types.ts`

`HrDocument` gains `company: string`, matching how `target_level` is already present (even though the widget UI doesn't display it, for type-completeness with the data actually returned by `/api/documents`).

### Error handling

No new error classes. Missing company on upload follows the same 400-response pattern as missing file/name. All filtering (RLS, `/api/documents`, `/api/policies/ask`) fails closed — a caller with no matching company/level sees/retrieves nothing, never an error.

### Testing

Same posture as prior sub-projects — no automated test convention for these files. Manual verification:
1. Upload a document with Company = "Colorbar Cosmetics" and no level restriction.
2. Confirm a Colorbar employee sees it in the widget's Documents tab.
3. Confirm a Modicare employee does NOT see it.
4. Ask the AI a question whose answer only exists in that document — confirm a Colorbar employee gets an answer sourced from it, and a Modicare employee does not.
5. Repeat with a level restriction added, confirming both company and level must match for visibility/search.
6. Confirm HR (CMS-side) continues to see and manage all documents regardless of company.

## Open questions

None — all three decisions (search = Ask AI not new UI, company editable in the edit modal, backfill to Modicare Ltd.) were resolved during brainstorming.
