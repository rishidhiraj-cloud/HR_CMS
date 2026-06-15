import { render, screen } from '@testing-library/react'
import MessageTable from '@/components/MessageTable'
import type { Message } from '@/lib/types'

const base: Message = {
  id: '1',
  title: 'Test Message',
  content_html: '<p>Hello</p>',
  target_type: 'all',
  target_value: null,
  scheduled_at: null,
  published_at: new Date().toISOString(),
  created_by: 'hr-1',
  created_at: new Date().toISOString(),
}

describe('MessageTable', () => {
  it('renders message title', () => {
    render(<MessageTable messages={[base]} />)
    expect(screen.getByText('Test Message')).toBeInTheDocument()
  })

  it('shows Live badge for published message', () => {
    render(<MessageTable messages={[base]} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows Scheduled badge for scheduled message', () => {
    const msg = { ...base, published_at: null, scheduled_at: new Date().toISOString() }
    render(<MessageTable messages={[msg]} />)
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
  })

  it('shows All Employees when target_type is all', () => {
    render(<MessageTable messages={[base]} />)
    expect(screen.getByText('All Employees')).toBeInTheDocument()
  })

  it('shows department name when target_type is dept', () => {
    const msg = { ...base, target_type: 'dept' as const, target_value: 'Sales' }
    render(<MessageTable messages={[msg]} />)
    expect(screen.getByText('Sales')).toBeInTheDocument()
  })
})
