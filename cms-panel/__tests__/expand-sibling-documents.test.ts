import { expandSiblingDocuments, RetrievedChunk } from '@/lib/embeddings'

// Minimal fake of the supabase-js query builder, routed by table name so a single
// svc instance can serve both the policy_documents listing and per-sibling chunk fetches.
function fakeSvc(policyDocs: Array<{ id: string; name: string }>, chunksByDoc: Record<string, Array<{ chunk_text: string; chunk_index: number }>>) {
  return {
    from: (table: string) => {
      if (table === 'policy_documents') {
        const builder: any = {
          eq: () => builder,
          then: (resolve: any) => resolve({ data: policyDocs, error: null }),
        }
        return { select: () => builder }
      }
      if (table === 'document_chunks') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              order: () => Promise.resolve({ data: chunksByDoc[id] ?? [], error: null }),
            }),
          }),
        }
      }
      throw new Error('unexpected table: ' + table)
    },
  }
}

describe('expandSiblingDocuments', () => {
  it('returns the original chunks unchanged if there are none', async () => {
    const svc = fakeSvc([], {})
    const result = await expandSiblingDocuments(svc as any, [], 'Modicare Ltd.')
    expect(result).toEqual([])
  })

  it('includes small sibling documents that share a keyword with the primary document name', async () => {
    const policyDocs = [
      { id: 'leave-1', name: 'Leave Policy' },
      { id: 'paternity-1', name: 'Paternity Leave Policy' },
      { id: 'pink-1', name: 'Pink Leave Policy' },
      { id: 'gift-1', name: 'Gift Policy' },
    ]
    const chunksByDoc = {
      'paternity-1': [{ chunk_text: 'Paternity leave is 15 days.', chunk_index: 0 }],
      'pink-1': [{ chunk_text: 'Pink leave is for menstrual health, 12 days.', chunk_index: 0 }],
      'gift-1': [{ chunk_text: 'Gifts above Rs 5000 must be declared.', chunk_index: 0 }],
    }
    const svc = fakeSvc(policyDocs, chunksByDoc)

    const primaryChunks: RetrievedChunk[] = [
      { chunk_text: '2.2.1 Earned Leave: 30 days', document_id: 'leave-1', document_name: 'Leave Policy', similarity: 0.39 },
    ]

    const result = await expandSiblingDocuments(svc as any, primaryChunks, 'Modicare Ltd.')

    expect(result.some(c => c.document_name === 'Paternity Leave Policy')).toBe(true)
    expect(result.some(c => c.document_name === 'Pink Leave Policy')).toBe(true)
    expect(result.some(c => c.document_name === 'Gift Policy')).toBe(false)
    expect(result).toContainEqual(primaryChunks[0])
  })

  it('does not duplicate a sibling document already present in the chunk list', async () => {
    const policyDocs = [
      { id: 'leave-1', name: 'Leave Policy' },
      { id: 'paternity-1', name: 'Paternity Leave Policy' },
    ]
    const chunksByDoc = {
      'paternity-1': [{ chunk_text: 'Paternity leave is 15 days.', chunk_index: 0 }],
    }
    const svc = fakeSvc(policyDocs, chunksByDoc)

    const primaryChunks: RetrievedChunk[] = [
      { chunk_text: '2.2.1 Earned Leave: 30 days', document_id: 'leave-1', document_name: 'Leave Policy', similarity: 0.39 },
      { chunk_text: 'already fetched paternity chunk', document_id: 'paternity-1', document_name: 'Paternity Leave Policy', similarity: 0.24 },
    ]

    const result = await expandSiblingDocuments(svc as any, primaryChunks, 'Modicare Ltd.')

    expect(result.filter(c => c.document_id === 'paternity-1')).toHaveLength(1)
  })
})
