'use client'

import { useState } from 'react'
import Link from 'next/link'

type LinkType = 'website' | 'mobile_app'

interface QuickLink {
  id: string
  company: string
  portal_name: string
  purpose: string
  how_to_use: string
  type: LinkType
  url: string | null
  android_app_url: string | null
  ios_app_url: string | null
}

interface Company {
  id: string
  name: string
}

interface Props {
  initialQuickLinks: QuickLink[]
  companies: Company[]
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

export default function QuickLinksClient({ initialQuickLinks, companies }: Props) {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(initialQuickLinks)

  // Filters
  const [searchName, setSearchName] = useState('')
  const [searchCompany, setSearchCompany] = useState('')
  const [searchType, setSearchType] = useState('')

  // Edit state
  const [editLink, setEditLink] = useState<QuickLink | null>(null)
  const [editCompany, setEditCompany] = useState('')
  const [editPortalName, setEditPortalName] = useState('')
  const [editPurpose, setEditPurpose] = useState('')
  const [editType, setEditType] = useState<LinkType>('website')
  const [editUrl, setEditUrl] = useState('')
  const [editAndroidAppUrl, setEditAndroidAppUrl] = useState('')
  const [editIosAppUrl, setEditIosAppUrl] = useState('')
  const [editHowToUse, setEditHowToUse] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete state
  const [deleteLink, setDeleteLink] = useState<QuickLink | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = quickLinks.filter(link => {
    const nameMatch = !searchName.trim() || link.portal_name.toLowerCase().includes(searchName.toLowerCase())
    const companyMatch = !searchCompany || link.company === searchCompany
    const typeMatch = !searchType || link.type === searchType
    return nameMatch && companyMatch && typeMatch
  })

  const editCanSave = Boolean(
    editCompany && editPortalName.trim() && editPurpose.trim() && editHowToUse.trim() &&
    (editType === 'website' ? editUrl.trim() : (editAndroidAppUrl.trim() || editIosAppUrl.trim()))
  )

  function openEdit(link: QuickLink) {
    setEditLink(link)
    setEditCompany(link.company)
    setEditPortalName(link.portal_name)
    setEditPurpose(link.purpose)
    setEditType(link.type)
    setEditUrl(link.url ?? '')
    setEditAndroidAppUrl(link.android_app_url ?? '')
    setEditIosAppUrl(link.ios_app_url ?? '')
    setEditHowToUse(link.how_to_use)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!editLink || !editCanSave) return
    setEditSaving(true)
    setEditError('')
    try {
      const body = {
        company: editCompany,
        portal_name: editPortalName.trim(),
        purpose: editPurpose.trim(),
        how_to_use: editHowToUse.trim(),
        type: editType,
        url: editType === 'website' ? editUrl.trim() : null,
        android_app_url: editType === 'mobile_app' ? editAndroidAppUrl.trim() : null,
        ios_app_url: editType === 'mobile_app' ? editIosAppUrl.trim() : null,
      }
      const res = await fetch(`/api/quick-links/${editLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Save failed')
      }
      setQuickLinks(prev => prev.map(l => l.id === editLink.id ? { ...l, ...body } : l))
      setEditLink(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteLink) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/quick-links/${deleteLink.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setQuickLinks(prev => prev.filter(l => l.id !== deleteLink.id))
      setDeleteLink(null)
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
        <strong className="text-teal-300">How it works:</strong> Add portals and mobile apps for employees to find in the widget. Every link is scoped to one company — only employees of that company will see it.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by portal name…"
          value={searchName}
          onChange={e => setSearchName(e.target.value)}
          style={{ ...inputStyle, maxWidth: 280 }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        />
        <select
          value={searchCompany}
          onChange={e => setSearchCompany(e.target.value)}
          style={{ ...inputStyle, maxWidth: 200, cursor: 'pointer' }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        >
          <option value="">All Companies</option>
          {companies.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={searchType}
          onChange={e => setSearchType(e.target.value)}
          style={{ ...inputStyle, maxWidth: 160, cursor: 'pointer' }}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        >
          <option value="">All Types</option>
          <option value="website">Website</option>
          <option value="mobile_app">Mobile App</option>
        </select>
        {(searchName || searchCompany || searchType) && (
          <button
            onClick={() => { setSearchName(''); setSearchCompany(''); setSearchType('') }}
            className="text-xs px-3 py-1 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            Clear
          </button>
        )}
        <div className="ml-auto">
          <Link
            href="/quick-links/new"
            className="text-white text-sm font-medium px-4 py-2 rounded-xl transition-all inline-block"
            style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)', boxShadow: '0 4px 14px rgba(13,148,136,0.30)' }}
          >
            + New Quick Link
          </Link>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.30)' }}>
          <p className="text-5xl mb-4">🔗</p>
          <p className="font-medium text-white/60 text-base">
            {quickLinks.length === 0 ? 'No quick links yet' : 'No quick links match your filters'}
          </p>
          {quickLinks.length === 0 && <p className="text-sm mt-2">Add your first quick link to get started</p>}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={glass}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                {['Portal Name', 'Company', 'Type', 'Purpose', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((link, i) => (
                <tr key={link.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate">{link.portal_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(8,145,178,0.20)', color: '#67e8f9', border: '1px solid rgba(8,145,178,0.35)' }}
                    >
                      {link.company}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)' }}
                    >
                      {link.type === 'website' ? 'Website' : 'Mobile App'}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[280px] truncate" style={{ color: 'rgba(255,255,255,0.60)' }}>{link.purpose}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(link)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.30)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteLink(link)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditLink(null) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <h2 className="text-base font-semibold text-white">Edit Quick Link</h2>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Company</label>
              <select
                value={editCompany}
                onChange={e => setEditCompany(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                {companies.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Portal Name</label>
              <input
                type="text"
                value={editPortalName}
                onChange={e => setEditPortalName(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Purpose</label>
              <textarea
                value={editPurpose}
                onChange={e => setEditPurpose(e.target.value)}
                rows={2}
                className="resize-none"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Type</label>
              <select
                value={editType}
                onChange={e => setEditType(e.target.value as LinkType)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="website">Website</option>
                <option value="mobile_app">Mobile App</option>
              </select>
            </div>

            {editType === 'website' && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>URL</label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  style={inputStyle}
                  onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                  onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                />
              </div>
            )}

            {editType === 'mobile_app' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>Android App URL</label>
                  <input
                    type="text"
                    value={editAndroidAppUrl}
                    onChange={e => setEditAndroidAppUrl(e.target.value)}
                    style={inputStyle}
                    onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                    onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>iOS App URL</label>
                  <input
                    type="text"
                    value={editIosAppUrl}
                    onChange={e => setEditIosAppUrl(e.target.value)}
                    style={inputStyle}
                    onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                    onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.70)' }}>How to Use</label>
              <textarea
                value={editHowToUse}
                onChange={e => setEditHowToUse(e.target.value)}
                rows={3}
                className="resize-none"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            </div>

            {editError && (
              <p className="text-sm rounded-xl px-4 py-2" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}>
                {editError}
              </p>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setEditLink(null)}
                className="px-4 py-2 text-sm rounded-xl"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editCanSave || editSaving}
                className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all"
                style={{
                  background: (!editCanSave || editSaving) ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                  cursor: (!editCanSave || editSaving) ? 'not-allowed' : 'pointer',
                }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) setDeleteLink(null) }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <div className="text-center">
              <p className="text-3xl mb-3">🗑️</p>
              <h2 className="text-base font-semibold text-white mb-1">Delete Quick Link?</h2>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.50)' }}>
                <span className="text-white font-medium">&quot;{deleteLink.portal_name}&quot;</span> will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-1">
              <button
                onClick={() => setDeleteLink(null)}
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
