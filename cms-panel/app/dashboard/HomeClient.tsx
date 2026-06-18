'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const BUBBLE_COLORS = [
  'radial-gradient(circle at 38% 32%, rgba(94,234,212,0.80), rgba(13,148,136,0.40) 50%, transparent 75%)',
  'radial-gradient(circle at 38% 32%, rgba(125,211,252,0.75), rgba(8,145,178,0.35) 50%, transparent 75%)',
  'radial-gradient(circle at 38% 32%, rgba(167,243,208,0.70), rgba(16,185,129,0.30) 50%, transparent 75%)',
  'radial-gradient(circle at 38% 32%, rgba(196,181,253,0.75), rgba(99,102,241,0.35) 50%, transparent 75%)',
  'radial-gradient(circle at 38% 32%, rgba(147,197,253,0.70), rgba(59,130,246,0.30) 50%, transparent 75%)',
]

const BUBBLE_BORDERS = [
  'rgba(94,234,212,0.35)',
  'rgba(125,211,252,0.32)',
  'rgba(167,243,208,0.28)',
  'rgba(196,181,253,0.32)',
  'rgba(147,197,253,0.28)',
]

export interface HomeStats {
  hrName: string
  messages: { total: number; scheduled: number }
  employees: { total: number; pending: number }
  documents: { total: number }
  polls: { active: number; totalVotes: number }
  analytics: { searches30d: number; docOpens30d: number }
  masters: { departments: number; levels: number }
  policies: { total: number }
  cmsUsers: { total: number }
}

interface TileAction { label: string; href: string }

interface TileDef {
  key: string
  href: string
  label: string
  description: string
  accent: string
  iconBg: string
  iconColor: string
  icon: React.ReactNode
  stats: { label: string; value: number }[]
  action?: TileAction
}

function getTiles(stats: HomeStats): TileDef[] {
  return [
    {
      key: 'messages',
      href: '/messages',
      label: 'Announcements',
      description: 'Broadcast messages to employees',
      accent: 'linear-gradient(135deg,#0d9488,#0891b2)',
      iconBg: 'rgba(13,148,136,0.15)',
      iconColor: '#5eead4',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>,
      stats: [{ label: 'Total', value: stats.messages.total }, { label: 'Scheduled', value: stats.messages.scheduled }],
      action: { label: '+ New Message', href: '/messages/new' },
    },
    {
      key: 'employees',
      href: '/employees',
      label: 'Employees',
      description: 'Manage your workforce',
      accent: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      iconBg: 'rgba(99,102,241,0.15)',
      iconColor: '#a5b4fc',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      stats: [{ label: 'Active', value: stats.employees.total }, { label: 'Inactive', value: stats.employees.pending }],
      action: { label: '+ Add Employee', href: '/employees' },
    },
    {
      key: 'documents',
      href: '/documents',
      label: 'Documents',
      description: 'Company document library',
      accent: 'linear-gradient(135deg,#10b981,#059669)',
      iconBg: 'rgba(16,185,129,0.15)',
      iconColor: '#6ee7b7',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
      stats: [{ label: 'Uploaded', value: stats.documents.total }],
      action: { label: '+ Upload Document', href: '/documents/upload' },
    },
    {
      key: 'polls',
      href: '/polls',
      label: 'Polls',
      description: 'Gather employee feedback',
      accent: 'linear-gradient(135deg,#0891b2,#06b6d4)',
      iconBg: 'rgba(8,145,178,0.15)',
      iconColor: '#67e8f9',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
      stats: [{ label: 'Active', value: stats.polls.active }, { label: 'Total Votes', value: stats.polls.totalVotes }],
      action: { label: '+ Create Poll', href: '/polls/create' },
    },
    {
      key: 'analytics',
      href: '/analytics',
      label: 'Analytics',
      description: 'AI usage & employee activity',
      accent: 'linear-gradient(135deg,#8b5cf6,#6366f1)',
      iconBg: 'rgba(139,92,246,0.15)',
      iconColor: '#c4b5fd',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
      stats: [{ label: 'AI Searches (30d)', value: stats.analytics.searches30d }, { label: 'Doc Opens (30d)', value: stats.analytics.docOpens30d }],
    },
    {
      key: 'policies',
      href: '/policies',
      label: 'Policies',
      description: 'AI-powered knowledge base',
      accent: 'linear-gradient(135deg,#f59e0b,#f97316)',
      iconBg: 'rgba(245,158,11,0.15)',
      iconColor: '#fcd34d',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
      stats: [{ label: 'Documents', value: stats.policies.total }],
    },
    {
      key: 'masters',
      href: '/masters',
      label: 'Masters',
      description: 'Departments & levels config',
      accent: 'linear-gradient(135deg,#06b6d4,#0891b2)',
      iconBg: 'rgba(6,182,212,0.15)',
      iconColor: '#67e8f9',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
      stats: [{ label: 'Departments', value: stats.masters.departments }, { label: 'Levels', value: stats.masters.levels }],
    },
    {
      key: 'cms-users',
      href: '/admin/users',
      label: 'CMS Users',
      description: 'HR admin accounts',
      accent: 'linear-gradient(135deg,#64748b,#475569)',
      iconBg: 'rgba(100,116,139,0.15)',
      iconColor: '#94a3b8',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      stats: [{ label: 'Admins', value: stats.cmsUsers.total }],
    },
  ]
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export default function HomeClient({ stats }: { stats: HomeStats }) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 600, y: 350 })
  const bubblesData = useRef(
    Array.from({ length: 28 }, (_, i) => ({
      x: 60 + (i * 83) % 1100,
      y: 40 + (i * 67) % 700,
      vx: ((i % 3) - 1) * 0.12,
      vy: ((i % 5) - 2) * 0.10,
      baseR: 5 + (i % 7) * 4,
    }))
  )
  const els = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let raf: number
    function tick() {
      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const W = containerRef.current?.clientWidth ?? 1100
      const H = containerRef.current?.clientHeight ?? 700

      bubblesData.current.forEach((b, i) => {
        const el = els.current[i]
        if (!el) return
        const dx = mx - b.x
        const dy = my - b.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        b.vx = (b.vx + (dx / dist) * 0.06) * 0.985
        b.vy = (b.vy + (dy / dist) * 0.06) * 0.985
        b.x += b.vx
        b.y += b.vy
        if (b.x < b.baseR) { b.vx += 0.3; b.x = b.baseR }
        if (b.x > W - b.baseR) { b.vx -= 0.3; b.x = W - b.baseR }
        if (b.y < b.baseR) { b.vy += 0.3; b.y = b.baseR }
        if (b.y > H - b.baseR) { b.vy -= 0.3; b.y = H - b.baseR }
        const prox = Math.max(0, 1 - dist / 180)
        const r = b.baseR * (1 + prox * 0.9)
        el.style.transform = `translate(${b.x - r}px, ${b.y - r}px)`
        el.style.width = `${r * 2}px`
        el.style.height = `${r * 2}px`
        el.style.opacity = String(0.28 + prox * 0.38)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const tiles = getTiles(stats)

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ minHeight: 'calc(100vh - 56px)' }}
      onMouseMove={e => {
        const rect = containerRef.current!.getBoundingClientRect()
        mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      }}
    >
      {/* Bubble layer */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        {bubblesData.current.map((b, i) => (
          <div
            key={i}
            ref={el => { els.current[i] = el }}
            style={{
              position: 'absolute',
              top: 0, left: 0,
              borderRadius: '50%',
              background: BUBBLE_COLORS[i % 5],
              border: `1px solid ${BUBBLE_BORDERS[i % 5]}`,
              boxShadow: `0 0 ${b.baseR}px ${BUBBLE_BORDERS[i % 5]}`,
              width: b.baseR * 2,
              height: b.baseR * 2,
              transform: `translate(${b.x - b.baseR}px, ${b.y - b.baseR}px)`,
              opacity: 0.28,
              willChange: 'transform, width, height, opacity',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, paddingBottom: 40 }}>

        {/* Welcome header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 4, letterSpacing: '-0.3px' }}>
                Good {getGreeting()}, {stats.hrName || 'there'}! 👋
              </h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)' }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div style={{
              background: 'rgba(13,148,136,0.12)',
              border: '1px solid rgba(13,148,136,0.25)',
              borderRadius: 12,
              padding: '8px 16px',
              fontSize: 12,
              color: '#5eead4',
              fontWeight: 600,
            }}>
              Modicare HR Panel
            </div>
          </div>
        </div>

        {/* Tile mosaic */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateAreas: `
              "messages messages employees"
              "documents polls analytics"
              "masters policies cms-users"
            `,
            gap: 16,
          }}
        >
          {tiles.map(tile => (
            <TileCard key={tile.key} tile={tile} onNavigate={() => router.push(tile.href)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TileCard({ tile, onNavigate }: { tile: TileDef; onNavigate: () => void }) {
  const divRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={divRef}
      onClick={onNavigate}
      style={{
        gridArea: tile.key,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        padding: '22px 24px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
      }}
      onMouseEnter={() => {
        if (!divRef.current) return
        divRef.current.style.transform = 'translateY(-4px)'
        divRef.current.style.boxShadow = '0 16px 48px rgba(0,0,0,0.35)'
        divRef.current.style.borderColor = 'rgba(255,255,255,0.16)'
      }}
      onMouseLeave={() => {
        if (!divRef.current) return
        divRef.current.style.transform = 'translateY(0)'
        divRef.current.style.boxShadow = 'none'
        divRef.current.style.borderColor = 'rgba(255,255,255,0.08)'
      }}
    >
      {/* Gradient top accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: tile.accent,
        borderRadius: '20px 20px 0 0',
      }} />

      {/* Subtle inner glow matching accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 80,
        background: tile.accent.replace('linear-gradient', 'linear-gradient').replace('135deg', '180deg'),
        opacity: 0.05,
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <div style={{
        width: 50, height: 50, borderRadius: 14,
        background: tile.iconBg,
        border: `1px solid ${tile.iconColor}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, color: tile.iconColor,
        flexShrink: 0,
      }}>
        {tile.icon}
      </div>

      {/* Label + desc */}
      <p style={{ fontWeight: 700, fontSize: 15, color: 'white', marginBottom: 3, lineHeight: 1.2 }}>
        {tile.label}
      </p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.36)', marginBottom: 18, lineHeight: 1.45 }}>
        {tile.description}
      </p>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, marginBottom: tile.action ? 18 : 0 }}>
        {tile.stats.map(s => (
          <div key={s.label}>
            <p style={{ fontSize: 26, fontWeight: 800, color: 'white', lineHeight: 1, letterSpacing: '-0.5px' }}>
              {s.value}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.36)', marginTop: 3, fontWeight: 500 }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Optional quick-action */}
      {tile.action && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 15 }}>
          <Link
            href={tile.action.href}
            onClick={e => e.stopPropagation()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600, color: 'white',
              background: tile.accent,
              padding: '7px 14px',
              borderRadius: 9,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {tile.action.label}
          </Link>
        </div>
      )}
    </div>
  )
}
