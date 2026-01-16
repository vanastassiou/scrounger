// =============================================================================
// SERVICE WORKER
// =============================================================================

const CACHE_NAME = 'thrift-inventory-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/js/app.js',
  '/js/config.js',
  '/js/db.js',
  '/js/inventory.js',
  '/js/state.js',
  '/js/stores.js',
  '/js/sync.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/visits.js',
  '/data/stores.json'
];

// Install: cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for assets, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip OAuth callback URLs entirely - let the browser handle them
  if (url.searchParams.has('code') || url.searchParams.has('state')) {
    return; // Don't call event.respondWith - let browser handle normally
  }

  // Let navigation requests pass through
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { redirect: 'follow' }).catch(() => {
        // Fall back to cached index.html if network fails
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Network-first for Google APIs
  if (url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for local assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
