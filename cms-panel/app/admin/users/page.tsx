import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { HrUser } from '@/lib/types'
import AppLayout from '@/components/AppLayout'
import AdminUsersClient from './client'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: hrUsers } = await supabase
    .from('hr_users')
    .select('id, name, email')
    .order('name')

  return (
    <AppLayout title="CMS Users">
      <div className="max-w-3xl space-y-6">
        {/* Existing users table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.70)' }}>Existing Users</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {(hrUsers as HrUser[] ?? []).map((u, i, arr) => (
                <tr key={u.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <td className="px-5 py-3.5 font-medium text-white">{u.name}</td>
                  <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.50)' }}>{u.email}</td>
                </tr>
              ))}
              {!hrUsers?.length && (
                <tr>
                  <td colSpan={2} className="px-5 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.30)' }}>
                    No CMS users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add user form */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <h2 className="text-sm font-semibold mb-5" style={{ color: 'rgba(255,255,255,0.70)' }}>Add CMS User</h2>
          <AdminUsersClient />
        </div>
      </div>
    </AppLayout>
  )
}
