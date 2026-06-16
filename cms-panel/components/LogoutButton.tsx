'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase-browser'

export default function LogoutButton() {
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-2 text-sm w-full transition-colors"
      style={{ color: 'rgba(255,255,255,0.40)', cursor: loading ? 'not-allowed' : 'pointer' }}
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.color = '#f87171' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)' }}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      )}
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
