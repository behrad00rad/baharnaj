import { api } from './api'
import { registerFirebaseDevice, unregisterFirebaseDevice } from './firebase'

const preferenceKey = 'baharnaj-push-enabled'
const tokenKey = 'baharnaj-fcm-token'
export function pushEnabled() { try { return localStorage.getItem(preferenceKey) !== 'false' } catch { return true } }
function save(key, value) { try { localStorage.setItem(key, value) } catch { /* Session still works. */ } }
let pending
export async function syncFirebaseDevice() {
  if (!pushEnabled() || !('Notification' in window) || Notification.permission !== 'granted') return false
  pending ||= (async () => {
    const device = await registerFirebaseDevice()
    await api.post('firebase-devices/', device)
    save(tokenKey, device.token)
    return true
  })().finally(() => { pending = null })
  return pending
}
export async function enableFirebaseDevice() {
  save(preferenceKey, 'true')
  return syncFirebaseDevice()
}
export async function disableCurrentFirebaseDevice({ explicit = false } = {}) {
  if (explicit) save(preferenceKey, 'false')
  let token
  try { token = localStorage.getItem(tokenKey) } catch { /* No stored token. */ }
  // Disable on the server before deleting locally, so retry remains possible.
  if (token) await api.post('firebase-devices/disable/', { token })
  if ('serviceWorker' in navigator) await unregisterFirebaseDevice()
  try { localStorage.removeItem(tokenKey) } catch { /* No persistence available. */ }
}
