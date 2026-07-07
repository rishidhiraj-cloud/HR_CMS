import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { chunkText, getEmbeddings } from '@/lib/embeddings'

export const runtime = 'nodejs'
export const maxDuration = 60

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()

  if (name.endsWith('.pdf')) {
    const { extractText } = await import('unpdf')
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
    return text
  }

  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  return buffer.toString('utf-8')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: hrUser } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  if (!hrUser) return NextResponse.json({ error: 'HR access required' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = (formData.get('name') as string | null)?.trim()
  const levelRaw = (formData.get('level') as string | null)?.trim()
  const targetLevel = levelRaw || null
  const company = (formData.get('company') as string | null)?.trim()

  if (!file || !name || !company) {
    return NextResponse.json({ error: 'File, name, and company are required' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!['pdf', 'docx', 'txt'].includes(ext)) {
    return NextResponse.json({ error: 'Only PDF, DOCX and TXT files are supported' }, { status: 400 })
  }

  let text: string
  try {
    text = await extractText(file)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload] text extraction failed:', msg)
    return NextResponse.json({ error: `Text extraction failed: ${msg}` }, { status: 422 })
  }

  text = text.replace(/\s+/g, ' ').trim()
  if (text.length < 100) {
    return NextResponse.json({ error: 'Document appears to be empty or unreadable' }, { status: 422 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Insert document record first to get the ID
  const { data: doc, error: docErr } = await svc
    .from('policy_documents')
    .insert({ name, file_type: ext, status: 'processing', uploaded_by: user.id, target_level: targetLevel, company })
    .select()
    .single()

  if (docErr || !doc) {
    console.error('[upload] insert doc failed:', docErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // Store original file in Supabase Storage
  const storagePath = `documents/${doc.id}.${ext}`
  const fileBuffer = await file.arrayBuffer()
  const { error: storageErr } = await svc.storage
    .from('policy-documents')
    .upload(storagePath, fileBuffer, { contentType: file.type || 'application/octet-stream', upsert: false })

  let fileUrl: string | null = null
  if (!storageErr) {
    const { data: urlData } = svc.storage.from('policy-documents').getPublicUrl(storagePath)
    fileUrl = urlData.publicUrl
    await svc.from('policy_documents').update({ file_url: fileUrl }).eq('id', doc.id)
  } else {
    console.warn('[upload] file storage failed (continuing):', storageErr.message)
  }

  // Chunk and embed
  const chunks = chunkText(text)

  try {
    const BATCH = 64
    const allEmbeddings: number[][] = []
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH)
      const embs = await getEmbeddings(batch)
      allEmbeddings.push(...embs)
    }

    const rows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      chunk_text: chunk,
      chunk_index: i,
      embedding: JSON.stringify(allEmbeddings[i]),
    }))

    const { error: chunkErr } = await svc.from('document_chunks').insert(rows)
    if (chunkErr) throw chunkErr

    await svc.from('policy_documents')
      .update({ status: 'ready', chunk_count: chunks.length })
      .eq('id', doc.id)

    return NextResponse.json({ success: true, documentId: doc.id, chunks: chunks.length })
  } catch (err) {
    console.error('[upload] embedding/insert failed:', err)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', doc.id)
    return NextResponse.json({ error: 'Failed to process document embeddings' }, { status: 500 })
  }
}
