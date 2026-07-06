import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordModal from '@/components/ChangePasswordModal'

describe('ChangePasswordModal', () => {
  const user = { id: 'user-1', name: 'HR Admin' }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the password field and user name', () => {
    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    expect(screen.getByText('Change password for HR Admin')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Min 6 characters')).toBeInTheDocument()
  })

  it('shows a validation error for a short password', async () => {
    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Min 6 characters'), '123')
    await userEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument()
  })

  it('calls the password API and shows success on submit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch

    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Min 6 characters'), 'newpassword123')
    await userEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Password updated successfully')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/users/user-1/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'newpassword123' }),
    })
  })

  it('shows an inline error when the API call fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Something went wrong' }),
    }) as unknown as typeof fetch

    render(<ChangePasswordModal user={user} onClose={jest.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Min 6 characters'), 'newpassword123')
    await userEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
  })
})
