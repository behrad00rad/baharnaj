self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() || {} } catch { data = { title: 'بهارناژ', body: event.data?.text() || '' } }
  event.waitUntil(self.registration.showNotification(data.title || 'بهارناژ', {
    body: data.body || '',
    icon: '/favicon.svg',
    data: { targetUrl: data.target_url?.startsWith('/') ? data.target_url : '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.targetUrl || '/', self.location.origin).href
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const current = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (current) return current.navigate(target).then((client) => client.focus())
    return clients.openWindow(target)
  }))
})
