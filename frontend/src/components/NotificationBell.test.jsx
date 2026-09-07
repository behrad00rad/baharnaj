import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import NotificationBell from './NotificationBell'
import { api } from '../shared/api'
import { listenForForegroundMessages } from '../shared/firebase'
import { enableFirebaseDevice, syncFirebaseDevice } from '../shared/firebasePush'
vi.mock('../shared/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../shared/firebase', () => ({ listenForForegroundMessages: vi.fn() }))
vi.mock('../shared/firebasePush', () => ({ enableFirebaseDevice: vi.fn(), syncFirebaseDevice: vi.fn(), disableCurrentFirebaseDevice: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
  api.get.mockImplementation(url => Promise.resolve({data: url.includes('count') ? {count:1} : [{id:1,title:'نوبت جدید',message:'پیام نوبت',is_read:false,created_at:'2026-09-07T09:00:00Z',target_url:'/employee/calendar'}]}))
  api.post.mockResolvedValue({})
  syncFirebaseDevice.mockResolvedValue(false)
  enableFirebaseDevice.mockResolvedValue(true)
  listenForForegroundMessages.mockResolvedValue(() => {})
})
it('requests permission only after clicking enable and registers the device', async () => {
  render(<MemoryRouter><NotificationBell /></MemoryRouter>)
  expect(Notification.requestPermission).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name:/اعلان‌ها،/}))
  fireEvent.click(screen.getByRole('button', {name:'فعال‌سازی اعلان‌ها'}))
  await waitFor(() => expect(enableFirebaseDevice).toHaveBeenCalledOnce())
  expect(Notification.requestPermission).toHaveBeenCalledOnce()
  expect(await screen.findByText('اعلان‌های این دستگاه فعال شد.')).toBeVisible()
})
it('surfaces foreground messages and marks all notifications read', async () => {
  render(<MemoryRouter><NotificationBell /></MemoryRouter>)
  await waitFor(() => expect(listenForForegroundMessages).toHaveBeenCalled())
  const {act} = await import('@testing-library/react')
  await act(async () => listenForForegroundMessages.mock.calls[0][0]({data:{title:'گزارش پرداخت',body:'پرداخت تازه'}}))
  expect(screen.getByRole('status')).toHaveTextContent('پرداخت تازه')
  fireEvent.click(screen.getByRole('button', {name:/اعلان‌ها،/}))
  fireEvent.click(await screen.findByRole('button', {name:'خواندن همه'}))
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('notifications/read-all/'))
})
