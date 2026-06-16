const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3-lite'

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Voyage AI error ${res.status}: ${err}`)
  }

  const json = await res.json()
  return (json.data as { embedding: number[] }[]).map(d => d.embedding)
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
