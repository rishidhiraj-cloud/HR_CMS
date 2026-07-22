import { expandTopDocumentChunks, RetrievedChunk } from '@/lib/embeddings'

// Minimal fake of the supabase-js chainable query builder used by expandTopDocumentChunks:
// svc.from('document_chunks').select(...).eq('document_id', id).order('chunk_index')
function fakeSvc(rows: Array<{ chunk_text: string; chunk_index: number; policy_documents: { name: string } }> | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error }),
        }),
      }),
    }),
  }
}

describe('expandTopDocumentChunks', () => {
  it('returns the original chunks unchanged if there are none', async () => {
    const svc = fakeSvc([])
    const result = await expandTopDocumentChunks(svc as any, [])
    expect(result).toEqual([])
  })

  it('expands to the full document when the top match document is small', async () => {
    const fullDoc = Array.from({ length: 16 }, (_, i) => ({
      chunk_text: `clause ${i}`,
      chunk_index: i,
      policy_documents: { name: 'Leave Policy' },
    }))
    const svc = fakeSvc(fullDoc)

    const topFive: RetrievedChunk[] = [
      { chunk_text: 'clause 0', document_id: 'doc-1', document_name: 'Leave Policy', similarity: 0.4 },
      { chunk_text: 'unrelated', document_id: 'doc-2', document_name: 'Car Policy', similarity: 0.3 },
    ]

    const result = await expandTopDocumentChunks(svc as any, topFive)

    // All 16 Leave Policy chunks should be present, plus the Car Policy chunk from
    // a different document that was also in the original top-K.
    expect(result.filter(c => c.document_name === 'Leave Policy')).toHaveLength(16)
    expect(result.some(c => c.document_name === 'Car Policy')).toBe(true)
  })

  it('leaves chunks unchanged when the top match document is too large to expand', async () => {
    const bigDoc = Array.from({ length: 53 }, (_, i) => ({
      chunk_text: `clause ${i}`,
      chunk_index: i,
      policy_documents: { name: 'Employee Handbook' },
    }))
    const svc = fakeSvc(bigDoc)

    const topFive: RetrievedChunk[] = [
      { chunk_text: 'clause 0', document_id: 'doc-1', document_name: 'Employee Handbook', similarity: 0.4 },
    ]

    const result = await expandTopDocumentChunks(svc as any, topFive, 25)

    expect(result).toEqual(topFive)
  })
})
