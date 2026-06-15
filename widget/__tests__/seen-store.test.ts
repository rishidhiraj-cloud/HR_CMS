import { SeenStore } from '@/main/seen-store'

describe('SeenStore', () => {
  let store: SeenStore

  beforeEach(() => {
    store = new SeenStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('returns false for an unseen message', () => {
    expect(store.hasSeen('msg-1')).toBe(false)
  })

  it('returns true after marking a message as seen', () => {
    store.markSeen('msg-1')
    expect(store.hasSeen('msg-1')).toBe(true)
  })

  it('returns all unseen IDs from a list', () => {
    store.markSeen('msg-1')
    const unseen = store.filterUnseen(['msg-1', 'msg-2', 'msg-3'])
    expect(unseen).toEqual(['msg-2', 'msg-3'])
  })

  it('markSeen is idempotent', () => {
    store.markSeen('msg-1')
    store.markSeen('msg-1')
    expect(store.hasSeen('msg-1')).toBe(true)
  })
})
