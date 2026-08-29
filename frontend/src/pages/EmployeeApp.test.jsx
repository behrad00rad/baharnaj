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
  })

  it('reloads finance data for the selected period', async () => {
    render(<MemoryRouter initialEntries={['/earnings']}><EmployeeApp /></MemoryRouter>)

    await waitFor(() => expect(get).toHaveBeenCalledWith('employee/earnings/?period=day'))
    fireEvent.click(screen.getByRole('button', { name: 'هفتگی' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('employee/earnings/?period=week'))
    fireEvent.click(screen.getByRole('button', { name: 'ماهانه' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('employee/earnings/?period=month'))
  })
})
