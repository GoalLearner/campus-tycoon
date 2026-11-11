/**
 * Web build only: registers the service worker and tells the UI when a new
 * build has been downloaded and is waiting. The player chooses when to switch,
 * so the page never reloads under their finger. The native app does not use a
 * service worker at all: its files ship inside the app.
 */

type Listener = () => void;

const CHECK_EVERY_MS = 5 * 60_000;

let waiting: ServiceWorker | null = null;
let reloading = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const updates = {
  /** True when a new build is downloaded and ready to switch to. */
  get ready(): boolean {
    return waiting !== null;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Switch to the new build. The page reloads once the new worker has taken over. */
  apply(): void {
    waiting?.postMessage({ type: 'SKIP_WAITING' });
  },
};

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;

  // A first install also changes the controller. Only reload when a build was replaced.
  const hadController = container.controller !== null;
  container.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  container
    .register('./sw.js')
    .then((registration) => {
      const offer = (worker: ServiceWorker | null): void => {
        // With no controller this is the first install, which takes over by itself.
        if (!worker || !container.controller) return;
        waiting = worker;
        emit();
      };

      offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const incoming = registration.installing;
        incoming?.addEventListener('statechange', () => {
          if (incoming.state === 'installed') offer(incoming);
        });
      });

      // A home-screen app can stay open for days, so look for a new build whenever it comes back.
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_EVERY_MS) return;
        lastCheck = Date.now();
        void registration.update().catch(() => undefined);
      });
    })
    .catch(() => {
      // Not fatal: the game simply needs a connection to load.
    });
}
