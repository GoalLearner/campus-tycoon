import type { GameState } from '../sim';
import { KIND, SLOTS } from '../sim/config/web';
import type { StudentRef } from '../sim/systems/students';
import { webWeekOf } from '../sim/systems/web';
import { readWebRecord, writeWebRecord } from './persistence';
import type { WebReply, WebRequest } from './webWorker';
import { idIn, type WebView } from './socialView';

/**
 * The social web on the main thread (DESIGN.md 63.5): it runs the worker, hands it the campus once a game week, keeps
 * the web's save record (decision 3: a record of its own, written once a game week, so the everyday save stays small)
 * and a copy of the web for the cards to read.
 */

interface Host {
  state: GameState;
  hasGame: boolean;
  isEphemeral: boolean;
  subscribe(listener: () => void): () => void;
}

const listeners = new Set<() => void>();

export const socialWeb = {
  /** What the cards read: null until the worker's first answer. */
  view: null as WebView | null,
  /** How the last job went, for the dev page. */
  stats: null as WebReply['stats'] | null,
  /** The stored record's length, as text. */
  recordBytes: 0,
  onChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

let worker: Worker | null = null;
let busy = false;
let wanted: WebRequest | null = null;
let campus = '';
let posted = -1;

function send(request: WebRequest): void {
  if (!worker) return;
  if (busy) {
    // One job at a time: the latest waits, any older one is dropped.
    wanted = request.type === 'start' || wanted?.type !== 'start' ? request : wanted;
    return;
  }
  busy = true;
  worker.postMessage(request);
}

/** Start the web for the game the host has, and follow it: a new game starts a new web. */
export function startSocialWeb(host: Host): void {
  if (worker || typeof Worker === 'undefined') return;
  worker = new Worker(new URL('./webWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WebReply>) => {
    busy = false;
    const reply = event.data;
    socialWeb.view = reply.view;
    socialWeb.stats = reply.stats;
    socialWeb.recordBytes = reply.record.length;
    if (!host.isEphemeral) void writeWebRecord(reply.record);
    for (const listener of listeners) listener();
    const next = wanted;
    wanted = null;
    if (next) send(next);
  };
  const follow = async (): Promise<void> => {
    if (!host.hasGame) return;
    const state = host.state;
    const id = `${state.seed}:${state.clock.createdAt}`;
    const week = webWeekOf(state);
    if (id !== campus) {
      campus = id;
      posted = week;
      // The saved web, for this campus only: another campus's record is not read.
      const record = host.isEphemeral ? null : await readWebRecord();
      send({ type: 'start', state, record, week });
      return;
    }
    if (week > posted) {
      posted = week;
      send({ type: 'week', state, week });
    }
  };
  host.subscribe(() => void follow());
  void follow();
}

/** Their roommate in the web, or undefined when the web has not answered yet (null: no roommate). */
export function roommateInWeb(ref: StudentRef): StudentRef | null | undefined {
  const view = socialWeb.view;
  if (!view) return undefined;
  const id = idIn(view, ref);
  if (id < 0) return undefined;
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = view.other[s]!;
    if (b >= 0 && view.kind[s] === KIND.roommate) return { entryYear: view.ring[Math.floor(b / view.classSlot)]!, index: b % view.classSlot };
  }
  return null;
}
