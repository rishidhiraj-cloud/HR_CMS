import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { getEmbeddings } from '@/lib/embeddings'

export const runtime = 'nodejs'
export const maxDuration = 60

const BATCH = 20

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: hrUser } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  if (!hrUser) return NextResponse.json({ error: 'HR access required' }, { status: 403 })

  const { documentId } = await req.json() as { documentId?: string }
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: pending, error: pendingErr } = await svc
    .from('document_chunks')
    .select('id, chunk_text')
    .eq('document_id', documentId)
    .is('embedding', null)
    .order('chunk_index', { ascending: true })
    .limit(BATCH)

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  }

  if (pending.length === 0) {
    return NextResponse.json({ embedded: 0, remaining: 0, totalChunks: 0 })
  }

  try {
    const embeddings = await getEmbeddings(pending.map(p => p.chunk_text))

    for (let i = 0; i < pending.length; i++) {
      const { error: updateErr } = await svc
        .from('document_chunks')
        .update({ embedding: JSON.stringify(embeddings[i]) })
        .eq('id', pending[i].id)
      if (updateErr) throw updateErr
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[embed-batch] embedding failed:', msg)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', documentId)
    return NextResponse.json({ error: `Failed to embed chunks: ${msg}` }, { status: 500 })
  }

  const { count: total, error: totalErr } = await svc
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)

  const { count: remaining, error: remainingErr } = await svc
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .is('embedding', null)

  if (totalErr || remainingErr) {
    const msg = (totalErr ?? remainingErr)!.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (remaining === 0) {
    await svc.from('policy_documents')
      .update({ status: 'ready', chunk_count: total ?? 0 })
      .eq('id', documentId)
  }

  return NextResponse.json({ embedded: pending.length, remaining: remaining ?? 0, totalChunks: total ?? 0 })
}
