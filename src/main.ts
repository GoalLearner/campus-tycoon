import './ui/ui.css';
import { store } from './app/store';
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

  // The service worker lets the home-screen app open with no connection.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Not fatal: the game simply needs a connection to load.
    });
  }
}

void boot();
