import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'

interface ReadRow {
  read_at: string
  employee: {
    name: string
    department: string | null
  } | null
}

export default async function MessageReadsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params

  const [{ data: message }, { data: reads }] = await Promise.all([
    supabase.from('messages').select('title').eq('id', id).single(),
    supabase
      .from('message_reads')
      .select('read_at, employee:employees(name, department)')
      .eq('message_id', id)
      .order('read_at', { ascending: false }),
  ])

  if (!message) notFound()

  const rows = (reads ?? []) as unknown as ReadRow[]

  return (
    <AppLayout title="Read Receipts">
      <div className="max-w-2xl space-y-5">
        {/* Back link */}
        <Link
          href={`/messages/${id}/view`}
          className="inline-flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'rgba(255,255,255,0.50)' }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Message
        </Link>

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-white">{message.title}</h2>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {rows.length} {rows.length === 1 ? 'employee has' : 'employees have'} read this message
          </p>
        </div>

        {/* Table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          {rows.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.30)' }}>
              No reads yet
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Employee</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Department</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Read At</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
                  >
                    <td className="px-5 py-3.5 font-medium text-white">{row.employee?.name ?? '—'}</td>
                    <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {row.employee?.department ?? '—'}
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {new Date(row.read_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
