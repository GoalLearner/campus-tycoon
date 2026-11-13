import type { CampusMeta, CampusRecord } from '../../server/src/api';
import type { CloudSync, SyncStatus } from '../app/cloud';
import { cloudSync, snapshotOf } from '../app/cloudWire';
import { store } from '../app/store';
import { duration } from '../sim';

/**
 * The Account page and the choice between two campuses (DESIGN.md 48). Only
 * the dev server loads this file, and only when cloud saves have a server:
 * every build of the game leaves it out.
 */

type OpenModal = (build: (close: () => void, card: HTMLElement) => void, dismissable?: boolean) => void;
type Toast = (text: string, kind?: 'info' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** "5 m ago", or "just now". */
function ago(at: number, now: number): string {
  const minutes = Math.round((now - at) / 60_000);
  return minutes < 1 ? 'just now' : `${duration(minutes)} ago`;
}

/** "Level 7 · No. 120", or "Level 7 · not ranked yet". */
function standing(meta: CampusMeta): string {
  return `Level ${meta.level} · ${meta.rank > 0 ? `No. ${meta.rank}` : 'not ranked yet'}`;
}

const STATUS: Record<SyncStatus, string> = {
  signedOut: '',
  synced: 'Synced',
  waiting: 'Syncs within ten minutes, and when the app is put away',
  syncing: 'Syncing',
  offline: 'Offline. It syncs when this iPhone is back online',
  conflict: 'Waiting for you to choose a campus',
  failed: 'Could not sync. It tries again at the next save',
};

function statusLine(sync: CloudSync): string {
  if (sync.status === 'synced' && sync.lastSyncedAt !== null) return `Synced ${ago(sync.lastSyncedAt, Date.now())}`;
  return STATUS[sync.status];
}

/** Ask which campus to keep: this phone's, or the one another phone uploaded since. Never merged. */
function openConflict(openModal: OpenModal, toast: Toast, sync: CloudSync): void {
  const conflict = sync.conflict;
  if (!conflict) return;
  openModal((close, card) => {
    card.append(el('h1', '', `Two saves of ${conflict.there.name}`), el('p', '', 'Another iPhone saved this campus since this one last synced. Keep one.'));
    const choice = (label: string, meta: CampusMeta, when: string, keep: () => Promise<void>): HTMLButtonElement => {
      const b = button('', 'decision-option', () => {
        b.disabled = true;
        void keep().then(close);
      });
      b.append(el('span', 'decision-label', label), el('span', 'decision-detail', `${standing(meta)} · ${when}`));
      return b;
    };
    card.append(
      choice('This iPhone’s', conflict.here, `played ${ago(conflict.here.simulatedAt, Date.now())}`, async () => {
        const snapshot = snapshotOf(store);
        if (snapshot) await sync.keepHere(snapshot);
        toast('Kept this iPhone’s campus.');
      }),
      choice('The other iPhone’s', conflict.there, `saved ${ago(conflict.there.uploadedAt, Date.now())}`, async () => {
        const text = await sync.keepThere();
        const problem = text === null ? 'Could not fetch it. Try again.' : store.adoptCloudSave(text);
        toast(problem ?? 'Loaded the other iPhone’s campus.', problem ? 'error' : 'info');
      }),
    );
  }, false);
}

function openAccountPage(openModal: OpenModal, toast: Toast, sync: CloudSync): void {
  openModal((close, card) => {
    card.append(el('h1', '', 'Account'));
    if (!sync.signedIn) {
      card.append(
        el('p', '', 'Keeps your campus safe, and on any iPhone you sign in on.'),
        button('Sign in with Apple', 'primary apple-sign-in', () => {
          void sync.signIn(snapshotOf(store)).then((result) => {
            if (result === 'failed') toast('Could not sign in. Try again.', 'error');
            // A choice between two campuses has opened by itself: it stays in front.
            if (result === 'ok' && !sync.conflict) openAccountPage(openModal, toast, sync);
          });
        }),
        button('Close', 'wide', close),
      );
      return;
    }

    const status = el('p', 'account-status', statusLine(sync));
    card.append(status);
    const list = el('div', 'account-campuses');
    card.append(el('h2', 'account-head', 'Your campuses'), list);
    void sync.campuses().then((campuses: CampusRecord[]) => {
      if (campuses.length === 0) list.append(el('p', 'fine', 'None yet. This campus goes up at its next save.'));
      for (const campus of campuses) {
        const here = campus.id === sync.campusId;
        const row = button('', here ? 'decision-option chosen' : 'decision-option', () => {
          if (here) return;
          if (row.dataset.armed !== 'yes') {
            row.dataset.armed = 'yes';
            tag.textContent = `Tap again to play it here. ${store.hasGame ? store.state.school.name : 'This campus'} stays in your account.`;
            return;
          }
          row.disabled = true;
          void (async () => {
            // This phone's campus goes up first, so nothing is lost by switching.
            const snapshot = snapshotOf(store);
            if (snapshot) await sync.syncNow(snapshot);
            // Another iPhone saved this one since: the choice has opened by itself.
            if (sync.conflict) return;
            const text = await sync.choose(campus.id);
            const problem = text === null ? 'Could not fetch it. Try again.' : store.adoptCloudSave(text);
            toast(problem ?? `Now playing ${campus.name}.`, problem ? 'error' : 'info');
            close();
          })();
        });
        const tag = el('span', 'decision-tag', here ? 'On this iPhone' : '');
        row.append(el('span', 'decision-label', campus.name), el('span', 'decision-detail', `${standing(campus)} · saved ${ago(campus.uploadedAt, Date.now())}`), tag);
        list.append(row);
      }
    });

    const syncNow = button('Sync now', 'wide', () => {
      const snapshot = snapshotOf(store);
      if (!snapshot) return;
      void sync.syncNow(snapshot).then(() => {
        if (!sync.conflict) status.textContent = statusLine(sync);
      });
    });
    const signOut = button('Sign out', 'wide', () => {
      void sync.signOut().then(close);
    });
    const remove = button('Delete account', 'wide danger', () => {
      if (remove.dataset.armed !== 'yes') {
        remove.dataset.armed = 'yes';
        remove.textContent = 'Tap again to delete your account and every campus in it';
        return;
      }
      remove.disabled = true;
      void sync.deleteAccount().then((reply) => {
        toast(reply ? 'Account deleted. The campus on this iPhone stays.' : 'Could not delete it. Try again.', reply ? 'info' : 'error');
        close();
      });
    });
    card.append(syncNow, signOut, remove, el('p', 'fine', 'Deleting the account deletes every campus in it. The campus on this iPhone stays.'), button('Close', 'wide', close));
  });
}

/**
 * Join the Account page to the game's modals. Returns null when cloud saves are off. A choice between two campuses
 * opens by itself, whenever the sync finds one.
 */
export function mountAccount(openModal: OpenModal, toast: Toast): { open: () => void } | null {
  const sync = cloudSync();
  if (!sync) return null;
  let asked: CloudSync['conflict'] = null;
  const watch = (): void => {
    if (sync.conflict && sync.conflict !== asked) {
      asked = sync.conflict;
      openConflict(openModal, toast, sync);
    }
  };
  sync.subscribe(watch);
  watch();
  return { open: () => openAccountPage(openModal, toast, sync) };
}
