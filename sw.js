const CACHE_NAME = 'iceqube-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './css/style_v10.css',
  './assets/logo.png',
  './assets/hero.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
