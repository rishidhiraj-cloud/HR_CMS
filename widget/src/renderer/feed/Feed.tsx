import React, { useEffect, useState, useRef } from 'react'
import type { Employee, Message, HrDocument, Poll } from '../../shared/types'
// @ts-ignore
import modicareLogoUrl from '../assets/MCLogo.png'
// @ts-ignore
import kiteLogoUrl from '../assets/icon.png'

const APP_VERSION = '1.0.11'

type ActiveTab = 'announcements' | 'documents' | 'polls' | 'ai-search'

interface QA {
  question: string
  answerHtml: string
  sources: string[]
  error?: boolean
}

// Convert markdown-like Claude output to HTML
function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false

  function inline(s: string): string {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#ffffff">$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em style="font-style:italic;color:rgba(255,255,255,0.85)">$1</em>')
  }

  function closeList() {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (!line.trim()) {
      closeList()
      out.push('<div style="height:7px"></div>')
      continue
    }

    const ulMatch = line.match(/^[-•]\s+(.+)$/)
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul style="margin:4px 0;padding-left:18px;list-style:disc">'); inUl = true }
      out.push(`<li style="margin:3px 0;color:rgba(255,255,255,0.82);font-size:12px;line-height:1.55">${inline(ulMatch[1])}</li>`)
      continue
    }

    const olMatch = line.match(/^(\d+)\.\s+(.+)$/)
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol style="margin:4px 0;padding-left:18px">'); inOl = true }
      out.push(`<li style="margin:3px 0;color:rgba(255,255,255,0.82);font-size:12px;line-height:1.55">${inline(olMatch[2])}</li>`)
      continue
    }

    closeList()
    out.push(`<p style="margin:0 0 5px;color:rgba(255,255,255,0.82);font-size:12px;line-height:1.6">${inline(line)}</p>`)
  }

  closeList()
  return out.join('')
}

const BUBBLE_COLORS = [
  'radial-gradient(circle at 40% 35%, rgba(13,148,136,0.60), rgba(8,145,178,0.25) 55%, transparent 80%)',
  'radial-gradient(circle at 40% 35%, rgba(8,145,178,0.55), rgba(99,102,241,0.20) 55%, transparent 80%)',
  'radial-gradient(circle at 40% 35%, rgba(94,234,212,0.50), rgba(13,148,136,0.20) 55%, transparent 80%)',
  'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.50), rgba(8,145,178,0.20) 55%, transparent 80%)',
]

function BubbleBackground({ mouseRef }: { mouseRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const bubbles = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      x: 40 + (i * 31) % 310,
      y: 60 + (i * 47) % 460,
      vx: ((i % 3) - 1) * 0.3,
      vy: ((i % 5) - 2) * 0.25,
      baseR: 18 + (i % 5) * 14,
    }))
  )
  const els = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let raf: number
    function tick() {
      const { x: mx, y: my } = mouseRef.current
      bubbles.current.forEach((b, i) => {
        const el = els.current[i]
        if (!el) return
        const dx = mx - b.x, dy = my - b.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        b.vx = (b.vx + (dx / dist) * 0.18) * 0.97
        b.vy = (b.vy + (dy / dist) * 0.18) * 0.97
        b.x += b.vx
        b.y += b.vy
        if (b.x < b.baseR) { b.vx += 0.5; b.x = b.baseR }
        if (b.x > 390 - b.baseR) { b.vx -= 0.5; b.x = 390 - b.baseR }
        if (b.y < b.baseR) { b.vy += 0.5; b.y = b.baseR }
        if (b.y > 546 - b.baseR) { b.vy -= 0.5; b.y = 546 - b.baseR }
        const prox = Math.max(0, 1 - dist / 180)
        const r = b.baseR * (1 + prox * 1.5)
        el.style.transform = `translate(${b.x - r}px, ${b.y - r}px)`
        el.style.width = `${r * 2}px`
        el.style.height = `${r * 2}px`
        el.style.opacity = String(0.28 + prox * 0.45)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mouseRef])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {bubbles.current.map((b, i) => (
        <div
          key={i}
          ref={el => { els.current[i] = el }}
          style={{
            position: 'absolute',
            top: 0, left: 0,
            borderRadius: '50%',
            background: BUBBLE_COLORS[i % 4],
            width: b.baseR * 2,
            height: b.baseR * 2,
            transform: `translate(${b.x - b.baseR}px, ${b.y - b.baseR}px)`,
            opacity: 0.28,
            willChange: 'transform, width, height, opacity',
          }}
        />
      ))}
    </div>
  )
}

const BG = 'linear-gradient(135deg, #0a0f1e 0%, #0b2d3d 45%, #0a1f2a 100%)'
const HEADER_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  padding: '10px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  WebkitAppRegion: 'drag',
  flexShrink: 0,
} as React.CSSProperties

export default function Feed() {
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined)
  const [messages, setMessages] = useState<Message[]>([])
  const [unseenIds, setUnseenIds] = useState<Set<string>>(new Set())
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [selected, setSelected] = useState<Message | null>(null)
  const [loginError, setLoginError] = useState('')
  const [msLoggingIn, setMsLoggingIn] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('announcements')
  const [isExpanded, setIsExpanded] = useState(false)
  const [passcodeFor, setPasscodeFor] = useState<'logout' | 'quit' | null>(null)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeError, setPasscodeError] = useState(false)
  const [passcodeShake, setPasscodeShake] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [qaHistory, setQaHistory] = useState<QA[]>([])
  const qaEndRef = useRef<HTMLDivElement>(null)
  const loginMouseRef = useRef<{ x: number; y: number }>({ x: 195, y: 300 })

  const [documents, setDocuments] = useState<HrDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsLoaded, setDocsLoaded] = useState(false)

  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [pollsLoaded, setPollsLoaded] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [newPollAlert, setNewPollAlert] = useState(false)

  useEffect(() => {
    window.hrWidget.getEmployee().then(emp => setEmployee(emp ?? null))
    window.hrWidget.isUpdateReady().then(ready => { if (ready) setUpdateReady(true) })
    const unsubUpdate = window.hrWidget.onUpdateReady(() => setUpdateReady(true))
    return unsubUpdate
  }, [])

  useEffect(() => {
    if (!employee) return
    window.hrWidget.getMessages().then(msgs => setMessages(msgs))
    window.hrWidget.getUnseenIds().then(ids => setUnseenIds(new Set(ids)))

    const unsubMsg = window.hrWidget.onNewMessage(msg => {
      setMessages(prev => [msg as Message, ...prev])
      setUnseenIds(prev => new Set([...prev, (msg as Message).id]))
    })
    const unsubUnread = window.hrWidget.onShowUnread(() => {
      setActiveTab('announcements')
      setShowUnreadOnly(true)
      setSelected(null)
    })
    const unsubMarked = window.hrWidget.onMessageMarkedSeen(id => {
      setUnseenIds(prev => { const s = new Set(prev); s.delete(id); return s })
    })
    const unsubDisabled = window.hrWidget.onDisabled(() => {
      setEmployee(null)
      setMessages([])
      setUnseenIds(new Set())
      setSelected(null)
      setLoginError('Your account has been disabled. Please contact HR.')
    })
    const unsubPoll = window.hrWidget.onNewPoll(() => {
      setNewPollAlert(true)
      setActiveTab(prev => {
        if (prev === 'polls') loadPolls(true)
        return prev
      })
    })
    const unsubShowPolls = window.hrWidget.onShowPolls(() => {
      handleTabChange('polls')
    })
    const unsubPasscode = window.hrWidget.onRequestPasscode((action) => {
      openPasscode(action)
    })

    // Show badge dot if there are already unvoted polls (catches startup case where
    // feedWindow was null when checkForNewPolls ran in the main process)
    window.hrWidget.getPolls().then(polls => {
      if (polls.some(p => !p.hasVoted)) setNewPollAlert(true)
    })
    return () => { unsubMsg(); unsubUnread(); unsubMarked(); unsubDisabled(); unsubPoll(); unsubShowPolls(); unsubPasscode() }
  }, [employee])

  useEffect(() => {
    qaEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qaHistory, asking])

  async function loadDocuments() {
    if (docsLoaded || docsLoading) return
    setDocsLoading(true)
    const docs = await window.hrWidget.getDocuments()
    setDocuments(docs)
    setDocsLoaded(true)
    setDocsLoading(false)
  }

  async function loadPolls(force = false) {
    if ((pollsLoaded && !force) || pollsLoading) return
    setPollsLoading(true)
    const p = await window.hrWidget.getPolls()
    setPolls(p)
    setPollsLoaded(true)
    setPollsLoading(false)
  }

  function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab)
    if (tab === 'documents') loadDocuments()
    if (tab === 'polls') {
      setNewPollAlert(false)
      window.hrWidget.clearPollBadge()
      loadPolls(true)
    }
  }

  async function handleVote(pollId: string, optionIndex: number) {
    setVotingId(pollId)
    const result = await window.hrWidget.votePoll(pollId, optionIndex)
    if (result.voteCounts !== undefined) {
      setPolls(prev => prev.map(p => p.id === pollId
        ? { ...p, hasVoted: true, myVote: optionIndex, voteCounts: result.voteCounts!, totalVotes: result.totalVotes! }
        : p
      ))
    }
    setVotingId(null)
  }

  async function handleMicrosoftLogin() {
    setLoginError('')
    setMsLoggingIn(true)
    const result = await window.hrWidget.loginWithMicrosoft()
    if (result?.error) {
      setLoginError(result.error)
      setMsLoggingIn(false)
    } else {
      const emp = await window.hrWidget.getEmployee()
      setEmployee(emp ?? null)
      setMsLoggingIn(false)
    }
  }

  async function handleLogout() {
    await window.hrWidget.logout()
    setEmployee(null)
    setMessages([])
    setUnseenIds(new Set())
    setSelected(null)
    setShowUnreadOnly(false)
    setQaHistory([])
    setDocuments([])
    setDocsLoaded(false)
    setActiveTab('announcements')
  }

  function openPasscode(action: 'logout' | 'quit') {
    setPasscodeInput('')
    setPasscodeError(false)
    setPasscodeShake(false)
    setPasscodeFor(action)
  }

  function submitPasscode() {
    if (passcodeInput === '7486') {
      const action = passcodeFor
      setPasscodeFor(null)
      if (action === 'logout') handleLogout()
      else window.hrWidget.quitApp()
    } else {
      setPasscodeError(true)
      setPasscodeInput('')
      setPasscodeShake(true)
      setTimeout(() => setPasscodeShake(false), 500)
    }
  }

  function handleMarkSeen(id: string) {
    window.hrWidget.markSeen(id)
    setUnseenIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || asking) return
    setQuestion('')
    setAsking(true)
    const result = await window.hrWidget.askHr(q)
    setAsking(false)
    if (result.error) {
      setQaHistory(prev => [...prev, { question: q, answerHtml: result.error!, sources: [], error: true }])
    } else {
      setQaHistory(prev => [...prev, {
        question: q,
        answerHtml: renderMarkdown(result.answer ?? 'No answer returned.'),
        sources: result.sources ?? [],
      }])
    }
  }

  async function handleOpenDocument(doc: HrDocument) {
    if (!doc.file_url) return
    window.hrWidget.logDocumentAccess(doc.id)
    await window.hrWidget.openDocumentUrl(doc.file_url)
  }

  // Loading
  if (employee === undefined) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: BG }}>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>Loading…</span>
      </div>
    )
  }

  // Login
  if (!employee) {
    return (
      <div
        style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, position: 'relative', overflow: 'hidden' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          loginMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }}
      >
        <BubbleBackground mouseRef={loginMouseRef} />

        {/* Drag region */}
        <div style={{ height: 28, WebkitAppRegion: 'drag', flexShrink: 0, position: 'relative', zIndex: 1 } as React.CSSProperties} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px 24px', position: 'relative', zIndex: 1, gap: 0 }}>

          {/* Kite logo */}
          <img
            src={kiteLogoUrl}
            alt="M-Connect"
            style={{ width: 88, height: 88, objectFit: 'contain', marginBottom: 16, filter: 'drop-shadow(0 8px 24px rgba(0,120,210,0.35))' }}
          />

          {/* App name */}
          <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 20, margin: '0 0 3px', letterSpacing: '-0.4px' }}>M-Connect</p>
          <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: 10, margin: '0 0 30px', letterSpacing: '1.2px', textTransform: 'uppercase' }}>Modicare Employee Hub</p>

          {/* Welcome text */}
          <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: 600, margin: '0 0 6px', textAlign: 'center' }}>Welcome back</p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: '0 0 22px', textAlign: 'center', lineHeight: 1.55 }}>Sign in with your Modicare corporate account</p>

          {/* Microsoft SSO button */}
          <button
            onClick={handleMicrosoftLogin}
            disabled={msLoggingIn}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              width: '100%', padding: '11px 20px',
              background: msLoggingIn ? 'rgba(255,255,255,0.90)' : '#ffffff',
              border: 'none', borderRadius: 12,
              cursor: msLoggingIn ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600, color: '#1a1a1a',
              boxShadow: '0 4px 20px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.10)',
              transition: 'opacity 0.15s, transform 0.1s',
              opacity: msLoggingIn ? 0.80 : 1,
            }}
            onMouseEnter={e => { if (!msLoggingIn) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
          >
            {msLoggingIn ? (
              <span style={{ width: 18, height: 18, border: '2.5px solid #ddd', borderTopColor: '#0078d4', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            )}
            {msLoggingIn ? 'Signing in…' : 'Sign in with Microsoft'}
          </button>

          {loginError && (
            <div style={{ marginTop: 14, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10, padding: '8px 14px', width: '100%' }}>
              <p style={{ color: '#fca5a5', fontSize: 11, margin: 0, textAlign: 'center' }}>{loginError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', paddingBottom: 16, position: 'relative', zIndex: 1 }}>
          <p style={{ color: 'rgba(255,255,255,0.20)', fontSize: 10, margin: 0, letterSpacing: '0.3px' }}>Secured by Microsoft Identity</p>
        </div>
      </div>
    )
  }

  // Announcement detail — white background so HR-formatted content renders correctly
  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#ffffff' }}>
        {/* Header: Back button styled like Ask */}
        <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 14px', WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <button
            onClick={() => setSelected(null)}
            style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ← Back
          </button>
        </div>
        {/* Content */}
        <div style={{ padding: '14px 16px', flex: 1, overflow: 'auto', background: '#ffffff', color: '#1e293b' }}>
          <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 5 }}>
            {new Date(selected.published_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}{selected.target_type === 'all' ? 'All Employees' : selected.target_value}
          </p>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 14, lineHeight: 1.4 }}>{selected.title}</p>
          <div style={{ fontSize: 13, lineHeight: 1.75, color: '#1e293b' }} dangerouslySetInnerHTML={{ __html: selected.content_html }} />
        </div>
      </div>
    )
  }

  const displayedMessages = showUnreadOnly
    ? messages.filter(m => unseenIds.has(m.id))
    : messages

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, position: 'relative' }}>

      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#0d9488,#0f766e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0, letterSpacing: '0.2px' }}>MC</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', lineHeight: 1 }}>M-Connect</div>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#ffffff', marginTop: 1 }}>Hi, {employee.name.split(' ')[0]} 👋</div>
        </div>
        {/* Window controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Expand / Collapse */}
          <button
            title={isExpanded ? 'Collapse' : 'Expand'}
            onClick={() => {
              const next = !isExpanded
              setIsExpanded(next)
              window.hrWidget.setExpanded(next)
            }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.50)', cursor: 'pointer', padding: '4px 5px', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.90)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}
          >
            {isExpanded ? (
              /* Collapse: inward arrows */
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="8,1 12,1 12,5"/>
                <polyline points="5,12 1,12 1,8"/>
                <line x1="12" y1="1" x2="7.5" y2="5.5"/>
                <line x1="1" y1="12" x2="5.5" y2="7.5"/>
              </svg>
            ) : (
              /* Expand: outward arrows */
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="8,1 12,1 12,5"/>
                <polyline points="5,12 1,12 1,8"/>
                <line x1="7" y1="7" x2="12" y2="1"/>
                <line x1="1" y1="12" x2="6" y2="6"/>
              </svg>
            )}
          </button>

          {/* Minimize */}
          <button
            title="Minimise"
            onClick={() => window.hrWidget.minimizeWidget()}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.50)', cursor: 'pointer', padding: '4px 5px', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.90)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <line x1="2" y1="10" x2="11" y2="10"/>
            </svg>
          </button>

          <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)', margin: '0 3px' }} />

          <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9, letterSpacing: '0.2px', userSelect: 'none' }}>v{APP_VERSION}</span>

          <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)', margin: '0 3px' }} />

          <button onClick={() => openPasscode('logout')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.50)', cursor: 'pointer', fontSize: 11, padding: '4px 2px', transition: 'color 0.15s' } as React.CSSProperties}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.90)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        {([
          { id: 'announcements', label: 'MESSAGES',  badge: unseenIds.size },
          { id: 'documents',     label: 'POLICIES',  badge: 0 },
          { id: 'polls',         label: 'POLLS',     badge: newPollAlert ? 1 : 0 },
          { id: 'ai-search',     label: 'ASK AI',    badge: 0 },
        ] as { id: ActiveTab; label: string; badge: number }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #0d9488' : '2px solid transparent',
              color: activeTab === tab.id ? '#5eead4' : 'rgba(255,255,255,0.60)',
              fontSize: 9,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              padding: '8px 2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span style={{ background: '#0d9488', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 5px' }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Announcements ── */}
      {activeTab === 'announcements' && (
        <>
          {unseenIds.size > 0 && (
            <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              {[{ label: 'All', active: !showUnreadOnly, onClick: () => setShowUnreadOnly(false) },
                { label: `Unread (${unseenIds.size})`, active: showUnreadOnly, onClick: () => setShowUnreadOnly(true) }]
                .map(t => (
                  <button key={t.label} onClick={t.onClick} style={{
                    background: t.active ? 'rgba(13,148,136,0.20)' : 'none',
                    border: t.active ? '1px solid rgba(13,148,136,0.35)' : '1px solid transparent',
                    color: t.active ? '#5eead4' : 'rgba(255,255,255,0.60)',
                    fontSize: 11, cursor: 'pointer', padding: '2px 10px', borderRadius: 6,
                  }}>{t.label}</button>
                ))}
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {displayedMessages.map(msg => {
              const isUnseen = unseenIds.has(msg.id)
              return (
                <div
                  key={msg.id}
                  onClick={() => { setSelected(msg); if (isUnseen) handleMarkSeen(msg.id) }}
                  style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    {isUnseen && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0d9488', flexShrink: 0 }} />}
                    <div style={{ fontWeight: isUnseen ? 700 : 600, fontSize: 12, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.title}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.60)', marginBottom: 4, paddingLeft: isUnseen ? 12 : 0 }}>
                    {new Date(msg.published_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {' · '}{msg.target_type === 'all' ? 'All Employees' : msg.target_value}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.70)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, paddingLeft: isUnseen ? 12 : 0 }}>
                    {msg.content_html.replace(/<[^>]+>/g, '')}
                  </div>
                </div>
              )
            })}
            {displayedMessages.length === 0 && (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.50)', fontSize: 12, padding: '40px 0' }}>
                {showUnreadOnly ? 'No unread messages' : 'No announcements yet'}
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Documents ── */}
      {activeTab === 'documents' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {docsLoading && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.50)', fontSize: 12, padding: '40px 0' }}>Loading…</p>
          )}
          {!docsLoading && documents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 14px' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📂</p>
              <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>No documents available</p>
              <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 11, marginTop: 4 }}>HR will upload documents here for your reference.</p>
            </div>
          )}
          {documents.map(doc => (
            <div
              key={doc.id}
              onClick={() => handleOpenDocument(doc)}
              style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: doc.file_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s' }}
              onMouseEnter={e => { if (doc.file_url) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>
                {doc.file_type === 'pdf' ? '📕' : doc.file_type === 'docx' ? '📘' : '📄'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.60)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ textTransform: 'uppercase' }}>{doc.file_type}</span>
                  {doc.target_level && (
                    <span style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 600 }}>
                      {doc.target_level}
                    </span>
                  )}
                </div>
              </div>
              {doc.file_url && (
                <span style={{ fontSize: 10, color: '#5eead4', flexShrink: 0 }}>Open ↗</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Polls ── */}
      {activeTab === 'polls' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
          {pollsLoading && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.50)', fontSize: 12, padding: '40px 0' }}>Loading…</p>
          )}
          {!pollsLoading && polls.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 14px' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📊</p>
              <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>No active polls</p>
              <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 11, marginTop: 4 }}>HR will post polls here for your feedback.</p>
            </div>
          )}
          {polls.map(poll => {
            const isVoting = votingId === poll.id
            const maxVotes = Math.max(...poll.voteCounts, 1)
            return (
              <div key={poll.id} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', marginBottom: 10, lineHeight: 1.4 }}>{poll.question}</p>
                {!poll.hasVoted ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {poll.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleVote(poll.id, i)}
                        disabled={isVoting}
                        style={{
                          background: 'rgba(255,255,255,0.07)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 8,
                          padding: '7px 12px',
                          color: '#ffffff',
                          fontSize: 11,
                          cursor: isVoting ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          opacity: isVoting ? 0.6 : 1,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!isVoting) (e.currentTarget as HTMLElement).style.background = 'rgba(13,148,136,0.20)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
                      >
                        {opt}
                      </button>
                    ))}
                    {isVoting && <p style={{ fontSize: 10, color: '#5eead4', textAlign: 'center' }}>Submitting…</p>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {poll.options.map((opt, i) => {
                      const count = poll.voteCounts[i] ?? 0
                      const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0
                      const barWidth = poll.totalVotes > 0 ? (count / maxVotes) * 100 : 0
                      const isMyVote = poll.myVote === i
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                            <span style={{ color: isMyVote ? '#5eead4' : 'rgba(255,255,255,0.80)', fontWeight: isMyVote ? 600 : 400 }}>
                              {isMyVote ? '✓ ' : ''}{opt}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.65)' }}>{count} ({pct}%)</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
                            <div style={{ height: '100%', borderRadius: 3, width: `${barWidth}%`, background: isMyVote ? 'linear-gradient(90deg,#0d9488,#0891b2)' : 'rgba(255,255,255,0.20)', transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''} total</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── AI Search ── */}
      {activeTab === 'ai-search' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
            {qaHistory.length === 0 && !asking && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>🤖</p>
                <p style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12, fontWeight: 600 }}>Ask about company policies</p>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 }}>
                  Ask about leave, payroll, benefits, conduct, and more.
                </p>
              </div>
            )}
            {qaHistory.map((qa, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                {/* Question */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <div style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', borderRadius: '12px 12px 2px 12px', padding: '7px 11px', fontSize: 12, maxWidth: '85%', lineHeight: 1.4 }}>
                    {qa.question}
                  </div>
                </div>
                {/* Answer */}
                <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '2px 12px 12px 12px', padding: '10px 12px', maxWidth: '92%' }}>
                  {qa.error ? (
                    <span style={{ color: '#f87171', fontSize: 12 }}>{qa.answerHtml}</span>
                  ) : (
                    <>
                      <div dangerouslySetInnerHTML={{ __html: qa.answerHtml }} />
                      {qa.sources.length > 0 && (
                        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.55)', fontSize: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                          📄 {qa.sources.join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {asking && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '2px 12px 12px 12px', padding: '10px 12px', maxWidth: '92%', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #5eead4', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: '#5eead4', fontSize: 12 }}>Thinking…</span>
              </div>
            )}
            <div ref={qaEndRef} />
          </div>

          <form onSubmit={handleAsk} style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask about a policy…"
              disabled={asking}
              style={{ ...S.input, flex: 1, fontSize: 12, padding: '7px 10px' }}
            />
            <button
              type="submit"
              disabled={!question.trim() || asking}
              style={{ ...S.primaryBtn, padding: '7px 16px', fontSize: 12, opacity: (!question.trim() || asking) ? 0.5 : 1 }}
            >
              Ask
            </button>
          </form>
        </div>
      )}

      {/* Update banner */}
      {updateReady && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(135deg,#0d9488,#0891b2)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 50 }}>
          <span style={{ fontSize: 16 }}>🔄</span>
          <span style={{ flex: 1, color: '#ffffff', fontSize: 11, fontWeight: 600, lineHeight: 1.4 }}>A new version is available!</span>
          <button
            onClick={() => window.hrWidget.openReleasePage()}
            style={{ background: 'rgba(255,255,255,0.20)', border: '1px solid rgba(255,255,255,0.35)', color: '#ffffff', borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            Download
          </button>
        </div>
      )}

      {/* Passcode modal */}
      {passcodeFor && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div
            style={{ background: 'linear-gradient(135deg,#0b2030,#0d2840)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '28px 24px', width: 260, boxShadow: '0 20px 60px rgba(0,0,0,0.50)', animation: passcodeShake ? 'shake 0.45s ease' : 'none' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
              <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 13, margin: 0 }}>Admin Passcode Required</p>
              <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 11, marginTop: 4 }}>
                {passcodeFor === 'logout' ? 'Enter passcode to sign out' : 'Enter passcode to quit'}
              </p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={passcodeInput}
              onChange={e => { setPasscodeInput(e.target.value); setPasscodeError(false) }}
              onKeyDown={e => { if (e.key === 'Enter') submitPasscode() }}
              placeholder="••••"
              style={{ ...S.input, textAlign: 'center', letterSpacing: 6, fontSize: 18, marginBottom: 6, border: passcodeError ? '1px solid rgba(239,68,68,0.60)' : '1px solid rgba(255,255,255,0.14)' }}
            />
            {passcodeError && (
              <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', margin: '0 0 8px' }}>Incorrect passcode</p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setPasscodeFor(null)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.70)', borderRadius: 8, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={submitPasscode}
                style={{ flex: 1, background: 'linear-gradient(135deg,#0d9488,#0891b2)', border: 'none', color: '#ffffff', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20%      { transform: translateX(-8px) }
          40%      { transform: translateX(8px) }
          60%      { transform: translateX(-6px) }
          80%      { transform: translateX(6px) }
        }
      `}</style>
    </div>
  )
}

const S = {
  input: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 8,
    padding: '8px 10px',
    color: '#ffffff',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  } as React.CSSProperties,

  primaryBtn: {
    background: 'linear-gradient(135deg, #0d9488, #0891b2)',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '9px 0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,
}
