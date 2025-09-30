/* sw.js for StartList */
const VERSION = 'v1.0.0';
const CACHE_STATIC = `startlist-static-${VERSION}`;
const CACHE_DYNAMIC = `startlist-dynamic-${VERSION}`;

// core assets you want available offline
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_DYNAMIC].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// network helper with timeout
const networkWithTimeout = (request, ms = 5000) =>
  Promise.race([
    fetch(request, { cache: 'no-store' }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    )
  ]);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // handle Google Sheets CSV → network-first
  if (/docs\.google\.com\/spreadsheets\/.*tqx=out:csv/.test(request.url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await networkWithTimeout(request);
          const cache = await caches.open(CACHE_DYNAMIC);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response('"No Data"\n', {
            headers: { 'Content-Type': 'text/csv' }
          });
        }
      })()
    );
    return;
  }

  // navigation (HTML) → network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: 'no-store' });
          const cache = await caches.open(CACHE_STATIC);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || caches.match('./index.html');
        }
      })()
    );
    return;
  }

  // everything else → cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_STATIC);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
