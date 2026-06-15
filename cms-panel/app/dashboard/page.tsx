import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MessageTable from '@/components/MessageTable'
import LogoutButton from '@/components/LogoutButton'
import type { Message } from '@/lib/types'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: hrUser } = await supabase
    .from('hr_users')
    .select('name')
    .eq('id', user.id)
    .single()

  const params = await searchParams
  const filter = params.filter ?? 'all'

  let query = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })

  if (filter === 'scheduled') query = query.is('published_at', null).not('scheduled_at', 'is', null)
  if (filter === 'live') query = query.not('published_at', 'is', null)

  const { data: messages } = await query
  const tabs = ['all', 'live', 'scheduled']

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">HR Announcements</h1>
          {hrUser?.name && (
            <p className="text-sm text-gray-500 mt-0.5">Welcome back, {hrUser.name} 👋</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/messages/new"
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            + New Message
          </Link>
          <LogoutButton />
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {tabs.map(tab => (
          <Link
            key={tab}
            href={`/dashboard?filter=${tab}`}
            className={`px-3 py-1.5 rounded text-sm capitalize ${
              filter === tab
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab}
          </Link>
        ))}
        <div className="ml-auto flex gap-2">
          <Link
            href="/employees"
            className="px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            Employees
          </Link>
          <Link
            href="/admin/users"
            className="px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            CMS Users
          </Link>
        </div>
      </div>

      <MessageTable messages={(messages as Message[]) ?? []} />
    </div>
  )
}
