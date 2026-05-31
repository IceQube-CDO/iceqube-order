const CACHE_NAME = 'iceqube-cache-v10.9.2';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './admin_mobile.html',
  './rider.html',
  './css/style_v10.css',
  './manifest.json',
  './manifest_admin.json',
  './manifest_admin_mobile.json',
  './assets/logo-192.png',
  './assets/logo-512.png',
  './assets/logo2.png',
  './js/app_header.js',
  './js/sync.js',
  './js/app_v24.js'
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
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // STRICT NETWORK-ONLY for these critical files to prevent stale caching
  if (event.request.url.includes('sync.js') || 
      event.request.url.includes('app_v24.js') || 
      event.request.url.includes('admin_v24.js') || 
      event.request.url.includes('admin.js') || 
      event.request.url.includes('app_header.js')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // NETWORK-FIRST for others
  if (event.request.mode === 'navigate' || 
      event.request.url.includes('.css')) {
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
