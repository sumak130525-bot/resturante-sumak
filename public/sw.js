// Service Worker for Push Notifications - Sumak Restaurante

self.addEventListener('push', function (event) {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch (e) {
      data = { title: 'Sumak', body: event.data.text() }
    }
  }

  const title = data.title || 'Sumak Restaurante'
  const options = {
    body: data.body || 'Tenemos novedades para vos',
    icon: '/logo-sumak.png',
    badge: '/logo-sumak.png',
    data: { url: data.url || 'https://restaurante-sumak.vercel.app' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : 'https://restaurante-sumak.vercel.app'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i]
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
