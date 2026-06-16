import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/polls/[id]/vote — called by widget with employee Bearer token
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = svc()
  const { data: { user }, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { id } = await params
  const { optionIndex } = await req.json() as { optionIndex: number }

  const { error } = await admin.from('poll_responses').insert({
    poll_id: id,
    employee_id: user.id,
    selected_option: optionIndex,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: responses } = await admin
    .from('poll_responses')
    .select('selected_option')
    .eq('poll_id', id)

  const { data: poll } = await admin
    .from('polls')
    .select('options')
    .eq('id', id)
    .single()

  const options = (poll?.options ?? []) as string[]
  const voteCounts = options.map((_: string, i: number) =>
    (responses ?? []).filter((r: Record<string, unknown>) => r.selected_option === i).length
  )

  return NextResponse.json({ voteCounts, totalVotes: responses?.length ?? 0 })
}
