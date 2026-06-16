'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative blur orbs */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '10%', left: '15%',
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(13,148,136,0.18) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '10%', right: '10%',
          width: 350, height: 350,
          background: 'radial-gradient(circle, rgba(59,130,246,0.14) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: '50%', right: '25%',
          width: 250, height: 250,
          background: 'radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(30px)',
        }}
      />

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
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
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
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
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
