import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AdminRouter from './AdminApp'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn((endpoint) => {
    const data = {
      'admin/employees/': [],
      'admin/employee-eligible-users/': [{ id: 9, username: 'eligible-user', first_name: 'Eligible User' }],
      'admin/service-categories/': [{ id: 4, name: 'Hair' }],
      'services/': [{ id: 3, persian_name: 'Cut', is_active: true, is_bookable: true }],
      'admin/customer-options/': [{ id: 2, name: 'Customer' }],
      'admin/gallery/': [],
      'admin/gallery-categories/': [{ id: 5, name: 'مو' }],
    }[endpoint] || []
    return Promise.resolve({ data })
  }),
  post: vi.fn((endpoint) => Promise.resolve({ data: endpoint === 'admin/gallery-categories/' ? { id: 6, name: 'ناخن' } : {} })),
}))

vi.mock('../shared/api', () => ({ api: { get, post, patch: vi.fn() }, toman: (value) => `${value} تومان` }))

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

  it('loads and creates gallery categories without leaving the gallery form', async () => {
    render(<MemoryRouter initialEntries={['/content']}><AdminRouter /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /افزودن بخش محتوا/ }))

    expect(await screen.findByRole('option', { name: 'مو' })).toHaveValue('5')
    fireEvent.change(screen.getByLabelText('نام دسته‌بندی جدید'), { target: { value: 'ناخن' } })
    fireEvent.click(screen.getByRole('button', { name: '+ افزودن دسته‌بندی جدید' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/gallery-categories/', { name: 'ناخن' }))
    expect(await screen.findByRole('option', { name: 'ناخن' })).toHaveValue('6')
    expect(screen.getByRole('combobox').value).toBe('6')
  })

  it('assigns selected available services when creating an employee', async () => {
    render(<MemoryRouter initialEntries={['/employees']}><AdminRouter /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /افزودن کارمند/ }))
    const service = await screen.findByLabelText(/Cut/)
    fireEvent.click(service)
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد کارمند' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/employees/', expect.any(FormData)))
    expect(post.mock.calls[0][1].getAll('services')).toEqual(['3'])
  })

  it('loads backend-filtered appointments and real customer options for a new appointment', async () => {
    render(<MemoryRouter initialEntries={['/appointments']}><AdminRouter /></MemoryRouter>)

    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(/^admin\/appointments\/\?start_date=/)))
    fireEvent.click(screen.getByRole('button', { name: 'فیلترها' }))
    fireEvent.change(screen.getByLabelText('فیلتر خدمت'), { target: { value: '3' } })
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(/service=3/)))
    fireEvent.click(screen.getByRole('button', { name: /افزودن نوبت/ }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('admin/customer-options/'))
    expect(await screen.findByRole('option', { name: 'Customer' })).toHaveValue('2')
  })

  it('selects a calendar day and requests that day from the backend', async () => {
    render(<MemoryRouter initialEntries={['/appointments']}><AdminRouter /></MemoryRouter>)

    const days = await screen.findAllByRole('button', { name: /[۰-۹]/ })
    fireEvent.click(days[0])
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(/start_date=.*&end_date=/)))
  })
})
