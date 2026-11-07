const CACHE_NAME = 'md-preview-cache-v3';
const SHELL_URL = '/index.html';
const PRECACHE = [SHELL_URL, '/favicon.svg', '/manifest.json'];

const isHtml = (response) =>
  (response.headers.get('content-type') || '').toLowerCase().includes('text/html');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              // Never precache an HTML fallback in place of a non-HTML file.
              if (res.ok && (url === SHELL_URL || !isHtml(res))) return cache.put(url, res);
            })
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigations: network-first so a deploy is picked up immediately; the
  // cached shell is only an offline fallback.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && isHtml(response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Hashed build assets are immutable: cache-first. Cloudflare Pages' SPA
  // fallback answers missing files with index.html (200, text/html), so a
  // text/html response for a non-navigation request is never cached.
  const isHashedAsset = url.pathname.startsWith('/assets/');
  const cacheable = (response) => response.ok && response.type === 'basic' && !isHtml(response);

  if (isHashedAsset) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (cacheable(response)) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else (icons, manifest, ...): network-first, cache as offline fallback.
  e.respondWith(
    fetch(request)
      .then((response) => {
        if (cacheable(response)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
