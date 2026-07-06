'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import EmployeeForm from '@/components/EmployeeForm'
import type { Employee } from '@/lib/types'

const ONLINE_MS = 10 * 60 * 1000 // 10 minutes

function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_MS
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      title={online ? 'Online' : 'Offline'}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        flexShrink: 0,
        background: online ? '#22c55e' : 'rgba(255,255,255,0.20)',
        boxShadow: online ? '0 0 6px rgba(34,197,94,0.60)' : 'none',
      }}
    />
  )
}


interface Props {
  employees: Employee[]
  departments: string[]
  levels: string[]
}

type StatusFilter = 'all' | 'online' | 'offline'

export default function EmployeesClient({ employees: initial, departments, levels }: Props) {
  const router = useRouter()
  const [employees, setEmployees] = useState(initial)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Presence map: employeeId → last_seen_at string
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    initial.forEach(emp => { if (emp.last_seen_at) map[emp.id] = emp.last_seen_at })
    return map
  })

  // Filters
  const [filterDept, setFilterDept] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')

  // Poll presence every 30s
  useEffect(() => {
    const poll = async () => {
      const res = await fetch('/api/employees/presence')
      if (!res.ok) return
      const data: { employee_id: string; last_seen_at: string }[] = await res.json()
      const map: Record<string, string> = {}
      data.forEach(p => { map[p.employee_id] = p.last_seen_at })
      setPresenceMap(map)
    }
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [])

  const allDepts = [...new Set(employees.map(e => e.department))].filter(Boolean).sort()
  const allRoles = [...new Set(employees.map(e => e.role))].filter(Boolean).sort()

  const filtered = employees.filter(emp => {
    if (filterDept !== 'all' && emp.department !== filterDept) return false
    if (filterRole !== 'all' && emp.role !== filterRole) return false
    const online = isOnline(presenceMap[emp.id])
    if (filterStatus === 'online' && !online) return false
    if (filterStatus === 'offline' && online) return false
    return true
  })

  const onlineCount = employees.filter(e => isOnline(presenceMap[e.id])).length

  function openAdd() { setFormMode('add'); setEditingEmployee(null) }
  function openEdit(emp: Employee) { setFormMode('edit'); setEditingEmployee(emp) }
  function closeForm() { setFormMode(null); setEditingEmployee(null) }

  async function handleToggleActive(emp: Employee) {
    setTogglingId(emp.id)
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !emp.is_active }),
    })
    if (res.ok) {
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: !emp.is_active } : e))
    }
    setTogglingId(null)
  }

  function handleFormSuccess() {
    closeForm()
    router.refresh()
  }

  const pillStyle = (active: boolean) => ({
    background: active ? 'rgba(13,148,136,0.25)' : 'rgba(255,255,255,0.06)',
    color: active ? '#5eead4' : 'rgba(255,255,255,0.50)',
    border: `1px solid ${active ? 'rgba(13,148,136,0.40)' : 'rgba(255,255,255,0.10)'}`,
    cursor: 'pointer' as const,
  })

  const selectStyle = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.70)',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(255,255,255,0.35)'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '14px',
    paddingRight: '30px',
    cursor: 'pointer' as const,
  }

  return (
    <AppLayout
      title="Employees"
      action={
        <button
          onClick={() => formMode === 'add' ? closeForm() : openAdd()}
          className="text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
          style={{
            background: formMode === 'add'
              ? 'rgba(255,255,255,0.10)'
              : 'linear-gradient(135deg, #0d9488, #0891b2)',
            boxShadow: formMode === 'add' ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
          }}
        >
          {formMode === 'add' ? 'Cancel' : '+ Add Employee'}
        </button>
      }
    >
      {formMode && (
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.70)' }}>
              {formMode === 'add' ? 'New Employee' : `Edit — ${editingEmployee?.name}`}
            </h2>
            <button onClick={closeForm} className="text-xs transition-colors" style={{ color: 'rgba(255,255,255,0.40)' }}>✕ Cancel</button>
          </div>
          <EmployeeForm
            departments={departments}
            levels={levels}
            initial={editingEmployee ?? undefined}
            employeeId={editingEmployee?.id}
            onSuccess={handleFormSuccess}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Online summary */}
        <span className="text-xs flex items-center gap-1.5 mr-2" style={{ color: 'rgba(255,255,255,0.40)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 5px rgba(34,197,94,0.6)' }} />
          {onlineCount} online
        </span>

        {/* Status pills */}
        <div className="flex gap-1.5">
          {(['all', 'online', 'offline'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className="px-3 py-1 rounded-full text-xs font-medium capitalize transition-all"
              style={pillStyle(filterStatus === s)}
            >
              {s === 'all' ? 'All Status' : s === 'online' ? '● Online' : '○ Offline'}
            </button>
          ))}
        </div>

        {/* Department dropdown */}
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          className="rounded-xl px-3 py-1.5 text-xs outline-none"
          style={selectStyle}
        >
          <option value="all" style={{ background: '#0b2d3d' }}>All Departments</option>
          {allDepts.map(d => (
            <option key={d} value={d} style={{ background: '#0b2d3d' }}>{d}</option>
          ))}
        </select>

        {/* Role dropdown */}
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="rounded-xl px-3 py-1.5 text-xs outline-none"
          style={selectStyle}
        >
          <option value="all" style={{ background: '#0b2d3d' }}>All Roles</option>
          {allRoles.map(r => (
            <option key={r} value={r} style={{ background: '#0b2d3d' }}>{r}</option>
          ))}
        </select>

        {(filterDept !== 'all' || filterRole !== 'all' || filterStatus !== 'all') && (
          <button
            onClick={() => { setFilterDept('all'); setFilterRole('all'); setFilterStatus('all') }}
            className="text-xs transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              {['', 'Name', 'Email', 'Mobile', 'Department', 'Level', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp, i) => {
              const online = isOnline(presenceMap[emp.id])
              const isDisabled = !emp.is_active
              const isToggling = togglingId === emp.id
              return (
                <tr
                  key={emp.id}
                  style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    opacity: isDisabled ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {/* Online dot */}
                  <td className="pl-4 pr-1 py-3.5 w-6">
                    <OnlineDot online={online && !isDisabled} />
                  </td>

                  <td className="px-4 py-3.5 font-medium" style={{ color: isDisabled ? 'rgba(255,255,255,0.50)' : 'white' }}>
                    <span className="flex items-center gap-2 flex-wrap">
                      {emp.name}
                      {isDisabled && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}>
                          Disabled
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{emp.email}</td>
                  <td className="px-4 py-3.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{emp.mobile}</td>
                  <td className="px-4 py-3.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{emp.department}</td>
                  <td className="px-4 py-3.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{emp.role}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => openEdit(emp)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#5eead4' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(emp)}
                        disabled={isToggling}
                        className="text-xs font-medium transition-colors"
                        style={{
                          color: isDisabled ? 'rgba(134,239,172,0.80)' : 'rgba(252,165,165,0.80)',
                          opacity: isToggling ? 0.5 : 1,
                          cursor: isToggling ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isToggling ? '…' : isDisabled ? 'Enable' : 'Disable'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.30)' }}>
            {employees.length === 0 ? 'No employees yet — add one above' : 'No employees match these filters'}
          </p>
        )}
      </div>
    </AppLayout>
  )
}
