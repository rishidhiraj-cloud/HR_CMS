import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageForm from '@/components/MessageForm'

jest.mock('@/lib/supabase-browser', () => ({
  getBrowserClient: () => ({
    from: () => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
      eq: jest.fn().mockReturnThis(),
    }),
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test.png' }, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://example.com/test.png' } }),
      }),
    },
  }),
}))

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))

describe('MessageForm', () => {
  it('renders title input', () => {
    render(<MessageForm />)
    expect(screen.getByPlaceholderText('Message title')).toBeInTheDocument()
  })

  it('shows department input when By Department is selected', async () => {
    render(<MessageForm />)
    await userEvent.click(screen.getByText('By Department'))
    expect(screen.getByPlaceholderText('e.g. Sales')).toBeInTheDocument()
  })

  it('shows date-time picker when Schedule is selected', async () => {
    render(<MessageForm />)
    await userEvent.click(screen.getByText('Schedule'))
    expect(screen.getByLabelText('Scheduled date and time')).toBeInTheDocument()
  })

  it('shows validation error when title is empty on submit', async () => {
    render(<MessageForm />)
    await userEvent.click(screen.getByText('Publish Now'))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
  })
})
