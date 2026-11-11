import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Closing and reopening the real app, minus the screen. The store is the same
 * code the web build and the iOS app run; only where the save text is kept
 * differs, and here that is a variable standing in for the disk. A force
 * close is a store that is dropped without being told: whatever was last
 * written is all that survives.
 */
const h = vi.hoisted(() => ({
  now: 0,
  disk: { save: null as string | null, backup: null as string | null },
}));

vi.mock('../src/app/persistence', () => ({
  readSaves: async () => ({ ...h.disk }),
  writeSave: async (text: string) => {
    h.disk.backup = h.disk.save;
    h.disk.save = text;
  },
  clearSaves: async () => {
    h.disk.save = null;
    h.disk.backup = null;
  },
  requestPersistentStorage: async () => true,
}));
vi.mock('../src/app/clock', () => ({
  clock: { now: () => h.now, follow: () => {}, reset: () => {}, skip: () => {}, offset: () => 0 },
}));

import { AWAY_LOG_LIMIT, backupReminder, mergeAway, readSavedApp, type AwayReport } from '../src/app/away';
import { Store } from '../src/app/store';
import { advance, applyAction, enrollment, FIRST_INTAKE_TICK, parseSave, rowBetween, serialize, type Action, type GameState } from '../src/sim';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

beforeEach(() => {
  // Saves are scheduled with timers. Frozen timers mean a save lands only when a test says it did.
  vi.useFakeTimers();
  h.now = T0;
  h.disk.save = null;
  h.disk.backup = null;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

interface Killed {
  /** The same game played without ever closing, as it stood after its last action. */
  reference: GameState;
  /** What was on disk when the app died. */
  saved: GameState;
  killedAt: number;
}

/**
 * Found a campus, zone lots, wait until they are being built, let that save
 * land, play on for forty seconds and then die without warning.
 */
async function playUntilKilled(): Promise<Killed> {
  const live = new Store();
  live.startNewGame('Test University');
  live.state.money.cash = 5_000_000;
  let reference = structuredClone(live.state);

  const act = (action: Action): void => {
    const result = live.dispatch(action);
    if (!result.ok) throw new Error(result.error);
    reference = advance(reference, reference.clock.lastSimulatedAt, h.now).state;
    const mirrored = applyAction(reference, action);
    if (!mirrored.ok) throw new Error(mirrored.error);
    reference = mirrored.state;
  };

  // The app is open while the first class moves in, ticking once a minute as the real one does.
  for (let minute = 0; minute <= FIRST_INTAKE_TICK; minute++) {
    h.now += MIN;
    live.catchUp();
  }
  expect(live.away).toBeNull();
  act({ type: 'paint', tool: 'academic', cells: rowBetween([4, 13], [9, 13]) });
  act({ type: 'paint', tool: 'housing', cells: rowBetween([8, 18], [14, 18]) });

  // The app sits open, ticking, until builders are on site.
  for (let minute = 0; minute < 40 && live.state.timers.length === 0; minute++) {
    h.now += MIN;
    live.catchUp();
  }
  expect(live.state.timers.length).toBeGreaterThan(0);
  await live.flush();
  const saved = parseSave(h.disk.save!);
  if (!saved.ok) throw new Error(saved.reason);
  expect(saved.state.timers.length).toBeGreaterThan(0);

  // Forty more seconds of play that never reach the disk, then the app is gone.
  h.now += 40_000;
  live.catchUp();
  return { reference, saved: saved.state, killedAt: h.now };
}

/** The reference game run on without a break, in many small steps, as an app left open would. */
function runOn(state: GameState, until: number, stepMs: number): GameState {
  let current = state;
  for (let at = current.clock.lastSimulatedAt + stepMs; at < until; at += stepMs) current = advance(current, current.clock.lastSimulatedAt, at).state;
  return advance(current, current.clock.lastSimulatedAt, until).state;
}

describe('a force close in the middle of construction', () => {
  for (const [label, gap, step] of [
    ['one hour', HOUR, 7 * MIN],
    ['one day', DAY, 7 * MIN],
    ['seven days', 7 * DAY, 61 * MIN],
  ] as const) {
    it(`reopens after ${label} exactly where a game that never closed would be`, async () => {
      const killed = await playUntilKilled();
      h.now = killed.killedAt + gap;

      const reopened = new Store();
      expect(await reopened.load()).toBe(true);
      const continuous = runOn(killed.reference, h.now, step);
      expect(reopened.state).toEqual(continuous);
      // The builders finished while the app was closed. Nothing waited for a tap.
      expect(reopened.state.timers.length).toBeLessThan(killed.saved.timers.length + 1);
      expect(reopened.state.map.buildings.filter((b) => b && b.stage >= 1).length).toBeGreaterThan(killed.saved.map.buildings.filter((b) => b && b.stage >= 1).length);

      // The away list is everything that happened since the last save, in order.
      const missed = advance(killed.saved, killed.saved.clock.lastSimulatedAt, h.now);
      expect(reopened.away).not.toBeNull();
      expect(reopened.away!.log).toEqual(missed.log);
      expect(reopened.away!.studentsBefore).toBe(enrollment(killed.saved));
      expect(reopened.away!.studentsAfter).toBe(enrollment(continuous));
    }, 60_000);
  }

  it('loses nothing when the clock has not moved at all', async () => {
    const killed = await playUntilKilled();
    const reopened = new Store();
    expect(await reopened.load()).toBe(true);
    expect(reopened.state).toEqual(advance(killed.reference, killed.reference.clock.lastSimulatedAt, h.now).state);
  });
});

describe('the away list', () => {
  it('is still there after the app is closed before it is read, with anything newer added', async () => {
    const killed = await playUntilKilled();
    h.now = killed.killedAt + DAY;
    const second = new Store();
    await second.load();
    const first = second.away!;
    expect(first.log.length).toBeGreaterThan(0);
    // The save a moment after opening lands, list and all. Then the app is closed unread.
    await second.flush();

    h.now += 5 * MIN;
    const third = new Store();
    await third.load();
    expect(third.away).not.toBeNull();
    expect(third.away!.minutes).toBe(first.minutes + 5);
    expect(third.away!.log.slice(0, first.log.length)).toEqual(first.log);
    expect(third.away!.cashBefore).toBe(first.cashBefore);
    expect(third.away!.studentsBefore).toBe(first.studentsBefore);
    expect(third.away!.cashAfter).toBe(third.state.money.cash);

    // Read at last. It does not come back.
    third.awaySeen(third.away!);
    expect(third.away).toBeNull();
    await third.flush();
    h.now += 2 * MIN;
    const fourth = new Store();
    await fourth.load();
    expect(fourth.away).toBeNull();
  });

  it('is rebuilt whole when the app dies before the save after opening lands', async () => {
    const killed = await playUntilKilled();
    h.now = killed.killedAt + DAY;
    const second = new Store();
    await second.load();
    const first = second.away!;
    // No flush: the app is killed within a second of opening.

    h.now += 5 * MIN;
    const third = new Store();
    await third.load();
    expect(third.away!.minutes).toBe(first.minutes + 5);
    expect(third.away!.log.slice(0, first.log.length)).toEqual(first.log);
    expect(third.state).toEqual(runOn(killed.reference, h.now, 13 * MIN));
  });

  it('keeps what was added while an older list was on screen', async () => {
    const killed = await playUntilKilled();
    h.now = killed.killedAt + DAY;
    const store = new Store();
    await store.load();
    const shown = store.away!;
    // The phone is put down for two hours with the list still up, then picked up again.
    h.now += 2 * HOUR;
    store.catchUp();
    expect(store.away).not.toBe(shown);
    store.awaySeen(shown);
    expect(store.away).not.toBeNull();
    expect(store.away!.minutes).toBe(shown.minutes + 120);
  });

  it('is not carried in an exported backup, and a backup loads without one', async () => {
    const killed = await playUntilKilled();
    h.now = killed.killedAt + DAY;
    const store = new Store();
    await store.load();
    expect(store.away).not.toBeNull();
    const backup = store.exportText();
    expect(JSON.parse(backup).app).toBeUndefined();
    expect(store.importSave(backup)).toBeNull();
    expect(store.away).toBeNull();
    // Loading a backup counts as having one, as old as the file.
    expect(store.lastExportAt).toBe(h.now);
  });

  it('never grows without limit, and survives a damaged save', () => {
    const entry = (tick: number) => ({ tick, kind: 'intake' as const, text: 'x' });
    const report = (count: number, from: number): AwayReport => ({
      minutes: count,
      weeksSkipped: 0,
      log: Array.from({ length: count }, (_, i) => entry(from + i)),
      cashBefore: from,
      cashAfter: from + count,
      studentsBefore: 1,
      studentsAfter: 2,
    });
    const merged = mergeAway(report(AWAY_LOG_LIMIT, 0), report(10, AWAY_LOG_LIMIT));
    expect(merged.log.length).toBe(AWAY_LOG_LIMIT);
    expect(merged.log[merged.log.length - 1]!.tick).toBe(AWAY_LOG_LIMIT + 9);
    expect(merged.cashBefore).toBe(0);

    expect(readSavedApp(null)).toEqual({ away: null, lastExportAt: null });
    expect(readSavedApp({ away: { minutes: 'soon' }, lastExportAt: 'never' })).toEqual({ away: null, lastExportAt: null });
    // An older save has no app part at all, and still loads.
    const old = parseSave(serialize(freshGame(), T0));
    expect(old.ok && old.app).toBeNull();
  });
});

describe('the backup reminder on the web', () => {
  const base = { native: false, persistent: true, lastExportAt: null as number | null, createdAt: T0, now: T0 };

  it('says nothing in the iOS app, whatever else is true', () => {
    expect(backupReminder({ ...base, native: true, persistent: false, now: T0 + 400 * DAY })).toBeNull();
  });

  it('says nothing while the browser keeps the save and a backup is under five days old', () => {
    expect(backupReminder(base)).toBeNull();
    expect(backupReminder({ ...base, now: T0 + 5 * DAY })).toBeNull();
    expect(backupReminder({ ...base, lastExportAt: T0 + 20 * DAY, now: T0 + 24 * DAY })).toBeNull();
  });

  it('asks for a backup once the last one is more than five days old', () => {
    expect(backupReminder({ ...base, now: T0 + 5 * DAY + MIN })).toMatch(/not exported a backup/);
    expect(backupReminder({ ...base, lastExportAt: T0, now: T0 + 6 * DAY })).toMatch(/6 days ago.*fresh one/);
  });

  it('always speaks up when the browser has not agreed to keep the save', () => {
    expect(backupReminder({ ...base, persistent: false })).toMatch(/may clear a save.*Export a backup/);
    expect(backupReminder({ ...base, persistent: false, lastExportAt: T0, now: T0 + HOUR })).toMatch(/last backup was today\.$/);
    expect(backupReminder({ ...base, persistent: false, lastExportAt: T0, now: T0 + 9 * DAY })).toMatch(/9 days ago.*fresh one/);
  });
});
