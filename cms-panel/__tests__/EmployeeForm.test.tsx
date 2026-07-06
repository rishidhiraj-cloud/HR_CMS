import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmployeeForm from '@/components/EmployeeForm'

describe('EmployeeForm', () => {
  it('renders all fields', () => {
    render(<EmployeeForm companies={[]} departments={[]} levels={[]} onSuccess={jest.fn()} />)
    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('work@company.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mobile number')).toBeInTheDocument()
    expect(screen.getByText('Select Company')).toBeInTheDocument()
    expect(screen.getByText('Select Department')).toBeInTheDocument()
    expect(screen.getByText('Select Level')).toBeInTheDocument()
  })

  it('shows error if name is empty on submit', async () => {
    render(<EmployeeForm companies={[]} departments={[]} levels={[]} onSuccess={jest.fn()} />)
    await userEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
  })

  it('renders company options and shows a validation error when none is selected', async () => {
    render(<EmployeeForm companies={['Modicare Ltd.', 'Colorbar Cosmetics']} departments={['Sales']} levels={['Manager']} onSuccess={jest.fn()} />)
    expect(screen.getByText('Modicare Ltd.')).toBeInTheDocument()
    expect(screen.getByText('Colorbar Cosmetics')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Full name'), 'Jane Smith')
    await userEvent.type(screen.getByPlaceholderText('work@company.com'), 'jane@company.com')
    await userEvent.type(screen.getByPlaceholderText('Mobile number'), '9999999999')
    await userEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('Please select a company')).toBeInTheDocument()
  })
})
