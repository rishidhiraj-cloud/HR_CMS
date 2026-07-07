# Quick Links — Design

## Problem

HR wants a way to publish a curated list of company portals and mobile apps (e.g., "Employee Self-Service", "Field Force App") that employees can find in the widget, each scoped to the employee's own company. Today there's no such module — the closest analogs are Documents (company + level scoping) and Messages/Polls (company targeting), but Quick Links needs neither a level dimension nor a targeting-mode toggle: every link belongs to exactly one company, always.

This also folds in a widget IA change: the "Ask AI" tab (currently top-level, next to "Policies") moves inside the Policies tab as its own section, and "Quick Links" becomes the new 4th top-level tab.

## Goals

- HR can create, edit, and delete Quick Links via a new CMS page, each with a mandatory Company, a Portal Name, a Purpose, a Type (Website or Mobile App), and a How-to-Use note.
- Website-type links carry a URL; Mobile-App-type links carry an Android App URL and/or an iOS App URL (at least one required) instead of a plain URL.
- Employees see only the Quick Links belonging to their own company, in a new "Quick Links" widget tab.
- Website links show an "Open" action that launches the URL in the system's default browser. Mobile-App links show "Copy Android link" / "Copy iOS link" actions (only for whichever URL is actually set) that copy the link to the clipboard, so the employee can send it to their phone.
- Each link shows an "i" info icon that reveals Purpose and How-to-Use in a popover.
- The widget's Policies tab absorbs the existing Ask AI tab as a section (Ask AI content first, then the document list below it, in one continuous scroll) — Ask AI is no longer a separate top-level tab.

## Non-goals

- No "All Companies" option for Quick Links — company is always mandatory, matching Documents' precedent, not Messages/Polls' targeting-mode pattern.
- No Level/role scoping on Quick Links — this feature has exactly one scoping dimension (company).
- No change to Ask AI's underlying company+level RLS-backed search logic — only where its UI lives changes.
- No sub-tab/switcher inside the widget's Policies tab — confirmed during brainstorming: it's one continuous scroll, Ask AI first, then the document list, not a toggle between two views.
- No character-limit enforcement or rich text on Purpose/How-to-Use — plain free text, same as other free-text fields in this codebase (e.g., `policy_documents.name`).
- No DB-level CHECK constraint cross-validating type against which URL fields are populated — that validation lives in the API route (application layer), matching how conditional-field logic is already handled elsewhere in this codebase (e.g., `target_level` nullability) rather than a complex multi-column CHECK.

## Design

### Database (new migration)

```sql
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

`url` is required (application-layer) when `type = 'website'`; `android_app_url`/`ios_app_url` are used (at least one required) when `type = 'mobile_app'`. For a Mobile App link, `url` stays unset — Type fully replaces the plain URL field with the two app-store links, it doesn't add to it.

### CMS: navigation

New nav item "Quick Links" in `AppLayout.tsx`'s `navItems` array (inline SVG icon, matching the existing style), placed after "Documents".

### CMS: list page (`app/quick-links/page.tsx` + `QuickLinksClient.tsx`)

Mirrors the Documents page pattern:
- Server component fetches `hrUser`, all `quick_links` rows, and `companies` (for the filter dropdown) via `Promise.all`.
- Client component renders a table (Portal Name, Company, Type, Purpose, Actions) with a Company filter dropdown and a name search box, following `DocumentsClient.tsx`'s exact filter-bar/table conventions.
- Edit via an inline modal (same shape as Documents' Edit modal): Company, Portal Name, Purpose, Type (switching Type toggles which URL field(s) show, mirroring the create form), How to Use.
- Delete via the same confirm-dialog pattern already used for Documents.

### CMS: create page (`app/quick-links/new/page.tsx`)

A form page mirroring the structure (not the file-upload mechanics) of `app/documents/upload/page.tsx`: Company dropdown (required, no empty option) → Portal Name → Purpose → Type dropdown (Website / Mobile App) → conditionally, URL (Website) or Android App URL + iOS App URL (Mobile App, at least one required) → How to Use. Submit disabled until all currently-relevant required fields are filled.

### CMS: API routes

- `GET/POST /api/quick-links` — list all (HR-only) / create (HR-only). POST validates: company, portal_name, purpose, how_to_use, type all present; if `type === 'website'`, url required; if `type === 'mobile_app'`, at least one of android_app_url/ios_app_url required.
- `PATCH/DELETE /api/quick-links/[id]` — update (same validation as POST) / delete. HR-only.
- `GET /api/quick-links/active` — widget-facing, company-scoped. Same auth pattern as `/api/documents` (Bearer token or X-Employee-Id header, employee lookup for `company`, fails closed to `[]` if company can't be resolved).

### Widget: merged Policies tab (`Feed.tsx`)

The "ASK AI" top-level tab is removed from the tab bar. The "Policies" tab's content becomes one continuous scrolling section: the existing Ask AI chat UI first, then the existing document list below it — both keep their current internal behavior and data untouched, only their position/composition changes. No sub-switcher.

### Widget: new Quick Links tab (`Feed.tsx`)

New top-level tab "🔗 QUICK LINKS", placed last (after Polls). Fetches via a new `quickLinks:getAll` IPC call → `GET /api/quick-links/active`, following the exact request/auth shape `documents:getAll` already uses.

Each link renders as a card:
- **Portal Name in bold**, with a small Type badge, and **Purpose in normal weight** below it.
- An **"i" info icon** that opens a small popover directly beneath it, showing "Purpose" and "How to Use" (matches the approved mockup — Option A from brainstorming).
- Action area on the right:
  - Website: **"Open ↗"** button. The implementation plan should first check whether the existing `documents:openUrl` IPC handler (`main/index.ts`) is generic (just `shell.openExternal(url)` with no document-specific logic) — if so, reuse it directly for Quick Links instead of adding a duplicate channel; otherwise add `quickLinks:openUrl` following the identical pattern.
  - Mobile App: **"📋 Copy Android link"** shown only if `android_app_url` is set; **"📋 Copy iOS link"** shown only if `ios_app_url` is set. A new `quickLinks:copyToClipboard` IPC handler uses Electron's `clipboard.writeText()` (new capability — nothing existing to reuse). Clicking briefly flips the button label to "Copied!" (~1.5s) as confirmation.

Empty state (no company-scoped links yet) matches the existing convention: an icon + short message, like Documents' "📂 No documents yet" and Polls' "📊" empty states.

`widget/src/shared/types.ts` gains a `QuickLink` interface: `{ id, company, portal_name, purpose, how_to_use, type: 'website' | 'mobile_app', url: string | null, android_app_url: string | null, ios_app_url: string | null }`.

### Error handling

- CMS create/edit: required-field validation returns 400 with a clear message, matching the Documents upload route's pattern. URL-shaped fields get basic client-side format hints (not strictly enforced server-side), matching how other free-text URL fields already work in this codebase.
- `/api/quick-links/active`: fails closed (empty array) if the caller's company can't be resolved — same convention as `/api/documents`.
- Clipboard copy: if it fails (rare), show a brief inline error rather than crashing; no retry logic needed.

### Testing

Same posture as every other sub-project this session — no automated test convention for these CMS pages or the widget's tab/IPC code. Manual verification:
1. Create a Website Quick Link for Colorbar Cosmetics; confirm a Colorbar employee sees it in the widget's Quick Links tab and "Open" launches it in the default browser.
2. Confirm a Modicare employee does NOT see that link.
3. Create a Mobile-App Quick Link with only an Android URL set; confirm only "Copy Android link" appears (no iOS button, no generic Open button).
4. Click "Copy Android link"; confirm the URL lands on the system clipboard and the button briefly shows "Copied!".
5. Click the "i" icon; confirm the popover shows the correct Purpose and How-to-Use text.
6. Confirm the Policies tab shows Ask AI at the top and the document list below it, in one scroll, and that Ask AI still answers questions correctly (company+level scoping unchanged).
7. Edit an existing Quick Link's Company via the CMS Edit modal; confirm it moves to the new company's employees and disappears for the old company's employees.
8. Delete a Quick Link; confirm it disappears from the widget.

## Open questions

None — all decisions (company mandatory, Mobile App replaces URL with Android/iOS links, at-least-one-required, popover info style, Policies tab as one continuous scroll with Ask AI first) were resolved during brainstorming, including one revision (Policies layout, initially proposed as a sub-switcher, corrected to continuous scroll per your feedback).
