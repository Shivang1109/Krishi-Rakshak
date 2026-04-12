/* Krishi Rakshak — Service Worker v4: cache-first static, network-first API */
const CACHE = 'krishi-v5';
const CORE = [
  './',
  './index.html',
  './home.html',
  './home-app.js',
  './detect.html',
  './login.html',
  './dashboard.html',
  './tracker.html',
  './map.html',
  './weather.html',
  './market.html',
  './soil.html',
  './insurance.html',
  './loans.html',
  './finance.html',
  './chat.html',
  './calendar.html',
  './forum.html',
  './irrigation.html',
  './style.css',
  './dashboard.css',
  './app.js',
  './config.js',
  './detect.js',
  './finance.js',
  './soil.js',
  './chat-bubble.js',
  './disease-translations.json',
  './manifest.json',
  './static/labels.json',
];

// API paths that must NEVER be served from cache (always network-first, no stale fallback for mutations)
const MUTATION_PATHS = /\/(predict|batch-predict|chat|forum\/posts|irrigation-schedule|read-soil-card)/;
// API paths that can fall back to cache if offline
const CACHEABLE_API = /\/(weather|mandi-prices|outbreak-map|my-area-alerts|history|alerts|daily-tip)/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return; // POST/DELETE pass through untouched

  // Mutation API endpoints — always network, never cache (let detect.js handle offline)
  if (MUTATION_PATHS.test(url)) return;

  // External resources (fonts, CDN libs) — network first, cache fallback
  if (url.includes('fonts.googleapis') || url.includes('fonts.gstatic') ||
      url.includes('cdnjs.cloudflare') || url.includes('unpkg.com') ||
      url.includes('cdn.jsdelivr') || url.includes('tensorflow')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cacheable API endpoints — network first, serve stale if offline
  if (CACHEABLE_API.test(url) || url.includes(':8000')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // HTML files — always network first, never serve stale HTML
  if (e.request.headers.get('accept')?.includes('text/html') || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets (JS, CSS, images) — cache first, network fallback
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      });
    })
  );
});
