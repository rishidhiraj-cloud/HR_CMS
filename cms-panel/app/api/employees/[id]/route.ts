import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireHr() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: hr } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  return hr ? user : null
}

// PUT /api/employees/[id] — update employee details
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { name, email, mobile, department, role } = await req.json()

  const admin = adminClient()

  // Update Supabase Auth email if it changed
  if (email) {
    const { error } = await admin.auth.admin.updateUserById(id, { email })
    if (error) {
      const msg = error.message || JSON.stringify(error) || 'Failed to update auth email'
      console.error('[employee PUT] auth update error:', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const { error } = await admin.from('employees').update({ name, email, mobile, department, role }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// PATCH /api/employees/[id] — toggle is_active
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { is_active } = await req.json()

  const { error } = await adminClient().from('employees').update({ is_active }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
