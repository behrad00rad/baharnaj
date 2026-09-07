import { initializeApp } from 'firebase/app'
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredEnvironment = [
  ['VITE_FIREBASE_API_KEY', config.apiKey],
  ['VITE_FIREBASE_PROJECT_ID', config.projectId],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', config.messagingSenderId],
  ['VITE_FIREBASE_APP_ID', config.appId],
  ['VITE_FIREBASE_VAPID_KEY', import.meta.env.VITE_FIREBASE_VAPID_KEY],
]

const missingEnvironment = () => requiredEnvironment.filter(([, value]) => !value).map(([name]) => name)
let messagingPromise

export async function getFirebaseMessaging() {
  if (missingEnvironment().length || !(await isSupported())) return null
  messagingPromise ||= Promise.resolve(getMessaging(initializeApp(config)))
  return messagingPromise
}

export async function registerFirebaseDevice() {
  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    const missing = missingEnvironment()
    throw new Error(missing.length ? 'اعلان‌های مرورگر هنوز آماده نیست. اعلان‌ها در پنل در دسترس‌اند.' : 'مرورگر شما از اعلان‌های مرورگر پشتیبانی نمی‌کند.')
  }
  const workerUrl = new URL('/firebase-messaging-sw.js', window.location.origin)
  workerUrl.search = new URLSearchParams(Object.entries(config).filter(([, value]) => value)).toString()
  const registration = await navigator.serviceWorker.register(workerUrl)
  const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) throw new Error('دریافت شناسه اعلان این دستگاه ممکن نیست.')
  return { token, device_label: navigator.userAgent.slice(0, 255) }
}

export async function listenForForegroundMessages(onNotification) {
  const messaging = await getFirebaseMessaging()
  return messaging ? onMessage(messaging, onNotification) : () => {}
}

export async function unregisterFirebaseDevice() {
  const messaging = await getFirebaseMessaging()
  if (!messaging) return null
  await deleteToken(messaging)
}
