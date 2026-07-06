import { getTheme } from '@/renderer/theme'

describe('getTheme', () => {
  it('returns Modicare blue for Modicare Ltd.', () => {
    const theme = getTheme('Modicare Ltd.')
    expect(theme.primary).toBe('#0A80B8')
  })

  it('returns Colorbar orange for Colorbar Cosmetics', () => {
    const theme = getTheme('Colorbar Cosmetics')
    expect(theme.primary).toBe('#CC6002')
  })

  it('returns the teal fallback for unknown or missing company', () => {
    expect(getTheme(undefined).primary).toBe('#0d9488')
    expect(getTheme(null).primary).toBe('#0d9488')
    expect(getTheme('Some Other Company').primary).toBe('#0d9488')
  })

  it('returns exactly 4 bubble colors', () => {
    const theme = getTheme('Modicare Ltd.')
    expect(theme.bubbleColors).toHaveLength(4)
  })

  it('builds gradients that reference the base color', () => {
    const theme = getTheme('Modicare Ltd.')
    expect(theme.primaryGradient).toContain('#0A80B8')
    expect(theme.primaryGradientHorizontal).toContain('#0A80B8')
    expect(theme.badgeGradient).toContain('#0A80B8')
    expect(theme.bgGradient).toBeTruthy()
  })
})
