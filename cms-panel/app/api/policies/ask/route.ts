import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getEmbedding } from '@/lib/embeddings'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Chunk {
  chunk_text: string
  document_name: string
  similarity: number
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { question } = await req.json() as { question?: string }
  if (!question?.trim()) {
    return NextResponse.json({ error: 'No question provided' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: userErr } = await svc.auth.getUser(token)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // Get the employee's role for level-based document filtering.
  // HR users won't be in the employees table — they get null (sees all docs).
  const { data: emp } = await svc.from('employees').select('role').eq('id', user.id).single()
  const employeeLevel: string | null = emp?.role ?? null

  let questionEmbedding: number[]
  try {
    questionEmbedding = await getEmbedding(question.trim())
  } catch (err) {
    console.error('[ask] embedding failed:', err)
    return NextResponse.json({ error: 'Embedding service error' }, { status: 502 })
  }

  const { data: chunks, error: searchErr } = await svc.rpc('match_document_chunks', {
    query_embedding: JSON.stringify(questionEmbedding),
    match_count: 5,
    employee_level: employeeLevel,
  })

  if (searchErr) {
    console.error('[ask] vector search failed:', searchErr)
    return NextResponse.json({ error: 'Search error' }, { status: 500 })
  }

  if (!chunks || chunks.length === 0) {
    return NextResponse.json({
      answer: "I couldn't find relevant information in the documents available to you. Please try rephrasing your question or contact HR directly.",
      sources: [],
    })
  }

  const context = (chunks as Chunk[])
    .map(c => `[From: ${c.document_name}]\n${c.chunk_text}`)
    .join('\n\n---\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: `You are a helpful HR policy assistant. Answer employee questions based ONLY on the policy documents provided below. Be concise, accurate, and friendly. If the exact answer is not clearly stated in the documents, acknowledge that and suggest the employee contact HR directly. Never make up policies.`,
    messages: [{
      role: 'user',
      content: `Policy Documents:\n\n${context}\n\n---\n\nEmployee Question: ${question}`,
    }],
  })

  const answer = response.content[0].type === 'text' ? response.content[0].text : ''
  const sources = [...new Set((chunks as Chunk[]).map(c => c.document_name))]

  return NextResponse.json({ answer, sources })
}
