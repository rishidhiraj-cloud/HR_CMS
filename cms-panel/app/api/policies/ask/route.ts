import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getEmbedding, expandTopDocumentChunks, RetrievedChunk } from '@/lib/embeddings'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  const { question } = await req.json() as { question?: string }
  if (!question?.trim()) {
    return NextResponse.json({ error: 'No question provided' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let userId: string
  let employeeLevel: string | null = null
  let employeeCompany: string | null = null

  if (token) {
    const { data: { user }, error: userErr } = await svc.auth.getUser(token)
    if (userErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    userId = user.id
    // Get the employee's role/company for level- and company-based document filtering.
    // HR users won't be in the employees table — they get null (sees all docs).
    const { data: emp } = await svc.from('employees').select('role, company').eq('id', userId).single()
    employeeLevel = emp?.role ?? null
    employeeCompany = emp?.company ?? null
  } else {
    const headerEmpId = req.headers.get('x-employee-id')
    if (!headerEmpId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: emp } = await svc.from('employees').select('id, role, company').eq('id', headerEmpId).single()
    if (!emp) return NextResponse.json({ error: 'Invalid employee' }, { status: 401 })
    userId = emp.id
    employeeLevel = emp.role ?? null
    employeeCompany = emp.company ?? null
  }

  let questionEmbedding: number[]
  try {
    questionEmbedding = await getEmbedding(question.trim())
  } catch (err) {
    console.error('[ask] embedding failed:', err)
    return NextResponse.json({ error: 'Embedding service error' }, { status: 502 })
  }

  const { data: topChunks, error: searchErr } = await svc.rpc('match_document_chunks', {
    query_embedding: JSON.stringify(questionEmbedding),
    match_count: 5,
    employee_level: employeeLevel,
    employee_company: employeeCompany,
  })

  if (searchErr) {
    console.error('[ask] vector search failed:', searchErr)
    return NextResponse.json({ error: 'Search error' }, { status: 500 })
  }

  const chunks = await expandTopDocumentChunks(svc, (topChunks ?? []) as RetrievedChunk[])

  const hasChunks = chunks.length > 0

  const context = hasChunks
    ? chunks.map(c => `[From: ${c.document_name}]\n${c.chunk_text}`).join('\n\n---\n\n')
    : null

  const systemPrompt = hasChunks
    ? `You are a helpful HR policy assistant for Modicare employees.

LANGUAGE RULE: Detect the language of the employee's question and respond in that SAME language. If the question is in Hindi (or Hinglish), respond in Hindi. If in English, respond in English.

Answer questions based ONLY on the policy documents provided. Format using markdown: **bold** for key terms, *italic* for emphasis, bullet points (- item) for lists, blank line between topics. Be concise, accurate, and friendly. If the answer is not clearly in the documents, say so and suggest contacting HR directly. Never invent policies.`
    : `You are a helpful HR assistant for Modicare employees.

LANGUAGE RULE: Detect the language of the employee's question and respond in that SAME language. If the question is in Hindi (or Hinglish), respond in Hindi. If in English, respond in English.

No relevant policy documents were found for this question. Politely tell the employee you couldn't find relevant information in the available documents and suggest they contact HR directly. Keep it brief and friendly.`

  const userContent = context
    ? `Policy Documents:\n\n${context}\n\n---\n\nEmployee Question: ${question}`
    : `Employee Question: ${question}`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const answer = response.content[0].type === 'text' ? response.content[0].text : ''
  const sources = hasChunks ? [...new Set(chunks.map(c => c.document_name))] : []

  // Log query for analytics (fire-and-forget)
  svc.from('search_logs').insert({
    user_id: userId,
    query: question.trim(),
    result_count: chunks.length,
  }).then(() => {})

  return NextResponse.json({ answer, sources })
}
