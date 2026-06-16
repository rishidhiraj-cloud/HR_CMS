import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AppLayout from '@/components/AppLayout'

interface PolicyDocument {
  id: string
  name: string
  file_type: string
  status: string
  chunk_count: number
  uploaded_at: string
}

const statusStyle: Record<string, { bg: string; color: string; border: string }> = {
  ready:      { bg: 'rgba(13,148,136,0.20)',  color: '#5eead4', border: 'rgba(13,148,136,0.35)' },
  processing: { bg: 'rgba(245,158,11,0.20)',  color: '#fcd34d', border: 'rgba(245,158,11,0.35)' },
  error:      { bg: 'rgba(239,68,68,0.20)',   color: '#fca5a5', border: 'rgba(239,68,68,0.35)' },
}

export default async function PoliciesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel fetches
  const [{ data: hrUser }, { data: documents }] = await Promise.all([
    supabase.from('hr_users').select('name').eq('id', user.id).single(),
    supabase.from('policy_documents').select('*').order('uploaded_at', { ascending: false }),
  ])

  if (!hrUser) redirect('/login')

  return (
    <AppLayout
      title="Policy Documents"
      userName={hrUser.name}
      action={
        <Link
          href="/policies/upload"
          className="text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
          style={{
            background: 'linear-gradient(135deg, #0d9488, #0891b2)',
            boxShadow: '0 4px 14px rgba(13,148,136,0.30)',
          }}
        >
          + Upload Document
        </Link>
      }
    >
      {/* Info box */}
      <div
        className="rounded-xl p-4 mb-6 text-sm"
        style={{
          background: 'rgba(13,148,136,0.10)',
          border: '1px solid rgba(13,148,136,0.25)',
          color: '#99f6e4',
        }}
      >
        <strong className="text-teal-300">How it works:</strong> Upload PDF, DOCX or TXT policy documents. The AI automatically reads and indexes them. Employees can then ask questions about company policies directly from the HR Widget.
      </div>

      {!documents?.length ? (
        <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.30)' }}>
          <p className="text-5xl mb-4">📄</p>
          <p className="font-medium text-white/60 text-base">No policy documents yet</p>
          <p className="text-sm mt-2">Upload your first document to get started</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Document</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Type</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Status</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Chunks</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {(documents as PolicyDocument[]).map((doc, i) => {
                const s = statusStyle[doc.status] ?? { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.50)', border: 'rgba(255,255,255,0.15)' }
                return (
                  <tr
                    key={doc.id}
                    style={{ borderBottom: i < documents.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
                  >
                    <td className="px-5 py-3.5 font-medium text-white">{doc.name}</td>
                    <td className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.40)' }}>{doc.file_type}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{doc.status === 'ready' ? doc.chunk_count : '—'}</td>
                    <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {new Date(doc.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  )
}
