import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AdminRouter from './AdminApp'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn((endpoint) => {
    const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())
    if (endpoint.startsWith('admin/appointments/?')) return Promise.resolve({ data: [{ id: 20, customer_name: 'Today Customer', status: 'pending', items: [{ id: 21, date: current, start_time: '10:00', end_time: '11:00', service: 3, service_name: 'Cut', employee_name: 'Stylist' }] }] })
    const data = {
      'admin/employees/': [],
      'admin/employee-eligible-users/': [{ id: 9, username: 'eligible-user', first_name: 'Eligible User' }],
      'admin/service-categories/': [{ id: 4, name: 'Hair' }],
      'services/': [{ id: 3, persian_name: 'Cut', is_active: true, is_bookable: true }],
      'admin/customer-options/': [{ id: 2, name: 'Customer' }],
      'admin/gallery/': [],
      'admin/gallery-categories/': [{ id: 5, name: 'مو' }],
      'admin/statistics/': { today: { appointments: 1, pending: 1, confirmed: 0, completed: 0, cancelled: 0 }, week: { appointments: 4 }, month: { appointments: 9 }, top_services: [{ id: 3, name: 'Cut', appointments: 3 }], revenue_available: false },
      'admin/activity/': [],
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

  it('keeps today selected, shows real day badges, and syncs another selected day', async () => {
    render(<MemoryRouter initialEntries={['/appointments']}><AdminRouter /></MemoryRouter>)
    const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())
    const todayCell = await screen.findByRole('button', { name: current })
    expect(todayCell).toHaveClass('today', 'selected')
    expect(screen.getByText('۱ نوبت')).toBeInTheDocument()
    const otherCell = screen.getAllByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/ }).find((cell) => cell.getAttribute('aria-label') !== current)
    fireEvent.click(otherCell)
    expect(await screen.findByText('برای این روز نوبتی ثبت نشده است')).toBeInTheDocument()
  })

  it('loads another month with one range request and returns to today', async () => {
    render(<MemoryRouter initialEntries={['/appointments']}><AdminRouter /></MemoryRouter>)
    await screen.findByRole('button', { name: 'ماه بعد' })
    const callsBefore = get.mock.calls.filter(([endpoint]) => endpoint.startsWith('admin/appointments/?')).length
    fireEvent.click(screen.getByRole('button', { name: 'ماه بعد' }))
    await waitFor(() => expect(get.mock.calls.filter(([endpoint]) => endpoint.startsWith('admin/appointments/?')).length).toBeGreaterThan(callsBefore))
    fireEvent.click(screen.getByRole('button', { name: 'امروز' }))
    const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())
    expect(await screen.findByRole('button', { name: current })).toHaveClass('selected')
  })

  it('uses real dashboard statistics and marks revenue unavailable', async () => {
    render(<MemoryRouter initialEntries={['/']}><AdminRouter /></MemoryRouter>)
    await waitFor(() => expect(get).toHaveBeenCalledWith('admin/statistics/'))
    expect(await screen.findByText('آمار درآمد هنوز در دسترس نیست')).toBeInTheDocument()
    expect(screen.queryByText(/تومان/)).not.toBeInTheDocument()
  })
})
