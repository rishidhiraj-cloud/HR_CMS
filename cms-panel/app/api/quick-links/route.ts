import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { validateQuickLink, buildQuickLinkRow, QuickLinkBody } from './validate'

function svc() {
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

// GET /api/quick-links — list all (HR only)
export async function GET() {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await svc().from('quick_links').select('*').order('portal_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/quick-links — create (HR only)
export async function POST(req: NextRequest) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Partial<QuickLinkBody>
  const validationError = validateQuickLink(body)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const row = buildQuickLinkRow(body as QuickLinkBody)
  const { data, error } = await svc().from('quick_links').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
