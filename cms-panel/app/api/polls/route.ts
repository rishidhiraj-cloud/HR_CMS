import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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

// GET /api/polls — list all polls with vote counts
export async function GET() {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = svc()

  const { data: polls, error } = await admin
    .from('polls')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach vote counts + voter names per poll
  const pollsWithCounts = await Promise.all((polls ?? []).map(async (poll) => {
    const { data: responses } = await admin
      .from('poll_responses')
      .select('selected_option, employee_id')
      .eq('poll_id', poll.id)

    const options = poll.options as string[]
    const voteCounts = options.map((_: string, i: number) =>
      (responses ?? []).filter((r: { selected_option: number }) => r.selected_option === i).length
    )

    let votersByOption: { name: string; department: string | null }[][] = options.map(() => [])
    if (responses && responses.length > 0) {
      const ids = [...new Set(responses.map((r: { employee_id: string }) => r.employee_id))]
      const { data: emps } = await admin
        .from('employees')
        .select('id, name, department')
        .in('id', ids)
      const empMap = Object.fromEntries(
        (emps ?? []).map((e: { id: string; name: string; department: string | null }) => [
          e.id, { name: e.name, department: e.department }
        ])
      )
      votersByOption = options.map((_: string, i: number) =>
        responses
          .filter((r: { selected_option: number }) => r.selected_option === i)
          .map((r: { employee_id: string }) => empMap[r.employee_id] ?? { name: 'Unknown', department: null })
      )
    }

    return { ...poll, voteCounts, totalVotes: responses?.length ?? 0, votersByOption }
  }))

  return NextResponse.json(pollsWithCounts)
}

// POST /api/polls — create a poll
export async function POST(req: NextRequest) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    question: string
    options: string[]
    poll_type: string
    target_type: string
    target_value?: string
    expires_at?: string
  }

  const { question, options, poll_type, target_type, target_value, expires_at } = body
  if (!question?.trim() || !options?.length) {
    return NextResponse.json({ error: 'question and options are required' }, { status: 400 })
  }

  const { data, error } = await svc().from('polls').insert({
    question: question.trim(),
    options,
    poll_type,
    target_type,
    target_value: target_value || null,
    expires_at: expires_at || null,
    created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
