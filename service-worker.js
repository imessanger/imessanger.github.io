const CACHE_NAME = 'imessenger-shell-v1';
// Relative to this script's own location, so this works whether the app is
// hosted at a domain root (Vercel) or a subpath (e.g. a GitHub Pages project
// site at username.github.io/repo-name/).
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/ws.js',
  './js/state.js',
  './js/auth.js',
  './js/conversations.js',
  './js/chat.js',
  './js/settings.js',
  './js/push.js',
  './js/main.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for API/WS calls, cache-first for the static app shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api')) return; // never cache API responses

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && url.origin === self.location.origin) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'New message', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'New message';
  const iconUrl = new URL('icons/icon-192.png', self.registration.scope).href;
  const options = {
    body: data.body || '',
    icon: iconUrl,
    badge: iconUrl,
    data: { conversationId: data.conversationId || null },
    tag: data.conversationId ? `conv-${data.conversationId}` : undefined,
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  const targetUrl = new URL(
    conversationId ? `?conversation=${conversationId}` : './',
    self.registration.scope
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'open-conversation', conversationId });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
