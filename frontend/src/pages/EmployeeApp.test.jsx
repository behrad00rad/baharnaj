import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EmployeeApp from './EmployeeApp'
import { MemoryRouter } from 'react-router-dom'

const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(() => Promise.resolve({ data: {} })), patch: vi.fn(() => Promise.resolve({ data: {} })) }))
vi.mock('../shared/api', () => ({ api: { get, post, patch }, toman: (value) => `${value} تومان` }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('employee app', () => {
  it('renders explicit empty state on today view', async () => {
    render(<MemoryRouter><EmployeeApp /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('نوبت بعدی ندارید')).toBeInTheDocument())
    expect(screen.getByText('برای امروز نوبتی ثبت نشده')).toBeInTheDocument()
  })

  it('renders calendar loading/empty state and employee action payload shape', async () => {
    render(<MemoryRouter initialEntries={['/calendar']}><EmployeeApp /></MemoryRouter>)
    expect(screen.getByText('تقویم')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('تقویم خالی است')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  it('uses the employee schedule endpoint for weekly hours', async () => {
    render(<MemoryRouter initialEntries={['/profile']}><EmployeeApp /></MemoryRouter>)
    await waitFor(() => expect(get).toHaveBeenCalledWith('employee/schedule/'))
    await waitFor(() => expect(screen.getAllByText('ذخیره')).toHaveLength(7))
    screen.getAllByText('ذخیره')[0].click()
    await waitFor(() => expect(post).toHaveBeenCalledWith('employee/schedule/', expect.objectContaining({ weekday: 0 })))
    expect(post.mock.calls[0][1]).not.toHaveProperty('employee')
  })

  it('keeps specialty and time-off administration out of the employee profile', async () => {
    render(<MemoryRouter initialEntries={['/profile']}><EmployeeApp /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('ساعات کاری من')).toBeInTheDocument())
    expect(screen.queryByText('تخصص')).not.toBeInTheDocument()
    expect(screen.queryByText('درخواست مرخصی')).not.toBeInTheDocument()
    expect(screen.queryByText('ارسال درخواست')).not.toBeInTheDocument()
    expect(screen.queryByText('خدمات قابل ارائه')).not.toBeInTheDocument()
  })

  it('uploads the selected profile photo as multipart form data', async () => {
    render(<MemoryRouter initialEntries={['/profile']}><EmployeeApp /></MemoryRouter>)
    const photo = new File(['image'], 'profile.png', { type: 'image/png' })
    fireEvent.change(await screen.findByLabelText('تصویر پروفایل'), { target: { files: [photo] } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith('employee/profile/', expect.any(FormData)))
    expect(patch.mock.calls.at(-1)[1].get('profile_photo')).toBe(photo)
  })

  it('submits the employee password change form', async () => {
    render(<MemoryRouter initialEntries={['/profile']}><EmployeeApp /></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText('رمز عبور فعلی'), { target: { value: 'old-password' } })
    fireEvent.change(screen.getByLabelText('رمز عبور جدید'), { target: { value: 'new-password-8472' } })
    fireEvent.change(screen.getByLabelText('تکرار رمز عبور جدید'), { target: { value: 'new-password-8472' } })
    fireEvent.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('employee/password/', expect.objectContaining({ current_password: 'old-password', new_password: 'new-password-8472' })))
  })

  it('reloads finance data for the selected period', async () => {
    render(<MemoryRouter initialEntries={['/earnings']}><EmployeeApp /></MemoryRouter>)

    await waitFor(() => expect(get).toHaveBeenCalledWith('employee/earnings/?period=day'))
    fireEvent.click(screen.getByRole('button', { name: 'هفتگی' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('employee/earnings/?period=week'))
    fireEvent.click(screen.getByRole('button', { name: 'ماهانه' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('employee/earnings/?period=month'))
  })

  it('submits notes with completed work and shows backend failures', async () => {
    const current = new Date().toISOString().slice(0, 10)
    get.mockImplementation((endpoint) => {
      if (endpoint === 'employee/earnings/?period=day') return Promise.resolve({ data: { completed_services: 0, employee_commission: 0, items: [] } })
      if (endpoint === 'employee/appointments/') return Promise.resolve({ data: [{ id: 1, customer_name: 'مشتری', items: [{ id: 12, date: current, start_time: '23:59', end_time: '23:59', service_name: 'کوتاهی', notes: '' }] }] })
      return Promise.resolve({ data: [] })
    })
    post.mockRejectedValueOnce({ response: { data: { detail: 'ثبت وضعیت ممکن نیست' } } })
    render(<MemoryRouter><EmployeeApp /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: /مشتری.*کوتاهی/ }))
    fireEvent.change(screen.getByPlaceholderText('یادداشت‌ها و محصولات مصرف‌شده را ثبت کنید...'), { target: { value: 'کار تکمیل شد' } })
    fireEvent.click(screen.getByRole('button', { name: 'تکمیل نوبت' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('employee/appointment-items/12/action/', expect.objectContaining({ status: 'complete', notes: 'کار تکمیل شد' })))
    expect(await screen.findByText('ثبت وضعیت ممکن نیست')).toBeInTheDocument()
  })

  it('changes appointments and working hours when selecting another calendar day', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())
    const nextDate = new Date(`${today}T12:00:00`); nextDate.setDate(nextDate.getDate() + 1)
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(nextDate)
    const weekday = (date) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7
    get.mockImplementation((endpoint) => {
      if (endpoint === 'employee/schedule/') return Promise.resolve({ data: [{ id: 1, weekday: weekday(today), start_time: '09:00:00', end_time: '17:00:00', is_active: true }, { id: 2, weekday: weekday(tomorrow), start_time: '11:00:00', end_time: '19:00:00', is_active: true }] })
      if (endpoint === `employee/appointments/?date=${today}`) return Promise.resolve({ data: [{ id: 1, customer_name: 'مشتری امروز', status: 'confirmed', items: [{ date: today, start_time: '09:00', end_time: '10:00', service_name: 'کوتاهی' }] }] })
      if (endpoint === `employee/appointments/?date=${tomorrow}`) return Promise.resolve({ data: [{ id: 2, customer_name: 'مشتری فردا', status: 'confirmed', items: [{ date: tomorrow, start_time: '11:00', end_time: '12:00', service_name: 'رنگ' }] }] })
      return Promise.resolve({ data: [] })
    })
    render(<MemoryRouter initialEntries={['/calendar']}><EmployeeApp /></MemoryRouter>)

    expect(await screen.findByText('مشتری امروز')).toBeInTheDocument()
    expect(screen.getByText('بازه کاری 09:00 تا 17:00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'هفته' }))
    fireEvent.click(await screen.findByRole('button', { name: `انتخاب ${tomorrow}` }))
    expect(await screen.findByText('مشتری فردا')).toBeInTheDocument()
    expect(screen.getByText('بازه کاری 11:00 تا 19:00')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(`employee/appointments/?date=${tomorrow}`)
  })
})
