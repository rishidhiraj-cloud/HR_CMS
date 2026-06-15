# HR Widget — Plan 2: Electron Desktop Widget

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cross-platform Electron desktop app that employees install on Windows and macOS. It shows a startup popup with new HR messages on login, keeps a system tray icon with an unread badge, and receives new messages in real time via Supabase Realtime.

**Architecture:** Electron main process manages the tray icon, BrowserWindows (popup and feed), Supabase Realtime subscription, and a local SQLite store for seen message IDs. Two renderer windows (React) — a startup popup and a tray feed — communicate with main via contextBridge IPC. Employee logs in once; credentials are stored in Electron's safeStorage. Packaged with electron-builder into `.exe` (Windows) and `.dmg` (macOS).

**Tech Stack:** Electron 30, React 18, TypeScript, Vite (renderer build), better-sqlite3 (local state), @supabase/supabase-js, electron-builder, Jest + React Testing Library

**Prerequisite:** Plan 1 complete — Supabase project live with `employees` table, RLS, and Realtime enabled. Have `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

## File Map

```
HRWidget/
└── widget/
    ├── src/
    │   ├── main/
    │   │   ├── index.ts          # entry — creates tray, windows, realtime sub
    │   │   ├── tray.ts           # Tray icon setup, badge count
    │   │   ├── windows.ts        # creates/manages BrowserWindow instances
    │   │   ├── seen-store.ts     # better-sqlite3 — tracks seen message IDs
    │   │   └── auth-store.ts     # safeStorage — persists employee session
    │   ├── preload/
    │   │   └── index.ts          # contextBridge: exposes IPC to renderer
    │   └── renderer/
    │       ├── popup/
    │       │   ├── index.html
    │       │   ├── main.tsx
    │       │   └── Popup.tsx     # startup popup UI
    │       └── feed/
    │           ├── index.html
    │           ├── main.tsx
    │           └── Feed.tsx      # tray click message feed
    ├── __tests__/
    │   ├── seen-store.test.ts
    │   └── auth-store.test.ts
    ├── assets/
    │   ├── icon.png              # tray icon (32x32)
    │   └── icon.icns             # macOS icon
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── jest.config.ts
    └── electron-builder.yml
```

---

## Task 1: Electron project scaffold

**Files:**
- Create: `widget/package.json`
- Create: `widget/tsconfig.json`
- Create: `widget/vite.config.ts`
- Create: `widget/jest.config.ts`

- [ ] **Step 1: Create widget directory and package.json**

```bash
mkdir -p /Users/dhiraj/Documents/HRWidget/widget/src/{main,preload,renderer/{popup,feed}}
mkdir -p /Users/dhiraj/Documents/HRWidget/widget/{__tests__,assets}
```

Create `widget/package.json`:

```json
{
  "name": "hr-widget",
  "version": "1.0.0",
  "description": "HR message widget for employees",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "concurrently \"vite build --watch\" \"electron .\"",
    "build": "vite build && tsc -p tsconfig.main.json",
    "dist": "npm run build && electron-builder",
    "test": "jest"
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/dhiraj/Documents/HRWidget/widget
npm install --save-dev electron@30 typescript vite @vitejs/plugin-react concurrently electron-builder
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest @types/jest jest-environment-jsdom
npm install react react-dom
npm install @supabase/supabase-js better-sqlite3
npm install --save-dev @types/better-sqlite3 @types/react @types/react-dom
```

- [ ] **Step 3: Create tsconfig.json (renderer)**

Create `widget/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist/renderer",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/renderer/**/*", "src/preload/**/*"]
}
```

Create `widget/tsconfig.main.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist/main"
  },
  "include": ["src/main/**/*"]
}
```

- [ ] **Step 4: Create vite.config.ts**

Create `widget/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/renderer/popup/index.html'),
        feed: path.resolve(__dirname, 'src/renderer/feed/index.html'),
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

- [ ] **Step 5: Create jest.config.ts**

Create `widget/jest.config.ts`:

```typescript
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
}

export default config
```

- [ ] **Step 6: Create placeholder tray icon**

Download any 32×32 PNG and save as `widget/assets/icon.png`. (For production, use your company logo.)

- [ ] **Step 7: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/
git commit -m "chore: scaffold electron widget project"
```

---

## Task 2: Seen messages store (SQLite)

**Files:**
- Create: `widget/src/main/seen-store.ts`
- Create: `widget/__tests__/seen-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `widget/__tests__/seen-store.test.ts`:

```typescript
import Database from 'better-sqlite3'
import { SeenStore } from '@/main/seen-store'

describe('SeenStore', () => {
  let store: SeenStore

  beforeEach(() => {
    // Use in-memory DB for tests
    store = new SeenStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('returns false for an unseen message', () => {
    expect(store.hasSeen('msg-1')).toBe(false)
  })

  it('returns true after marking a message as seen', () => {
    store.markSeen('msg-1')
    expect(store.hasSeen('msg-1')).toBe(true)
  })

  it('returns all unseen IDs from a list', () => {
    store.markSeen('msg-1')
    const unseen = store.filterUnseen(['msg-1', 'msg-2', 'msg-3'])
    expect(unseen).toEqual(['msg-2', 'msg-3'])
  })

  it('markSeen is idempotent', () => {
    store.markSeen('msg-1')
    store.markSeen('msg-1')
    expect(store.hasSeen('msg-1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -- --testPathPattern=seen-store
```

Expected: FAIL — `Cannot find module '@/main/seen-store'`

- [ ] **Step 3: Implement seen-store**

Create `widget/src/main/seen-store.ts`:

```typescript
import Database from 'better-sqlite3'

export class SeenStore {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec(`
      create table if not exists seen_messages (
        message_id text primary key
      )
    `)
  }

  hasSeen(messageId: string): boolean {
    const row = this.db
      .prepare('select 1 from seen_messages where message_id = ?')
      .get(messageId)
    return !!row
  }

  markSeen(messageId: string): void {
    this.db
      .prepare('insert or ignore into seen_messages (message_id) values (?)')
      .run(messageId)
  }

  filterUnseen(messageIds: string[]): string[] {
    return messageIds.filter(id => !this.hasSeen(id))
  }

  close(): void {
    this.db.close()
  }
}
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
npm test -- --testPathPattern=seen-store
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/src/main/seen-store.ts widget/__tests__/seen-store.test.ts
git commit -m "feat: add SeenStore for tracking read message IDs in SQLite"
```

---

## Task 3: Auth store (persist employee session)

**Files:**
- Create: `widget/src/main/auth-store.ts`
- Create: `widget/__tests__/auth-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `widget/__tests__/auth-store.test.ts`:

```typescript
import { AuthStore } from '@/main/auth-store'

// Mock Electron's safeStorage for unit tests
jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  app: { getPath: () => '/tmp' },
}))

describe('AuthStore', () => {
  let store: AuthStore

  beforeEach(() => {
    store = new AuthStore('/tmp/test-auth.json')
  })

  afterEach(() => {
    try { require('fs').unlinkSync('/tmp/test-auth.json') } catch {}
  })

  it('returns null when no credentials saved', () => {
    expect(store.getCredentials()).toBeNull()
  })

  it('saves and retrieves credentials', () => {
    store.saveCredentials({ email: 'emp@co.com', accessToken: 'tok123', refreshToken: 'ref456' })
    const creds = store.getCredentials()
    expect(creds?.email).toBe('emp@co.com')
    expect(creds?.accessToken).toBe('tok123')
  })

  it('clears credentials', () => {
    store.saveCredentials({ email: 'emp@co.com', accessToken: 'tok', refreshToken: 'ref' })
    store.clearCredentials()
    expect(store.getCredentials()).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -- --testPathPattern=auth-store
```

Expected: FAIL

- [ ] **Step 3: Implement auth-store**

Create `widget/src/main/auth-store.ts`:

```typescript
import { safeStorage } from 'electron'
import fs from 'fs'

interface Credentials {
  email: string
  accessToken: string
  refreshToken: string
}

export class AuthStore {
  constructor(private readonly filePath: string) {}

  saveCredentials(creds: Credentials): void {
    if (!safeStorage.isEncryptionAvailable()) return
    const json = JSON.stringify(creds)
    const encrypted = safeStorage.encryptString(json)
    fs.writeFileSync(this.filePath, encrypted)
  }

  getCredentials(): Credentials | null {
    if (!safeStorage.isEncryptionAvailable()) return null
    if (!fs.existsSync(this.filePath)) return null
    try {
      const encrypted = fs.readFileSync(this.filePath)
      const json = safeStorage.decryptString(encrypted)
      return JSON.parse(json) as Credentials
    } catch {
      return null
    }
  }

  clearCredentials(): void {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath)
  }
}
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
npm test -- --testPathPattern=auth-store
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/src/main/auth-store.ts widget/__tests__/auth-store.test.ts
git commit -m "feat: add AuthStore to persist employee session via safeStorage"
```

---

## Task 4: Preload script (IPC bridge)

**Files:**
- Create: `widget/src/preload/index.ts`

- [ ] **Step 1: Write preload script**

Create `widget/src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hrWidget', {
  // Auth
  login: (email: string, password: string) =>
    ipcRenderer.invoke('auth:login', email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getEmployee: () => ipcRenderer.invoke('auth:getEmployee'),

  // Messages
  getMessages: () => ipcRenderer.invoke('messages:getAll'),
  markSeen: (id: string) => ipcRenderer.invoke('messages:markSeen', id),

  // Events from main → renderer
  onNewMessage: (cb: (msg: unknown) => void) => {
    ipcRenderer.on('message:new', (_event, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('message:new')
  },
})
```

- [ ] **Step 2: Create global type declaration**

Create `widget/src/renderer/global.d.ts`:

```typescript
import type { Message, Employee } from '@/shared/types'

interface HrWidgetAPI {
  login(email: string, password: string): Promise<{ error?: string }>
  logout(): Promise<void>
  getEmployee(): Promise<Employee | null>
  getMessages(): Promise<Message[]>
  markSeen(id: string): Promise<void>
  onNewMessage(cb: (msg: Message) => void): () => void
}

declare global {
  interface Window {
    hrWidget: HrWidgetAPI
  }
}
```

- [ ] **Step 3: Create shared types**

Create `widget/src/shared/types.ts`:

```typescript
export type TargetType = 'all' | 'dept' | 'role'

export interface Message {
  id: string
  title: string
  content_html: string
  target_type: TargetType
  target_value: string | null
  scheduled_at: string | null
  published_at: string | null
  created_at: string
}

export interface Employee {
  id: string
  name: string
  email: string
  department: string
  role: string
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/src/preload/ widget/src/shared/ widget/src/renderer/global.d.ts
git commit -m "feat: add preload IPC bridge and shared types"
```

---

## Task 5: Popup renderer (startup popup UI)

**Files:**
- Create: `widget/src/renderer/popup/index.html`
- Create: `widget/src/renderer/popup/main.tsx`
- Create: `widget/src/renderer/popup/Popup.tsx`

- [ ] **Step 1: Write popup HTML entry**

Create `widget/src/renderer/popup/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src * data:; style-src 'unsafe-inline'">
    <title>HR Message</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e2e; color: #e0e0f0; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write popup entry**

Create `widget/src/renderer/popup/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import Popup from './Popup'

createRoot(document.getElementById('root')!).render(<Popup />)
```

- [ ] **Step 3: Write Popup component**

Create `widget/src/renderer/popup/Popup.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import type { Message } from '@/shared/types'

export default function Popup() {
  const [messages, setMessages] = useState<Message[]>([])
  const [current, setCurrent] = useState(0)
  const [employee, setEmployee] = useState<{ name: string } | null>(null)

  useEffect(() => {
    window.hrWidget.getEmployee().then(emp => setEmployee(emp))
    window.hrWidget.getMessages().then(msgs => setMessages(msgs))
  }, [])

  if (!messages.length) return null

  const msg = messages[current]

  async function handleDismiss() {
    await window.hrWidget.markSeen(msg.id)
    if (current + 1 < messages.length) {
      setCurrent(c => c + 1)
    } else {
      window.close()
    }
  }

  const remaining = messages.length - current - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#1e1e2e' }}>
      {/* Title bar */}
      <div style={{ background: '#2a2a3e', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#a0a0c0', fontSize: 12 }}>📢 HR Announcement</span>
        {employee && <span style={{ color: '#666', fontSize: 11 }}>Hi, {employee.name.split(' ')[0]}</span>}
      </div>

      {/* Message */}
      <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{msg.title}</h2>
        <p style={{ color: '#a0a0c0', fontSize: 11, marginBottom: 12 }}>
          From HR · {new Date(msg.published_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          {' · '}{msg.target_type === 'all' ? 'All Employees' : msg.target_value}
        </p>
        <div
          style={{ color: '#c0c0d8', fontSize: 13, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: msg.content_html }}
        />
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #333', display: 'flex', gap: 8 }}>
        <button
          onClick={handleDismiss}
          style={{ background: '#6c63ff', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 5, fontSize: 12, cursor: 'pointer' }}
        >
          {remaining > 0 ? `Next (${remaining} more)` : 'Dismiss'}
        </button>
      </div>

      {/* Footer */}
      {remaining > 0 && (
        <div style={{ background: '#2a2a3e', padding: '6px 14px', fontSize: 11, color: '#555' }}>
          {remaining} more unread message{remaining > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/src/renderer/popup/
git commit -m "feat: add startup popup renderer"
```

---

## Task 6: Feed renderer (tray click message list)

**Files:**
- Create: `widget/src/renderer/feed/index.html`
- Create: `widget/src/renderer/feed/main.tsx`
- Create: `widget/src/renderer/feed/Feed.tsx`

- [ ] **Step 1: Write feed HTML entry**

Create `widget/src/renderer/feed/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src * data:; style-src 'unsafe-inline'">
    <title>HR Feed</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e2e; color: #e0e0f0; }
      ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write feed entry**

Create `widget/src/renderer/feed/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import Feed from './Feed'

createRoot(document.getElementById('root')!).render(<Feed />)
```

- [ ] **Step 3: Write Feed component**

Create `widget/src/renderer/feed/Feed.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import type { Message } from '@/shared/types'

export default function Feed() {
  const [messages, setMessages] = useState<Message[]>([])
  const [selected, setSelected] = useState<Message | null>(null)

  useEffect(() => {
    window.hrWidget.getMessages().then(msgs => setMessages(msgs))

    const unsub = window.hrWidget.onNewMessage(msg => {
      setMessages(prev => [msg as Message, ...prev])
    })
    return unsub
  }, [])

  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ background: '#2a2a3e', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#a0a0c0', cursor: 'pointer', fontSize: 13 }}>← Back</button>
          <span style={{ color: '#e0e0f0', fontSize: 13, fontWeight: 600 }}>{selected.title}</span>
        </div>
        <div style={{ padding: 14, flex: 1, overflow: 'auto' }}>
          <p style={{ color: '#888', fontSize: 11, marginBottom: 10 }}>
            {new Date(selected.published_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}{selected.target_type === 'all' ? 'All Employees' : selected.target_value}
          </p>
          <div
            style={{ color: '#c0c0d8', fontSize: 13, lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: selected.content_html }}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ background: '#2a2a3e', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>HR Announcements</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {messages.map(msg => (
          <div
            key={msg.id}
            onClick={() => { setSelected(msg); window.hrWidget.markSeen(msg.id) }}
            style={{ padding: '12px 14px', borderBottom: '1px solid #2a2a3e', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#252535')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontWeight: 600, fontSize: 12, color: '#e0e0f0', marginBottom: 2 }}>{msg.title}</div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
              {new Date(msg.published_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {' · '}{msg.target_type === 'all' ? 'All Employees' : msg.target_value}
            </div>
            <div style={{ fontSize: 11, color: '#a0a0c0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {msg.content_html.replace(/<[^>]+>/g, '')}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#555', fontSize: 12, padding: '40px 0' }}>No messages yet</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/src/renderer/feed/
git commit -m "feat: add tray feed renderer"
```

---

## Task 7: Windows manager

**Files:**
- Create: `widget/src/main/windows.ts`

- [ ] **Step 1: Write windows.ts**

Create `widget/src/main/windows.ts`:

```typescript
import { BrowserWindow, screen } from 'electron'
import path from 'path'

const POPUP_WIDTH = 380
const POPUP_HEIGHT = 400
const FEED_WIDTH = 300
const FEED_HEIGHT = 420

function getRendererPath(name: string): string {
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:5173/${name}/index.html`
  }
  return `file://${path.join(__dirname, `../renderer/${name}/index.html`)}`
}

export function createPopupWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    x: width - POPUP_WIDTH - 20,
    y: height - POPUP_HEIGHT - 20,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL(getRendererPath('popup'))
  return win
}

export function createFeedWindow(trayBounds: Electron.Rectangle): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize

  const x = process.platform === 'darwin'
    ? trayBounds.x - FEED_WIDTH / 2
    : width - FEED_WIDTH - 10

  // macOS: tray is at top → open below. Windows: taskbar is at bottom → open above.
  const y = process.platform === 'darwin'
    ? trayBounds.y + trayBounds.height + 4
    : trayBounds.y - FEED_HEIGHT - 4

  const win = new BrowserWindow({
    width: FEED_WIDTH,
    height: FEED_HEIGHT,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL(getRendererPath('feed'))
  win.on('blur', () => win.hide())
  return win
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/src/main/windows.ts
git commit -m "feat: add BrowserWindow factory for popup and feed"
```

---

## Task 8: Main process — tray, IPC handlers, Realtime

**Files:**
- Create: `widget/src/main/tray.ts`
- Create: `widget/src/main/index.ts`

- [ ] **Step 1: Write tray.ts**

Create `widget/src/main/tray.ts`:

```typescript
import { Tray, Menu, nativeImage } from 'electron'
import path from 'path'

export function createTray(onClick: () => void): Tray {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../assets/icon.png')
  ).resize({ width: 16, height: 16 })

  const tray = new Tray(icon)
  tray.setToolTip('HR Announcements')
  tray.on('click', onClick)

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Announcements', click: onClick },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]))

  return tray
}

export function setBadge(tray: Tray, count: number): void {
  tray.setTitle(count > 0 ? String(count) : '')
}
```

- [ ] **Step 2: Write main index.ts**

Create `widget/src/main/index.ts`:

```typescript
import { app, ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { createTray, setBadge } from './tray'
import { createPopupWindow, createFeedWindow } from './windows'
import { SeenStore } from './seen-store'
import { AuthStore } from './auth-store'
import type { Message, Employee } from '../shared/types'

const SUPABASE_URL = 'https://your-project-id.supabase.co'  // replace with actual
const SUPABASE_ANON_KEY = 'your-anon-key'                   // replace with actual

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const seenStore = new SeenStore(path.join(app.getPath('userData'), 'seen.db'))
const authStore = new AuthStore(path.join(app.getPath('userData'), 'auth.enc'))

let feedWindow: BrowserWindow | null = null
let tray: ReturnType<typeof createTray> | null = null
let currentEmployee: Employee | null = null
let unreadCount = 0

app.whenReady().then(async () => {
  app.dock?.hide() // macOS: hide from dock (tray-only app)

  // Restore session if saved
  const creds = authStore.getCredentials()
  if (creds) {
    await supabase.auth.setSession({ access_token: creds.accessToken, refresh_token: creds.refreshToken })
    const { data } = await supabase.from('employees').select('*').single()
    currentEmployee = data as Employee | null
  }

  tray = createTray(() => {
    if (!feedWindow || feedWindow.isDestroyed()) {
      const bounds = tray!.getBounds()
      feedWindow = createFeedWindow(bounds)
      feedWindow.show()
    } else if (feedWindow.isVisible()) {
      feedWindow.hide()
    } else {
      feedWindow.show()
    }
  })

  // Show startup popup for unread messages
  if (currentEmployee) await checkAndShowPopup()

  // Subscribe to new messages via Realtime
  supabase
    .channel('messages')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new as Message
      if (msg.published_at && isTargetedAtEmployee(msg, currentEmployee)) {
        unreadCount++
        setBadge(tray!, unreadCount)
        feedWindow?.webContents.send('message:new', msg)
        seenStore.hasSeen(msg.id) || createPopupWindow().show()
      }
    })
    .subscribe()
})

async function checkAndShowPopup() {
  const { data: msgs } = await supabase
    .from('messages')
    .select('*')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  if (!msgs) return
  const targeted = (msgs as Message[]).filter(m => isTargetedAtEmployee(m, currentEmployee))
  const unseen = seenStore.filterUnseen(targeted.map(m => m.id))

  if (unseen.length > 0) {
    unreadCount = unseen.length
    setBadge(tray!, unreadCount)
    const popup = createPopupWindow()
    popup.show()
  }
}

function isTargetedAtEmployee(msg: Message, emp: Employee | null): boolean {
  if (!emp) return false
  if (msg.target_type === 'all') return true
  if (msg.target_type === 'dept') return msg.target_value === emp.department
  if (msg.target_type === 'role') return msg.target_value === emp.role
  return false
}

// IPC handlers
ipcMain.handle('auth:login', async (_event, email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  const { data: emp } = await supabase.from('employees').select('*').single()
  currentEmployee = emp as Employee
  authStore.saveCredentials({ email, accessToken: data.session!.access_token, refreshToken: data.session!.refresh_token })
  await checkAndShowPopup()
  return {}
})

ipcMain.handle('auth:logout', async () => {
  await supabase.auth.signOut()
  authStore.clearCredentials()
  currentEmployee = null
  unreadCount = 0
  setBadge(tray!, 0)
})

ipcMain.handle('auth:getEmployee', () => currentEmployee)

ipcMain.handle('messages:getAll', async () => {
  if (!currentEmployee) return []
  const { data } = await supabase
    .from('messages')
    .select('*')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
  return ((data as Message[]) ?? []).filter(m => isTargetedAtEmployee(m, currentEmployee))
})

ipcMain.handle('messages:markSeen', (_event, id: string) => {
  seenStore.markSeen(id)
  unreadCount = Math.max(0, unreadCount - 1)
  setBadge(tray!, unreadCount)
})

app.on('window-all-closed', e => e.preventDefault()) // keep app running in tray
```

- [ ] **Step 3: Replace placeholder Supabase credentials**

In `widget/src/main/index.ts`, replace `'https://your-project-id.supabase.co'` and `'your-anon-key'` with the actual values from your Supabase project.

- [ ] **Step 4: Commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/src/main/
git commit -m "feat: add main process with tray, IPC handlers, and Realtime subscription"
```

---

## Task 9: electron-builder config + packaging

**Files:**
- Create: `widget/electron-builder.yml`

- [ ] **Step 1: Write electron-builder config**

Create `widget/electron-builder.yml`:

```yaml
appId: com.yourcompany.hrwidget
productName: HR Widget
directories:
  output: release
files:
  - dist/**/*
  - assets/**/*
  - node_modules/**/*
  - package.json

mac:
  icon: assets/icon.icns
  category: public.app-category.business
  target:
    - target: dmg
      arch: [x64, arm64]

win:
  icon: assets/icon.png
  target:
    - target: nsis
      arch: [x64]

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

linux:
  target: []
```

- [ ] **Step 2: Run development mode to verify widget launches**

```bash
cd widget
npm run dev
```

Expected: Electron window opens, tray icon appears in taskbar (Windows) or menu bar (macOS).

- [ ] **Step 3: Test login flow manually**

With the dev widget running:
1. If no session saved, the feed window opens. Add a login form or test via IPC DevTools:
   ```javascript
   // In Electron DevTools console (feed window):
   await window.hrWidget.login('employee@yourcompany.com', 'their-password')
   ```
2. Verify `getEmployee()` returns the employee profile
3. Publish a new message via the CMS panel → verify tray badge increments and popup appears

- [ ] **Step 4: Build distributables**

```bash
npm run dist
```

Expected: `release/` folder contains `.dmg` (macOS) and `.exe` NSIS installer (Windows, if cross-compiling or run on Windows).

- [ ] **Step 5: Test install on macOS**

1. Open `release/HR Widget-1.0.0.dmg` → drag to Applications
2. Open HR Widget → tray icon appears
3. Log in as an employee → publish a test message from CMS panel → verify popup appears

- [ ] **Step 6: Final commit**

```bash
cd /Users/dhiraj/Documents/HRWidget
git add widget/electron-builder.yml
git commit -m "feat: add electron-builder config for macOS dmg and Windows nsis"
```

---

## Task 10: Run full test suite

- [ ] **Step 1: Run all widget unit tests**

```bash
cd /Users/dhiraj/Documents/HRWidget/widget
npm test
```

Expected: 7 tests passing (4 seen-store + 3 auth-store).

- [ ] **Step 2: Run CMS panel tests**

```bash
cd /Users/dhiraj/Documents/HRWidget/cms-panel
npm test
```

Expected: all tests passing.

- [ ] **Step 3: End-to-end smoke test**

1. Open CMS panel at your Vercel URL — log in as HR
2. Create a message: title "Test Widget Message", body "This is a test", target "All Employees", Publish Now
3. On a machine with the widget installed, log in as an employee
4. Verify: popup appears with the message, badge shows 1, dismiss → badge clears, tray feed shows the message

- [ ] **Step 4: Final tag**

```bash
cd /Users/dhiraj/Documents/HRWidget
git tag v1.0.0
```

---

## Deployment Checklist

- [ ] CMS panel deployed to Vercel (Plan 1 Task 13)
- [ ] Supabase Storage bucket `message-images` created as public
- [ ] pg_cron enabled and `publish-scheduled-messages` job running
- [ ] Electron `.dmg` shared with macOS employees via company file share
- [ ] Electron `.exe` installer shared with Windows employees via company file share or MDM
- [ ] Each employee logs into the widget with credentials sent via Supabase invite email
