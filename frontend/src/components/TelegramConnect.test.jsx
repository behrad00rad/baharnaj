import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TelegramConnect from './TelegramConnect'
import { api } from '../shared/api'
vi.mock('../shared/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../shared/auth', () => ({ useAuth: () => ({ role: null }) }))
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })
describe('Telegram booking card', () => {
  it('stays hidden when unconfigured', async () => {
    api.get.mockResolvedValue({ data: { configured: false } })
    const { container } = render(<TelegramConnect receipt="receipt" compact />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
  it('uses scoped receipt and separate unchecked marketing', async () => {
    api.get.mockResolvedValue({ data: { configured: true, connected: false } })
    api.post.mockResolvedValue({ data: { url: 'https://t.me/example?start=token', expires_in: 600 } })
    render(<TelegramConnect receipt="receipt" compact />)
    await screen.findByText('هنوز متصل نشده‌اید.')
    expect(screen.getByLabelText('مایلم پیشنهادها و تخفیف‌های بهارناژ را هم دریافت کنم.')).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'اتصال به تلگرام' }))
    await screen.findByRole('link', { name: 'باز کردن تلگرام و تأیید اتصال' })
    expect(api.post.mock.calls[0][1]).toMatchObject({ receipt: 'receipt', action: 'link', marketing: false })
    expect(screen.queryByText('✓ متصل به تلگرام')).not.toBeInTheDocument()
  })
  it('cleans up pending polling on unmount', async () => {
    api.get.mockResolvedValue({ data: { configured: true, connected: false } })
    api.post.mockResolvedValue({ data: { url: 'https://t.me/example?start=token', expires_in: 600 } })
    const { unmount } = render(<TelegramConnect receipt="receipt" compact />)
    await screen.findByText('هنوز متصل نشده‌اید.')
    vi.useFakeTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'اتصال به تلگرام' })) })
    unmount(); const count = api.get.mock.calls.length
    await act(async () => { vi.advanceTimersByTime(180000) })
    expect(api.get).toHaveBeenCalledTimes(count)
  })
})
