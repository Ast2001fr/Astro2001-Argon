/**
 * sw.js
 * Progressive Web App Service Worker for offline operation and optional pack caching.
 */

const CACHE_CORE = 'uranometrie-core-v5';
const CACHE_PACKS = 'uranometrie-packs-v5';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/features.js',
  './js/i18n.js',
  './js/i18n-fr.js',
  './js/astro/time.js',
  './js/astro/solar-system.js',
  './js/astro/sgp4.js',
  './js/astro/events.js',
  './js/render/projection.js',
  './js/render/planet-shader.js',
  './js/render/milkyway-hips.js',
  './js/render/sky-renderer.js',
  './js/ui/object-card.js',
  './js/ui/panels.js',
  './js/ui/command-palette.js',
  './data/stars.bin',
  './data/star-meta.json',
  './data/openngc.json',
  './data/constellations.json',
  './data/asteroids.json',
  './data/satellites-tle.json',
  './data/meteors.json',
  './data/cities.json',
  './data/telescopes.json',
  './data/wiki-index.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_CORE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_CORE && k !== CACHE_PACKS)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // For external APIs (Open-Meteo, Celestrak, HiPS DSS2, Wikipedia API), try network first, fail silently offline
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  // Network-first with cache fallback for HTML, JS, CSS so code updates apply immediately when online
  if (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_CORE).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for heavy catalogs, textures, DSO photos, and offline packs
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_CORE).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      });
    })
  );
});
