import Link from 'next/link'
import type { Message, MessageStatus } from '@/lib/types'
import { getMessageStatus } from '@/lib/types'

const STATUS_STYLE: Record<MessageStatus, { bg: string; color: string; border: string }> = {
  live:      { bg: 'rgba(13,148,136,0.20)',  color: '#5eead4', border: 'rgba(13,148,136,0.35)' },
  scheduled: { bg: 'rgba(245,158,11,0.20)',  color: '#fcd34d', border: 'rgba(245,158,11,0.35)' },
  draft:     { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)', border: 'rgba(255,255,255,0.15)' },
  archived:  { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.30)', border: 'rgba(255,255,255,0.10)' },
}

function TargetLabel({ type, value }: { type: string; value: string | null }) {
  if (type === 'all') return <span>All Employees</span>
  return <span>{value ?? '—'}</span>
}

interface Props {
  messages: Message[]
  readCounts?: Record<string, number>
}

export default function MessageTable({ messages, readCounts = {} }: Props) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
            <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Title</th>
            <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Audience</th>
            <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Status</th>
            <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Read Receipts</th>
            <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Date</th>
            <th className="px-5 py-3.5" />
          </tr>
        </thead>
        <tbody>
          {messages.map((msg, i) => {
            const status = getMessageStatus(msg)
            const s = STATUS_STYLE[status]
            const date = msg.published_at ?? msg.scheduled_at ?? msg.created_at
            const isLive = status === 'live'
            const isViewOnly = status === 'live' || status === 'archived'
            const readCount = readCounts[msg.id] ?? 0

            return (
              <tr key={msg.id} style={{ borderBottom: i < messages.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <td className="px-5 py-3.5 font-medium text-white">{msg.title}</td>
                <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  <TargetLabel type={msg.target_type} value={msg.target_value} />
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
                    style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                  >
                    {status}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  {isLive ? (
                    <Link
                      href={`/messages/${msg.id}/reads`}
                      className="text-xs font-semibold transition-colors"
                      style={{ color: '#5eead4' }}
                    >
                      {readCount} read
                    </Link>
                  ) : (
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.20)' }}>—</span>
                  )}
                </td>
                <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {isViewOnly ? (
                    <Link href={`/messages/${msg.id}/view`} className="text-xs font-medium transition-colors" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      View
                    </Link>
                  ) : (
                    <Link href={`/messages/${msg.id}`} className="text-xs font-medium transition-colors" style={{ color: '#5eead4' }}>
                      Edit
                    </Link>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {messages.length === 0 && (
        <p className="text-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.30)' }}>No messages yet</p>
      )}
    </div>
  )
}
