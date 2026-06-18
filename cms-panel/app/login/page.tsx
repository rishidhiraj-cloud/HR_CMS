'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase-browser'

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

const BUBBLES_INIT = Array.from({ length: 28 }, (_, i) => ({
  x: 60 + (i * 83) % 1200,
  y: 40 + (i * 67) % 800,
  vx: ((i % 3) - 1) * 0.12,
  vy: ((i % 5) - 2) * 0.10,
  baseR: 5 + (i % 7) * 4,
}))

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 600, y: 400 })
  const bubblesData = useRef(BUBBLES_INIT.map(b => ({ ...b })))
  const els = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let raf: number
    function tick() {
      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const W = containerRef.current?.clientWidth ?? 1200
      const H = containerRef.current?.clientHeight ?? 800

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = getBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      onMouseMove={e => {
        const rect = containerRef.current!.getBoundingClientRect()
        mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      }}
    >
      {/* Interactive bubbles */}
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

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-white text-xl font-bold mb-5 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
          >
            MC
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">M-Connect (HR Panel)</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.50)' }}>
            Sign in to manage HR communications
          </p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.30)',
                  color: '#fca5a5',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.7)'; e.target.style.background = 'rgba(255,255,255,0.10)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.7)'; e.target.style.background = 'rgba(255,255,255,0.10)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 mt-2"
              style={{
                background: loading ? 'rgba(13,148,136,0.5)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(13,148,136,0.35)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
          HR Broadcast &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
