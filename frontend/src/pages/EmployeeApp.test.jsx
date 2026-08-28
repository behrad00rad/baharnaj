import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EmployeeApp from './EmployeeApp'
import { MemoryRouter } from 'react-router-dom'

const { post } = vi.hoisted(() => ({ post: vi.fn(() => Promise.resolve({ data: {} })) }))
vi.mock('../shared/api', () => ({ api: { get: vi.fn(() => Promise.resolve({ data: [] })), post }, toman: (value) => `${value} تومان` }))

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
})
