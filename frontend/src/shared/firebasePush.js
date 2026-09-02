import { api } from './api'
import { unregisterFirebaseDevice } from './firebase'

export async function disableCurrentFirebaseDevice() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const token = await unregisterFirebaseDevice(registration)
    if (token) await api.post('firebase-devices/disable/', { token })
  } catch {
    // Logging out must continue even when browser push is unavailable.
  }
}
