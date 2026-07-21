const setLoginItemSettings = jest.fn()

jest.mock('electron', () => ({
  app: { setLoginItemSettings: (...args: unknown[]) => setLoginItemSettings(...args) },
}))

import { registerLoginItem } from '@/main/login-item'

describe('registerLoginItem', () => {
  beforeEach(() => setLoginItemSettings.mockClear())

  it('registers the app to open at login', () => {
    registerLoginItem()
    expect(setLoginItemSettings).toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    )
  })
})
