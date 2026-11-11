/*
 * Service worker for the home-screen app. It keeps a copy of everything the
 * game loads, so the game opens with no connection. Pages are fetched fresh
 * when there is a connection, so a new build shows up on the next launch.
 */
const CACHE = 'campus-tycoon-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch (err) {
        const kept = (await cache.match(request)) ?? (request.mode === 'navigate' ? await cache.match('./') : undefined);
        if (kept) return kept;
        throw err;
      }
    }),
  );
});
