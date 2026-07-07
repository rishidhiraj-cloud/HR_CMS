'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase-browser'
import AppLayout from '@/components/AppLayout'

type LinkType = 'website' | 'mobile_app'

interface Company {
  id: string
  name: string
}

export default function NewQuickLinkPage() {
  const router = useRouter()
  const [company, setCompany] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [portalName, setPortalName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [type, setType] = useState<LinkType>('website')
  const [url, setUrl] = useState('')
  const [androidAppUrl, setAndroidAppUrl] = useState('')
  const [iosAppUrl, setIosAppUrl] = useState('')
  const [howToUse, setHowToUse] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getBrowserClient()
      .from('companies')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Company[] | null }) => { if (data) setCompanies(data) })
  }, [])

  const canSubmit = Boolean(
    company && portalName.trim() && purpose.trim() && howToUse.trim() &&
    (type === 'website' ? url.trim() : (androidAppUrl.trim() || iosAppUrl.trim()))
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/quick-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          portal_name: portalName.trim(),
          purpose: purpose.trim(),
          how_to_use: howToUse.trim(),
          type,
          url: type === 'website' ? url.trim() : null,
          android_app_url: type === 'mobile_app' ? androidAppUrl.trim() : null,
          ios_app_url: type === 'mobile_app' ? iosAppUrl.trim() : null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Save failed')
      router.push('/quick-links')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
  }

  const glassCard = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
  }

  return (
    <AppLayout title="New Quick Link">
      <div className="max-w-xl">
        <Link
          href="/quick-links"
          className="text-sm mb-6 flex items-center gap-1 transition-colors"
          style={{ color: '#5eead4' }}
        >
          ← Back to Quick Links
        </Link>

        <form onSubmit={handleSubmit} className="rounded-2xl p-6 space-y-5" style={glassCard}>
          {/* Company */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Company *</label>
            <select
              value={company}
              onChange={e => setCompany(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all appearance-none cursor-pointer"
              style={{ ...inputStyle, backgroundImage: 'none' }}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            >
              <option value="" disabled>Select a company…</option>
              {companies.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Only employees of this company will see this link.
            </p>
          </div>

          {/* Portal Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Portal Name *</label>
            <input
              type="text"
              value={portalName}
              onChange={e => setPortalName(e.target.value)}
              placeholder="e.g. Employee Self-Service"
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Purpose *</label>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Apply for leave & view payslips"
              required
              rows={2}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all resize-none"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Shown to employees under the &quot;i&quot; info icon.</p>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Type *</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as LinkType)}
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all appearance-none cursor-pointer"
              style={{ ...inputStyle, backgroundImage: 'none' }}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            >
              <option value="website">Website</option>
              <option value="mobile_app">Mobile App</option>
            </select>
          </div>

          {/* URL (Website only) */}
          {type === 'website' && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>URL *</label>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://…"
                required
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>
          )}

          {/* Android/iOS App URL (Mobile App only) */}
          {type === 'mobile_app' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Android App URL</label>
                <input
                  type="text"
                  value={androidAppUrl}
                  onChange={e => setAndroidAppUrl(e.target.value)}
                  placeholder="https://play.google.com/…"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
                  style={inputStyle}
                  onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>iOS App URL</label>
                <input
                  type="text"
                  value={iosAppUrl}
                  onChange={e => setIosAppUrl(e.target.value)}
                  placeholder="https://apps.apple.com/…"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
                  style={inputStyle}
                  onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                />
              </div>
              <p className="text-xs -mt-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
                At least one of Android or iOS App URL is required.
              </p>
            </>
          )}

          {/* How to Use */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>How to Use *</label>
            <textarea
              value={howToUse}
              onChange={e => setHowToUse(e.target.value)}
              placeholder="e.g. Log in with your employee ID, no separate password needed."
              required
              rows={3}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all resize-none"
              style={inputStyle}
              onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
              onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
            style={{
              background: (!canSubmit || saving) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
              boxShadow: (!canSubmit || saving) ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
              cursor: (!canSubmit || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
            ) : 'Create Quick Link'}
          </button>
        </form>
      </div>
    </AppLayout>
  )
}
