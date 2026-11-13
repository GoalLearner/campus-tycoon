import type { GameState } from '../sim';
import { CloudApi, CloudSync, cloudAddress, localKeyValue, type Snapshot } from './cloud';
import type { CampusMeta } from '../../server/src/api';
import { isNative } from './platform';
import { appleSignIn, devSignIn } from './signIn';
import type { Store } from './store';

/**
 * Joins the cloud sync to the game (DESIGN.md 48). Started only on the dev
 * server, and only with a server's address: every build of the game leaves
 * it out.
 */

/** What the player is shown of a campus when choosing between two: its name, level, rank and clock. */
export function metaOf(state: GameState): CampusMeta {
  return {
    name: state.school.name.slice(0, 80),
    level: state.daily.level,
    rank: state.field.rank,
    tick: state.clock.tick,
    simulatedAt: Math.round(state.clock.lastSimulatedAt),
  };
}

let sync: CloudSync | null = null;

/** The sync, when cloud saves are on. */
export function cloudSync(): CloudSync | null {
  return sync;
}

/** The game's own snapshot: the save as the Export button makes it (the game only), and what it says about itself. */
export function snapshotOf(store: Store): Snapshot | null {
  if (!store.hasGame || store.visiting !== null) return null;
  return { text: () => store.exportText(), meta: metaOf(store.state) };
}

export function startCloud(store: Store, search: string): CloudSync | null {
  if (sync) return sync;
  const address = cloudAddress(search);
  if (address === null) return null;
  const params = new URLSearchParams(search);
  const signIn = isNative ? appleSignIn : devSignIn(params.get('fakeApple'), params.get('appleSub') ?? 'dev-player');
  const made = new CloudSync({ api: new CloudApi(address), signIn, storage: localKeyValue, online: () => navigator.onLine, now: () => Date.now() });
  sync = made;
  store.onSaved((puttingAway) => {
    const snapshot = snapshotOf(store);
    if (snapshot) void made.afterSave(snapshot, puttingAway);
  });
  store.onNewCampus(() => made.newCampus());
  const check = (): void => {
    const snapshot = snapshotOf(store);
    if (snapshot) void made.check(snapshot);
  };
  check();
  window.addEventListener('online', check);
  return made;
}
