// Rome trip — service worker v1 (offline app shell + offline map tiles)
const CORE = 'rome-core-v9';
const RUNTIME = 'rome-runtime-v1';
const TILES = 'rome-tiles-v1';
const KEEP = [CORE, RUNTIME, TILES];
const ASSETS = [
  './', './index.html', './index-he.html', './map.html', './essentials.html', './essentials-he.html', './qr-install.png',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  // hotel photos — available offline on the trip
  './hotel/facade.jpg', './hotel/room-double.jpg', './hotel/room-desk.jpg', './hotel/reception.jpg', './hotel/breakfast.jpg', './hotel/stairs.jpg', './hotel/room-beds.jpg', './hotel/room-detail.jpg', './hotel/location-map.jpg'
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
  // Pages: network-first, so an edit shows up on the very next load instead of
  // being shadowed by a cached copy. Falls back to cache (and finally to the
  // itinerary) when offline or when the network stalls — the trip still works
  // on a plane or a dead roaming SIM.
  if (req.mode === 'navigate' || (url.origin === self.location.origin && url.pathname.endsWith('.html'))) {
    e.respondWith(
      new Promise(resolve => {
        let settled = false;
        const fromCache = () => caches.match(req).then(h => h || caches.match('./index.html'));
        const done = r => { if (!settled) { settled = true; resolve(r); } };
        // don't let a stalled network hold the page hostage
        const timer = setTimeout(() => { fromCache().then(h => { if (h) done(h); }); }, 3500);
        fetch(req).then(r => {
          clearTimeout(timer);
          if (r && r.ok) {
            const c = r.clone();
            caches.open(CORE).then(cc => cc.put(req, c)).catch(() => {});
            done(r);
          } else {
            // a 4xx/5xx, or a captive-portal login page: keep what we already had
            fromCache().then(h => done(h || r));
          }
        }).catch(() => {
          clearTimeout(timer);
          fromCache().then(h => done(h || Response.error()));
        });
      })
    );
    return;
  }
  // Everything else (Leaflet, fonts, photos): cache-first + runtime cache
  e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => {
    const c = r.clone(); caches.open(RUNTIME).then(rc => rc.put(req, c)).catch(() => {}); return r;
  }).catch(() => undefined)));
});
