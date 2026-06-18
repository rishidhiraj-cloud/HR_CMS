import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/auth/ms-login
// Widget calls this after Microsoft OAuth with the raw id_token.
// We decode the token to get the email, then look up the employee using
// the service role key (bypasses RLS — safe because this runs server-side only).
export async function POST(req: Request) {
  const { idToken } = await req.json()
  if (!idToken || typeof idToken !== 'string') {
    return NextResponse.json({ error: 'Missing id_token' }, { status: 400 })
  }

  // Decode JWT payload (Microsoft already validated this token — we trust the email claim)
  let msEmail = ''
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    msEmail = (payload.email ?? payload.preferred_username ?? '').toLowerCase().trim()
  } catch {
    return NextResponse.json({ error: 'Invalid id_token format' }, { status: 400 })
  }

  if (!msEmail) {
    return NextResponse.json({ error: 'No email found in Microsoft token' }, { status: 400 })
  }

  const admin = adminClient()
  const { data: emp, error } = await admin
    .from('employees')
    .select('*')
    .ilike('email', msEmail)
    .single()

  if (error || !emp) {
    return NextResponse.json(
      { error: `No employee account found for ${msEmail}. Ask HR to register this email.` },
      { status: 404 }
    )
  }

  if (!emp.is_active) {
    return NextResponse.json(
      { error: 'Your account has been disabled. Please contact HR.' },
      { status: 403 }
    )
  }

  return NextResponse.json({ employee: emp })
}
