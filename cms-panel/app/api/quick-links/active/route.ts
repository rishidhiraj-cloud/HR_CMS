import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/quick-links/active — called by widget with Bearer token or X-Employee-Id header
export async function GET(req: NextRequest) {
  const admin = svc()
  let employeeCompany: string | null = null

  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null

  if (token) {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('company').eq('id', user.id).single()
    employeeCompany = emp?.company ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await admin.from('employees').select('id, company').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    employeeCompany = emp.company ?? null
  }

  // Company is mandatory on every quick link — if we don't know the caller's
  // company, there is no sensible "unrestricted" bucket to fall back to, so
  // return nothing rather than guessing.
  if (!employeeCompany) return NextResponse.json([])

  const { data, error } = await admin
    .from('quick_links')
    .select('id, company, portal_name, purpose, how_to_use, type, url, android_app_url, ios_app_url')
    .eq('company', employeeCompany)
    .order('portal_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
