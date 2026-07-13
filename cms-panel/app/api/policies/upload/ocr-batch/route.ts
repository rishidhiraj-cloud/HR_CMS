import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { ocrPage, getPageCount } from '@/lib/ocr'
import { chunkAndInsertDocument } from '@/lib/embeddings'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  const { data: doc, error: docErr } = await svc
    .from('policy_documents')
    .select('file_type')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const storagePath = `documents/${documentId}.${doc.file_type}`
  const { data: fileBlob, error: downloadErr } = await svc.storage
    .from('policy-documents')
    .download(storagePath)

  if (downloadErr || !fileBlob) {
    return NextResponse.json({ error: 'Failed to load stored file' }, { status: 500 })
  }

  const pdfBuffer = new Uint8Array(await fileBlob.arrayBuffer())
  const totalPages = await getPageCount(pdfBuffer)

  const { count: pagesDone, error: countErr } = await svc
    .from('document_ocr_pages')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 })
  }

  const nextPageIndex = pagesDone ?? 0

  if (nextPageIndex >= totalPages) {
    return NextResponse.json({ pagesDone: totalPages, totalPages, complete: true })
  }

  try {
    const pageText = await ocrPage(pdfBuffer, nextPageIndex)
    const { error: insertErr } = await svc
      .from('document_ocr_pages')
      .insert({ document_id: documentId, page_index: nextPageIndex, page_text: pageText })
    if (insertErr) throw insertErr
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ocr-batch] OCR failed:', msg)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', documentId)
    return NextResponse.json({ error: `Failed to OCR page: ${msg}` }, { status: 500 })
  }

  const newPagesDone = nextPageIndex + 1

  if (newPagesDone === totalPages) {
    const { data: pages, error: pagesErr } = await svc
      .from('document_ocr_pages')
      .select('page_text')
      .eq('document_id', documentId)
      .order('page_index', { ascending: true })

    if (pagesErr || !pages) {
      return NextResponse.json({ error: 'Failed to assemble OCR text' }, { status: 500 })
    }

    const fullText = pages.map(p => p.page_text).join(' ').replace(/\s+/g, ' ').trim()
    const result = await chunkAndInsertDocument(svc, documentId, fullText)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ pagesDone: newPagesDone, totalPages, complete: true, totalChunks: result.totalChunks })
  }

  return NextResponse.json({ pagesDone: newPagesDone, totalPages, complete: false })
}
