import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AdminRouter from './AdminApp'

const { get } = vi.hoisted(() => ({
  get: vi.fn((endpoint) => {
    const data = {
      'admin/employees/': [],
      'admin/employee-eligible-users/': [{ id: 9, username: 'eligible-user', first_name: 'Eligible User' }],
      'admin/service-categories/': [{ id: 4, name: 'Hair' }],
    }[endpoint] || []
    return Promise.resolve({ data })
  }),
}))

vi.mock('../shared/api', () => ({ api: { get, post: vi.fn() }, toman: (value) => `${value} تومان` }))

describe('admin CRUD forms', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads eligible users for existing employee creation', async () => {
    render(<MemoryRouter initialEntries={['/employees']}><AdminRouter /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /افزودن کارمند/ }))
    fireEvent.click(screen.getByRole('button', { name: 'حساب موجود' }))

    await waitFor(() => expect(get).toHaveBeenCalledWith('admin/employee-eligible-users/'))
    expect(await screen.findByRole('option', { name: 'Eligible User' })).toHaveValue('9')
  })

  it('loads real service categories instead of placeholder options', async () => {
    render(<MemoryRouter initialEntries={['/services']}><AdminRouter /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /افزودن خدمت/ }))

    await waitFor(() => expect(get).toHaveBeenCalledWith('admin/service-categories/'))
    expect(await screen.findByRole('option', { name: 'Hair' })).toHaveValue('4')
    expect(screen.queryByText('گزینه اول')).not.toBeInTheDocument()
  })
})
