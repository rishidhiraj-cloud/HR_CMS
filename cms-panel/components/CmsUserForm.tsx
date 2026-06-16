'use client'
import { useState } from 'react'

export default function CmsUserForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password.trim()) { setError('All fields are required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError('')
    setSuccess('')
    setSaving(true)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Failed to create user'); return }

    setSuccess(`User "${name.trim()}" created successfully`)
    setName(''); setEmail(''); setPassword('')
    onCreated()
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'white',
  }

  return (
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Full Name', placeholder: 'Jane Smith', value: name, setter: setName, type: 'text' },
          { label: 'Email', placeholder: 'jane@company.com', value: email, setter: setEmail, type: 'email' },
          { label: 'Password', placeholder: 'Min 6 characters', value: password, setter: setPassword, type: 'password' },
        ].map(f => (
          <div key={f.label}>
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{f.label}</label>
            <input
              type={f.type}
              placeholder={f.placeholder}
              value={f.value}
              onChange={e => f.setter(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
        style={{
          background: saving ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
          boxShadow: saving ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? (
          <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Creating…</>
        ) : 'Create CMS User'}
      </button>
    </form>
  )
}
