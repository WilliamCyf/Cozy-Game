// Service worker: keeps a copy of the game on the phone so it opens instantly and works offline.
// - The page itself is always checked online first (asking the website, not an old saved copy),
//   so a new version is noticed straight away.
// - Everything else comes from the phone's copy.
// - When a new version arrives, only files that changed are downloaded (the rest are copied over),
//   which saves mobile data and battery.
const VERSION = '%VERSION%';
const FILES = %FILES%; // { './file': 'fingerprint', … }  ('./' is the page)
const CACHE = 'cozycove-' + VERSION;
const LIST = './__files.json'; // which fingerprint of each file a copy holds

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const older = await olderCopies();
    await Promise.all(Object.entries(FILES).map(async ([url, print]) => {
      for (const o of older) {
        if (o.list[url] !== print) continue;
        const res = await o.cache.match(url);
        if (res) return cache.put(url, res); // unchanged: copy it, no download
      }
      // changed or new: download it fresh from the website (never a stale saved copy)
      const res = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!res.ok) throw new Error(`could not download ${url}`);
      return cache.put(url, res);
    }));
    await cache.put(LIST, new Response(JSON.stringify(FILES), { headers: { 'content-type': 'application/json' } }));
    await self.skipWaiting();
  })());
});

async function olderCopies() {
  const out = [];
  for (const key of await caches.keys()) {
    if (!key.startsWith('cozycove-') || key === CACHE) continue;
    try {
      const cache = await caches.open(key);
      const list = await cache.match(LIST);
      if (list) out.push({ cache, list: await list.json() });
    } catch { /* an old copy we can't read: just download */ }
  }
  return out;
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cozycove-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page can ask which files this copy holds (to see whether it is already the newest version).
self.addEventListener('message', (e) => {
  if (e.data === 'which-files') e.ports[0]?.postMessage(FILES);
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// The newest page if the website answers quickly, otherwise the copy on the phone.
async function page(req) {
  try {
    // "no-cache" = ask the website whether the page changed (a tiny question when it didn't),
    // instead of trusting the browser's own saved copy, which can be up to 10 minutes old
    const res = await Promise.race([fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }), timeout(3500)]);
    if (res.redirected) return Response.redirect(res.url, 302); // Safari won't show a redirected page from here
    if (res.ok) return res;
  } catch { /* offline or slow: use the copy */ }
  return (await caches.match('./', { ignoreSearch: true })) || fetch(req);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other websites
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) { e.respondWith(page(req)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
