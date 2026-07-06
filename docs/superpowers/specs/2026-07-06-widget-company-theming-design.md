# Widget Theming by Company — Design

## Problem

This is sub-project #2 of a larger initiative adding a "Company" dimension across the HR CMS/widget system (see sub-project #1: `2026-07-06-company-master-employee-field-design.md`, which added the `companies` master and a mandatory `employees.company` field). This sub-project makes the Electron employee widget's UI reflect the logged-in employee's company: Modicare Ltd. employees see shades of `#0A80B8`; Colorbar Cosmetics employees see shades of `#CC6002`.

The widget currently has no theme system at all — colors are hardcoded inline (`style={{...}}`) throughout `widget/src/renderer/feed/Feed.tsx` and `widget/src/renderer/popup/Popup.tsx`, all using one fixed teal/cyan palette (`#0d9488`, `#0891b2`, `#5eead4`, `#0f766e`).

## Goals

- The widget's brand-accent colors (primary buttons, active tab, badges, unseen-message dot, poll result bar, bubble background animation) render in shades of the logged-in employee's company color.
- The Feed's dark background gradient gets a subtle hue tint toward the company color (not a bright recolor — it must stay dark and readable).
- The Popup window's already-teal accent elements (badge, action buttons, links) shift the same way; its neutral white/light-gray surfaces are untouched.
- Until the employee's `company` is known (brief startup window, or if ever missing), the UI shows exactly today's teal/cyan values — no flash of wrong color, no broken/uncolored state.

## Non-goals

- Neutral text/background colors (white, grays, `rgba(255,255,255,...)`), error/red colors, and the Microsoft-blue sign-in accent (`#0078d4`) do not change.
- The indigo document-access-level badge (`rgba(99,102,241,...)` / `#a5b4fc`, tagging a document's visibility level) is treated as a semantic content-tag color, not a brand accent — left unchanged.
- No React Context/Provider is introduced — the widget has no such pattern today, and with only two flat renderer entry points (Feed, Popup), a shared utility function is simpler and consistent with the existing all-inline-styles, no-framework convention.
- No new npm dependency for color manipulation — the widget has none today; small self-contained HSL helpers are written directly in the new module.
- CMS-side theming (cms-panel) is out of scope — this sub-project only touches the Electron widget.

## Design

### `widget/src/shared/types.ts`

The `Employee` interface gains a `company: string` field (currently absent — confirmed via exploration; the CMS-side `Employee` type already has this from sub-project #1, but the widget's own copy does not).

### `widget/src/renderer/theme.ts` (new file)

Exports `getTheme(company?: string | null): Theme`, where `Theme` is:

```typescript
export interface Theme {
  primary: string
  primaryGradient: string
  badgeGradient: string
  lightAccentText: string
  bubbleColors: string[]
  bgGradient: string
}
```

Company → base hex mapping:
- `'Modicare Ltd.'` → `#0A80B8`
- `'Colorbar Cosmetics'` → `#CC6002`
- anything else (undefined, null, unrecognized) → `#0d9488` (today's teal — the fallback/loading theme)

Derivation from the base hex, using small self-contained hex↔HSL helpers (`hexToHsl`, `hslToHex`, `lighten`, `darken`, `rgba`) written in this file — no external color library:

- `primary` = the base hex itself
- `primaryGradient` = `` `linear-gradient(135deg, ${base}, ${darken(base, 12)})` `` — replaces every `linear-gradient(135deg,#0d9488,#0891b2)` occurrence (primary buttons, poll-voted bar via a 90deg variant, AI question bubble, passcode button, back button)
- `badgeGradient` = `` `linear-gradient(135deg, ${base}, ${darken(base, 18)})` `` — replaces `linear-gradient(135deg,#0d9488,#0f766e)` (the small circular header/popup badge)
- `lightAccentText` = `lighten(base, 30)` — replaces `#5eead4` (active tab text, unseen-message dot could reuse `primary` instead — see file-by-file mapping below)
- `bubbleColors` = 4 entries, each a radial-gradient string built from `rgba(base, alpha)` at different lightness offsets of the same hue, replacing the current 4-entry teal/cyan/indigo array with a coherent single-hue set:
  ```typescript
  [
    `radial-gradient(circle at 40% 35%, ${rgba(base, 0.60)}, ${rgba(darken(base, 15), 0.25)} 55%, transparent 80%)`,
    `radial-gradient(circle at 40% 35%, ${rgba(lighten(base, 10), 0.55)}, ${rgba(base, 0.20)} 55%, transparent 80%)`,
    `radial-gradient(circle at 40% 35%, ${rgba(lighten(base, 25), 0.50)}, ${rgba(base, 0.20)} 55%, transparent 80%)`,
    `radial-gradient(circle at 40% 35%, ${rgba(darken(base, 10), 0.50)}, ${rgba(lighten(base, 10), 0.20)} 55%, transparent 80%)`,
  ]
  ```
- `bgGradient` = the existing three dark stops (`#0a0f1e`, `#0b2d3d`, `#0a1f2a`), each with its hue nudged toward the base color's hue while keeping their original (very low) lightness/saturation — implemented by taking each stop's HSL, replacing only the hue component with the base's hue, and leaving lightness/saturation as-is. This tints without brightening.

### `widget/src/renderer/feed/Feed.tsx`

- On mount, once `employee` is set (existing `useEffect` at line 187 calling `window.hrWidget.getEmployee()`), compute `const theme = getTheme(employee?.company)`.
- Replace every hardcoded brand-accent literal identified during design exploration with the corresponding `theme.*` field:
  - `BUBBLE_COLORS` array (module-level constant) → becomes `theme.bubbleColors` (moved from a module constant to a per-render value, since it now depends on the logged-in employee)
  - `BG` background gradient constant → `theme.bgGradient`
  - Header badge gradient (`linear-gradient(135deg,#0d9488,#0f766e)`) → `theme.badgeGradient`
  - Active tab underline/text (`#0d9488` / `#5eead4`) → `theme.primary` / `theme.lightAccentText`
  - Unread-count badge pill (`#0d9488`) → `theme.primary`
  - Unread filter button active state (`rgba(13,148,136,0.20)` / `rgba(13,148,136,0.35)` / `#5eead4`) → derived from `theme.primary` via the same `rgba()` helper, and `theme.lightAccentText`
  - Unseen-message dot (`#0d9488`) → `theme.primary`
  - "Open" link text (`#5eead4`) → `theme.lightAccentText`
  - Poll option hover (`rgba(13,148,136,0.20)`) → `rgba(theme.primary, 0.20)`
  - Poll result bar when voted (`linear-gradient(90deg,#0d9488,#0891b2)`) → a 90deg variant built the same way as `primaryGradient`
  - AI Search question bubble, passcode confirm button, announcement-detail back button, update banner, `S.primaryBtn` constant (all `linear-gradient(135deg,#0d9488,#0891b2)`) → `theme.primaryGradient`
- The document-level badge (indigo) and all error/neutral colors are left untouched, per Non-goals.

### `widget/src/renderer/popup/Popup.tsx`

- Both `PollPopup()` and `AnnouncementPopup()` already independently call `window.hrWidget.getEmployee()` on mount — each computes its own `const theme = getTheme(employee?.company)` the same way.
- Replace the MC badge gradient, "Vote Now" button, "more unread" link color, and "Dismiss" button (all currently `#0d9488`/`linear-gradient(135deg,#0d9488,#0891b2)`/`linear-gradient(135deg,#0d9488,#0f766e)`) with the corresponding `theme.*` fields.
- The light background (`#ffffff`, `#f8fafc`) and neutral text colors (`#475569`, `#94a3b8`) are untouched.

### Error handling

None needed beyond the existing fallback: `getTheme()` never throws — an unrecognized/missing `company` value simply resolves to the teal fallback theme, same as the "not yet loaded" case. No new error states are introduced anywhere in the app.

### Testing

- `widget/__tests__/theme.test.ts` (new, following the existing `__tests__/*.test.ts` convention used by `auth-store.test.ts`/`seen-store.test.ts`): unit tests for `getTheme()` as a pure function — assert Modicare returns `primary === '#0A80B8'`, Colorbar returns `primary === '#CC6002'`, unknown/undefined company returns the teal fallback (`primary === '#0d9488'`), and that `bubbleColors` has exactly 4 entries and `primaryGradient`/`badgeGradient`/`bgGradient` are non-empty strings containing `base` as a substring.
- `Feed.tsx` and `Popup.tsx` have no existing test files — wiring `getTheme()` into them is verified manually by running the Electron widget as different employees (one Modicare, one Colorbar) and visually confirming the theme switch, consistent with how this repo already handles renderer-level verification (no test convention exists for these files today).

## Open questions

None — all decisions (fallback theme, recolor scope including background tint and Popup accents, architecture as a shared utility function rather than Context, and the indigo document-badge staying unchanged) were resolved during brainstorming.
