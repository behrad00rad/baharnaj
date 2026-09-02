import { api } from './api'

export async function disableCurrentPushSubscription() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration('/service-worker.js')
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    await api.post('push-subscriptions/disable/', { endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  } catch {
    // Logging out must continue even when browser push is unavailable.
  }
}
