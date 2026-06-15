import React, { useEffect, useState } from 'react'
import type { Message } from '../../shared/types'

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
        <div style={{ background: '#2a2a3e', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <button
            onClick={() => setSelected(null)}
            style={{ background: 'none', border: 'none', color: '#a0a0c0', cursor: 'pointer', fontSize: 13, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ← Back
          </button>
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
      <div style={{ background: '#2a2a3e', padding: '10px 14px', WebkitAppRegion: 'drag' } as React.CSSProperties}>
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
            <div style={{ fontSize: 11, color: '#a0a0c0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
              {msg.content_html.replace(/<[^>]+>/g, '')}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#555', fontSize: 12, padding: '40px 0' }}>No announcements yet</p>
        )}
      </div>
    </div>
  )
}
