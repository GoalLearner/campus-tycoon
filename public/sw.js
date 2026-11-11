/*
 * Service worker for the home-screen app. It keeps a copy of everything the
 * game needs, so the game opens with no connection. When there is a
 * connection every file is fetched fresh, so a new build shows up on the next
 * launch.
 */
const CACHE = 'campus-tycoon-v1';

const SHELL = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './assets/manifest.json',
  './assets/atlas.json',
  './assets/atlas.png',
];

/** The page names its own script and stylesheet, so read them from it. */
async function shellFiles() {
  const files = [...SHELL];
  try {
    const page = await (await fetch('./', { cache: 'no-store' })).text();
    for (const match of page.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)) files.push(match[1]);
  } catch {
    // Offline during install: keep what we can.
  }
  return [...new Set(files)];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const files = await shellFiles();
      await Promise.all(files.map((file) => cache.add(file).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

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
        // Some hosts mark files as varying by origin. The copies kept here are good for any request.
        const loose = { ignoreSearch: true, ignoreVary: true };
        const kept =
          (await cache.match(request, loose)) ??
          (request.mode === 'navigate' ? await cache.match('./', loose) : undefined);
        if (kept) return kept;
        throw err;
      }
    }),
  );
});
