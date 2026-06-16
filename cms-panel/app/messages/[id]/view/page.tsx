import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'
import type { Message } from '@/lib/types'
import { getMessageStatus } from '@/lib/types'

export default async function ViewMessagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params

  const { data: message } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .single()

  if (!message) notFound()

  const msg = message as Message
  const status = getMessageStatus(msg)
  const date = msg.published_at ?? msg.scheduled_at ?? msg.created_at

  const audienceLabel =
    msg.target_type === 'all'
      ? 'All Employees'
      : msg.target_type === 'dept'
      ? `Department: ${msg.target_value}`
      : `Role: ${msg.target_value}`

  return (
    <AppLayout title="View Message">
      <div className="max-w-2xl space-y-6">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'rgba(255,255,255,0.50)' }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Announcements
        </Link>

        {/* Meta card */}
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold text-white">{msg.title}</h1>
            <span
              className="shrink-0 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
              style={
                status === 'live'
                  ? { background: 'rgba(13,148,136,0.20)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.35)' }
                  : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.10)' }
              }
            >
              {status}
            </span>
          </div>

          <div className="flex flex-wrap gap-6 text-sm" style={{ color: 'rgba(255,255,255,0.50)' }}>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>Audience: </span>
              {audienceLabel}
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.30)' }}>Published: </span>
              {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Content card */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <div
            className="prose prose-sm max-w-none"
            style={{ color: 'rgba(255,255,255,0.80)' }}
            dangerouslySetInnerHTML={{ __html: msg.content_html ?? '' }}
          />
        </div>

        {/* Read receipts link */}
        {status === 'live' && (
          <Link
            href={`/messages/${id}/reads`}
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
            style={{ color: '#5eead4' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            View Read Receipts
          </Link>
        )}
      </div>
    </AppLayout>
  )
}
