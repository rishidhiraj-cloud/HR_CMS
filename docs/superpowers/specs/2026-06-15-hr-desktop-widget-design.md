# HR Desktop Widget — Design Spec
**Date:** 2026-06-15  
**Status:** Approved

---

## Overview

A cross-platform desktop widget (Windows + macOS) that displays HR messages pushed through a web-based CMS panel. Employees see a startup popup on login and a system tray icon for ongoing access. Built from scratch using Electron + Supabase.

---

## System Architecture

Three components sharing one Supabase backend:

| Component | Technology | Who uses it |
|---|---|---|
| Electron Widget | Electron + React | Every employee (desktop) |
| HR CMS Panel | Next.js web app | HR staff (browser) |
| Backend | Supabase (Postgres + Realtime + Auth + Storage + Cron) | Both |

**Delivery flow:**
1. HR publishes (or scheduler triggers) a message → row written to `messages` table with `published_at` set
2. Supabase Realtime fires an event to all connected Electron clients
3. Each client checks `target_type` / `target_value` against the logged-in employee's profile
4. Matching clients show a startup popup (if on first login since message) or increment the tray badge

---

## Data Model

### `employees`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Supabase Auth user id |
| `name` | text | |
| `email` | text | |
| `department` | text | e.g. "Sales", "Engineering" |
| `role` | text | e.g. "Manager", "Executive" |

### `messages`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` | text | |
| `content_html` | text | Rich HTML from TipTap editor |
| `target_type` | text | `'all'` \| `'dept'` \| `'role'` |
| `target_value` | text | e.g. "Sales" (null when target_type = 'all') |
| `scheduled_at` | timestamptz | Nullable — set by HR for future delivery |
| `published_at` | timestamptz | Nullable — set by cron when message goes live |
| `created_by` | uuid | FK → `hr_users.id` |

### `hr_users`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Supabase Auth user id |
| `name` | text | |
| `email` | text | |

**Scheduling:** Two publish paths:
- **Publish Now** — CMS panel sets `published_at = now()` immediately on form submit. Realtime fires instantly.
- **Scheduled** — CMS panel sets `scheduled_at` and leaves `published_at` null. A Supabase pg_cron job runs every minute, finds rows where `scheduled_at <= now()` AND `published_at IS NULL`, sets `published_at = now()`. Realtime fires at that point.

**Targeting:** The Electron widget filters incoming messages client-side: `'all'` → show to everyone; `'dept'` → compare `target_value` to employee's `department`; `'role'` → compare to employee's `role`. No match = silently ignore.

---

## Electron Widget (Employee-facing)

### Behaviour
- **On startup / login:** Check Supabase for messages where `published_at IS NOT NULL` and the message ID is not in the local seen-messages store. If any exist, show a startup popup with the newest unread message.
- **While running:** Subscribe to Supabase Realtime on the `messages` table. On new `published_at` event, show an OS native notification and increment the tray badge.
- **Tray icon click:** Opens a compact message feed popup listing all messages (newest first), with unread badge count. Clicking a message marks it as seen locally.

### Local state
A small SQLite file (via `better-sqlite3`) stores seen message IDs per employee. This prevents the startup popup from re-firing on every reboot.

### Screens
1. **Startup popup** — title, rich HTML content, "Open Portal →" CTA button, "Dismiss" button, unread count footer
2. **Tray feed popup** — scrollable message list, unread badge, "View all" link, Settings link

### Cross-platform notes
- Windows: taskbar notification area icon, native Windows toast notifications
- macOS: menu bar icon, native macOS `NSUserNotification`
- Electron's `Tray` and `Notification` APIs handle both with the same code

---

## HR CMS Panel (HR-facing web app)

### Screens
1. **Dashboard** — table of all messages with status badges (Live / Scheduled / Archived), filter tabs, "New Message" button
2. **Compose / Edit** — title field, TipTap rich text editor (bold, italic, underline, links, image upload to Supabase Storage), "Send To" selector (All / By Department / By Role + value picker), delivery toggle (Publish Now / Schedule with date-time picker), Save Draft and Publish/Schedule buttons
3. **Employee Management** — HR can add employees (name, email, department, role), edit their profile, and trigger a Supabase Auth invite email. This is how employees get their widget login credentials. Departments and roles are free-text (HR defines them) and drive message targeting.

### Auth
HR staff log in via Supabase Auth (email + password). Supabase Row Level Security (RLS) ensures only `hr_users` can insert/update `messages`. Employees can only read messages targeted to them.

---

## Out of Scope (this version)
- Read receipts / acknowledgment tracking
- Mobile app
- Push notifications when Electron is not running (email/SMS fallback)
- Employee self-service (replying to messages)
- Message templates

---

## Tech Stack Summary

| Layer | Choice |
|---|---|
| Desktop widget | Electron + React |
| CMS panel | Next.js (React) |
| Rich text editor | TipTap |
| Backend / DB | Supabase (Postgres) |
| Realtime | Supabase Realtime |
| Auth | Supabase Auth |
| File storage | Supabase Storage |
| Scheduling | Supabase pg_cron |
| Local widget state | better-sqlite3 |
| Packaging | electron-builder (produces .exe for Windows, .dmg for macOS) |
