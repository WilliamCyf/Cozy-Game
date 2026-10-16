// Service worker: keeps a copy of the game on the phone so it opens instantly and works offline.
// The page itself is checked online first (so updates arrive), everything else comes from the copy.
const VERSION = '95664c6843';
const FILES = ["./","./app.84fa020a8f.js","./fonts/fredoka-latin.woff2","./icons/icon-180.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./manifest.webmanifest","./splash/splash-1080x2340.jpg","./splash/splash-1125x2436.jpg","./splash/splash-1170x2532.jpg","./splash/splash-1179x2556.jpg","./splash/splash-1206x2622.jpg","./splash/splash-1242x2208.jpg","./splash/splash-1242x2688.jpg","./splash/splash-1284x2778.jpg","./splash/splash-1290x2796.jpg","./splash/splash-1320x2868.jpg","./splash/splash-750x1334.jpg","./splash/splash-828x1792.jpg"];
const CACHE = 'cozycove-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cozycove-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other websites
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) {
    // newest page if the internet answers quickly, otherwise the saved copy
    e.respondWith(
      Promise.race([fetch(req), timeout(3500)])
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./', { ignoreSearch: true }).then((r) => r || fetch(req))),
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
