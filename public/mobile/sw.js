// ============================================================================
// ALDAFFA PERFUMES ERP — PWA SERVICE WORKER (OFFLINE FIRST CACHE)
// ============================================================================

const CACHE_NAME = 'aldaffa-mobile-v2.1';
const STATIC_ASSETS = [
  '/mobile/',
  '/mobile/index.html',
  '/mobile/style.css',
  '/mobile/app.js',
  '/mobile/manifest.json',
  '/vite.svg'
];

// Install Event: Pre-cache core PWA static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First for static assets, Network-First for API requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. API Requests -> Network-First with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If successful GET request, clone to dynamic cache
          if (event.request.method === 'GET' && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          // Fallback offline JSON
          return new Response(
            JSON.stringify({ success: false, error: 'CLIENT_OFFLINE', offline: true }),
            { headers: { 'Content-Type': 'application/json' }, status: 503 }
          );
        })
    );
    return;
  }

  // 2. Static Assets -> Cache-First with Network Fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback to index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/mobile/index.html');
        }
      });
    })
  );
});

// Background Sync Event (Supported browsers)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-aldaffa-outbox') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_OUTBOX_SYNC' });
        });
      })
    );
  }
});
