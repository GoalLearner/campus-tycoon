import './ui/ui.css';
import { isNative } from './app/platform';
import { store } from './app/store';
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

  const gameRoot = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  if (!gameRoot || !uiRoot) throw new Error('The page is missing its roots.');

  createGame(gameRoot);
  mountUi(uiRoot);

  // The service worker lets the web build open with no connection and offers updates.
  // The iOS app ships its files inside the app, so it has no service worker.
  if (import.meta.env.PROD && !__NATIVE_BUILD__ && !isNative) registerServiceWorker();
}

void boot();
