/*
 * Service worker for the web build and the home-screen app.
 *
 * The build fills in the two values below (see tools/finish-build.ts). The
 * build id is a hash of every file in the build, so the cache gets a new name
 * exactly when something changed.
 *
 * How an update reaches the player:
 * 1. The browser sees that this file changed and installs the new worker
 *    beside the old one. The new worker copies the whole new build into its
 *    own cache.
 * 2. The new worker waits. The page shows "Update ready".
 * 3. The player taps Update, or closes the app. The new worker takes over and
 *    removes the old cache.
 *
 * A build is always served whole from one cache, so old and new files never mix.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = '__PRECACHE__';
const CACHE = 'campus-tycoon-' + BUILD_ID;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // "reload" skips the browser's own cache, so the copy is the real new build.
      .then((cache) => cache.addAll(PRECACHE.map((file) => new Request(file, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('campus-tycoon-') && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Some hosts mark files as varying by origin. The copies kept here are good for any request.
      const loose = { ignoreSearch: true, ignoreVary: true };
      const kept =
        (await cache.match(request, loose)) ?? (request.mode === 'navigate' ? await cache.match('./', loose) : undefined);
      return kept ?? fetch(request);
    }),
  );
});
