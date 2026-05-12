const CACHE_NAME = 'iceqube-cache-v10.6.1';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './rider.html',
  './css/style_v10.css',
  './manifest.json',
  './manifest_admin.json',
  './assets/logo-192.png',
  './assets/logo-512.png',
  './assets/logo2.png'
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
  // NETWORK-FIRST strategy for HTML, CSS, and JS to ensure latest updates
  if (event.request.mode === 'navigate' || 
      event.request.url.includes('.css') || 
      event.request.url.includes('.js')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clonedResponse));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
