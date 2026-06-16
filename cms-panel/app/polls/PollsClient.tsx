'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Level { id: string; name: string }

interface Voter {
  name: string
  department: string | null
}

interface PollWithResults {
  id: string
  question: string
  options: string[]
  poll_type: string
  target_type: string
  target_value: string | null
  status: string
  created_at: string
  expires_at: string | null
  voteCounts: number[]
  totalVotes: number
  votersByOption: Voter[][]
}

const glass = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 16,
}

export default function PollsClient({ levels }: { levels: Level[] }) {
  const [polls, setPolls] = useState<PollWithResults[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchPolls() }, [])

  async function fetchPolls() {
    setLoading(true)
    const res = await fetch('/api/polls')
    if (res.ok) setPolls(await res.json())
    setLoading(false)
  }

  async function handleToggleStatus(poll: PollWithResults) {
    setBusy(true)
    const newStatus = poll.status === 'active' ? 'closed' : 'active'
    await fetch(`/api/polls/${poll.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setPolls(prev => prev.map(p => p.id === poll.id ? { ...p, status: newStatus } : p))
    setBusy(false)
  }

  async function handleDelete(id: string) {
    setBusy(true)
    await fetch(`/api/polls/${id}`, { method: 'DELETE' })
    setPolls(prev => prev.filter(p => p.id !== id))
    setDeleteId(null)
    setBusy(false)
  }

  const levelName = (val: string | null) => {
    if (!val) return 'All Levels'
    return levels.find(l => l.name === val)?.name ?? val
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {polls.length} poll{polls.length !== 1 ? 's' : ''} total
        </p>
        <Link
          href="/polls/create"
          className="px-4 py-2 text-sm font-semibold text-white rounded-xl"
          style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', boxShadow: '0 4px 14px rgba(13,148,136,0.30)' }}
        >
          + Create Poll
        </Link>
      </div>

      {loading && (
        <p className="text-sm text-center py-16" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading…</p>
      )}

      {!loading && polls.length === 0 && (
        <div className="text-center py-20" style={glass}>
          <p className="text-4xl mb-3">📊</p>
          <p className="font-semibold text-white mb-1">No polls yet</p>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.40)' }}>Create your first poll to gather employee feedback.</p>
          <Link href="/polls/create" className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl"
            style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)' }}>
            Create Poll
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {polls.map(poll => {
          const isExpanded = expanded === poll.id
          const maxVotes = Math.max(...poll.voteCounts, 1)

          return (
            <div key={poll.id} style={glass} className="overflow-hidden">
              {/* Poll header */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        poll.status === 'active'
                          ? 'text-emerald-300'
                          : 'text-slate-400'
                      }`} style={{
                        background: poll.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
                        border: `1px solid ${poll.status === 'active' ? 'rgba(16,185,129,0.30)' : 'rgba(255,255,255,0.10)'}`,
                      }}>
                        {poll.status === 'active' ? '● Active' : '◉ Closed'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
                        {levelName(poll.target_value)}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {new Date(poll.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="font-semibold text-white text-sm leading-snug">{poll.question}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.40)' }}>
                      {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : poll.id)}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.10)' }}
                    >
                      {isExpanded ? 'Hide' : 'Results'}
                    </button>
                    <button
                      onClick={() => handleToggleStatus(poll)}
                      disabled={busy}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        background: poll.status === 'active' ? 'rgba(239,68,68,0.12)' : 'rgba(13,148,136,0.12)',
                        color: poll.status === 'active' ? '#fca5a5' : '#5eead4',
                        border: `1px solid ${poll.status === 'active' ? 'rgba(239,68,68,0.25)' : 'rgba(13,148,136,0.25)'}`,
                      }}
                    >
                      {poll.status === 'active' ? 'Close' : 'Reopen'}
                    </button>
                    <button
                      onClick={() => setDeleteId(poll.id)}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all"
                      style={{ background: 'rgba(239,68,68,0.10)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.20)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Results */}
              {isExpanded && (
                <div className="px-5 pb-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-xs font-semibold pt-4 pb-3" style={{ color: 'rgba(255,255,255,0.50)', letterSpacing: '0.06em' }}>
                    RESULTS — {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
                  </p>

                  {poll.totalVotes === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: 'rgba(255,255,255,0.30)' }}>No votes yet</p>
                  ) : (
                    <div className="space-y-4">
                      {poll.options.map((opt, i) => {
                        const count = poll.voteCounts[i] ?? 0
                        const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0
                        const barWidth = poll.totalVotes > 0 ? (count / maxVotes) * 100 : 0
                        const voters = poll.votersByOption?.[i] ?? []
                        const isWinner = count === maxVotes && count > 0

                        return (
                          <div key={i} className="rounded-xl p-3" style={{
                            background: isWinner ? 'rgba(13,148,136,0.08)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isWinner ? 'rgba(13,148,136,0.20)' : 'rgba(255,255,255,0.06)'}`,
                          }}>
                            {/* Option label + count */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {isWinner && <span className="text-xs">🏆</span>}
                                <span className="text-sm font-semibold" style={{ color: isWinner ? '#5eead4' : 'rgba(255,255,255,0.80)' }}>
                                  {opt}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold" style={{ color: isWinner ? '#5eead4' : 'rgba(255,255,255,0.60)' }}>
                                  {pct}%
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{
                                  background: isWinner ? 'rgba(13,148,136,0.20)' : 'rgba(255,255,255,0.08)',
                                  color: isWinner ? '#5eead4' : 'rgba(255,255,255,0.50)',
                                }}>
                                  {count} vote{count !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              <div className="h-full rounded-full transition-all duration-500" style={{
                                width: `${barWidth}%`,
                                background: isWinner ? 'linear-gradient(90deg,#0d9488,#0891b2)' : 'rgba(255,255,255,0.25)',
                              }} />
                            </div>

                            {/* Voter chips */}
                            {voters.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {voters.map((voter, vi) => {
                                  const initials = voter.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                                  const colors = [
                                    'linear-gradient(135deg,#0d9488,#0891b2)',
                                    'linear-gradient(135deg,#7c3aed,#6366f1)',
                                    'linear-gradient(135deg,#ea580c,#f59e0b)',
                                    'linear-gradient(135deg,#be185d,#e11d48)',
                                    'linear-gradient(135deg,#065f46,#0d9488)',
                                    'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                                  ]
                                  const bg = colors[vi % colors.length]
                                  return (
                                    <div key={vi} className="flex items-center gap-1.5 rounded-full px-2 py-1" style={{
                                      background: 'rgba(255,255,255,0.06)',
                                      border: '1px solid rgba(255,255,255,0.10)',
                                    }}>
                                      <div className="flex items-center justify-center rounded-full text-white flex-shrink-0" style={{
                                        width: 18, height: 18, fontSize: 8, fontWeight: 700, background: bg,
                                      }}>
                                        {initials}
                                      </div>
                                      <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap' }}>
                                        {voter.name}
                                      </span>
                                      {voter.department && (
                                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                          · {voter.department}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.70)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)' }}>
            <p className="font-semibold text-white mb-2">Delete Poll?</p>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.50)' }}>
              All votes will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.70)' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)} disabled={busy} className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.80)', color: 'white' }}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
