'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase-browser'
import AppLayout from '@/components/AppLayout'

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

const ACCEPTED = '.pdf,.docx,.txt'

interface Level {
  id: string
  name: string
}

interface Company {
  id: string
  name: string
}

export default function UploadDocumentPage() {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [level, setLevel] = useState<string>('')
  const [levels, setLevels] = useState<Level[]>([])
  const [company, setCompany] = useState<string>('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ chunks: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getBrowserClient()
      .from('levels')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Level[] | null }) => { if (data) setLevels(data) })
    getBrowserClient()
      .from('companies')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Company[] | null }) => { if (data) setCompanies(data) })
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
    setError('')
    setState('idle')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !name.trim()) return
    setError('')
    setState('uploading')
    try {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not logged in'); setState('error'); return }
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      formData.append('level', level)
      formData.append('company', company)
      setState('processing')
      const res = await fetch('/api/policies/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Upload failed')
      setResult({ chunks: json.chunks })
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }

  const stateLabel: Record<UploadState, string> = {
    idle: 'Upload & Index Document',
    uploading: 'Uploading…',
    processing: 'Processing & indexing with AI…',
    done: 'Done!',
    error: 'Try Again',
  }

  const busy = state === 'uploading' || state === 'processing'

  const glassCard = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
  }

  return (
    <AppLayout title="Upload Document">
      <div className="max-w-xl">
        <Link
          href="/documents"
          className="text-sm mb-6 flex items-center gap-1 transition-colors"
          style={{ color: '#5eead4' }}
        >
          ← Back to Documents
        </Link>

        {state === 'done' && result ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)' }}
          >
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold text-white text-lg">Document indexed successfully!</p>
            <p className="text-sm mt-2" style={{ color: '#99f6e4' }}>
              {result.chunks} text chunks created and embedded. Employees can now ask questions about this document.
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={() => { setFile(null); setName(''); setLevel(''); setCompany(''); setState('idle'); setResult(null); if (inputRef.current) inputRef.current.value = '' }}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.10)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.30)' }}
              >
                Upload Another
              </button>
              <Link
                href="/documents"
                className="px-4 py-2 text-sm text-white font-medium rounded-xl transition-all"
                style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)', boxShadow: '0 4px 14px rgba(13,148,136,0.30)' }}
              >
                View All Documents
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl p-6 space-y-5" style={glassCard}>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Supported formats: PDF, DOCX, TXT</p>

            {/* File picker */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.70)' }}>Document File *</label>
              <div
                className="rounded-xl p-8 text-center cursor-pointer transition-all"
                style={{ border: '2px dashed rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.03)' }}
                onClick={() => inputRef.current?.click()}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(13,148,136,0.60)'; (e.currentTarget as HTMLElement).style.background = 'rgba(13,148,136,0.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.16)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
              >
                {file ? (
                  <div>
                    <p className="text-3xl mb-2">📄</p>
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.40)' }}>{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-4xl mb-3">⬆️</p>
                    <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.60)' }}>Click to select a file</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>PDF, DOCX or TXT</p>
                  </div>
                )}
              </div>
              <input ref={inputRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" />
            </div>

            {/* Document name */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Document Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Leave Policy 2024"
                required
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Shown to employees as the source of answers.</p>
            </div>

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
                Only employees of this company will be able to see this document or get answers from it.
              </p>
            </div>

            {/* Level */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Visible To</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all appearance-none cursor-pointer"
                style={{ ...inputStyle, backgroundImage: 'none' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="">All Levels (everyone)</option>
                {levels.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Select a level to restrict visibility. Employees of other levels won&apos;t see this document or get answers from it.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            {/* Progress */}
            {busy && (
              <div className="flex items-center gap-3 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)', color: '#5eead4' }}>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                {stateLabel[state]}
              </div>
            )}

            <button
              type="submit"
              disabled={!file || !name.trim() || !company || busy}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: (!file || !name.trim() || !company || busy) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                boxShadow: (!file || !name.trim() || !company || busy) ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
                cursor: (!file || !name.trim() || !company || busy) ? 'not-allowed' : 'pointer',
              }}
            >
              {busy ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {stateLabel[state]}</>
              ) : stateLabel[state]}
            </button>
          </form>
        )}
      </div>
    </AppLayout>
  )
}
