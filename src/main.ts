import './ui/ui.css';
import { startNotices } from './app/notices';
import { isNative } from './app/platform';
import { store } from './app/store';
import { startSocialWeb } from './app/socialWeb';
import { installSound } from './app/sound';
import { registerServiceWorker } from './app/updates';
import { createGame } from './game/createGame';
import { mountUi } from './ui/ui';

/** Boot: load the save, catch the sim up to now, then start the map and the HUD. */
async function boot(): Promise<void> {
  if (import.meta.env.DEV) {
    const { installDevTools } = await import('./app/devtools');
    installDevTools();
  }
  await store.load();
  store.start();
  // The social web runs in a worker beside the game (DESIGN.md 63.5).
  startSocialWeb(store);
  // Cloud saves (DESIGN.md 48) are switched off: only the dev server loads them, and only with a server's address.
  if (import.meta.env.DEV) {
    const { startCloud } = await import('./app/cloudWire');
    startCloud(store, window.location.search);
  }
  // Notifications are planned when the iPhone app is put away. A browser tab has none.
  startNotices();

  const gameRoot = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  if (!gameRoot || !uiRoot) throw new Error('The page is missing its roots.');

  createGame(gameRoot);
  mountUi(uiRoot);
  // Sound starts at the player's first tap and stops whenever the page is hidden.
  installSound();

  // The service worker lets the web build open with no connection and offers updates.
  // The iOS app ships its files inside the app, so it has no service worker.
  if (import.meta.env.PROD && !__NATIVE_BUILD__ && !isNative) registerServiceWorker();
}

void boot();
