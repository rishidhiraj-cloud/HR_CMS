import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/documents — called by widget with Bearer token or X-Employee-Id header
export async function GET(req: NextRequest) {
  const admin = svc()
  let employeeRole: string | null = null
  let employeeCompany: string | null = null

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('role, company').eq('id', user.id).single()
    employeeRole = emp?.role ?? null
    employeeCompany = emp?.company ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id, role, company').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeRole = emp.role ?? null
    employeeCompany = emp.company ?? null
  }

  // Company is mandatory on every document — if we don't know the caller's
  // company, there is no sensible "unrestricted" bucket to fall back to
  // (unlike level), so return nothing rather than guessing.
  if (!employeeCompany) return NextResponse.json([])

  // Return documents belonging to this employee's company, targeted at all
  // employees or specifically at this employee's level.
  const query = admin
    .from('policy_documents')
    .select('id, name, file_type, file_url, target_level, company')
    .eq('status', 'ready')
    .eq('company', employeeCompany)
    .order('name', { ascending: true })

  const { data, error } = employeeRole
    ? await query.or(`target_level.is.null,target_level.eq.${employeeRole}`)
    : await query.is('target_level', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
