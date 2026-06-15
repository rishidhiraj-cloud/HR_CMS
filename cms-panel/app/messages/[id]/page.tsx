import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MessageForm from '@/components/MessageForm'
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

  const { data: message } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .single()

  if (!message) notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-bold text-gray-900">Edit Message</h1>
      </div>
      <MessageForm initial={message as Message} messageId={id} />
    </div>
  )
}
