import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MessageForm from '@/components/MessageForm'
import AppLayout from '@/components/AppLayout'
import type { Message } from '@/lib/types'

export default async function EditMessagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params

  const [{ data: message }, { data: departments }, { data: levels }] = await Promise.all([
    supabase.from('messages').select('*').eq('id', id).single(),
    supabase.from('departments').select('name').order('name'),
    supabase.from('levels').select('name').order('name'),
  ])

  if (!message) notFound()

  return (
    <AppLayout title="Edit Message">
      <MessageForm
        initial={message as Message}
        messageId={id}
        departments={(departments ?? []).map(d => d.name)}
        levels={(levels ?? []).map(l => l.name)}
      />
    </AppLayout>
  )
}
