import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UsersTable from '@/app/admin/users/UsersTable'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const users = [
  { id: 'user-1', name: 'HR Admin', email: 'rishi.dhiraj@gmail.com' },
]

describe('UsersTable', () => {
  it('renders each user with a Change Password button', () => {
    render(<UsersTable users={users} />)
    expect(screen.getByText('HR Admin')).toBeInTheDocument()
    expect(screen.getByText('rishi.dhiraj@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Change Password')).toBeInTheDocument()
  })

  it('shows the empty state when there are no users', () => {
    render(<UsersTable users={[]} />)
    expect(screen.getByText('No CMS users yet')).toBeInTheDocument()
  })

  it('opens the change-password modal for the clicked user', async () => {
    render(<UsersTable users={users} />)
    await userEvent.click(screen.getByText('Change Password'))
    expect(screen.getByText('Change password for HR Admin')).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', async () => {
    render(<UsersTable users={users} />)
    await userEvent.click(screen.getByText('Change Password'))
    await userEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Change password for HR Admin')).not.toBeInTheDocument()
  })
})
