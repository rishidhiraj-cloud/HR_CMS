export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import MessageTable from '@/components/MessageTable'
import AppLayout from '@/components/AppLayout'
import type { Message } from '@/lib/types'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const filter = params.filter ?? 'all'

  let query = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })

  if (filter === 'scheduled') query = query.is('published_at', null).not('scheduled_at', 'is', null)
  if (filter === 'live') query = query.not('published_at', 'is', null)

  const admin = svc()
  const [{ data: hrUser }, { data: messages }, { data: readData }] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    query,
    admin.from('message_reads').select('message_id'),
  ])

  const readCounts: Record<string, number> = {}
  readData?.forEach(r => {
    readCounts[r.message_id] = (readCounts[r.message_id] ?? 0) + 1
  })

  const tabs = ['all', 'live', 'scheduled']

  return (
    <AppLayout
      title="Announcements"
      userName={hrUser?.name}
      action={
        <Link
          href="/messages/new"
          className="text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
          style={{
            background: 'linear-gradient(135deg, #0d9488, #0891b2)',
            boxShadow: '0 4px 14px rgba(13,148,136,0.30)',
          }}
        >
          + New Message
        </Link>
      }
    >
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <Link
            key={tab}
            href={`/messages?filter=${tab}`}
            className="px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-all"
            style={
              filter === tab
                ? { background: 'rgba(13,148,136,0.30)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.40)' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.10)' }
            }
          >
            {tab}
          </Link>
        ))}
      </div>

      <MessageTable messages={(messages as Message[]) ?? []} readCounts={readCounts} />
    </AppLayout>
  )
}
