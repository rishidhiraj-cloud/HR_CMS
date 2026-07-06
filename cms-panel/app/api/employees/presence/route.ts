import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('employee_presence')
    .select('employee_id, last_seen_at')

  return NextResponse.json(data ?? [])
}

// POST /api/employees/presence — called by widget heartbeat
// Accepts Bearer token (email/password users) or X-Employee-Id (MS SSO users)
export async function POST(req: NextRequest) {
  const admin = svc()
  let employeeId: string

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    employeeId = user.id
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeId = emp.id
  }

  await admin
    .from('employee_presence')
    .upsert({ employee_id: employeeId, last_seen_at: new Date().toISOString() }, { onConflict: 'employee_id' })

  return NextResponse.json({ ok: true })
}
