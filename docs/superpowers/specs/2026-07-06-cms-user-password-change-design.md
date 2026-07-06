# CMS User Password Change — Design

## Problem

The CMS Users admin page (`/admin/users`) can create new HR admin accounts but has no way to change an existing user's password. If a CMS user forgets their password, there is currently no in-app recovery path — someone would have to go into the Supabase dashboard directly.

## Goals

- Let any logged-in CMS/HR admin change the password of any user listed on the CMS Users page (matches the existing permission model, where membership in `hr_users` is the only access check — see `Add CMS User`, which already has no extra role gate).
- Reuse existing UI/API conventions in `cms-panel` rather than introducing new patterns.

## Non-goals

- Self-service "forgot password" flow (no email, no reset link).
- Password confirmation field (single input, per user preference — matches the existing create-user form).
- Role/permission tiers beyond "member of `hr_users`".
- Audit logging of password changes.

## Design

### Backend: `PATCH /api/admin/users/[id]/password`

New route file: `cms-panel/app/api/admin/users/[id]/password/route.ts`.

Mirrors the existing `POST /api/admin/users` route (`cms-panel/app/api/admin/users/route.ts`):

1. Get the current session via `createClient()` / `supabase.auth.getUser()`. If no user, return 401.
2. Parse `{ password }` from the request body. If missing or shorter than 6 characters, return 400.
3. Build a service-role client (`createServiceClient` with `SUPABASE_SERVICE_ROLE_KEY`).
4. Call `adminSupabase.auth.admin.updateUserById(id, { password })`.
5. On Supabase error, return 500 with the error message. On success, return `{ ok: true }`.

The `id` param is the target user's `auth.users` id, which is the same id used as the primary key in `hr_users` (per the existing schema — `hr_users.id references auth.users(id)`).

### Frontend: Users table + modal

File: `cms-panel/app/admin/users/client.tsx`.

- Add a "Change Password" button/link in each row of the existing users table (next to Name/Email columns).
- Clicking it opens a modal, following the existing modal convention used elsewhere in the app (fixed-position overlay, `rgba(0,0,0,0.60)` backdrop, glassmorphic card, dismiss on backdrop click or Escape).
- Modal contents:
  - Heading identifying which user ("Change password for {name}").
  - Single password input (same `inputStyle` as `CmsUserForm.tsx`), client-side min-length-6 validation.
  - Submit button with loading spinner state (same pattern as `CmsUserForm`'s create button).
  - Inline color-coded error/success message area (same pattern as `CmsUserForm`).
- On submit: `PATCH /api/admin/users/{id}/password` with `{ password }`.
  - Success: show inline success message, then close the modal after a short delay (or on next interaction — match whatever `CmsUserForm` currently does after a successful create).
  - Error: show inline error inside the modal, keep it open so the admin can retry without re-entering navigation.
  - 401: redirect to `/login`, consistent with existing page-level auth handling.

### Data flow

Admin clicks "Change Password" on a row → modal opens with that user's id/name in local state → admin types new password → submit → `PATCH /api/admin/users/{id}/password` → server validates session + password length → server calls Supabase Admin API → response bubbles back to modal → success/error shown → modal closes on success.

### Error handling

- Client-side: block submit if password is empty or under 6 characters (mirrors `CmsUserForm`).
- Server-side: same length check (defense in depth), 401 if unauthenticated, 500 with Supabase's error message on failure (e.g. transient Supabase outage).
- No partial-failure state to worry about — this is a single Supabase Admin API call, no secondary DB write (unlike user creation, which also inserts into `hr_users`).

### Testing

- Manual: change a test user's password via the modal, confirm the old password fails at `/login` and the new one succeeds.
- Optional (not required for this change): an e2e spec under `cms-panel/e2e/`, following the existing `auth.setup.ts` pattern, exercising the change-password modal end to end.

## Open questions

None — all prior open questions (who can trigger it, typed vs. generated password, modal vs. inline, single vs. confirm field) were resolved during brainstorming:
- Any HR admin can change any user's password.
- Admin types the new password directly.
- Modal per row (not inline row expansion).
- Single password field, no confirm field.
