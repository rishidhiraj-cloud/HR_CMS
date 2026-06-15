import { getMessageStatus } from '@/lib/types'

describe('getMessageStatus', () => {
  it('returns live for recently published message', () => {
    const msg = { published_at: new Date().toISOString(), scheduled_at: null }
    expect(getMessageStatus(msg)).toBe('live')
  })

  it('returns archived for message published over 30 days ago', () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const msg = { published_at: old, scheduled_at: null }
    expect(getMessageStatus(msg)).toBe('archived')
  })

  it('returns scheduled when only scheduled_at is set', () => {
    const msg = { published_at: null, scheduled_at: new Date().toISOString() }
    expect(getMessageStatus(msg)).toBe('scheduled')
  })

  it('returns draft when neither date is set', () => {
    const msg = { published_at: null, scheduled_at: null }
    expect(getMessageStatus(msg)).toBe('draft')
  })
})
