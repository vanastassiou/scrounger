// =============================================================================
// SERVICE WORKER
// =============================================================================

const CACHE_NAME = 'thrift-inventory-v7';
const ASSETS = [
  // Core
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/manifest.json',

  // PWA icons
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',

  // Main JS modules
  '/js/app.js',
  '/js/config.js',
  '/js/state.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/components.js',
  '/js/data-loaders.js',

  // Database modules
  '/js/db/core.js',
  '/js/db/inventory.js',
  '/js/db/stores.js',
  '/js/db/visits.js',
  '/js/db/attachments.js',
  '/js/db/trips.js',
  '/js/db/expenses.js',
  '/js/db/knowledge.js',
  '/js/db/chat-logs.js',
  '/js/db/export.js',

  // Feature modules (UI)
  '/js/inventory.js',
  '/js/stores.js',
  '/js/visits.js',
  '/js/selling.js',
  '/js/settings.js',
  '/js/references.js',
  '/js/dashboard-actions.js',
  '/js/chat.js',
  '/js/location.js',

  // Selling helpers
  '/js/recommendations.js',
  '/js/fees.js',
  '/js/seasonal.js',

  // Media handling
  '/js/photos.js',
  '/js/camera.js',

  // Sync infrastructure
  '/js/sync.js',
  '/js/google-config.js',
  '/js/core/oauth.js',
  '/js/core/google-drive.js',
  '/js/core/google-picker.js',
  '/js/core/sync-engine.js',

  // Reference data (read-only)
  '/data/stores.json',
  '/data/brands-clothing-shoes.json',
  '/data/brands-jewelry-hallmarks.json',
  '/data/materials.json',
  '/data/platforms.json',
  '/data/seasonal-selling.json',
  '/data/inventory-form-schema.json',
  '/data/rotation-logic.json'
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
        // Fall back to offline page if network fails
        return caches.match('/offline.html');
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

// =============================================================================
// BACKGROUND SYNC
// =============================================================================

const SYNC_TAG = 'thrift-sync';

// Handle background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(doBackgroundSync());
  }
});

// Process queued sync operations
async function doBackgroundSync() {
  try {
    // Notify all clients to perform sync
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_REQUESTED' });
    }
  } catch (err) {
    console.error('Background sync failed:', err);
    throw err; // Causes retry
  }
}

// Listen for messages from main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'REGISTER_SYNC') {
    // Register for background sync when online
    if (self.registration.sync) {
      self.registration.sync.register(SYNC_TAG).catch((err) => {
        console.warn('Background sync registration failed:', err);
      });
    }
  }
});
