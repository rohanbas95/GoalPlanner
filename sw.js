// Offline support: keeps a copy of the app files so it opens without internet.
// Your goals and tasks are NOT stored here - they live in the browser's localStorage.
// Bump VERSION whenever you want to force every device to drop its old cached copy.
const VERSION = 'v1';
const CACHE = 'goal-planner-' + VERSION;
const FILES = [
  './', './index.html', './css/app.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './apple-touch-icon.png',
  './js/main.js', './js/store.js', './js/dates.js', './js/ui.js', './js/forms.js', './js/items.js', './js/filter.js', './js/google.js', './js/config.js',
  './js/views/today.js', './js/views/goals.js', './js/views/timeline.js', './js/views/calendar.js', './js/views/settings.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('goal-planner-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only this site's own files; Google calls always go straight to the network
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Network first so updates show up as soon as you're online; cached copy when offline
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
        .then(hit => hit || Response.error()))
  );
});
