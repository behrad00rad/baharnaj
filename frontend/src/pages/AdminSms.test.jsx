import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import AdminSms from './AdminSms'
import { api } from '../shared/api'

vi.mock('../shared/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
const config = { mode: 'test', environment_enabled: true, dry_run: true, configured: false, credentials_configured: false, verified: false, live_ready: false, sender: '', body_ids_configured: [], heartbeat: null, last_provider_verification: null, reminder_hours: [24, 3], enabled_events: ['booking_received'], daily_limit: 100 }
const templates = { allowed_variables: ['first_name', 'date'], templates: [{ kind: 'booking_received', text: '{first_name} عزیز', version: 1, parts: 1, pattern_configured: false }] }
const setup = { source: 'environment', revision: 0, credentials_readable: true, username_present: false, password_present: false, sender: '', body_ids_configured: [] }
beforeEach(() => {
  api.get.mockImplementation(async url => ({ data: url.includes('overview/') ? { config, counts: { queued: 2, simulated: 1 }, next_reminders: [] } : url.includes('templates/') ? templates : url.includes('setup/') ? setup : { count: 1, results: [{ id: 1, kind: 'test', status: 'simulated', recipient: '0912***6543', appointment: null, created_at: '2026-09-23T10:00:00Z' }] } }))
  api.post.mockResolvedValue({ data: { status: 'simulated' } })
  api.patch.mockResolvedValue({ data: config })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => vi.restoreAllMocks())

it('shows safe overview and setup errors without exposing credentials', async () => {
  render(<AdminSms />)
  await screen.findByText('ارسال آزمایشی')
  expect(screen.getByText('فعال؛ پیام واقعی ارسال نمی‌شود')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'راه‌اندازی' }))
  expect(screen.getByText(/اطلاعات ورود: ثبت نشده/)).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'ارسال واقعی' })).toBeDisabled()
  api.post.mockRejectedValueOnce({ response: { data: { detail: 'تنظیمات ناقص است.' } } })
  fireEvent.click(screen.getByRole('button', { name: 'بررسی تنظیمات' }))
  await screen.findByRole('alert')
})

it('requires confirmation for a dry-run test and edits reminder settings', async () => {
  render(<AdminSms />)
  await screen.findByText('ارسال آزمایشی')
  fireEvent.click(screen.getByRole('button', { name: 'راه‌اندازی' }))
  fireEvent.change(screen.getByLabelText('شماره همراه خودم'), { target: { value: '09129876543' } })
  fireEvent.click(screen.getByRole('button', { name: 'ارسال پیام آزمایشی' }))
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('sms/admin/test/', { phone: '09129876543', confirm: true }))
  expect(screen.getByText(/ارسال واقعی انجام نشد/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'یادآوری نوبت‌ها' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'تأیید نوبت' }))
  fireEvent.click(screen.getByRole('button', { name: 'ذخیره یادآوری‌ها' }))
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('sms/admin/config/', expect.objectContaining({ enabled_events: ['booking_received', 'booking_confirmed'] })))
})

it('previews templates and filters a masked delivery report', async () => {
  render(<AdminSms />)
  await screen.findByText('ارسال آزمایشی')
  fireEvent.click(screen.getByRole('button', { name: 'قالب‌ها' }))
  expect(screen.getByText(/نمونه: مریم عزیز/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('متن پیام'), { target: { value: '{first_name} سلام' } })
  fireEvent.click(screen.getByRole('button', { name: 'ذخیره قالب' }))
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('sms/admin/templates/booking_received/', { text: '{first_name} سلام' }))
  fireEvent.click(screen.getByRole('button', { name: 'گزارش ارسال' }))
  fireEvent.change(screen.getByLabelText('۴ رقم آخر شماره'), { target: { value: '6543' } })
  await waitFor(() => expect(api.get.mock.calls.some(([url]) => url.includes('phone=6543'))).toBe(true))
  expect(await screen.findByText('0912***6543')).toBeInTheDocument()
})

it('saves provider credentials through write-only setup fields', async () => {
  render(<AdminSms />)
  await screen.findByText('ارسال آزمایشی')
  fireEvent.click(screen.getByRole('button', { name: 'راه‌اندازی' }))
  fireEvent.change(screen.getByLabelText(/نام کاربری Melipayamak/), { target: { value: 'account' } })
  fireEvent.change(screen.getByLabelText(/گذرواژه Melipayamak/), { target: { value: 'private-pass' } })
  fireEvent.change(screen.getByLabelText('شماره فرستنده'), { target: { value: '50001234' } })
  fireEvent.change(screen.getByLabelText(/شناسه الگوی ثبت درخواست/), { target: { value: '456' } })
  fireEvent.click(screen.getByRole('button', { name: 'ذخیره اطلاعات ارائه‌دهنده' }))
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('sms/admin/setup/', expect.objectContaining({ revision: 0, username: 'account', password: 'private-pass', sender: '50001234', body_ids: { booking_received: '456' } })))
  await waitFor(() => expect(screen.getByLabelText(/گذرواژه Melipayamak/)).toHaveValue(''))
})
