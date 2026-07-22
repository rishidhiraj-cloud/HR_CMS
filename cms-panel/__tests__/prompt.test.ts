import { formatEmployeeProfile } from '@/lib/prompt'

describe('formatEmployeeProfile', () => {
  it('includes the grade and department when known', () => {
    const result = formatEmployeeProfile({ level: 'DGM', department: 'Sales' })
    expect(result).toContain('DGM')
    expect(result).toContain('Sales')
  })

  it('falls back to "Not specified" when the profile is missing', () => {
    const result = formatEmployeeProfile({ level: null, department: null })
    expect(result).toContain('Not specified')
  })
})
