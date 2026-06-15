import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmployeeForm from '@/components/EmployeeForm'

describe('EmployeeForm', () => {
  it('renders all fields', () => {
    render(<EmployeeForm onSuccess={jest.fn()} />)
    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('work@company.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Sales')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Manager')).toBeInTheDocument()
  })

  it('shows error if name is empty on submit', async () => {
    render(<EmployeeForm onSuccess={jest.fn()} />)
    await userEvent.click(screen.getByText('Send Invite'))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })
})
