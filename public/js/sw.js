const CACHE = 'aura-v9';
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

  // HTML и JS — network-first (свежий код сразу, кэш только при оффлайне)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.html') ||
      url.pathname === '/' || !url.pathname.includes('.')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Картинки/CSS — stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});

// ── Push уведомления ─────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: '+aura', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || '+aura', {
      body:    data.body || '',
      icon:    data.icon  || '/icon-192.png',
      badge:   data.badge || '/icon-192.png',
      tag:     data.tag   || 'aura',
      data:    { url: data.url || '/' },
      vibrate: [100, 50, 100],
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
