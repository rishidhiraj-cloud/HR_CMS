'use client'

import { useState } from 'react'
import Link from 'next/link'

interface PolicyDocument {
  id: string
  name: string
  file_type: string
  status: string
  chunk_count: number
  uploaded_at: string
  target_level: string | null
  file_url: string | null
}

interface Level {
  id: string
  name: string
}

interface Props {
  initialDocuments: PolicyDocument[]
  levels: Level[]
}

const statusStyle: Record<string, { bg: string; color: string; border: string }> = {
  ready:      { bg: 'rgba(13,148,136,0.20)',  color: '#5eead4', border: 'rgba(13,148,136,0.35)' },
  processing: { bg: 'rgba(245,158,11,0.20)',  color: '#fcd34d', border: 'rgba(245,158,11,0.35)' },
  error:      { bg: 'rgba(239,68,68,0.20)',   color: '#fca5a5', border: 'rgba(239,68,68,0.35)' },
}

const glass = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.09)',
} as React.CSSProperties

const inputStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  color: 'white',
  outline: 'none',
  borderRadius: '0.75rem',
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  width: '100%',
} as React.CSSProperties

export default function DocumentsClient({ initialDocuments, levels }: Props) {
  const [documents, setDocuments] = useState<PolicyDocument[]>(initialDocuments)

  // Filters
  const [searchName, setSearchName] = useState('')
  const [searchLevel, setSearchLevel] = useState('')

  // Edit state
  const [editDoc, setEditDoc] = useState<PolicyDocument | null>(null)
  const [editName, setEditName] = useState('')
  const [editLevel, setEditLevel] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete state
  const [deleteDoc, setDeleteDoc] = useState<PolicyDocument | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Filter: name contains + level match (when level filter active, also show "All Levels" docs)
  const filtered = documents.filter(doc => {
    const nameMatch = !searchName.trim() || doc.name.toLowerCase().includes(searchName.toLowerCase())
    const levelMatch = !searchLevel || doc.target_level === null || doc.target_level === searchLevel
    return nameMatch && levelMatch
  })

  function openEdit(doc: PolicyDocument) {
    setEditDoc(doc)
    setEditName(doc.name)
    setEditLevel(doc.target_level ?? '')
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!editDoc || !editName.trim()) return
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/documents/${editDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), target_level: editLevel || null }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Save failed')
      }
      setDocuments(prev => prev.map(d =>
        d.id === editDoc.id ? { ...d, name: editName.trim(), target_level: editLevel || null } : d
      ))
      setEditDoc(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteDoc) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/documents/${deleteDoc.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDocuments(prev => prev.filter(d => d.id !== deleteDoc.id))
      setDeleteDoc(null)
    } catch {
      // keep modal open on error — user can retry
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Info box */}
      <div
        className="rounded-xl p-4 mb-5 text-sm"
        style={{ background: 'rgba(13,148,136,0.10)', border: '1px solid rgba(13,148,136,0.25)', color: '#99f6e4' }}
      >
        <strong className="text-teal-300">How it works:</strong> Upload PDF, DOCX or TXT documents. Assign a level to restrict visibility — employees only see documents for their level. &quot;All Levels&quot; documents are visible to everyone. The AI assistant only reads documents the employee is allowed to see.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by document name…"
          value={searchName}
          onChange={e => setSearchName(e.target.value)}
          style={{ ...inputStyle, maxWidth: 280 }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        />
        <select
          value={searchLevel}
          onChange={e => setSearchLevel(e.target.value)}
          style={{ ...inputStyle, maxWidth: 200, cursor: 'pointer' }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        >
          <option value="">All Levels</option>
          {levels.map(l => (
            <option key={l.id} value={l.name}>{l.name}</option>
          ))}
        </select>
        {(searchName || searchLevel) && (
          <button
            onClick={() => { setSearchName(''); setSearchLevel('') }}
            className="text-xs px-3 py-1 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            Clear
          </button>
        )}
        <div className="ml-auto">
          <Link
            href="/documents/upload"
            className="text-white text-sm font-medium px-4 py-2 rounded-xl transition-all inline-block"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)', boxShadow: '0 4px 14px rgba(13,148,136,0.30)' }}
          >
            + Upload Document
          </Link>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.30)' }}>
          <p className="text-5xl mb-4">📄</p>
          <p className="font-medium text-white/60 text-base">
            {documents.length === 0 ? 'No documents yet' : 'No documents match your filters'}
          </p>
          {documents.length === 0 && <p className="text-sm mt-2">Upload your first document to get started</p>}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={glass}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                {['Document', 'Type', 'Level', 'Status', 'Chunks', 'Uploaded', 'File', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => {
                const s = statusStyle[doc.status] ?? { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.50)', border: 'rgba(255,255,255,0.15)' }
                return (
                  <tr key={doc.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate">{doc.name}</td>
                    <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>{doc.file_type}</td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={doc.target_level
                          ? { background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)' }
                          : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.15)' }
                        }
                      >
                        {doc.target_level ?? 'All Levels'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.45)' }}>{doc.status === 'ready' ? doc.chunk_count : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {new Date(doc.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      {doc.file_url ? (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
                          style={{ background: 'rgba(13,148,136,0.15)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.30)' }}
                        >
                          View ↗
                        </a>
                      ) : (
                        <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(doc)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.30)' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteDoc(doc)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditDoc(null) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <h2 className="text-base font-semibold text-white">Edit Document</h2>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Document Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Visible To</label>
              <select
                value={editLevel}
                onChange={e => setEditLevel(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="">All Levels (everyone)</option>
                {levels.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>

            {editError && (
              <p className="text-sm rounded-xl px-4 py-2" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}>
                {editError}
              </p>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setEditDoc(null)}
                className="px-4 py-2 text-sm rounded-xl"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || editSaving}
                className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all"
                style={{
                  background: (!editName.trim() || editSaving) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                  cursor: (!editName.trim() || editSaving) ? 'not-allowed' : 'pointer',
                }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) setDeleteDoc(null) }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <div className="text-center">
              <p className="text-3xl mb-3">🗑️</p>
              <h2 className="text-base font-semibold text-white mb-1">Delete Document?</h2>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.50)' }}>
                <span className="text-white font-medium">&quot;{deleteDoc.name}&quot;</span> and all its indexed chunks will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-1">
              <button
                onClick={() => setDeleteDoc(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-xl"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white rounded-xl"
                style={{ background: deleting ? 'rgba(239,68,68,0.40)' : 'rgba(239,68,68,0.80)', cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
