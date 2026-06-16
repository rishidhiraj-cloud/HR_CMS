import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'
import DocumentsClient from './DocumentsClient'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: hrUser }, { data: documents }, { data: levels }] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    supabase.from('policy_documents').select('*').order('uploaded_at', { ascending: false }),
    supabase.from('levels').select('id, name').order('name'),
  ])

  if (!hrUser) redirect('/login')

  return (
    <AppLayout title="Documents" userName={hrUser.name}>
      <DocumentsClient
        initialDocuments={documents ?? []}
        levels={levels ?? []}
      />
    </AppLayout>
  )
}
