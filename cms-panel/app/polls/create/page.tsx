'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase-browser'
import AppLayout from '@/components/AppLayout'

interface Level { id: string; name: string }
interface Company { id: string; name: string }

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 12,
  padding: '10px 14px',
  color: 'white',
  fontSize: 14,
  outline: 'none',
  width: '100%',
}

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 16,
  padding: 24,
}

export default function CreatePollPage() {
  const router = useRouter()
  const [levels, setLevels] = useState<Level[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [question, setQuestion] = useState('')
  const [pollType, setPollType] = useState<'yes_no' | 'mcq'>('yes_no')
  const [options, setOptions] = useState(['Yes', 'No'])
  const [targetType, setTargetType] = useState<'all' | 'level' | 'company'>('all')
  const [targetValue, setTargetValue] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getBrowserClient().from('levels').select('id, name').order('name')
      .then(({ data }: { data: Level[] | null }) => { if (data) setLevels(data) })
    getBrowserClient().from('companies').select('id, name').order('name')
      .then(({ data }: { data: Company[] | null }) => { if (data) setCompanies(data) })
  }, [])

  function handleTypeChange(type: 'yes_no' | 'mcq') {
    setPollType(type)
    setOptions(type === 'yes_no' ? ['Yes', 'No'] : ['Option 1', 'Option 2'])
  }

  function handleOptionChange(i: number, val: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? val : o))
  }

  function addOption() {
    if (options.length < 6) setOptions(prev => [...prev, `Option ${prev.length + 1}`])
  }

  function removeOption(i: number) {
    if (options.length > 2) setOptions(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question.trim(),
        options,
        poll_type: pollType,
        target_type: targetType,
        target_value: targetType !== 'all' ? targetValue : null,
        expires_at: expiresAt || null,
      }),
    })

    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to create poll'); setSubmitting(false); return }
    router.push('/polls')
  }

  return (
    <AppLayout title="Create Poll">
      <div className="max-w-xl">
        <Link href="/polls" className="text-sm mb-6 flex items-center gap-1" style={{ color: '#5eead4' }}>
          ← Back to Polls
        </Link>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div style={glassCard}>
            {/* Question */}
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.70)' }}>Question *</label>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="What would you like to ask employees?"
                required
                rows={3}
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            {/* Poll type */}
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.70)' }}>Poll Type</label>
              <div className="flex gap-3">
                {(['yes_no', 'mcq'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={pollType === type
                      ? { background: 'rgba(13,148,136,0.25)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.40)' }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.10)' }}
                  >
                    {type === 'yes_no' ? '👍 Yes / No' : '📋 Multiple Choice'}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.70)' }}>Options</label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-xs w-5 text-center shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>{i + 1}.</span>
                    <input
                      value={opt}
                      onChange={e => handleOptionChange(i, e.target.value)}
                      disabled={pollType === 'yes_no'}
                      style={{ ...inputStyle, flex: 1, opacity: pollType === 'yes_no' ? 0.6 : 1 }}
                      onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                      onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                    />
                    {pollType === 'mcq' && options.length > 2 && (
                      <button type="button" onClick={() => removeOption(i)}
                        className="text-xs px-2 py-1 rounded-lg shrink-0"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {pollType === 'mcq' && options.length < 6 && (
                <button type="button" onClick={addOption}
                  className="mt-2 text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: 'rgba(13,148,136,0.12)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.25)' }}>
                  + Add Option
                </button>
              )}
            </div>

            {/* Target */}
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.70)' }}>Audience</label>
              <div className="flex gap-3 mb-3">
                {(['all', 'level', 'company'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTargetType(t)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={targetType === t
                      ? { background: 'rgba(13,148,136,0.25)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.40)' }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.10)' }}>
                    {t === 'all' ? '👥 All Employees' : t === 'level' ? '🎯 Specific Level' : '🏢 By Company'}
                  </button>
                ))}
              </div>
              {targetType === 'level' && (
                <select value={targetValue} onChange={e => setTargetValue(e.target.value)} required
                  className="appearance-none" style={inputStyle}>
                  <option value="">Select level…</option>
                  {levels.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              )}
              {targetType === 'company' && (
                <select value={targetValue} onChange={e => setTargetValue(e.target.value)} required
                  className="appearance-none" style={inputStyle}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.70)' }}>
                Expires At <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !question.trim() || (targetType !== 'all' && !targetValue)}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
            style={{
              background: (submitting || !question.trim()) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg,#0d9488,#0891b2)',
              boxShadow: submitting ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}>
            {submitting ? 'Creating…' : 'Create Poll'}
          </button>
        </form>
      </div>
    </AppLayout>
  )
}
