import React, { useEffect, useState } from 'react'
import type { Message } from '../../shared/types'

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
  const remaining = messages.length - current - 1

  async function handleDismiss() {
    await window.hrWidget.markSeen(msg.id)
    if (current + 1 < messages.length) {
      setCurrent(c => c + 1)
    } else {
      window.close()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e1e2e' }}>
      <div style={{ background: '#2a2a3e', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span style={{ color: '#a0a0c0', fontSize: 12 }}>📢 HR Announcement</span>
        {employee && <span style={{ color: '#666', fontSize: 11 }}>Hi, {employee.name.split(' ')[0]}</span>}
      </div>

      <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#e0e0f0' }}>{msg.title}</h2>
        <p style={{ color: '#a0a0c0', fontSize: 11, marginBottom: 12 }}>
          From HR · {new Date(msg.published_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          {' · '}{msg.target_type === 'all' ? 'All Employees' : msg.target_value}
        </p>
        <div
          style={{ color: '#c0c0d8', fontSize: 13, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: msg.content_html }}
        />
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid #2a2a3e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#555' }}>
          {remaining > 0 ? `${remaining} more unread` : ''}
        </span>
        <button
          onClick={handleDismiss}
          style={{ background: '#6c63ff', color: 'white', border: 'none', padding: '7px 18px', borderRadius: 5, fontSize: 12, cursor: 'pointer' }}
        >
          {remaining > 0 ? `Next →` : 'Dismiss'}
        </button>
      </div>
    </div>
  )
}
