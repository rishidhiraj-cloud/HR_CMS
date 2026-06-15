import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { HrUser } from '@/lib/types'
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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-bold text-gray-900">CMS Users</h1>
      </div>

      <div className="bg-white rounded-lg border mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Email</th>
            </tr>
          </thead>
          <tbody>
            {(hrUsers as HrUser[] ?? []).map(u => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
              </tr>
            ))}
            {!hrUsers?.length && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-gray-400 text-sm">No CMS users yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add CMS User</h2>
        <AdminUsersClient />
      </div>
    </div>
  )
}
