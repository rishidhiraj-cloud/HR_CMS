'use client'
import { useState } from 'react'
import type { Employee } from '@/lib/types'

interface Props {
  departments: string[]
  levels: string[]
  initial?: Employee
  employeeId?: string
  onSuccess: () => void
}

export default function EmployeeForm({ departments, levels, initial, employeeId, onSuccess }: Props) {
  const isEdit = !!employeeId

  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [mobile, setMobile] = useState(initial?.mobile ?? '')
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [level, setLevel] = useState(initial?.role ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (!mobile.trim()) { setError('Mobile is required'); return }
    if (!department) { setError('Please select a department'); return }
    if (!level) { setError('Please select a level'); return }
    setError('')
    setSaving(true)

    const body: Record<string, string> = {
      name: name.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      department,
      role: level,
    }

    const res = await fetch(
      isEdit ? `/api/employees/${employeeId}` : '/api/employees',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok) { setError(typeof data.error === 'string' && data.error ? data.error : 'Failed to save. Please try again.'); setSaving(false); return }
    onSuccess()
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'white',
  }

  const selectStyle = {
    ...inputStyle,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(255,255,255,0.4)'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '16px',
    paddingRight: '36px',
    cursor: 'pointer',
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.border = '1px solid rgba(13,148,136,0.60)'
    e.target.style.background = 'rgba(255,255,255,0.10)'
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.border = '1px solid rgba(255,255,255,0.14)'
    e.target.style.background = 'rgba(255,255,255,0.08)'
  }

  const baseInputCls = 'w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Full name"
          value={name}
          onChange={e => setName(e.target.value)}
          className={baseInputCls}
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <input
          type="email"
          placeholder="work@company.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={baseInputCls}
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <input
          type="tel"
          placeholder="Mobile number"
          value={mobile}
          onChange={e => setMobile(e.target.value)}
          className={baseInputCls}
          style={inputStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        <div className="relative">
          <select
            value={department}
            onChange={e => setDepartment(e.target.value)}
            className={baseInputCls}
            style={selectStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Department</option>
            {departments.length === 0 && (
              <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No departments — add in Masters</option>
            )}
            {departments.map(d => (
              <option key={d} value={d} style={{ background: '#0b2d3d', color: 'white' }}>{d}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            className={baseInputCls}
            style={selectStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Level</option>
            {levels.length === 0 && (
              <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No levels — add in Masters</option>
            )}
            {levels.map(l => (
              <option key={l} value={l} style={{ background: '#0b2d3d', color: 'white' }}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 mt-1"
        style={{
          background: saving ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
          boxShadow: saving ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? (
          <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
        ) : isEdit ? 'Save Changes' : 'Save Employee'}
      </button>
    </form>
  )
}
