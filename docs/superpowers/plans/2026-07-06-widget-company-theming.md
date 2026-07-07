# Widget Company Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Electron employee widget's brand-accent colors and background match the logged-in employee's company (Modicare Ltd. → shades of `#0A80B8`, Colorbar Cosmetics → shades of `#CC6002`), replacing the single hardcoded teal/cyan palette used today.

**Architecture:** A new pure-function module `widget/src/renderer/theme.ts` derives a full color palette from one base hex per company using small self-contained HSL helpers (no new dependency). `Feed.tsx` and `Popup.tsx` each compute `getTheme(employee?.company)` once they have the employee object and reference the returned palette instead of hardcoded hex/rgba literals.

**Tech Stack:** Electron + React 19 (Vite-built renderer), TypeScript, Jest + ts-jest (existing `__tests__/*.test.ts` convention, `@/` path alias → `src/`).

## Global Constraints

- Company → base hex: `'Modicare Ltd.'` → `#0A80B8`, `'Colorbar Cosmetics'` → `#CC6002`, anything else (undefined/null/unrecognized) → `#0d9488` (today's teal — the loading/fallback theme).
- Only brand-accent colors and the Feed's dark background gradient shift with theme. Neutral text/backgrounds (white, grays), error/red colors, the Microsoft-blue sign-in accent (`#0078d4`, `rgba(0,120,210,...)`), and the indigo document-access-level badge (`rgba(99,102,241,...)` / `#a5b4fc`) are left completely unchanged.
- No React Context/Provider — use a plain function `getTheme()`, matching the widget's existing no-framework, all-inline-styles convention.
- No new npm dependency for color math — self-contained hex↔HSL helpers only.
- The background hue-tint keeps each original dark stop's saturation and lightness, only swapping in the company's hue — a subtle tint, not a bright recolor.

---

### Task 1: `theme.ts` module + widget `Employee` type

**Files:**
- Modify: `widget/src/shared/types.ts:14-22` (the `Employee` interface)
- Create: `widget/src/renderer/theme.ts`
- Test: `widget/__tests__/theme.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export interface Theme { primary: string; primaryGradient: string; primaryGradientHorizontal: string; badgeGradient: string; lightAccentText: string; bubbleColors: string[]; bgGradient: string }`, `export function getTheme(company?: string | null): Theme`, and a reusable helper also exported from this file: `export function rgba(hex: string, alpha: number): string`. Task 2 imports `getTheme` and `rgba` from `'../theme'` (relative to `feed/`, i.e. `widget/src/renderer/theme.ts`); Task 3 imports only `getTheme` the same way (relative to `popup/`).

- [ ] **Step 1: Write the failing tests**

```typescript
// widget/__tests__/theme.test.ts
import { getTheme } from '@/renderer/theme'

describe('getTheme', () => {
  it('returns Modicare blue for Modicare Ltd.', () => {
    const theme = getTheme('Modicare Ltd.')
    expect(theme.primary).toBe('#0A80B8')
  })

  it('returns Colorbar orange for Colorbar Cosmetics', () => {
    const theme = getTheme('Colorbar Cosmetics')
    expect(theme.primary).toBe('#CC6002')
  })

  it('returns the teal fallback for unknown or missing company', () => {
    expect(getTheme(undefined).primary).toBe('#0d9488')
    expect(getTheme(null).primary).toBe('#0d9488')
    expect(getTheme('Some Other Company').primary).toBe('#0d9488')
  })

  it('returns exactly 4 bubble colors', () => {
    const theme = getTheme('Modicare Ltd.')
    expect(theme.bubbleColors).toHaveLength(4)
  })

  it('builds gradients that reference the base color', () => {
    const theme = getTheme('Modicare Ltd.')
    expect(theme.primaryGradient).toContain('#0A80B8')
    expect(theme.primaryGradientHorizontal).toContain('#0A80B8')
    expect(theme.badgeGradient).toContain('#0A80B8')
    expect(theme.bgGradient).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd widget && npx jest theme -v`
Expected: FAIL — `Cannot find module '@/renderer/theme'`

- [ ] **Step 3: Update the widget's `Employee` type**

In `widget/src/shared/types.ts`, replace:

```typescript
export interface Employee {
  id: string
  name: string
  email: string
  mobile: string
  department: string
  role: string
  is_active: boolean
}
```

with:

```typescript
export interface Employee {
  id: string
  name: string
  email: string
  mobile: string
  company: string
  department: string
  role: string
  is_active: boolean
}
```

- [ ] **Step 4: Write the theme module**

```typescript
// widget/src/renderer/theme.ts

export interface Theme {
  primary: string
  primaryGradient: string
  primaryGradientHorizontal: string
  badgeGradient: string
  lightAccentText: string
  bubbleColors: string[]
  bgGradient: string
}

const DEFAULT_BASE = '#0d9488'

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.min(100, Math.max(0, s)) / 100
  l = Math.min(100, Math.max(0, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function lighten(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.min(100, l + amount))
}

export function darken(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0, l - amount))
}

export function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Keeps the original stop's saturation/lightness, only swaps in the target hue —
// a subtle tint rather than a bright recolor.
function hueShift(stopHex: string, targetHueHex: string): string {
  const [, s, l] = hexToHsl(stopHex)
  const [targetH] = hexToHsl(targetHueHex)
  return hslToHex(targetH, s, l)
}

export function getTheme(company?: string | null): Theme {
  const base =
    company === 'Modicare Ltd.' ? '#0A80B8'
    : company === 'Colorbar Cosmetics' ? '#CC6002'
    : DEFAULT_BASE

  return {
    primary: base,
    primaryGradient: `linear-gradient(135deg, ${base}, ${darken(base, 12)})`,
    primaryGradientHorizontal: `linear-gradient(90deg, ${base}, ${darken(base, 12)})`,
    badgeGradient: `linear-gradient(135deg, ${base}, ${darken(base, 18)})`,
    lightAccentText: lighten(base, 30),
    bubbleColors: [
      `radial-gradient(circle at 40% 35%, ${rgba(base, 0.60)}, ${rgba(darken(base, 15), 0.25)} 55%, transparent 80%)`,
      `radial-gradient(circle at 40% 35%, ${rgba(lighten(base, 10), 0.55)}, ${rgba(base, 0.20)} 55%, transparent 80%)`,
      `radial-gradient(circle at 40% 35%, ${rgba(lighten(base, 25), 0.50)}, ${rgba(base, 0.20)} 55%, transparent 80%)`,
      `radial-gradient(circle at 40% 35%, ${rgba(darken(base, 10), 0.50)}, ${rgba(lighten(base, 10), 0.20)} 55%, transparent 80%)`,
    ],
    bgGradient: `linear-gradient(135deg, ${hueShift('#0a0f1e', base)} 0%, ${hueShift('#0b2d3d', base)} 45%, ${hueShift('#0a1f2a', base)} 100%)`,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd widget && npx jest theme -v`
Expected: PASS — all 5 tests green.

- [ ] **Step 6: Typecheck**

Run: `cd widget && npx tsc --noEmit`
Expected: no new errors (existing errors, if any, are pre-existing and out of scope).

- [ ] **Step 7: Commit**

```bash
git add widget/src/renderer/theme.ts widget/src/shared/types.ts widget/__tests__/theme.test.ts
git commit -m "feat(widget): add getTheme() company color palette module"
```

---

### Task 2: Wire theme into Feed.tsx

**Files:**
- Modify: `widget/src/renderer/feed/Feed.tsx`

**Interfaces:**
- Consumes: `getTheme`, `rgba`, `darken` from `../theme` (Task 1).
- Produces: nothing further downstream — this task is self-contained within Feed.tsx.

This task replaces every hardcoded teal/cyan/indigo-bubble literal in `Feed.tsx` with the corresponding `theme.*` value, computed once per render from the current `employee` state. The Microsoft-blue sign-in accent (lines with `#0078d4` / `rgba(0,120,210,...)`) and the indigo document-level badge (`rgba(99,102,241,...)` / `#a5b4fc`) are NOT touched — they are out of scope per the Global Constraints.

- [ ] **Step 1: Add the import and compute `theme` once per render**

Replace:

```typescript
import React, { useEffect, useState, useRef } from 'react'
import type { Employee, Message, HrDocument, Poll } from '../../shared/types'
```

with:

```typescript
import React, { useEffect, useState, useRef } from 'react'
import type { Employee, Message, HrDocument, Poll } from '../../shared/types'
import { getTheme, rgba } from '../theme'
```

- [ ] **Step 2: Remove the static `BUBBLE_COLORS` constant and thread bubble colors as a prop**

Replace:

```typescript
const BUBBLE_COLORS = [
  'radial-gradient(circle at 40% 35%, rgba(13,148,136,0.60), rgba(8,145,178,0.25) 55%, transparent 80%)',
  'radial-gradient(circle at 40% 35%, rgba(8,145,178,0.55), rgba(99,102,241,0.20) 55%, transparent 80%)',
  'radial-gradient(circle at 40% 35%, rgba(94,234,212,0.50), rgba(13,148,136,0.20) 55%, transparent 80%)',
  'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.50), rgba(8,145,178,0.20) 55%, transparent 80%)',
]

function BubbleBackground({ mouseRef }: { mouseRef: React.MutableRefObject<{ x: number; y: number }> }) {
```

with:

```typescript
function BubbleBackground({ mouseRef, bubbleColors }: { mouseRef: React.MutableRefObject<{ x: number; y: number }>; bubbleColors: string[] }) {
```

Then, still inside `BubbleBackground`, replace:

```typescript
            background: BUBBLE_COLORS[i % 4],
```

with:

```typescript
            background: bubbleColors[i % 4],
```

- [ ] **Step 3: Remove the static `BG` constant**

Replace:

```typescript
const BG = 'linear-gradient(135deg, #0a0f1e 0%, #0b2d3d 45%, #0a1f2a 100%)'
const HEADER_STYLE = {
```

with:

```typescript
const HEADER_STYLE = {
```

- [ ] **Step 4: Compute `theme` at the top of the `Feed` component**

Replace:

```typescript
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [pollsLoaded, setPollsLoaded] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [newPollAlert, setNewPollAlert] = useState(false)
```

with:

```typescript
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [pollsLoaded, setPollsLoaded] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [newPollAlert, setNewPollAlert] = useState(false)

  const theme = getTheme(employee?.company)
```

(`employee` is `Employee | null | undefined` here — `employee?.company` correctly resolves to `undefined` while loading or logged out, which `getTheme` maps to the teal fallback, matching the Global Constraints.)

- [ ] **Step 5: Loading branch background**

Replace:

```typescript
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: BG }}>
```

with:

```typescript
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: theme.bgGradient }}>
```

- [ ] **Step 6: Login branch background and bubble colors**

Replace:

```typescript
        style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, position: 'relative', overflow: 'hidden' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          loginMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }}
      >
        <BubbleBackground mouseRef={loginMouseRef} />
```

with:

```typescript
        style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: theme.bgGradient, position: 'relative', overflow: 'hidden' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          loginMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }}
      >
        <BubbleBackground mouseRef={loginMouseRef} bubbleColors={theme.bubbleColors} />
```

- [ ] **Step 7: Announcement-detail back button**

Replace:

```typescript
            style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ← Back
```

with:

```typescript
            style={{ background: theme.primaryGradient, color: 'white', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ← Back
```

- [ ] **Step 8: Main view background**

Replace:

```typescript
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, position: 'relative' }}>
```

with:

```typescript
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: theme.bgGradient, position: 'relative' }}>
```

- [ ] **Step 9: Header MC badge**

Replace:

```typescript
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#0d9488,#0f766e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0, letterSpacing: '0.2px' }}>MC</div>
```

with:

```typescript
        <div style={{ width: 30, height: 30, borderRadius: 8, background: theme.badgeGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0, letterSpacing: '0.2px' }}>MC</div>
```

- [ ] **Step 10: Active tab underline and text color**

Replace:

```typescript
              borderBottom: activeTab === tab.id ? '2px solid #0d9488' : '2px solid transparent',
              color: activeTab === tab.id ? '#5eead4' : 'rgba(255,255,255,0.60)',
```

with:

```typescript
              borderBottom: activeTab === tab.id ? `2px solid ${theme.primary}` : '2px solid transparent',
              color: activeTab === tab.id ? theme.lightAccentText : 'rgba(255,255,255,0.60)',
```

- [ ] **Step 11: Unread-count badge pill**

Replace:

```typescript
              <span style={{ background: '#0d9488', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 5px' }}>
```

with:

```typescript
              <span style={{ background: theme.primary, color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 5px' }}>
```

- [ ] **Step 12: Unread filter pill active state**

Replace:

```typescript
                  <button key={t.label} onClick={t.onClick} style={{
                    background: t.active ? 'rgba(13,148,136,0.20)' : 'none',
                    border: t.active ? '1px solid rgba(13,148,136,0.35)' : '1px solid transparent',
                    color: t.active ? '#5eead4' : 'rgba(255,255,255,0.60)',
                    fontSize: 11, cursor: 'pointer', padding: '2px 10px', borderRadius: 6,
                  }}>{t.label}</button>
```

with:

```typescript
                  <button key={t.label} onClick={t.onClick} style={{
                    background: t.active ? rgba(theme.primary, 0.20) : 'none',
                    border: t.active ? `1px solid ${rgba(theme.primary, 0.35)}` : '1px solid transparent',
                    color: t.active ? theme.lightAccentText : 'rgba(255,255,255,0.60)',
                    fontSize: 11, cursor: 'pointer', padding: '2px 10px', borderRadius: 6,
                  }}>{t.label}</button>
```

- [ ] **Step 13: Unseen-message dot**

Replace:

```typescript
                    {isUnseen && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0d9488', flexShrink: 0 }} />}
```

with:

```typescript
                    {isUnseen && <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.primary, flexShrink: 0 }} />}
```

- [ ] **Step 14: "Open ↗" document link**

Replace:

```typescript
                <span style={{ fontSize: 10, color: '#5eead4', flexShrink: 0 }}>Open ↗</span>
```

with:

```typescript
                <span style={{ fontSize: 10, color: theme.lightAccentText, flexShrink: 0 }}>Open ↗</span>
```

(The indigo `target_level` badge immediately above this in the same block is untouched — out of scope.)

- [ ] **Step 15: Poll option hover state**

Replace:

```typescript
                        onMouseEnter={e => { if (!isVoting) (e.currentTarget as HTMLElement).style.background = 'rgba(13,148,136,0.20)' }}
```

with:

```typescript
                        onMouseEnter={e => { if (!isVoting) (e.currentTarget as HTMLElement).style.background = rgba(theme.primary, 0.20) }}
```

- [ ] **Step 16: "Submitting…" text**

Replace:

```typescript
                    {isVoting && <p style={{ fontSize: 10, color: '#5eead4', textAlign: 'center' }}>Submitting…</p>}
```

with:

```typescript
                    {isVoting && <p style={{ fontSize: 10, color: theme.lightAccentText, textAlign: 'center' }}>Submitting…</p>}
```

- [ ] **Step 17: Poll result bar and "my vote" label**

Replace:

```typescript
                            <span style={{ color: isMyVote ? '#5eead4' : 'rgba(255,255,255,0.80)', fontWeight: isMyVote ? 600 : 400 }}>
```

with:

```typescript
                            <span style={{ color: isMyVote ? theme.lightAccentText : 'rgba(255,255,255,0.80)', fontWeight: isMyVote ? 600 : 400 }}>
```

Then replace:

```typescript
                            <div style={{ height: '100%', borderRadius: 3, width: `${barWidth}%`, background: isMyVote ? 'linear-gradient(90deg,#0d9488,#0891b2)' : 'rgba(255,255,255,0.20)', transition: 'width 0.4s ease' }} />
```

with:

```typescript
                            <div style={{ height: '100%', borderRadius: 3, width: `${barWidth}%`, background: isMyVote ? theme.primaryGradientHorizontal : 'rgba(255,255,255,0.20)', transition: 'width 0.4s ease' }} />
```

- [ ] **Step 18: AI Search question bubble**

Replace:

```typescript
                  <div style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', borderRadius: '12px 12px 2px 12px', padding: '7px 11px', fontSize: 12, maxWidth: '85%', lineHeight: 1.4 }}>
```

with:

```typescript
                  <div style={{ background: theme.primaryGradient, color: 'white', borderRadius: '12px 12px 2px 12px', padding: '7px 11px', fontSize: 12, maxWidth: '85%', lineHeight: 1.4 }}>
```

- [ ] **Step 19: "Thinking…" spinner and text**

Replace:

```typescript
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #5eead4', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: '#5eead4', fontSize: 12 }}>Thinking…</span>
```

with:

```typescript
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${theme.lightAccentText}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: theme.lightAccentText, fontSize: 12 }}>Thinking…</span>
```

- [ ] **Step 20: Ask button (uses `S.primaryBtn`)**

Replace:

```typescript
            <button
              type="submit"
              disabled={!question.trim() || asking}
              style={{ ...S.primaryBtn, padding: '7px 16px', fontSize: 12, opacity: (!question.trim() || asking) ? 0.5 : 1 }}
            >
              Ask
            </button>
```

with:

```typescript
            <button
              type="submit"
              disabled={!question.trim() || asking}
              style={{ ...S.primaryBtn, background: theme.primaryGradient, padding: '7px 16px', fontSize: 12, opacity: (!question.trim() || asking) ? 0.5 : 1 }}
            >
              Ask
            </button>
```

- [ ] **Step 21: Update-available banner**

Replace:

```typescript
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(135deg,#0d9488,#0891b2)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 50 }}>
```

with:

```typescript
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: theme.primaryGradient, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 50 }}>
```

- [ ] **Step 22: Passcode confirm button**

Replace:

```typescript
              <button
                onClick={submitPasscode}
                style={{ flex: 1, background: 'linear-gradient(135deg,#0d9488,#0891b2)', border: 'none', color: '#ffffff', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm
              </button>
```

with:

```typescript
              <button
                onClick={submitPasscode}
                style={{ flex: 1, background: theme.primaryGradient, border: 'none', color: '#ffffff', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm
              </button>
```

- [ ] **Step 23: Typecheck**

Run: `cd widget && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 24: Run the theme unit tests (regression check)**

Run: `cd widget && npx jest theme -v`
Expected: PASS — unaffected by this task's changes (Task 1's tests only exercise `theme.ts`, not `Feed.tsx`).

- [ ] **Step 25: Manual verification**

`Feed.tsx` has no existing test file (confirmed — no test convention for renderer components in this repo), so this task is verified by running the Electron widget:

1. Run the widget (`cd widget && npm run dev` or the project's existing dev-run command) and sign in as an employee whose `company` is `'Modicare Ltd.'`.
2. Confirm the primary buttons, active tab underline, header badge, background tint, and bubble background animation all render in shades of blue (`#0A80B8`-derived), not the old teal/cyan.
3. Sign out and sign in as a `'Colorbar Cosmetics'` employee (or update a test employee's `company` in the CMS to Colorbar and re-login).
4. Confirm the same elements now render in shades of orange (`#CC6002`-derived).
5. Confirm the indigo document-level badge and any error messages are unaffected (still indigo / red respectively).

Expected: all 5 steps behave as described.

- [ ] **Step 26: Commit**

```bash
git add widget/src/renderer/feed/Feed.tsx
git commit -m "feat(widget): apply company theme throughout Feed.tsx"
```

---

### Task 3: Wire theme into Popup.tsx

**Files:**
- Modify: `widget/src/renderer/popup/Popup.tsx`

**Interfaces:**
- Consumes: `getTheme` from `../theme` (Task 1).
- Produces: nothing further downstream — this task is self-contained.

`Popup.tsx`'s two components (`PollPopup`, `AnnouncementPopup`) each independently call `window.hrWidget.getEmployee()` and store the result in a locally-typed `{ name: string } | null>` state — narrower than the full `Employee` type, so it doesn't currently expose `.company`. Both need their local type widened to include `company`.

- [ ] **Step 1: Add the import**

Replace:

```typescript
import React, { useEffect, useState } from 'react'
import type { Message, Poll } from '../../shared/types'
```

with:

```typescript
import React, { useEffect, useState } from 'react'
import type { Message, Poll } from '../../shared/types'
import { getTheme } from '../theme'
```

- [ ] **Step 2: Remove the static `MC_BADGE` constant's hardcoded background (PollPopup)**

Replace:

```typescript
const MC_BADGE = {
  width: 24, height: 24, borderRadius: 6,
  background: 'linear-gradient(135deg,#0d9488,#0f766e)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 8, fontWeight: 700, color: 'white',
  letterSpacing: '0.2px', flexShrink: 0,
} as React.CSSProperties
```

with:

```typescript
const MC_BADGE_BASE = {
  width: 24, height: 24, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 8, fontWeight: 700, color: 'white',
  letterSpacing: '0.2px', flexShrink: 0,
} as React.CSSProperties
```

(The `background` is now supplied per-render via `theme.badgeGradient` at each of the two usage sites below, since it depends on the logged-in employee.)

- [ ] **Step 3: Widen `PollPopup`'s employee type and compute `theme`**

Replace:

```typescript
function PollPopup() {
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined)
  const [employee, setEmployee] = useState<{ name: string } | null>(null)

  useEffect(() => {
    window.hrWidget.getEmployee().then(emp => setEmployee(emp))
    window.hrWidget.getPollPopup().then(p => setPoll(p ?? null))
  }, [])

  if (poll === undefined) return null
  if (poll === null) { window.close(); return null }
```

with:

```typescript
function PollPopup() {
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined)
  const [employee, setEmployee] = useState<{ name: string; company?: string } | null>(null)

  useEffect(() => {
    window.hrWidget.getEmployee().then(emp => setEmployee(emp))
    window.hrWidget.getPollPopup().then(p => setPoll(p ?? null))
  }, [])

  if (poll === undefined) return null
  if (poll === null) { window.close(); return null }

  const theme = getTheme(employee?.company)
```

- [ ] **Step 4: Apply the theme in `PollPopup`'s JSX**

Replace:

```typescript
          <div style={MC_BADGE}>MC</div>
```

with:

```typescript
          <div style={{ ...MC_BADGE_BASE, background: theme.badgeGradient }}>MC</div>
```

Then replace:

```typescript
        <button
          onClick={handleVote}
          style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', border: 'none', padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Vote Now →
        </button>
```

with:

```typescript
        <button
          onClick={handleVote}
          style={{ background: theme.primaryGradient, color: 'white', border: 'none', padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Vote Now →
        </button>
```

- [ ] **Step 5: Widen `AnnouncementPopup`'s employee type and compute `theme`**

Replace:

```typescript
function AnnouncementPopup() {
  const [messages, setMessages] = useState<Message[]>([])
  const [employee, setEmployee] = useState<{ name: string } | null>(null)

  useEffect(() => {
    window.hrWidget.getEmployee().then(emp => setEmployee(emp))
    window.hrWidget.getMessages().then(msgs => {
      window.hrWidget.getUnseenIds().then(unseenIds => {
        const unseen = msgs.filter(m => unseenIds.includes(m.id))
        setMessages(unseen)
      })
    })
  }, [])

  if (!messages.length) return null

  const msg = messages[0]
  const moreCount = messages.length - 1
```

with:

```typescript
function AnnouncementPopup() {
  const [messages, setMessages] = useState<Message[]>([])
  const [employee, setEmployee] = useState<{ name: string; company?: string } | null>(null)

  useEffect(() => {
    window.hrWidget.getEmployee().then(emp => setEmployee(emp))
    window.hrWidget.getMessages().then(msgs => {
      window.hrWidget.getUnseenIds().then(unseenIds => {
        const unseen = msgs.filter(m => unseenIds.includes(m.id))
        setMessages(unseen)
      })
    })
  }, [])

  if (!messages.length) return null

  const msg = messages[0]
  const moreCount = messages.length - 1
  const theme = getTheme(employee?.company)
```

- [ ] **Step 6: Apply the theme in `AnnouncementPopup`'s JSX**

Replace:

```typescript
          <div style={MC_BADGE}>MC</div>
```

(the second occurrence, inside `AnnouncementPopup`'s JSX) with:

```typescript
          <div style={{ ...MC_BADGE_BASE, background: theme.badgeGradient }}>MC</div>
```

Then replace:

```typescript
          <button
            onClick={handleOpenUnread}
            style={{ background: 'none', border: 'none', color: '#0d9488', fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}
          >
            {moreCount} more unread →
          </button>
```

with:

```typescript
          <button
            onClick={handleOpenUnread}
            style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}
          >
            {moreCount} more unread →
          </button>
```

Then replace:

```typescript
        <button
          onClick={handleClose}
          style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', border: 'none', padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Dismiss
        </button>
```

with:

```typescript
        <button
          onClick={handleClose}
          style={{ background: theme.primaryGradient, color: 'white', border: 'none', padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Dismiss
        </button>
```

- [ ] **Step 7: Typecheck**

Run: `cd widget && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Run the theme unit tests (regression check)**

Run: `cd widget && npx jest theme -v`
Expected: PASS — unaffected by this task's changes.

- [ ] **Step 9: Manual verification**

`Popup.tsx` has no existing test file. Verify manually:

1. Trigger a poll notification popup (or announcement popup) for a Modicare employee — confirm the badge and action button render in blue.
2. Trigger the same for a Colorbar employee — confirm they render in orange.
3. Confirm the light background (`#ffffff`/`#f8fafc`) and neutral text are unchanged in both cases.

Expected: all 3 steps behave as described.

- [ ] **Step 10: Commit**

```bash
git add widget/src/renderer/popup/Popup.tsx
git commit -m "feat(widget): apply company theme to Popup badge/buttons/link"
```
