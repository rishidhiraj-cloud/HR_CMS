# Poll Targeting by Company — Design

## Problem

This is sub-project #4 of the larger Company initiative (sub-project #1: Company master + employee field; #2: widget theming; #3: announcement targeting by company, just shipped). HR currently targets a poll at "All Employees" or a "Specific Level". This sub-project adds a 3rd option: "By Company", mirroring the just-shipped Messages company-targeting feature but adapted to Polls' 2-mode system and its two independent (non-shared) eligibility-filtering call sites.

## Goals

- HR can create a poll targeted at a specific company via a 3rd pill button + dropdown in `app/polls/create/page.tsx`, following the exact existing "Specific Level" pattern.
- Company-targeted polls are correctly scoped at every layer that currently handles `level` targeting: the RLS policy, the widget's active-polls fetch (`GET /api/polls/active`), and the widget's real-time push-notification eligibility check (`handleRealtimePoll`).
- Existing polls and targeting modes (`all`/`level`) are completely unaffected.

## Non-goals

- No CHECK constraint change — unlike `messages`, the `polls` table has no `target_type` CHECK constraint today, so this migration only touches the RLS policy.
- No changes to `PollsClient.tsx`'s admin display — its `levelName()` helper already falls through to the raw `target_value` for any non-null value, so "Colorbar Cosmetics" displays correctly with zero changes (confirmed during brainstorming, same situation as Messages' `TargetLabel`).
- No shared `isPollTargetedAtEmployee()`-style helper — Polls' two eligibility-filter call sites (`GET /api/polls/active` and `handleRealtimePoll`) are independent inline checks today, not consolidated like Messages' `isTargetedAtEmployee()`. This sub-project adds the company branch to each in its own existing style rather than introducing a new shared abstraction (that would be unrequested refactoring).
- No typed `PollTargetType` union — `Poll.target_type` stays a plain `string` in the widget, per explicit choice during brainstorming.
- No changes to voting logic (`POST /api/polls/[id]/vote`) — voting doesn't check targeting eligibility today (relies entirely on RLS to prevent an ineligible employee from ever seeing the poll to vote on), and that's unchanged.

## Design

### Database (new migration)

`polls` has no `target_type` CHECK constraint, so only the RLS policy needs widening:

```sql
DROP POLICY "employees_read_polls" ON polls;
CREATE POLICY "employees_read_polls" ON polls
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND (
      target_type = 'all'
      OR (target_type = 'level' AND target_value = (SELECT role FROM employees WHERE id = auth.uid()))
      OR (target_type = 'company' AND target_value = (SELECT company FROM employees WHERE id = auth.uid()))
    )
  );
```

### CMS: `app/polls/create/page.tsx`

- `companies` state (`useState<Company[]>([])`), fetched client-side in a `useEffect` via `getBrowserClient().from('companies').select('id, name').order('name')` — mirroring exactly how `levels` is already fetched in this same client component (this page fetches its own dropdown data client-side, unlike Messages which received `departments`/`levels` as server-fetched props — different existing convention per page, followed as-is).
- `targetType` widens from `useState<'all' | 'level'>('all')` to `useState<'all' | 'level' | 'company'>('all')`.
- Pill button array becomes `['all', 'level', 'company'] as const`, with label `t === 'all' ? '👥 All Employees' : t === 'level' ? '🎯 Specific Level' : '🏢 By Company'`.
- A new conditional `<select>`, shown when `targetType === 'company'`, sourced from `companies` — same `inputStyle`, same "Select …" placeholder pattern as the level dropdown.
- Submit payload: `target_value: targetType !== 'all' ? targetValue : null` (widening the existing `targetType === 'level' ? targetValue : null` ternary to cover both non-"all" modes generically).
- Submit-button disabled condition widens from `(targetType === 'level' && !targetValue)` to `(targetType !== 'all' && !targetValue)` — same generalization.

### Widget: `GET /api/polls/active` (`cms-panel/app/api/polls/active/route.ts`)

Both auth branches (`token` and `X-Employee-Id`) currently `.select('role')` on the employee; both widen to `.select('role, company')`, introducing an `employeeCompany` variable alongside the existing `employeeRole`. The filter predicate widens from:

```typescript
p.target_type === 'all' ||
(p.target_type === 'level' && p.target_value === employeeRole)
```

to:

```typescript
p.target_type === 'all' ||
(p.target_type === 'level' && p.target_value === employeeRole) ||
(p.target_type === 'company' && p.target_value === employeeCompany)
```

### Widget: `handleRealtimePoll()` (`widget/src/main/index.ts`)

The eligibility check widens from:

```typescript
if (poll.target_type !== 'all' && !(poll.target_type === 'level' && poll.target_value === currentEmployee.role)) return
```

to a form that also accepts company-matching, following the existing single-line style (exact code finalized in the implementation plan).

### Error handling

No new error paths — company-targeted polls follow the exact same validation/RLS shape as level-targeted polls today.

### Testing

Same posture as prior sub-projects: no automated test convention exists for `app/polls/create/page.tsx` or the widget's poll-handling code. Verified via typecheck plus manual testing:
1. Create a company-targeted poll for "Colorbar Cosmetics".
2. Confirm it appears (and is votable) for a Colorbar employee via the normal widget poll fetch.
3. Confirm it does NOT appear for a Modicare employee.
4. Confirm a real-time-pushed company-targeted poll correctly triggers (or doesn't trigger) the popup notification for matching/non-matching employees.
5. Confirm existing `all`/`level`-targeted polls are unaffected.

## Open questions

None — both open decisions (pill emoji, typed union vs. plain string) were resolved during brainstorming.
