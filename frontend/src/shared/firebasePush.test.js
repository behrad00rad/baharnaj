import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from './api'
import { registerFirebaseDevice, unregisterFirebaseDevice } from './firebase'
import { disableCurrentFirebaseDevice, enableFirebaseDevice, syncFirebaseDevice } from './firebasePush'
vi.mock('./api', () => ({ api: { post: vi.fn() } }))
vi.mock('./firebase', () => ({ registerFirebaseDevice: vi.fn(), unregisterFirebaseDevice: vi.fn() }))
beforeEach(() => {
  vi.stubGlobal('Notification', { permission: 'granted' })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
  api.post.mockResolvedValue({})
  registerFirebaseDevice.mockResolvedValue({ token: 'device-one' })
  unregisterFirebaseDevice.mockResolvedValue()
})
afterEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })
it('registers and refreshes the current device, preserving explicit opt-out', async () => {
  await syncFirebaseDevice()
  expect(api.post).toHaveBeenCalledWith('firebase-devices/', { token: 'device-one' })
  registerFirebaseDevice.mockResolvedValue({ token: 'refreshed-token' })
  await syncFirebaseDevice()
  expect(localStorage.getItem('baharnaj-fcm-token')).toBe('refreshed-token')
  await disableCurrentFirebaseDevice({ explicit: true })
  expect(api.post).toHaveBeenCalledWith('firebase-devices/disable/', { token: 'refreshed-token' })
  expect(await syncFirebaseDevice()).toBe(false)
  expect(await enableFirebaseDevice()).toBe(true)
})
it('does not register or request permission when denied', async () => {
  Notification.permission = 'denied'
  expect(await syncFirebaseDevice()).toBe(false)
  expect(registerFirebaseDevice).not.toHaveBeenCalled()
})
it('keeps the token available for retry when server disable fails', async () => {
  await syncFirebaseDevice()
  api.post.mockRejectedValue(new Error('offline'))
  await expect(disableCurrentFirebaseDevice({ explicit: true })).rejects.toThrow('offline')
  expect(localStorage.getItem('baharnaj-fcm-token')).toBe('device-one')
  expect(unregisterFirebaseDevice).not.toHaveBeenCalled()
})
