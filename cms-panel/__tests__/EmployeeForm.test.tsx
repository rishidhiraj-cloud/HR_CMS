import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmployeeForm from '@/components/EmployeeForm'

describe('EmployeeForm', () => {
  it('renders all fields', () => {
    render(<EmployeeForm onSuccess={jest.fn()} />)
    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('work@company.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mobile number')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Sales')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Senior Manager')).toBeInTheDocument()
  })

  it('shows error if name is empty on submit', async () => {
    render(<EmployeeForm onSuccess={jest.fn()} />)
    await userEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })
})
