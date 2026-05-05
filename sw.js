const CACHE_NAME = 'iceqube-v3';
const ASSETS = [
  './',
  './index.html',
  './rider.html',
  './admin.html',
  './js/app_v10.js',
  './js/admin.js',
  './js/sync.js',
  './js/app_header.js',
  './css/style_v10.css',
  './assets/logo.png',
  './assets/hero.jpeg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).then((response) => {
      // Network succeeded — update cache and return fresh response
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => {
      // Network failed — fall back to cache
      return caches.match(event.request);
    })
  );
});
