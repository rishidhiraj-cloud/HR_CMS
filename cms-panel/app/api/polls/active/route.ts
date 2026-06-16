import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/polls/active — called by widget with employee Bearer token
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7)
    : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = svc()
  const { data: { user }, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { data: emp } = await admin.from('employees').select('role').eq('id', user.id).single()
  const employeeRole: string | null = emp?.role ?? null

  const { data: polls, error } = await admin
    .from('polls')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filtered = (polls ?? []).filter((p: Record<string, unknown>) =>
    p.target_type === 'all' ||
    (p.target_type === 'level' && p.target_value === employeeRole)
  )

  const result = await Promise.all(filtered.map(async (poll: Record<string, unknown>) => {
    const { data: responses } = await admin
      .from('poll_responses')
      .select('selected_option, employee_id')
      .eq('poll_id', poll.id)

    const myResponse = (responses ?? []).find((r: Record<string, unknown>) => r.employee_id === user.id)
    const options = poll.options as string[]
    const voteCounts = options.map((_: string, i: number) =>
      (responses ?? []).filter((r: Record<string, unknown>) => r.selected_option === i).length
    )

    return {
      ...poll,
      hasVoted: !!myResponse,
      myVote: myResponse ? (myResponse as Record<string, unknown>).selected_option : null,
      voteCounts,
      totalVotes: responses?.length ?? 0,
    }
  }))

  return NextResponse.json(result)
}
