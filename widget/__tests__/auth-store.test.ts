import { AuthStore } from '@/main/auth-store'

jest.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  app: { getPath: () => '/tmp' },
}))

describe('AuthStore', () => {
  let store: AuthStore

  beforeEach(() => {
    store = new AuthStore('/tmp/test-auth.json')
  })

  afterEach(() => {
    try { require('fs').unlinkSync('/tmp/test-auth.json') } catch {}
  })

  it('returns null when no credentials saved', () => {
    expect(store.getCredentials()).toBeNull()
  })

  it('saves and retrieves credentials', () => {
    store.saveCredentials({ email: 'emp@co.com', accessToken: 'tok123', refreshToken: 'ref456' })
    const creds = store.getCredentials()
    expect(creds?.email).toBe('emp@co.com')
    expect(creds?.accessToken).toBe('tok123')
  })

  it('clears credentials', () => {
    store.saveCredentials({ email: 'emp@co.com', accessToken: 'tok', refreshToken: 'ref' })
    store.clearCredentials()
    expect(store.getCredentials()).toBeNull()
  })
})
