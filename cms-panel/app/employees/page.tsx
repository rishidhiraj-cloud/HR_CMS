import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { Employee } from '@/lib/types'
import EmployeesClient from './client'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: employees }, { data: departments }, { data: levels }, { data: presence }] = await Promise.all([
    supabase.from('employees').select('*').order('name'),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('levels').select('id, name').order('name'),
    supabase.from('employee_presence').select('employee_id, last_seen_at'),
  ])

  const presenceMap: Record<string, string> = {}
  presence?.forEach(p => { presenceMap[p.employee_id] = p.last_seen_at })

  const employeesWithPresence: Employee[] = (employees ?? []).map((emp: Employee) => ({
    ...emp,
    last_seen_at: presenceMap[emp.id] ?? null,
  }))

  return (
    <EmployeesClient
      employees={employeesWithPresence}
      departments={(departments ?? []).map(d => d.name)}
      levels={(levels ?? []).map(l => l.name)}
    />
  )
}
