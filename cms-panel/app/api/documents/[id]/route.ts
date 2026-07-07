import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

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

// PATCH /api/documents/[id] — update name and/or target_level
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { name?: string; target_level?: string | null; company?: string }

  const update: Record<string, string | null> = {}
  if (body.name !== undefined) update.name = body.name.trim()
  if (body.target_level !== undefined) update.target_level = body.target_level || null
  if (body.company !== undefined) {
    const company = body.company.trim()
    if (!company) return NextResponse.json({ error: 'Company is required' }, { status: 400 })
    update.company = company
  }

  const { error } = await svc().from('policy_documents').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE /api/documents/[id] — remove document, chunks, and storage file
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireHr()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = svc()

  // Get file info before deleting
  const { data: doc } = await admin
    .from('policy_documents')
    .select('file_type, file_url')
    .eq('id', id)
    .single()

  // Remove from storage if a file was stored
  if (doc?.file_url && doc?.file_type) {
    await admin.storage.from('policy-documents').remove([`documents/${id}.${doc.file_type}`])
  }

  // Delete document record — cascades to document_chunks
  const { error } = await admin.from('policy_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
