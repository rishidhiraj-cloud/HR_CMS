import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'
import AnalyticsClient from './AnalyticsClient'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: hrUser } = await supabase.from('hr_users').select('name').eq('id', user.id).single()
  if (!hrUser) redirect('/login')

  return (
    <AppLayout title="Analytics" userName={hrUser.name}>
      <AnalyticsClient />
    </AppLayout>
  )
}
