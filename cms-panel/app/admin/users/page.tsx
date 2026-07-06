import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { HrUser } from '@/lib/types'
import AppLayout from '@/components/AppLayout'
import AdminUsersClient from './client'
import UsersTable from './UsersTable'

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
          <UsersTable users={hrUsers as HrUser[] ?? []} />
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
