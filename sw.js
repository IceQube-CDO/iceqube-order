const CACHE_NAME = 'iceqube-v10.0.3';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './rider.html',
  './css/style_v10.css',
  './manifest.json',
  './assets/logo-192.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', event => {
  // BYPASS CACHE FOR JS FILES DURING DEBUGGING
  if (event.request.url.includes('.js')) {
    return event.respondWith(fetch(event.request));
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
