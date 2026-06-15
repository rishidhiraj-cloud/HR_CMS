import { app, ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { createTray, setBadge } from './tray'
import { createPopupWindow, createFeedWindow } from './windows'
import { SeenStore } from './seen-store'
import { AuthStore } from './auth-store'
import type { Message, Employee } from '../shared/types'

const SUPABASE_URL = 'https://ejkhlnmebqzbvpetynbb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqa2hsbm1lYnF6YnZwZXR5bmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDIxNTksImV4cCI6MjA5NzA3ODE1OX0.Z7PQ6BCRpy3HcDUVk6TwverRIGUKA0sTku1rRIQm_yw'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let seenStore: SeenStore
let authStore: AuthStore
let feedWindow: BrowserWindow | null = null
let tray: ReturnType<typeof createTray> | null = null
let currentEmployee: Employee | null = null
let unreadCount = 0

app.whenReady().then(async () => {
  app.dock?.hide()

  seenStore = new SeenStore(path.join(app.getPath('userData'), 'seen.db'))
  authStore = new AuthStore(path.join(app.getPath('userData'), 'auth.enc'))

  // Restore saved session
  const creds = authStore.getCredentials()
  if (creds) {
    const { error } = await supabase.auth.setSession({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
    })
    if (!error) {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single()
      currentEmployee = data as Employee | null
    }
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

  if (currentEmployee) await checkAndShowPopup()

  // Realtime: show popup + badge on new published messages
  supabase
    .channel('messages')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new as Message
      if (msg.published_at && isTargetedAtEmployee(msg, currentEmployee)) {
        if (!seenStore.hasSeen(msg.id)) {
          unreadCount++
          setBadge(tray!, unreadCount)
          feedWindow?.webContents.send('message:new', msg)
          const popup = createPopupWindow()
          popup.show()
        }
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
    createPopupWindow().show()
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

  const { data: emp } = await supabase
    .from('employees')
    .select('*')
    .eq('id', data.user.id)
    .single()

  currentEmployee = emp as Employee
  authStore.saveCredentials({
    email,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  })

  await checkAndShowPopup()
  return {}
})

ipcMain.handle('auth:logout', async () => {
  await supabase.auth.signOut()
  authStore.clearCredentials()
  currentEmployee = null
  unreadCount = 0
  if (tray) setBadge(tray, 0)
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
  if (tray) setBadge(tray, unreadCount)
})

// Keep app alive in tray even when all windows are closed
app.on('window-all-closed', e => e.preventDefault())
