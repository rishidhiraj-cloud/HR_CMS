import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { chunkAndInsertDocument } from '@/lib/embeddings'

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

  // Non-PDF files have no OCR fallback — an empty/unreadable DOCX or TXT is
  // genuinely unreadable, so fail exactly as before with no document row
  // created. PDFs with too little text fall through to the OCR path below.
  if (ext !== 'pdf' && text.length < 100) {
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

  // PDF with too little embedded text: fall back to page-by-page OCR, paced
  // from the client via POST /api/policies/upload/ocr-batch. totalPages is
  // deliberately NOT computed here — ocr-batch computes it itself on every
  // call (it needs to anyway, to know when it's done), and calling
  // getDocumentProxy() a second time from this separate route, ahead of
  // ocr-batch's own call, corrupts pdf.js's Node "fake worker" message
  // passing for ocr-batch's later call ("Cannot transfer object of
  // unsupported type") — Next.js bundles each route handler independently,
  // so this route and ocr-batch's route end up with separate, mutually
  // incompatible copies of pdf.js's worker machinery sharing one process-global
  // registration slot. The client learns totalPages from ocr-batch's own
  // first response instead.
  if (text.length < 100) {
    return NextResponse.json({ success: true, documentId: doc.id, needsOcr: true })
  }

  // Chunk and insert rows now; embeddings are filled in incrementally by
  // POST /api/policies/upload/embed-batch, paced from the client to respect
  // Voyage's rate limit and Vercel's function duration limit.
  const result = await chunkAndInsertDocument(svc, doc.id, text)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, documentId: doc.id, totalChunks: result.totalChunks })
}
