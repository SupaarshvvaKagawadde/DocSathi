// JKY-Folder service worker: makes the app installable, shows an offline page, and shows
// reminder notifications while the app is closed. Private data under /api/ is never cached.
const SHELL = 'jky-shell-v1';
const scope = new URL(self.registration.scope);
const scopedUrl = (path) => new URL(path, scope).href;
const offlinePage = scopedUrl('offline.html');
const assetPrefix = new URL('assets/', scope).pathname;
const OFFLINE = ['offline.html', 'icons/icon-192.png', 'favicon.svg'].map(scopedUrl);
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(OFFLINE))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(offlinePage)));
    return;
  }
  // Built files have content hashes in their names, so a cached copy is always correct.
  if (url.pathname.startsWith(assetPrefix))
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'DocSathi reminder';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : 'Open DocSathi to see what changed.',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: scopedUrl('favicon.svg'),
      badge: scopedUrl('favicon.svg'),
      data: { url: typeof data.url === 'string' ? data.url : scope.href },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open pages of this app.
  const target = new URL(event.notification.data?.url || scope.href, self.location.origin);
  let destination = scope.href;
  if (target.origin === scope.origin) {
    if (target.pathname === '/' && scope.pathname !== '/') {
      const scopedTarget = new URL(scope.href);
      scopedTarget.search = target.search;
      scopedTarget.hash = target.hash;
      destination = scopedTarget.href;
    } else if (target.pathname.startsWith(scope.pathname)) destination = target.href;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => {
        const page = new URL(w.url);
        return page.origin === scope.origin && page.pathname.startsWith(scope.pathname);
      });
      if (open) return open.navigate(destination).then((w) => (w || open).focus());
      return self.clients.openWindow(destination);
    }),
  );
});
