const CACHE = 'aura-v4';
const STATIC = [
  '/', '/home', '/login', '/signup', '/profile', '/chat', '/onboarding',
  '/manifest.json',
  '/js/utils.js', '/js/home.js', '/js/profile.js', '/js/auth.js',
  '/icon-192.png', '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.js',
];

// Install — кэшируем статику
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC.filter(u => !u.startsWith('http'))))
      .then(() => self.skipWaiting())
  );
});

// Activate — удаляем старый кэш
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — stale-while-revalidate для HTML/JS/CSS, network-only для API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API — всегда сеть
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;

  // Leaflet и шрифты — cache first
  if (url.hostname !== location.hostname) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // HTML страницы и JS — stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        // Возвращаем кэш мгновенно, обновляем в фоне
        return cached || networkFetch;
      })
    )
  );
});
