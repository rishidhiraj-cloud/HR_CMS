'use client'
import { useState } from 'react'

interface Props {
  onSuccess: () => void
}

export default function EmployeeForm({ onSuccess }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (!department.trim()) { setError('Department is required'); return }
    if (!role.trim()) { setError('Role is required'); return }
    setError('')
    setSaving(true)

    const res = await fetch('/api/employees/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), department: department.trim(), role: role.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <input type="email" placeholder="work@company.com" value={email} onChange={e => setEmail(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <input placeholder="e.g. Sales" value={department} onChange={e => setDepartment(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <input placeholder="e.g. Manager" value={role} onChange={e => setRole(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <button type="submit" disabled={saving}
        className="w-full bg-indigo-600 text-white py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {saving ? 'Sending invite…' : 'Send Invite'}
      </button>
    </form>
  )
}
