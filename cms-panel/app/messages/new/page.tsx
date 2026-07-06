import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MessageForm from '@/components/MessageForm'
import AppLayout from '@/components/AppLayout'

export default async function NewMessagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: departments }, { data: levels }, { data: companies }] = await Promise.all([
    supabase.from('departments').select('name').order('name'),
    supabase.from('levels').select('name').order('name'),
    supabase.from('companies').select('name').order('name'),
  ])

  return (
    <AppLayout title="New Message">
      <MessageForm
        departments={(departments ?? []).map(d => d.name)}
        levels={(levels ?? []).map(l => l.name)}
        companies={(companies ?? []).map(c => c.name)}
      />
    </AppLayout>
  )
}
