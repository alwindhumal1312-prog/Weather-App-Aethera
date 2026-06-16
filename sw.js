const CACHE_NAME = 'aethera-weather-cache-v2';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'icon.png'
];

// Install Event - cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clear old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - network-first for local static assets, falling back to cache if offline
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // If it's an external API call, go to network.
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Network unavailable' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Network-first for local static assets
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (e.request.mode === 'navigate') {
            return caches.match('index.html');
          }
        });
      })
  );
});
