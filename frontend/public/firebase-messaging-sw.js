self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const candidate = new URL(event.notification.data?.targetUrl || '/', self.location.origin)
  const target = candidate.origin === self.location.origin ? candidate.href : self.location.origin + '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const current = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (current) return current.navigate(target).then((client) => client?.focus())
    return clients.openWindow(target)
  }))
})

// Firebase needs an independent worker context; values are public web-app config,
// supplied by the Vite environment through the registration URL, never credentials.
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js')

const config = Object.fromEntries(new URL(self.location.href).searchParams.entries())
firebase.initializeApp(config)
const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {}
  const targetUrl = data.target_url?.startsWith('/') ? data.target_url : '/'
  return self.registration.showNotification(data.title || 'بهارناژ', { body: data.body || '', icon: '/favicon.svg', tag: data.notification_id || undefined, data: { targetUrl } })
})
