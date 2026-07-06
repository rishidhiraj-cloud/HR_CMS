'use client'
import { useState } from 'react'
import type { HrUser } from '@/lib/types'
import ChangePasswordModal from '@/components/ChangePasswordModal'

export default function UsersTable({ users }: { users: HrUser[] }) {
  const [changingUser, setChangingUser] = useState<HrUser | null>(null)

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Name</th>
            <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Email</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {users.map((u, i, arr) => (
            <tr key={u.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <td className="px-5 py-3.5 font-medium text-white">{u.name}</td>
              <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.50)' }}>{u.email}</td>
              <td className="px-5 py-3.5 text-right">
                <button
                  onClick={() => setChangingUser(u)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.70)' }}
                >
                  Change Password
                </button>
              </td>
            </tr>
          ))}
          {!users.length && (
            <tr>
              <td colSpan={3} className="px-5 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.30)' }}>
                No CMS users yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {changingUser && (
        <ChangePasswordModal key={changingUser.id} user={changingUser} onClose={() => setChangingUser(null)} />
      )}
    </>
  )
}
