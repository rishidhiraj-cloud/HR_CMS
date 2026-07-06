# Announcement Targeting by Company — Design

## Problem

This is sub-project #3 of the larger Company initiative (see sub-project #1: Company master + employee field; sub-project #2: widget theming). HR currently targets an announcement at "All Employees", "By Department", or "By Role". This sub-project adds a 4th option: "By Company", so HR can send an announcement to only Modicare Ltd. employees or only Colorbar Cosmetics employees.

## Goals

- HR can create/edit an announcement targeted at a specific company via a 4th pill button + dropdown in `MessageForm.tsx`, following the exact existing Department/Role pattern.
- Company-targeted announcements are correctly scoped both at the database level (RLS) and in the widget's client-side filtering, so an employee only sees announcements meant for their company (or `all`/matching-department/matching-role, as today).
- Existing announcements and targeting modes are completely unaffected.

## Non-goals

- No changes to delivery/scheduling logic (Send Now / Schedule), Message CRUD API shape, or the `MessageTable`/`Feed.tsx` display formatting — confirmed during brainstorming that raw target-value display (no "Company:" prefix) already works with zero code changes, since both already fall through to displaying `target_value` for any non-`'all'` type.
- No combined/multi-dimension targeting (e.g. "Department X within Company Y") — company is a targeting mode on its own, exactly parallel to department/role, not a filter layered on top of them.

## Design

### Database (new migration, `supabase/migrations/016_message_company_targeting.sql`)

`001_schema.sql` is already applied, so this is an `ALTER`/`DROP...CREATE` migration, not an edit to the original file:

```sql
-- Widen target_type to allow 'company'
ALTER TABLE messages DROP CONSTRAINT messages_target_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_target_type_check
  CHECK (target_type IN ('all', 'dept', 'role', 'company'));

-- Widen the employee-read RLS policy to include company targeting
DROP POLICY "messages: employee read" ON messages;
CREATE POLICY "messages: employee read" ON messages
  FOR SELECT USING (
    published_at IS NOT NULL
    AND (
      target_type = 'all'
      OR (target_type = 'dept' AND target_value = (SELECT department FROM employees WHERE id = auth.uid()))
      OR (target_type = 'role' AND target_value = (SELECT role FROM employees WHERE id = auth.uid()))
      OR (target_type = 'company' AND target_value = (SELECT company FROM employees WHERE id = auth.uid()))
    )
  );
```

(The exact constraint name `messages_target_type_check` needs confirming against the live schema before the migration is finalized in the implementation plan — Postgres auto-generates constraint names unless explicitly named, so the plan will verify the actual name.)

### Types

`TargetType` widens from `'all' | 'dept' | 'role'` to `'all' | 'dept' | 'role' | 'company'` in both `cms-panel/lib/types.ts` and `widget/src/shared/types.ts`.

### CMS: `MessageForm.tsx`

- The pill-button row (currently mapping over `['all', 'dept', 'role']`) becomes `['all', 'dept', 'role', 'company']`, with label `t === 'company' ? 'By Company' : ...` added to the existing ternary chain.
- A new conditional block, shown when `targetType === 'company'`, renders a `<select>` sourced from a new `companies?: string[]` prop — styled identically to the Department/Role dropdowns, including the "No companies — add in Masters" empty-state option.
- No validation changes: the existing `targetType !== 'all' && !targetValue.trim()` check already generically covers `'company'`.
- `Props` interface gains `companies?: string[]` (optional, defaulting to `[]`, matching `departments`/`levels`'s existing optional pattern).

### CMS: page-level wiring

`app/messages/new/page.tsx` and `app/messages/[id]/page.tsx` both add a third parallel fetch (`supabase.from('companies').select('name').order('name')`) alongside the existing `departments`/`levels` fetches, and pass `companies={(companies ?? []).map(c => c.name)}` to `MessageForm` — identical to how `departments`/`levels` already flow.

### Widget: `widget/src/main/index.ts`

`isTargetedAtEmployee()` gains a 4th branch:

```typescript
if (msg.target_type === 'company') return msg.target_value === emp.company
```

placed alongside the existing `dept`/`role` branches, before the final `return false`.

### No changes needed (confirmed during brainstorming)

- `MessageTable.tsx`'s `TargetLabel` already renders raw `target_value` for any type other than `'all'` — "Modicare Ltd." will display correctly with zero changes.
- `Feed.tsx`'s two display-text locations (`msg.target_type === 'all' ? 'All Employees' : msg.target_value`) already fall through to the raw value the same way.

### Error handling

No new error paths. Company-targeted messages follow the exact same validation/RLS/constraint shape as department/role targeting today — if something is malformed, it fails the same way (client-side "Please specify a target value", or a DB constraint violation on direct misuse).

### Testing

`MessageForm.tsx` has no existing test file (confirmed — no test convention for this component in this codebase). This sub-project follows that established convention: verified via typecheck plus manual testing —
1. Create a company-targeted announcement for "Colorbar Cosmetics" in the CMS.
2. Confirm it appears in the widget Feed for a Colorbar employee.
3. Confirm it does NOT appear for a Modicare employee.
4. Confirm existing `all`/`dept`/`role`-targeted announcements are unaffected for all employees.

## Open questions

None — the one real design decision (raw value display vs. a "Company:" prefix) was resolved during brainstorming: raw value everywhere, matching existing Department/Role display exactly, requiring zero display-code changes.
