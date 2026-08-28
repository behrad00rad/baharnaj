import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Booking from './Booking'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../shared/hooks', () => ({ useServices: () => ({ services: [{ id: 1, name: 'Cut', persian_name: 'کوتاهی', price: 800, duration: 60, category_name: 'مو' }] }) }))
vi.mock('../components/DatePicker', () => ({ DateModal: () => <div data-testid="date-modal" /> }))
vi.mock('../shared/api', () => ({ api: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(() => Promise.resolve({ data: { token: 'hold', expires_at: 'later' } })) }, toman: (value) => `${value} تومان` }))

describe('booking wizard', () => {
  beforeEach(() => { window.history.pushState({}, '', '/book') })

  it('moves from service selection to employee selection and validates selection', async () => {
    render(<MemoryRouter><Booking /></MemoryRouter>)
    expect(screen.getByText('خدمتت را انتخاب کن.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /کوتاهی/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /کوتاهی/ }))
    fireEvent.click(screen.getByRole('button', { name: /انتخاب متخصص/ }))
    expect(screen.getByText('متخصصت را انتخاب کن.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('متخصص فعالی برای این خدمت پیدا نشد.')).toBeInTheDocument())
  })
})
