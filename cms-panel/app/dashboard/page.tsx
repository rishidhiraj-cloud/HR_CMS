import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import AppLayout from '@/components/AppLayout'
import HomeClient from './HomeClient'
import type { HomeStats } from './HomeClient'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = svc()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: hrUser },
    { data: messages },
    { data: employees },
    { data: policyDocs },
    { data: polls },
    { data: pollResponses },
    { data: searchLogs },
    { data: docLogs },
    { data: departments },
    { data: levels },
    { data: hrUsers },
  ] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    admin.from('messages').select('id, published_at, scheduled_at'),
    admin.from('employees').select('id, is_active'),
    admin.from('policy_documents').select('id'),
    admin.from('polls').select('id, status'),
    admin.from('poll_responses').select('id'),
    admin.from('search_logs').select('id').gte('created_at', thirtyDaysAgo),
    admin.from('document_access_logs').select('id').gte('created_at', thirtyDaysAgo),
    admin.from('departments').select('id'),
    admin.from('levels').select('id'),
    admin.from('hr_users').select('id'),
  ])

  const stats: HomeStats = {
    hrName: hrUser?.name ?? '',
    messages: {
      total: messages?.length ?? 0,
      scheduled: messages?.filter(m => !m.published_at && m.scheduled_at).length ?? 0,
    },
    employees: {
      total: employees?.filter(e => e.is_active !== false).length ?? 0,
      pending: employees?.filter(e => e.is_active === false).length ?? 0,
    },
    documents: { total: policyDocs?.length ?? 0 },
    polls: {
      active: polls?.filter(p => p.status === 'active').length ?? 0,
      totalVotes: pollResponses?.length ?? 0,
    },
    analytics: {
      searches30d: searchLogs?.length ?? 0,
      docOpens30d: docLogs?.length ?? 0,
    },
    masters: {
      departments: departments?.length ?? 0,
      levels: levels?.length ?? 0,
    },
    policies: { total: policyDocs?.length ?? 0 },
    cmsUsers: { total: hrUsers?.length ?? 0 },
  }

  return (
    <AppLayout title="Home" userName={hrUser?.name}>
      <HomeClient stats={stats} />
    </AppLayout>
  )
}
