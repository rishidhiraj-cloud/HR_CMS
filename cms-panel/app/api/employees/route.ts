import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name, email, mobile, company, department, role } = await req.json()
  if (!name || !email || !mobile || !company || !department || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }

  const adminSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Generate a random internal password — employees authenticate via Microsoft SSO only
  const internalPassword = crypto.randomUUID() + crypto.randomUUID()

  const { data: authData, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password: internalPassword,
    email_confirm: true,
  })

  let authUserId: string

  if (createError) {
    // 'email_exists' can mean two different things: a genuine duplicate
    // employee, or an orphaned auth.users row left over from an earlier
    // attempt that created the auth user but never got as far as inserting
    // the employees row (e.g. the request was interrupted between the two
    // steps) — the rollback below only covers a clean employees-insert
    // failure within *this* request, not an interruption outside it.
    // Recover from the orphaned case by reusing the existing auth user
    // instead of failing forever on every future attempt for this email.
    if (createError.code !== 'email_exists') {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    const { data: existingUsers, error: listError } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
    const existingAuthUser = listError
      ? undefined
      : existingUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!existingAuthUser) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    const { data: existingEmployee } = await adminSupabase
      .from('employees')
      .select('id')
      .eq('id', existingAuthUser.id)
      .maybeSingle()
    if (existingEmployee) {
      return NextResponse.json({ error: 'An employee with this email already exists' }, { status: 409 })
    }

    authUserId = existingAuthUser.id
  } else {
    if (!authData?.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }
    authUserId = authData.user.id
  }

  const { error: dbError } = await adminSupabase.from('employees').insert({
    id: authUserId,
    name,
    email,
    mobile,
    company,
    department,
    role,
  })
  if (dbError) {
    // Only roll back (delete) the auth user if we created it fresh in this
    // request — an orphaned user we just adopted pre-existed this request,
    // so deleting it here would just recreate the exact same orphan problem
    // for the next attempt.
    if (!createError) {
      await adminSupabase.auth.admin.deleteUser(authUserId)
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
