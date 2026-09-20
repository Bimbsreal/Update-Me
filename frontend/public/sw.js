/* Update Me service worker — static/app-shell only.
 * Never caches API, auth cookies payloads, SSE, or private user data.
 */
const CACHE_VERSION = 'um-static-v1';
const PRECACHE = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const STATIC_EXT =
  /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico|map)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.hostname === 'localhost' && url.port === '5000' ||
    url.pathname.includes('/api/v1/')
  );
}

function isRealtime(url) {
  return url.pathname.includes('/realtime/');
}

function isNavigation(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never touch API / SSE / cross-origin backends
  if (isApiRequest(url) || isRealtime(url) || url.origin !== self.location.origin) {
    return;
  }

  if (isNavigation(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (STATIC_EXT.test(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstStatic(request));
  }
});

async function networkFirstNavigation(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      // Only cache safe public shells — never HTML that may embed private SSR data.
      // Landing + offline only.
      const url = new URL(request.url);
      if (url.pathname === '/' || url.pathname === '/offline') {
        cache.put(request, fresh.clone()).catch(() => {});
      }
      return fresh;
    }
    throw new Error('bad response');
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match('/offline');
    return offline || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
