// ATHLORA service worker: makes the app installable and loads the shell offline.
const CACHE = 'athlora-v1';
const SHELL = [
  '/', '/index.html', '/css/styles.css', '/manifest.webmanifest',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/js/app.js', '/js/api.js', '/js/ui.js', '/js/onboarding.js', '/js/tracker.js',
  '/js/views/dashboard.js', '/js/views/move.js', '/js/views/setup.js',
  '/js/views/passport.js', '/js/views/campus.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache API calls or third-party requests (camera AI model, fonts)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Network first, fall back to cache when offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
