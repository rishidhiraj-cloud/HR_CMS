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

export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const chunks: string[] = []
  let start = 0
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length)
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 80) chunks.push(chunk)
    if (end === cleaned.length) break
    start += chunkSize - overlap
  }
  return chunks
}
