const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3-lite'

const RATE_LIMIT_RETRY_DELAYS_MS = [3000, 10000, 20000]

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
    })

    if (res.ok) {
      const json = await res.json()
      return (json.data as { embedding: number[] }[]).map(d => d.embedding)
    }

    const err = await res.text()
    lastError = new Error(`Voyage AI error ${res.status}: ${err}`)

    const delay = RATE_LIMIT_RETRY_DELAYS_MS[attempt]
    if (res.status !== 429 || delay === undefined) throw lastError

    console.warn(`[embeddings] rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT_RETRY_DELAYS_MS.length})`)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  throw lastError
}

export async function getEmbedding(text: string): Promise<number[]> {
  const results = await getEmbeddings([text])
  return results[0]
}

// Splits text into paragraph/numbered-clause units (e.g. "2.2.3 Sick Leave") before
// packing them into chunks, so a short clause never gets buried inside a longer
// neighboring clause's chunk — that dilutes its embedding toward the wrong topic
// and can knock the answer out of the top-K retrieved chunks entirely.
const SECTION_BOUNDARY = /\n\s*\n|(?<![\d.])(?=\d+(?:\.\d+){1,3}\s+[A-Z])/

function splitIntoUnits(text: string): string[] {
  return text
    .split(SECTION_BOUNDARY)
    .map(u => u.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current.length > 80) chunks.push(current)
    current = ''
  }

  for (const unit of splitIntoUnits(text)) {
    if (unit.length > chunkSize) {
      // Oversized unit (e.g. one very long clause) — fall back to fixed-size slicing.
      flush()
      let start = 0
      while (start < unit.length) {
        const end = Math.min(start + chunkSize, unit.length)
        const slice = unit.slice(start, end).trim()
        if (slice.length > 80) chunks.push(slice)
        if (end === unit.length) break
        start += chunkSize - overlap
      }
      continue
    }

    const candidate = current ? `${current} ${unit}` : unit
    if (candidate.length > chunkSize) {
      flush()
      current = unit
    } else {
      current = candidate
    }
  }
  flush()

  return chunks
}

type ServiceClient = ReturnType<typeof import('@supabase/supabase-js').createClient<any>>

export interface RetrievedChunk {
  chunk_text: string
  document_id: string
  document_name: string
  similarity: number
}

// A broad question (e.g. "how many leaves can I avail?") can have its answer spread
// across many small, topically-narrow sections of one document (a leave policy covering
// 8 leave types) — no single section wins the top-K similarity race for every subtopic.
// When the single best-matching chunk's document is small enough, pull in its entire
// chunk set instead of just the top-K slice, so the model sees every section.
export async function expandTopDocumentChunks(
  svc: ServiceClient,
  chunks: RetrievedChunk[],
  maxChunks = 25
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return chunks

  const topDocId = chunks[0].document_id
  const { data: fullDocChunks, error } = await svc
    .from('document_chunks')
    .select('chunk_text, chunk_index, policy_documents(name)')
    .eq('document_id', topDocId)
    .order('chunk_index')

  if (error || !fullDocChunks || fullDocChunks.length === 0 || fullDocChunks.length > maxChunks) {
    return chunks
  }

  const expanded: RetrievedChunk[] = fullDocChunks.map((c: any) => ({
    chunk_text: c.chunk_text,
    document_id: topDocId,
    document_name: c.policy_documents.name,
    similarity: chunks[0].similarity,
  }))

  const others = chunks.filter(c => c.document_id !== topDocId)
  return [...expanded, ...others]
}

const NAME_STOPWORDS = new Set(['policy', 'the', 'and', 'for', 'of', 'scheme', 'a', 'an'])

function significantWords(name: string): Set<string> {
  return new Set(
    name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !NAME_STOPWORDS.has(w))
  )
}

function sharesKeyword(a: string, b: string): boolean {
  const wordsA = significantWords(a)
  if (wordsA.size === 0) return false
  for (const w of significantWords(b)) if (wordsA.has(w)) return true
  return false
}

// A broad question about one document can also apply to its sibling documents (e.g.
// "Paternity Leave Policy" / "Pink Leave Policy" alongside "Leave Policy"). Embedding
// similarity alone doesn't reliably surface these — verified empirically that a small,
// genuinely-related sibling document can score *below* an unrelated document (a 2-chunk
// Paternity Leave Policy scored lower than an unrelated Gift Policy for a leave query).
// Siblings are found by shared keywords in the document name instead, then included in
// full if small enough.
export async function expandSiblingDocuments(
  svc: ServiceClient,
  chunks: RetrievedChunk[],
  employeeCompany: string | null,
  maxChunks = 25
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return chunks

  const primaryName = chunks[0].document_name
  const includedDocIds = new Set(chunks.map(c => c.document_id))

  let query = svc.from('policy_documents').select('id, name').eq('status', 'ready')
  if (employeeCompany) query = query.eq('company', employeeCompany)
  const { data: allDocs, error } = await query

  if (error || !allDocs) return chunks

  const siblings = (allDocs as any[]).filter(
    d => !includedDocIds.has(d.id) && sharesKeyword(primaryName, d.name)
  )

  const siblingChunks: RetrievedChunk[] = []
  for (const sibling of siblings) {
    const { data: rows, error: chunkErr } = await svc
      .from('document_chunks')
      .select('chunk_text, chunk_index')
      .eq('document_id', sibling.id)
      .order('chunk_index')

    if (chunkErr || !rows || rows.length === 0 || rows.length > maxChunks) continue

    for (const row of rows as any[]) {
      siblingChunks.push({
        chunk_text: row.chunk_text,
        document_id: sibling.id,
        document_name: sibling.name,
        similarity: chunks[0].similarity,
      })
    }
  }

  return [...chunks, ...siblingChunks]
}

export async function chunkAndInsertDocument(
  svc: ServiceClient,
  documentId: string,
  text: string
): Promise<{ totalChunks: number } | { error: string }> {
  const chunks = chunkText(text)
  const chunkRows = chunks.map((chunk, i) => ({
    document_id: documentId,
    chunk_text: chunk,
    chunk_index: i,
  }))

  const { error: chunkErr } = await svc.from('document_chunks').insert(chunkRows)
  if (chunkErr) {
    console.error('[chunkAndInsertDocument] chunk insert failed:', chunkErr.message)
    await svc.from('policy_documents').update({ status: 'error' }).eq('id', documentId)
    return { error: 'Failed to save document chunks' }
  }

  return { totalChunks: chunks.length }
}
