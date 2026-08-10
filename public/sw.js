const CACHE_NAME = 'sumak-v2'

self.addEventListener('install', (event) => {
  // Clear old caches on install
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never cache API requests — always go to network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }

  // Network-first strategy for other requests: always try network, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET requests (non-API only)
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
