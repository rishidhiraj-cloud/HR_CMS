import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name, email, mobile, password, department, role } = await req.json()
  if (!name || !email || !mobile || !password || !department || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }

  const adminSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })

  if (!authData?.user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  const { error: dbError } = await adminSupabase.from('employees').insert({
    id: authData.user.id,
    name,
    email,
    mobile,
    department,
    role,
  })
  if (dbError) {
    await adminSupabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
