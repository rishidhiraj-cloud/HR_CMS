import { app, ipcMain, shell, BrowserWindow } from 'electron'
import path from 'path'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { createTray, setBadge } from './tray'
import { createPopupWindow, createFeedWindow, createPollPopupWindow } from './windows'
import { SeenStore } from './seen-store'
import { AuthStore } from './auth-store'
import type { Message, Employee, Poll } from '../shared/types'

const SUPABASE_URL = 'https://ejkhlnmebqzbvpetynbb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqa2hsbm1lYnF6YnZwZXR5bmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDIxNTksImV4cCI6MjA5NzA3ODE1OX0.Z7PQ6BCRpy3HcDUVk6TwverRIGUKA0sTku1rRIQm_yw'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
})

let seenStore: SeenStore
let authStore: AuthStore
let feedWindow: BrowserWindow | null = null
let popupWindow: BrowserWindow | null = null
let tray: ReturnType<typeof createTray> | null = null
let currentEmployee: Employee | null = null
let unreadCount = 0
let realtimeChannel: RealtimeChannel | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const notifiedIds = new Set<string>() // prevents repeat popups within a session
const notifiedPollIds = new Set<string>() // prevents repeat poll notifications
let unreadPollCount = 0
let pollForPopup: Poll | null = null

// Polling: check for new messages + polls every 30 seconds (primary notification mechanism)
function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer)
  pollingTimer = setInterval(async () => {
    if (!currentEmployee) return
    await checkForNewMessages()
    await checkForNewPolls()
  }, 30_000)
}

function stopPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
}

async function updatePresence() {
  if (!currentEmployee) return
  await supabase
    .from('employee_presence')
    .upsert({ employee_id: currentEmployee.id, last_seen_at: new Date().toISOString() }, { onConflict: 'employee_id' })
}

function startHeartbeat() {
  updatePresence()
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(updatePresence, 5 * 60 * 1000)
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

// Realtime: instant notifications when Supabase Realtime is enabled (bonus)
async function subscribeToMessages() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }

  // Set auth BEFORE subscribing so postgres_changes events pass RLS filters
  const { data } = await supabase.auth.getSession()
  if (data.session) supabase.realtime.setAuth(data.session.access_token)

  realtimeChannel = supabase
    .channel('messages-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleRealtimeMsg)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, handleRealtimeMsg)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'polls' }, handleRealtimePoll)
    .subscribe(status => {
      console.log('[realtime] status:', status)
    })
}

function handleRealtimeMsg(payload: { new: Record<string, unknown> }) {
  const msg = payload.new as unknown as Message
  console.log('[realtime] received:', msg.id, 'published_at:', msg.published_at)
  if (!msg.published_at) return
  notifyIfUnseen(msg)
}

function handleRealtimePoll(payload: { new: Record<string, unknown> }) {
  const poll = payload.new
  if (poll.status !== 'active') return
  if (!currentEmployee) return
  if (poll.target_type !== 'all' && !(poll.target_type === 'level' && poll.target_value === currentEmployee.role)) return
  if (notifiedPollIds.has(poll.id as string)) return

  notifiedPollIds.add(poll.id as string)
  unreadPollCount++
  setBadge(tray!, unreadCount + unreadPollCount)
  feedWindow?.webContents.send('poll:new')
  console.log('[poll] new poll notification:', poll.id)

  pollForPopup = poll as unknown as Poll
  createPollPopupWindow().show()
}

async function checkForNewPolls() {
  if (!currentEmployee) return
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return

  try {
    const res = await fetch(`${CMS_BASE_URL}/api/polls/active`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    console.log('[checkForNewPolls] api status:', res.status)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[checkForNewPolls] api error:', body)
      return
    }
    const polls: Poll[] = await res.json()
    const unvoted = polls.filter(p => !p.hasVoted)
    console.log('[checkForNewPolls] total:', polls.length, 'unvoted:', unvoted.length)

    let newlyFound = 0
    let firstNewPoll: Poll | undefined
    for (const poll of unvoted) {
      if (!notifiedPollIds.has(poll.id)) {
        if (!firstNewPoll) firstNewPoll = poll
        notifiedPollIds.add(poll.id)
        unreadPollCount++
        newlyFound++
      }
    }

    if (newlyFound > 0) {
      setBadge(tray!, unreadCount + unreadPollCount)
      feedWindow?.webContents.send('poll:new')
      console.log('[checkForNewPolls] badge set, unreadPollCount:', unreadPollCount, 'feedWindow open:', !!feedWindow)

      if (firstNewPoll) {
        pollForPopup = firstNewPoll
        createPollPopupWindow().show()
      }
    }
  } catch (err) {
    console.error('[checkForNewPolls] error:', err)
  }
}

async function checkForNewMessages() {
  if (!currentEmployee) return

  // Re-check active status — HR may have disabled this employee
  const { data: empCheck } = await supabase
    .from('employees')
    .select('is_active')
    .eq('id', currentEmployee.id)
    .single()

  if (empCheck && !empCheck.is_active) {
    console.log('[poll] employee disabled — signing out')
    stopPolling()
    stopHeartbeat()
    if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null }
    await supabase.auth.signOut()
    currentEmployee = null
    unreadCount = 0
    if (tray) setBadge(tray, 0)
    feedWindow?.webContents.send('employee:disabled')
    return
  }

  const { data } = await supabase
    .from('messages')
    .select('*')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  if (!data) return
  const targeted = (data as Message[]).filter(m => isTargetedAtEmployee(m, currentEmployee))
  const unseenIds = seenStore.filterUnseen(targeted.map(m => m.id))

  let anyNew = false
  for (const id of unseenIds) {
    const msg = targeted.find(m => m.id === id)!
    if (registerUnseen(msg)) anyNew = true
  }
  // Show a single coalesced popup for the whole batch (the popup itself
  // shows the first unread + a "N more unread" link).
  if (anyNew) showMessagePopup()
}

// Sync all locally-seen messages to Supabase message_reads (catches up after migration or re-install)
async function syncLocalReadsToSupabase() {
  if (!currentEmployee) return
  const seenIds = seenStore.getAllSeen()
  if (seenIds.length === 0) return
  const rows = seenIds.map(id => ({ message_id: id, employee_id: currentEmployee!.id }))
  const { error } = await supabase
    .from('message_reads')
    .upsert(rows, { onConflict: 'message_id,employee_id', ignoreDuplicates: true })
  if (error) console.error('[syncReads] error:', error.message)
  else console.log(`[syncReads] synced ${seenIds.length} reads`)
}

// Register a new unseen message (badge + feed sync) without showing a popup.
// Returns true if this message was newly registered this session.
function registerUnseen(msg: Message): boolean {
  if (!isTargetedAtEmployee(msg, currentEmployee)) return false
  if (seenStore.hasSeen(msg.id)) return false
  if (notifiedIds.has(msg.id)) return false  // already notified this session

  notifiedIds.add(msg.id)
  console.log('[notify] new message:', msg.title)
  unreadCount++
  if (tray) setBadge(tray, unreadCount)
  feedWindow?.webContents.send('message:new', msg)
  return true
}

// Show (or reuse) the single announcement popup. The popup renderer fetches the
// current unseen set itself, so one window is enough — never one per message.
function showMessagePopup() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.reload()  // refresh the unseen list shown in the existing popup
    popupWindow.show()
    return
  }
  popupWindow = createPopupWindow()
  popupWindow.on('closed', () => { popupWindow = null })
  popupWindow.show()
}

function notifyIfUnseen(msg: Message) {
  if (registerUnseen(msg)) showMessagePopup()
}

app.whenReady().then(async () => {
  // Single-instance lock: a second launch should surface the existing widget,
  // not spawn a duplicate tray / timers / realtime channel / SQLite handle.
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    if (feedWindow && !feedWindow.isDestroyed()) feedWindow.show()
  })

  try {
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
        const { data: userData } = await supabase.auth.getUser()
        if (userData.user) {
          const { data: emp } = await supabase
            .from('employees')
            .select('*')
            .eq('id', userData.user.id)
            .single()
          currentEmployee = emp as Employee | null
          if (currentEmployee) {
            subscribeToMessages()
            startPolling()
            startHeartbeat()
            syncLocalReadsToSupabase()
          }
        }
      } else {
        authStore.clearCredentials()
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

    if (currentEmployee) {
      await checkAndShowPopup()
      await checkForNewPolls()
    }
  } catch (err) {
    console.error('[HR Widget] startup error:', err)
  }
})

async function checkAndShowPopup() {
  const { data: msgs, error } = await supabase
    .from('messages')
    .select('*')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  console.log('[checkAndShowPopup] msgs:', msgs?.length ?? 0, 'error:', error?.message)

  if (!msgs || msgs.length === 0) return
  const targeted = (msgs as Message[]).filter(m => isTargetedAtEmployee(m, currentEmployee))
  const unseenIds = seenStore.filterUnseen(targeted.map(m => m.id))

  if (unseenIds.length > 0) {
    unreadCount = unseenIds.length
    if (tray) setBadge(tray, unreadCount)
    unseenIds.forEach(id => notifiedIds.add(id))
    showMessagePopup()
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
  if (error) {
    console.log('[auth:login] signIn error:', error.message)
    return { error: 'Invalid email or password' }
  }

  const { data: emp, error: empError } = await supabase
    .from('employees')
    .select('*')
    .eq('id', data.user.id)
    .single()

  console.log('[auth:login] employee lookup:', emp?.name ?? 'not found', empError?.message)

  if (empError || !emp) {
    await supabase.auth.signOut()
    return { error: 'No employee account found for this email' }
  }

  if (!(emp as Employee).is_active) {
    await supabase.auth.signOut()
    return { error: 'Your account has been disabled. Please contact HR.' }
  }

  currentEmployee = emp as Employee
  authStore.saveCredentials({
    email,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  })

  // Start realtime + polling after login
  subscribeToMessages()
  startPolling()
  startHeartbeat()
  syncLocalReadsToSupabase()

  await checkAndShowPopup()
  await checkForNewPolls()
  return {}
})

ipcMain.handle('auth:logout', async () => {
  stopPolling()
  stopHeartbeat()
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
  await supabase.auth.signOut()
  authStore.clearCredentials()
  currentEmployee = null
  unreadCount = 0
  unreadPollCount = 0
  notifiedIds.clear()
  notifiedPollIds.clear()
  if (tray) setBadge(tray, 0)
})

ipcMain.handle('auth:getEmployee', () => currentEmployee)

ipcMain.handle('messages:getAll', async () => {
  if (!currentEmployee) return []
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  console.log('[messages:getAll] count:', data?.length ?? 0, 'error:', error?.message)
  return ((data as Message[]) ?? []).filter(m => isTargetedAtEmployee(m, currentEmployee))
})

ipcMain.handle('messages:getUnseenIds', async () => {
  if (!currentEmployee) return []
  const { data } = await supabase
    .from('messages')
    .select('id, target_type, target_value')
    .not('published_at', 'is', null)
  if (!data) return []
  const targeted = (data as Pick<Message, 'id' | 'target_type' | 'target_value'>[])
    .filter(m => isTargetedAtEmployee(m as Message, currentEmployee))
    .map(m => m.id)
  return seenStore.filterUnseen(targeted)
})

ipcMain.handle('messages:markSeen', (_event, id: string) => {
  seenStore.markSeen(id)
  notifiedIds.add(id)
  unreadCount = Math.max(0, unreadCount - 1)
  if (tray) setBadge(tray, unreadCount)
  // Sync feed window so the purple dot disappears immediately
  feedWindow?.webContents.send('feed:markedSeen', id)

  // Fire-and-forget: persist read receipt to Supabase so HR can see it
  if (currentEmployee) {
    supabase
      .from('message_reads')
      .upsert(
        { message_id: id, employee_id: currentEmployee.id },
        { onConflict: 'message_id,employee_id', ignoreDuplicates: true }
      )
      .then(({ error }) => {
        if (error) console.error('[markSeen] read receipt error:', error.message)
      })
  }
})

ipcMain.handle('window:openFeed', async () => {
  if (!feedWindow || feedWindow.isDestroyed()) {
    const bounds = tray!.getBounds()
    feedWindow = createFeedWindow(bounds)
    feedWindow.once('ready-to-show', () => {
      feedWindow?.webContents.send('feed:showUnread')
    })
    feedWindow.show()
  } else {
    feedWindow.show()
    feedWindow.webContents.send('feed:showUnread')
  }
})

ipcMain.handle('window:openFeedToPolls', async () => {
  if (!feedWindow || feedWindow.isDestroyed()) {
    const bounds = tray!.getBounds()
    feedWindow = createFeedWindow(bounds)
    feedWindow.once('ready-to-show', () => {
      feedWindow?.webContents.send('feed:showPolls')
    })
    feedWindow.show()
  } else {
    feedWindow.show()
    feedWindow.webContents.send('feed:showPolls')
  }
})

const CMS_BASE_URL = 'https://hrcms-ten.vercel.app'

ipcMain.handle('hr:ask', async (_event, question: string) => {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { error: 'Not logged in' }

  try {
    const res = await fetch(`${CMS_BASE_URL}/api/policies/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ question }),
    })
    return res.json()
  } catch (err) {
    console.error('[hr:ask] error:', err)
    return { error: 'Could not connect to HR service' }
  }
})

ipcMain.handle('documents:getAll', async () => {
  if (!currentEmployee) return []
  const { data } = await supabase
    .from('policy_documents')
    .select('id, name, file_type, file_url, target_level')
    .eq('status', 'ready')
    .order('name', { ascending: true })
  return data ?? []
})

ipcMain.handle('documents:openUrl', async (_event, url: string) => {
  if (url) await shell.openExternal(url)
})

ipcMain.handle('documents:logAccess', async (_event, documentId: string) => {
  if (!currentEmployee) return
  await supabase.from('document_access_logs').insert({
    document_id: documentId,
    employee_id: currentEmployee.id,
  })
})

ipcMain.handle('polls:getActive', async (): Promise<Poll[]> => {
  if (!currentEmployee) return []
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return []

  try {
    const res = await fetch(`${CMS_BASE_URL}/api/polls/active`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    console.log('[polls:getActive] status:', res.status)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[polls:getActive] error body:', body)
      return []
    }
    const data = await res.json()
    console.log('[polls:getActive] returned:', data.length, 'polls')
    return data
  } catch (err) {
    console.error('[polls:getActive] error:', err)
    return []
  }
})

ipcMain.handle('polls:vote', async (_event, pollId: string, optionIndex: number) => {
  if (!currentEmployee) return { error: 'Not logged in' }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { error: 'Not logged in' }

  try {
    const res = await fetch(`${CMS_BASE_URL}/api/polls/${pollId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ optionIndex }),
    })
    return res.json()
  } catch (err) {
    console.error('[polls:vote] error:', err)
    return { error: 'Failed to submit vote' }
  }
})

ipcMain.handle('polls:clearBadge', () => {
  unreadPollCount = 0
  setBadge(tray!, unreadCount)
})

ipcMain.handle('polls:getPopupPoll', () => {
  const p = pollForPopup
  pollForPopup = null
  return p
})

app.on('window-all-closed', (e: { preventDefault: () => void }) => e.preventDefault())
