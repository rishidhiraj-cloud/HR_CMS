'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

export default function ChangePasswordModal({
  user,
  onClose,
}: {
  user: { id: string; name: string }
  onClose: () => void
}) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password.trim() || password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      setSaving(false)

      if (res.status === 401) { router.push('/login'); return }

      if (!res.ok) { setError(data.error ?? 'Failed to change password'); return }

      setSuccess('Password updated successfully')
      setTimeout(onClose, 1200)
    } catch {
      setSaving(false)
      setError('Failed to change password')
    }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'white',
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5"
        style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <h2 className="text-base font-semibold text-white">Change password for {user.name}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(13,148,136,0.15)', border: '1px solid rgba(13,148,136,0.30)', color: '#5eead4' }}>
              {success}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>New Password</label>
            <input
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all flex items-center gap-2"
              style={{
                background: saving ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
              ) : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
