// Rome trip — service worker v1 (offline app shell + offline map tiles)
const CORE = 'rome-core-v7';
const RUNTIME = 'rome-runtime-v1';
const TILES = 'rome-tiles-v1';
const KEEP = [CORE, RUNTIME, TILES];
const ASSETS = [
  './', './index.html', './index-he.html', './map.html', './essentials.html', './essentials-he.html', './qr-install.png',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Weather API: always network-first (live), no caching
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  // Map tiles: cache-first (so a downloaded area works fully offline)
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => {
      const c = r.clone(); caches.open(TILES).then(t => t.put(req, c)).catch(() => {}); return r;
    }).catch(() => caches.match(req))));
    return;
  }
  // Navigations: cache-first, fall back to network, then to index
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(req).then(h => h || fetch(req).catch(() => caches.match('./index.html'))));
    return;
  }
  // Everything else (Leaflet, fonts, photos): cache-first + runtime cache
  e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => {
    const c = r.clone(); caches.open(RUNTIME).then(rc => rc.put(req, c)).catch(() => {}); return r;
  }).catch(() => undefined)));
});
