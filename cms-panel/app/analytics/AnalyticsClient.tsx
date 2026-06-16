'use client'

import { useState, useEffect, useCallback } from 'react'

interface DailyPoint { date: string; count: number }
interface QueryStat { query: string; count: number }
interface DocStat { id: string; name: string; file_type: string; count: number }

interface SearchDetail {
  employee_name: string
  department: string | null
  query: string
  created_at: string
}

interface DocDetail {
  employee_name: string
  department: string | null
  document_id: string
  document_name: string
  file_type: string
  created_at: string
}

interface SearchStats {
  total30d: number
  totalAllTime: number
  uniqueQueries30d: number
  peakDay: string
  peakCount: number
  dailySearches: DailyPoint[]
  topQueries: QueryStat[]
}

interface DocStats {
  total30d: number
  totalAllTime: number
  uniqueDocs: number
  peakDay: string
  peakCount: number
  dailyDocOpens: DailyPoint[]
  topDocuments: DocStat[]
}

interface AnalyticsData {
  searchStats: SearchStats
  docStats: DocStats
  searchDetails: SearchDetail[]
  docDetails: DocDetail[]
}

// ── Modal ──────────────────────────────────────────────────────────────────

type ModalEntry =
  | { kind: 'search'; rows: SearchDetail[]; title: string }
  | { kind: 'doc'; rows: DocDetail[]; title: string }

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#0d9488,#0891b2)',
  'linear-gradient(135deg,#7c3aed,#6366f1)',
  'linear-gradient(135deg,#ea580c,#f59e0b)',
  'linear-gradient(135deg,#be185d,#e11d48)',
  'linear-gradient(135deg,#1d4ed8,#7c3aed)',
  'linear-gradient(135deg,#065f46,#0d9488)',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function DetailModal({ entry, onClose }: { entry: ModalEntry; onClose: () => void }) {
  const rows = entry.rows
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl rounded-2xl flex flex-col" style={{
        background: '#0b1629',
        border: '1px solid rgba(255,255,255,0.12)',
        maxHeight: '80vh',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <h3 className="font-bold text-white text-base">{entry.title}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.40)' }}>
              {rows.length} record{rows.length !== 1 ? 's' : ''} · newest first
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
          >
            ✕
          </button>
        </div>

        {/* Table header */}
        {rows.length > 0 && (
          <div className="grid px-6 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{
            color: 'rgba(255,255,255,0.35)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            gridTemplateColumns: entry.kind === 'search' ? '1fr 1fr 1.6fr auto' : '1fr 1fr 1.6fr auto',
          }}>
            <span>Employee</span>
            <span>Department</span>
            <span>{entry.kind === 'search' ? 'Query' : 'Document'}</span>
            <span>Date & Time</span>
          </div>
        )}

        {/* Rows */}
        <div className="overflow-y-auto flex-1">
          {rows.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'rgba(255,255,255,0.30)' }}>No records found.</p>
          ) : (
            rows.map((row, i) => {
              const name = row.employee_name
              const dept = row.department
              const detail = entry.kind === 'search'
                ? (row as SearchDetail).query
                : (row as DocDetail).document_name
              const fileType = entry.kind === 'doc' ? (row as DocDetail).file_type : null
              const icon = fileType === 'pdf' ? '📕' : fileType === 'docx' ? '📘' : fileType ? '📄' : null

              return (
                <div
                  key={i}
                  className="grid items-center px-6 py-3 gap-3 text-sm"
                  style={{
                    gridTemplateColumns: '1fr 1fr 1.6fr auto',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}
                >
                  {/* Employee */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: avatarColor(name), fontSize: 9 }}>
                      {initials(name)}
                    </div>
                    <span className="font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{name}</span>
                  </div>
                  {/* Department */}
                  <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {dept ?? '—'}
                  </span>
                  {/* Query / Document */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {icon && <span className="text-sm shrink-0">{icon}</span>}
                    <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      {entry.kind === 'search' ? `"${detail}"` : detail}
                    </span>
                  </div>
                  {/* Date */}
                  <span className="text-xs shrink-0 text-right" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {fmtDateTime(row.created_at)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared components ──────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 20,
  padding: 28,
}

function ClickableCount({ value, onClick, color = '#5eead4' }: { value: number; onClick: () => void; color?: string }) {
  if (value === 0) return <span className="text-2xl font-bold text-white leading-tight">0</span>
  return (
    <button
      onClick={onClick}
      className="text-2xl font-bold leading-tight underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-75"
      style={{ color, textDecorationColor: `${color}60` }}
    >
      {value}
    </button>
  )
}

function StatPill({ label, value, sub, onClick, color }: {
  label: string; value: string | number; sub?: string; onClick?: () => void; color?: string
}) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-0.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.40)' }}>{label}</span>
      {onClick && typeof value === 'number' && value > 0
        ? <ClickableCount value={value} onClick={onClick} color={color} />
        : <span className="text-2xl font-bold text-white leading-tight">{value}</span>
      }
      {sub && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</span>}
    </div>
  )
}

function BarChart({ data, color1, color2 }: { data: DailyPoint[]; color1: string; color2: string }) {
  const counts = data.map(d => d.count)
  const max = Math.max(...counts, 1)
  const H = 72
  const gradId = `grad${color1.replace('#', '')}`
  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${data.length * 5} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color1} stopOpacity="1" />
            <stop offset="100%" stopColor={color2} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const bh = Math.max((d.count / max) * (H - 4), d.count > 0 ? 3 : 0)
          return (
            <rect key={i} x={i * 5 + 0.5} y={H - bh} width={4} height={bh} rx={1.5}
              fill={d.count > 0 ? `url(#${gradId})` : 'rgba(255,255,255,0.06)'} />
          )
        })}
      </svg>
      <div className="flex justify-between mt-1" style={{ color: 'rgba(255,255,255,0.30)', fontSize: 10 }}>
        <span>{fmtDate(data[0]?.date)}</span>
        <span>{fmtDate(data[Math.floor(data.length / 2)]?.date)}</span>
        <span>{fmtDate(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalEntry | null>(null)

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  const closeModal = useCallback(() => setModal(null), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeModal])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading analytics…</p>
    </div>
  )
  if (!data) return null

  const { searchStats, docStats, searchDetails, docDetails } = data
  const maxQ = Math.max(...searchStats.topQueries.map(q => q.count), 1)
  const maxD = Math.max(...docStats.topDocuments.map(d => d.count), 1)

  const thirtyDaysAgo = (() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString()
  })()

  function openSearchAll(title: string, rows: SearchDetail[]) {
    setModal({ kind: 'search', title, rows })
  }
  function openDocAll(title: string, rows: DocDetail[]) {
    setModal({ kind: 'doc', title, rows })
  }

  return (
    <>
      {modal && <DetailModal entry={modal} onClose={closeModal} />}

      <div className="space-y-8">

        {/* ── AI Search Analytics ──────────────────────────────── */}
        <div style={glass}>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-lg">🤖</span>
            <div>
              <h2 className="font-bold text-white text-base leading-tight">AI Search Analytics</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>What employees are asking HR · click any number for details</p>
            </div>
          </div>

          {/* Stat pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatPill
              label="Searches (30d)" color="#a5b4fc"
              value={searchStats.total30d}
              onClick={() => openSearchAll('AI Searches — Last 30 Days', searchDetails.filter(s => s.created_at >= thirtyDaysAgo))}
            />
            <StatPill
              label="All-time Searches" color="#a5b4fc"
              value={searchStats.totalAllTime}
              onClick={() => openSearchAll('AI Searches — All Time', searchDetails)}
            />
            <StatPill
              label="Unique Queries (30d)"
              value={searchStats.uniqueQueries30d}
            />
            <StatPill
              label="Peak Day"
              value={searchStats.peakCount > 0 ? searchStats.peakCount : '—'}
              sub={searchStats.peakDay ? `${fmtDate(searchStats.peakDay)} searches` : 'No data yet'}
              color="#a5b4fc"
              onClick={searchStats.peakCount > 0 ? () => {
                const rows = searchDetails.filter(s => s.created_at.slice(0, 10) === searchStats.peakDay)
                openSearchAll(`AI Searches on ${fmtDate(searchStats.peakDay)}`, rows)
              } : undefined}
            />
          </div>

          {/* Daily chart */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'rgba(255,255,255,0.40)' }}>
              Daily Search Volume — Last 30 Days
            </p>
            <BarChart data={searchStats.dailySearches} color1="#818cf8" color2="#6366f1" />
          </div>

          {/* Top queries */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'rgba(255,255,255,0.40)' }}>
              Top Queries — Last 30 Days · <span className="normal-case font-normal" style={{ color: 'rgba(255,255,255,0.30)' }}>click any row to see who searched</span>
            </p>
            {searchStats.topQueries.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'rgba(255,255,255,0.30)' }}>No searches recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {searchStats.topQueries.map((q, i) => {
                  const matchRows = searchDetails.filter(s => s.query.trim().toLowerCase() === q.query && s.created_at >= thirtyDaysAgo)
                  return (
                    <button
                      key={i}
                      onClick={() => openSearchAll(`Who searched "${q.query}"`, matchRows)}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.10)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    >
                      <span className="w-5 text-center text-xs font-bold shrink-0" style={{ color: i < 3 ? '#a5b4fc' : 'rgba(255,255,255,0.25)' }}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            &ldquo;{q.query}&rdquo;
                          </span>
                          <span className="text-xs font-bold ml-3 shrink-0 underline decoration-dotted underline-offset-2" style={{ color: '#a5b4fc', textDecorationColor: '#a5b4fc60' }}>
                            {q.count}×
                          </span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${(q.count / maxQ) * 100}%`, background: i < 3 ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.40)' }} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Document Analytics ───────────────────────────────── */}
        <div style={glass}>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-lg">📄</span>
            <div>
              <h2 className="font-bold text-white text-base leading-tight">Document Analytics</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Which documents employees open most · click any number for details</p>
            </div>
          </div>

          {/* Stat pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatPill
              label="Opens (30d)" color="#5eead4"
              value={docStats.total30d}
              onClick={() => openDocAll('Document Opens — Last 30 Days', docDetails.filter(d => d.created_at >= thirtyDaysAgo))}
            />
            <StatPill
              label="All-time Opens" color="#5eead4"
              value={docStats.totalAllTime}
              onClick={() => openDocAll('Document Opens — All Time', docDetails)}
            />
            <StatPill
              label="Docs Accessed"
              value={docStats.uniqueDocs}
            />
            <StatPill
              label="Peak Day"
              value={docStats.peakCount > 0 ? docStats.peakCount : '—'}
              sub={docStats.peakDay ? `${fmtDate(docStats.peakDay)} opens` : 'No data yet'}
              color="#5eead4"
              onClick={docStats.peakCount > 0 ? () => {
                const rows = docDetails.filter(d => d.created_at.slice(0, 10) === docStats.peakDay)
                openDocAll(`Document Opens on ${fmtDate(docStats.peakDay)}`, rows)
              } : undefined}
            />
          </div>

          {/* Top documents */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'rgba(255,255,255,0.40)' }}>
              Most Opened Documents — All Time · <span className="normal-case font-normal" style={{ color: 'rgba(255,255,255,0.30)' }}>click any row to see who opened</span>
            </p>
            {docStats.topDocuments.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'rgba(255,255,255,0.30)' }}>No document opens logged yet.</p>
            ) : (
              <div className="space-y-2">
                {docStats.topDocuments.map((doc, i) => {
                  const icon = doc.file_type === 'pdf' ? '📕' : doc.file_type === 'docx' ? '📘' : '📄'
                  const matchRows = docDetails.filter(d => d.document_id === doc.id)
                  return (
                    <button
                      key={doc.id}
                      onClick={() => openDocAll(`Who opened "${doc.name}"`, matchRows)}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,148,136,0.10)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    >
                      <span className="w-5 text-center text-xs font-bold shrink-0" style={{ color: i < 3 ? '#5eead4' : 'rgba(255,255,255,0.25)' }}>
                        {i + 1}
                      </span>
                      <span className="text-base shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            {doc.name}
                          </span>
                          <span className="text-xs font-bold ml-3 shrink-0 underline decoration-dotted underline-offset-2" style={{ color: '#5eead4', textDecorationColor: '#5eead460' }}>
                            {doc.count} open{doc.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${(doc.count / maxD) * 100}%`, background: i < 3 ? 'linear-gradient(90deg,#0d9488,#10b981)' : 'rgba(13,148,136,0.40)' }} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Daily chart */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'rgba(255,255,255,0.40)' }}>
              Daily Opens — Last 30 Days
            </p>
            <BarChart data={docStats.dailyDocOpens} color1="#10b981" color2="#0d9488" />
          </div>
        </div>

      </div>
    </>
  )
}
