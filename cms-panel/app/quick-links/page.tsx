import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'
import QuickLinksClient from './QuickLinksClient'

export default async function QuickLinksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: hrUser }, { data: quickLinks }, { data: companies }] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    supabase.from('quick_links').select('*').order('portal_name', { ascending: true }),
    supabase.from('companies').select('id, name').order('name'),
  ])

  if (!hrUser) redirect('/login')

  return (
    <AppLayout title="Quick Links" userName={hrUser.name}>
      <QuickLinksClient
        initialQuickLinks={quickLinks ?? []}
        companies={companies ?? []}
      />
    </AppLayout>
  )
}
