'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase-browser'
import AppLayout from '@/components/AppLayout'

type UploadState = 'idle' | 'uploading' | 'processing' | 'ocr' | 'embedding' | 'done'

const ACCEPTED = '.pdf,.docx,.txt'

interface Level {
  id: string
  name: string
}

interface Company {
  id: string
  name: string
}

interface LevelResult {
  level: string
  label: string
  status: 'success' | 'error'
  chunks?: number
  error?: string
}

// '' is the existing "All Levels" sentinel value the upload API already
// understands (an empty level field maps to target_level = NULL).
function levelLabel(levelValue: string): string {
  return levelValue === '' ? 'All Levels' : levelValue
}

export default function UploadDocumentPage() {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [allLevels, setAllLevels] = useState(true)
  const [selectedLevels, setSelectedLevels] = useState<string[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [company, setCompany] = useState<string>('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [state, setState] = useState<UploadState>('idle')
  const [embeddedCount, setEmbeddedCount] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [ocrPagesDone, setOcrPagesDone] = useState(0)
  const [ocrTotalPages, setOcrTotalPages] = useState(0)
  const [batchLevels, setBatchLevels] = useState<string[]>([])
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [batchResults, setBatchResults] = useState<LevelResult[]>([])
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
    setState('idle')
  }

  function selectAllLevels() {
    setAllLevels(true)
    setSelectedLevels([])
  }

  function toggleIndividualLevel(levelName: string) {
    setAllLevels(false)
    setSelectedLevels(prev =>
      prev.includes(levelName) ? prev.filter(l => l !== levelName) : [...prev, levelName]
    )
  }

  function resetForm() {
    setFile(null)
    setName('')
    setAllLevels(true)
    setSelectedLevels([])
    setCompany('')
    setState('idle')
    setEmbeddedCount(0)
    setTotalChunks(0)
    setOcrPagesDone(0)
    setOcrTotalPages(0)
    setBatchLevels([])
    setCurrentBatchIndex(0)
    setBatchResults([])
    if (inputRef.current) inputRef.current.value = ''
  }

  // Runs the existing, unmodified single-level upload -> (OCR if needed) ->
  // embed pipeline for one level value, returning the resulting chunk count
  // or throwing. This is byte-for-byte the same sequence of network calls
  // the page made for a single upload before this feature existed — the
  // only thing that changed is that it's now a function callable once per
  // selected level instead of running inline in the submit handler.
  async function runSingleLevelUpload(levelValue: string): Promise<number> {
    const supabase = getBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not logged in')
    const formData = new FormData()
    formData.append('file', file!)
    formData.append('name', name.trim())
    formData.append('level', levelValue)
    formData.append('company', company)
    setState('processing')
    const res = await fetch('/api/policies/upload', { method: 'POST', body: formData })
    const json = await res.json()
    if (!res.ok || json.error) throw new Error(json.error ?? 'Upload failed')
    if (json.needsOcr) {
      return await runOcrBatchLoop(json.documentId)
    } else {
      return await runEmbedBatchLoop(json.documentId, json.totalChunks)
    }
  }

  async function runOcrBatchLoop(documentId: string): Promise<number> {
    setOcrTotalPages(0)
    setOcrPagesDone(0)
    setState('ocr')

    while (true) {
      const res = await fetch('/api/policies/upload/ocr-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'OCR failed')

      setOcrTotalPages(json.totalPages)
      setOcrPagesDone(json.pagesDone)

      if (json.complete) {
        return await runEmbedBatchLoop(documentId, json.totalChunks)
      }
    }
  }

  async function runEmbedBatchLoop(documentId: string, totalChunksCount: number): Promise<number> {
    setTotalChunks(totalChunksCount)
    setEmbeddedCount(0)
    setState('embedding')

    // The upload route rejects documents under 100 chars and the chunker guarantees
    // at least one chunk for any text that long, so totalChunksCount should never be
    // 0 in practice — but guard anyway so a 0-chunk document can't get stuck forever.
    if (totalChunksCount === 0) {
      return 0
    }

    let embeddedSoFar = 0
    while (embeddedSoFar < totalChunksCount) {
      const res = await fetch('/api/policies/upload/embed-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Embedding failed')

      embeddedSoFar += json.embedded
      setEmbeddedCount(embeddedSoFar)

      if (json.remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, 22_000))
      } else {
        break
      }
    }

    return totalChunksCount
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !name.trim() || !company) return
    const levelsToRun = allLevels ? [''] : selectedLevels
    if (levelsToRun.length === 0) return

    setBatchLevels(levelsToRun)
    setBatchResults([])
    setCurrentBatchIndex(0)
    setState('uploading')

    for (let i = 0; i < levelsToRun.length; i++) {
      setCurrentBatchIndex(i)
      const levelValue = levelsToRun[i]
      try {
        const chunks = await runSingleLevelUpload(levelValue)
        setBatchResults(prev => [...prev, { level: levelValue, label: levelLabel(levelValue), status: 'success', chunks }])
      } catch (err) {
        setBatchResults(prev => [...prev, {
          level: levelValue,
          label: levelLabel(levelValue),
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
        }])
      }
    }

    setState('done')
  }

  const stateLabel: Record<UploadState, string> = {
    idle: 'Upload & Index Document',
    uploading: 'Uploading…',
    processing: 'Processing & indexing with AI…',
    ocr: 'Reading scanned pages…',
    embedding: 'Embedding chunks…',
    done: 'Done!',
  }

  const busy = state === 'uploading' || state === 'processing' || state === 'ocr' || state === 'embedding'
  const missingLevelSelection = !allLevels && selectedLevels.length === 0
  const submitDisabled = !file || !name.trim() || !company || busy || missingLevelSelection
  const allSucceeded = batchResults.length > 0 && batchResults.every(r => r.status === 'success')

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

        {state === 'done' ? (
          <div
            className="rounded-2xl p-8"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)' }}
          >
            <p className="text-4xl mb-3 text-center">{allSucceeded ? '✅' : '⚠️'}</p>
            <p className="font-semibold text-white text-lg text-center">
              {batchResults.length > 1 ? 'Upload complete' : allSucceeded ? 'Document indexed successfully!' : 'Upload failed'}
            </p>
            <ul className="mt-4 space-y-2">
              {batchResults.map(r => (
                <li key={r.level} className="flex items-start gap-2 text-sm">
                  <span>{r.status === 'success' ? '✅' : '❌'}</span>
                  <span>
                    <span className="text-white font-medium">{r.label}</span>
                    {r.status === 'success' ? (
                      <span style={{ color: '#99f6e4' }}> — {r.chunks} text chunks created and embedded.</span>
                    ) : (
                      <span style={{ color: '#fca5a5' }}> — {r.error}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={resetForm}
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

            {/* Levels (multi-select) */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Visible To</label>
              <label className="flex items-center gap-2 text-sm text-white cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={allLevels}
                  onChange={selectAllLevels}
                  style={{ accentColor: '#0d9488' }}
                  className="w-4 h-4"
                />
                All Levels (everyone)
              </label>
              <div className="rounded-xl p-3 space-y-1.5 max-h-48 overflow-y-auto" style={inputStyle}>
                {levels.map(l => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    style={{ color: allLevels ? 'rgba(255,255,255,0.35)' : 'white' }}
                  >
                    <input
                      type="checkbox"
                      checked={!allLevels && selectedLevels.includes(l.name)}
                      disabled={allLevels}
                      onChange={() => toggleIndividualLevel(l.name)}
                      style={{ accentColor: '#0d9488' }}
                      className="w-4 h-4"
                    />
                    {l.name}
                  </label>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Select one or more levels to restrict visibility, or leave &quot;All Levels&quot; checked for everyone.
                Selecting multiple levels uploads this document once per level automatically.
              </p>
            </div>

            {/* Batch progress banner (only shown when uploading for more than one level) */}
            {busy && batchLevels.length > 1 && (
              <div className="text-sm font-medium" style={{ color: '#5eead4' }}>
                Level {currentBatchIndex + 1} of {batchLevels.length}: {levelLabel(batchLevels[currentBatchIndex])}
              </div>
            )}

            {/* Progress */}
            {busy && state !== 'embedding' && state !== 'ocr' && (
              <div className="flex items-center gap-3 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)', color: '#5eead4' }}>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                {stateLabel[state]}
              </div>
            )}

            {/* OCR progress bar */}
            {state === 'ocr' && (
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)' }}>
                <div className="flex items-center justify-between text-sm mb-2" style={{ color: '#5eead4' }}>
                  <span>Reading page {ocrPagesDone} / {ocrTotalPages}…</span>
                  <span>{ocrTotalPages > 0 ? Math.round((ocrPagesDone / ocrTotalPages) * 100) : 0}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.10)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${ocrTotalPages > 0 ? (ocrPagesDone / ocrTotalPages) * 100 : 0}%`, background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  This looks like a scanned document — reading its text before indexing. Keep this tab open.
                </p>
              </div>
            )}

            {/* Embedding progress bar */}
            {state === 'embedding' && (
              <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)' }}>
                <div className="flex items-center justify-between text-sm mb-2" style={{ color: '#5eead4' }}>
                  <span>Embedding {embeddedCount} / {totalChunks} chunks…</span>
                  <span>{totalChunks > 0 ? Math.round((embeddedCount / totalChunks) * 100) : 0}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.10)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${totalChunks > 0 ? (embeddedCount / totalChunks) * 100 : 0}%`, background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  Large documents can take a few minutes — keep this tab open.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: submitDisabled ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                boxShadow: submitDisabled ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
                cursor: submitDisabled ? 'not-allowed' : 'pointer',
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
