'use client'
import { useState, useRef, useEffect } from 'react'

interface Item {
  id: string
  name: string
  created_at: string
}

interface Props {
  title: string
  noun: string            // e.g. "Department" or "Level"
  initialItems: Item[]
  apiPath: string         // e.g. '/api/masters/departments'
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

const glass = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.09)',
}

const inputStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: 'white',
}

export default function MasterTable({ title, noun, initialItems, apiPath }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) addInputRef.current?.focus() }, [adding])
  useEffect(() => { if (editingId) editInputRef.current?.focus() }, [editingId])

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setAddSaving(true)
    setError('')
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setAdding(false)
    } finally {
      setAddSaving(false)
    }
  }

  function startEdit(item: Item) {
    setConfirmDeleteId(null)
    setEditingId(item.id)
    setEditName(item.name)
    setError('')
  }

  async function handleEdit() {
    const trimmed = editName.trim()
    if (!trimmed || !editingId) return
    setEditSaving(true)
    setError('')
    try {
      const res = await fetch(`${apiPath}/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setItems(prev => prev.map(i => i.id === editingId ? data : i).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingId(null)
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError('')
    try {
      const res = await fetch(`${apiPath}/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error)
        return
      }
      setItems(prev => prev.filter(i => i.id !== id))
      setConfirmDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  function cancelAdd() { setAdding(false); setNewName(''); setError('') }
  function cancelEdit() { setEditingId(null); setEditName(''); setError('') }

  return (
    <div className="rounded-2xl overflow-hidden" style={glass}>
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <button
          onClick={() => { setAdding(true); setConfirmDeleteId(null); setEditingId(null); setError('') }}
          disabled={adding}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all text-white"
          style={{
            background: adding ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
            boxShadow: adding ? 'none' : '0 2px 10px rgba(13,148,136,0.30)',
          }}
        >
          + Add {noun}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mx-4 mt-3 rounded-xl px-4 py-2.5 text-xs"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}
        >
          {error}
        </div>
      )}

      {/* Add row */}
      {adding && (
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,148,136,0.06)' }}
        >
          <input
            ref={addInputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={`${noun} name…`}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') cancelAdd() }}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-all placeholder:text-white/30"
            style={inputStyle}
          />
          <button
            onClick={handleAdd}
            disabled={addSaving || !newName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
            style={{ background: 'rgba(13,148,136,0.40)', border: '1px solid rgba(13,148,136,0.50)' }}
          >
            {addSaving ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckIcon />}
            Save
          </button>
          <button
            onClick={cancelAdd}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <XIcon /> Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.38)' }}>#</th>
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.38)' }}>Name</th>
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.38)' }}>Added On</th>
            <th className="px-5 py-3 w-24" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} style={{ borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <td className="px-5 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.30)' }}>{i + 1}</td>

              {/* Name cell — normal or edit mode */}
              <td className="px-5 py-3">
                {editingId === item.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') cancelEdit() }}
                    className="rounded-lg px-3 py-1 text-sm outline-none transition-all w-full max-w-xs"
                    style={inputStyle}
                  />
                ) : (
                  <span className="font-medium text-white">{item.name}</span>
                )}
              </td>

              <td className="px-5 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
                {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </td>

              {/* Actions */}
              <td className="px-5 py-3">
                {editingId === item.id ? (
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      onClick={handleEdit}
                      disabled={editSaving || !editName.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                      style={{ background: 'rgba(13,148,136,0.40)', border: '1px solid rgba(13,148,136,0.50)' }}
                    >
                      {editSaving ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckIcon />}
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center px-2 py-1 rounded-lg transition-all"
                      style={{ color: 'rgba(255,255,255,0.40)', background: 'rgba(255,255,255,0.06)' }}
                    >
                      <XIcon />
                    </button>
                  </div>
                ) : confirmDeleteId === item.id ? (
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-xs mr-1" style={{ color: 'rgba(255,255,255,0.45)' }}>Delete?</span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                      style={{ background: 'rgba(239,68,68,0.40)', border: '1px solid rgba(239,68,68,0.50)' }}
                    >
                      {deletingId === item.id ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckIcon />}
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex items-center px-2 py-1 rounded-lg transition-all"
                      style={{ color: 'rgba(255,255,255,0.40)', background: 'rgba(255,255,255,0.06)' }}
                    >
                      <XIcon />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      onClick={() => startEdit(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ color: '#5eead4', background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.22)' }}
                      title="Edit"
                    >
                      <EditIcon /> Edit
                    </button>
                    <button
                      onClick={() => { setConfirmDeleteId(item.id); setEditingId(null) }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)' }}
                      title="Delete"
                    >
                      <TrashIcon /> Delete
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && !adding && (
        <p className="text-center py-10 text-sm" style={{ color: 'rgba(255,255,255,0.28)' }}>
          No {title.toLowerCase()} yet — add one above
        </p>
      )}
    </div>
  )
}
