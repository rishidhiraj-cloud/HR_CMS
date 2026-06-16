import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'
import PollsClient from './PollsClient'

export default async function PollsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: hrUser } = await supabase.from('hr_users').select('name').eq('id', user.id).single()
  if (!hrUser) redirect('/login')

  const { data: levels } = await supabase.from('levels').select('id, name').order('name')

  return (
    <AppLayout title="Polls" userName={hrUser.name}>
      <PollsClient levels={levels ?? []} />
    </AppLayout>
  )
}
