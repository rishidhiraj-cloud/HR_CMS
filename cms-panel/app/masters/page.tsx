import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'
import MasterTable from '@/components/MasterTable'

export default async function MastersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: hrUser } = await supabase.from('hr_users').select('name').eq('id', user.id).single()
  if (!hrUser) redirect('/login')

  // Parallel fetch all masters
  const [{ data: departments }, { data: levels }, { data: companies }] = await Promise.all([
    supabase.from('departments').select('*').order('name'),
    supabase.from('levels').select('*').order('name'),
    supabase.from('companies').select('*').order('name'),
  ])

  return (
    <AppLayout title="Masters" userName={hrUser.name}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MasterTable
          title="Departments"
          noun="Department"
          initialItems={departments ?? []}
          apiPath="/api/masters/departments"
        />
        <MasterTable
          title="Levels"
          noun="Level"
          initialItems={levels ?? []}
          apiPath="/api/masters/levels"
        />
        <MasterTable
          title="Companies"
          noun="Company"
          initialItems={companies ?? []}
          apiPath="/api/masters/companies"
        />
      </div>
    </AppLayout>
  )
}
