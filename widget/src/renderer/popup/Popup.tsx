import React, { useEffect, useState } from 'react'
import type { Message, Poll } from '../../shared/types'
import { getTheme } from '../theme'

const HEADER = {
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  padding: '8px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  WebkitAppRegion: 'drag',
} as React.CSSProperties

const MC_BADGE_BASE = {
  width: 24, height: 24, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 8, fontWeight: 700, color: 'white',
  letterSpacing: '0.2px', flexShrink: 0,
} as React.CSSProperties

// ── Poll popup ──────────────────────────────────────────────────────────────

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

  async function handleVote() {
    await window.hrWidget.openFeedToPolls()
    window.close()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#ffffff' }}>
      <div style={HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ ...MC_BADGE_BASE, background: theme.badgeGradient }}>MC</div>
          <span style={{ color: '#475569', fontSize: 11, fontWeight: 600 }}>M-Connect · New Poll</span>
        </div>
        {employee && (
          <span style={{ color: '#94a3b8', fontSize: 11 }}>Hi, {employee.name.split(' ')[0]}</span>
        )}
      </div>

      <div style={{ padding: '14px 16px', flex: 1, overflow: 'hidden' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.45, margin: 0 }}>
          {poll.question}
        </p>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          {poll.options.length} option{poll.options.length !== 1 ? 's' : ''} · Tap below to vote
        </p>
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={() => window.close()}
          style={{ background: 'none', border: '1px solid #e2e8f0', color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '7px 16px', borderRadius: 8 }}
        >
          Later
        </button>
        <button
          onClick={handleVote}
          style={{ background: theme.primaryGradient, color: 'white', border: 'none', padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Vote Now →
        </button>
      </div>
    </div>
  )
}

// ── Announcement popup ──────────────────────────────────────────────────────

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

  async function handleClose() {
    await window.hrWidget.markSeen(msg.id)
    window.close()
  }

  async function handleOpenUnread() {
    await window.hrWidget.markSeen(msg.id)
    await window.hrWidget.openFeed()
    window.close()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#ffffff' }}>
      <div style={HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ ...MC_BADGE_BASE, background: theme.badgeGradient }}>MC</div>
          <span style={{ color: '#475569', fontSize: 11, fontWeight: 600 }}>M-Connect · Announcement</span>
        </div>
        {employee && (
          <span style={{ color: '#94a3b8', fontSize: 11 }}>Hi, {employee.name.split(' ')[0]}</span>
        )}
      </div>

      <div style={{ padding: '14px 16px', flex: 1, overflow: 'auto', color: '#1e293b' }}>
        <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 5 }}>
          {new Date(msg.published_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          {' · '}{msg.target_type === 'all' ? 'All Employees' : msg.target_value}
        </p>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12, lineHeight: 1.4 }}>{msg.title}</h2>
        <div
          style={{ fontSize: 13, lineHeight: 1.7, color: '#1e293b' }}
          dangerouslySetInnerHTML={{ __html: msg.content_html }}
        />
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {moreCount > 0 ? (
          <button
            onClick={handleOpenUnread}
            style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}
          >
            {moreCount} more unread →
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={handleClose}
          style={{ background: theme.primaryGradient, color: 'white', border: 'none', padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── Root: pick mode from URL ────────────────────────────────────────────────

export default function Popup() {
  const isPollMode = new URLSearchParams(window.location.search).get('mode') === 'poll'
  return isPollMode ? <PollPopup /> : <AnnouncementPopup />
}
