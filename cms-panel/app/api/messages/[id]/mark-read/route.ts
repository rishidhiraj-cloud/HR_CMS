import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/messages/[id]/mark-read — called by widget when employee reads a message
// Accepts Bearer token (email/password users) or X-Employee-Id (MS SSO users)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = svc()
  const { id: messageId } = await params
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
    .from('message_reads')
    .upsert(
      { message_id: messageId, employee_id: employeeId, read_at: new Date().toISOString() },
      { onConflict: 'message_id,employee_id', ignoreDuplicates: true }
    )

  return NextResponse.json({ ok: true })
}
