import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { Employee } from '@/lib/types'
import EmployeesClient from './client'

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employees } = await supabase.from('employees').select('*').order('name')

  return <EmployeesClient employees={(employees as Employee[]) ?? []} />
}
