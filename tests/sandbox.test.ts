import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The sandbox (chaos C5, DESIGN.md 79). The store is the app's own; only where the text is kept is a stand-in for the
 * disk, keyed as the phone keys it, with every write recorded, so a test can say which keys a sandbox ever wrote.
 */
const h = vi.hoisted(() => ({
  now: 0,
  disk: new Map<string, string>(),
  writes: [] as string[],
}));

vi.mock('../src/app/persistence', () => {
  const key = (slot: string | undefined, what: string): string => `${slot ?? 'real'}:${what}`;
  const set = (k: string, v: string): void => {
    h.disk.set(k, v);
    h.writes.push(k);
  };
  return {
    readSaves: async (slot?: string) => ({ save: h.disk.get(key(slot, 'save')) ?? null, backup: h.disk.get(key(slot, 'backup')) ?? null }),
    writeSave: async (text: string, slot?: string) => {
      const previous = h.disk.get(key(slot, 'save'));
      if (previous) set(key(slot, 'backup'), previous);
      set(key(slot, 'save'), text);
    },
    clearSaves: async (slot?: string) => {
      for (const what of ['save', 'backup', 'web']) {
        h.disk.delete(key(slot, what));
        h.writes.push(key(slot, what));
      }
    },
    readSlots: async () => {
      const text = h.disk.get('slots');
      return text ? JSON.parse(text) : { open: 'real', names: {} };
    },
    writeSlots: async (record: unknown) => set('slots', JSON.stringify(record)),
    readWebRecord: async (slot?: string) => h.disk.get(key(slot, 'web')) ?? null,
    writeWebRecord: async (record: string, slot?: string) => set(key(slot, 'web'), record),
    requestPersistentStorage: async () => true,
  };
});
vi.mock('../src/app/clock', () => ({
  clock: { now: () => h.now, follow: () => {}, reset: () => {}, skip: () => {}, offset: () => 0, restore: () => {} },
}));

import { Store } from '../src/app/store';
import { advance, applyAction, newGame, parseSave, serialize, TICK_MS, type GameState } from '../src/sim';
import { MEDDLE } from '../src/sim/config/meddle';
import { WEB_WEEK_TICKS } from '../src/sim/config/web';
import { makeSandbox, SANDBOX_CASH } from '../src/sim/systems/sandbox';
import { stepChaos } from '../src/sim/systems/chaos';
import { meddleCost, cooldownLeft, meddleView } from '../src/sim/systems/meddle';
import type { LogEntry } from '../src/sim/types';

const HOUR = 60 * TICK_MS;
const DAY = 24 * HOUR;
/** His kind of save: a model campus played once a day for two game years (scripts/make-mature-fixture.ts). */
const MATURE = readFileSync(new URL('./fixtures/save-v39-mature-model.json', import.meta.url), 'utf8');
const savedAt = (): number => JSON.parse(MATURE).savedAt as number;

function realKeysWritten(from: number): string[] {
  return h.writes.slice(from).filter((k) => k.startsWith('real:'));
}

/** A store that opened the mature save as the player's own campus, an hour after it was saved. */
async function opened(): Promise<Store> {
  const store = new Store();
  expect(await store.load()).toBe(true);
  return store;
}

beforeEach(() => {
  h.disk = new Map([
    ['real:save', MATURE],
    ['real:web', 'the real campus web record'],
  ]);
  h.writes = [];
  h.now = savedAt() + HOUR;
});

describe('the sandbox (C5, DESIGN.md 79)', () => {
  it('in the game: money without end, no letters from the trustees, every Meddle tool free and never resting', () => {
    const real = newGame({ seed: 77, name: 'Test University', now: Date.UTC(2026, 0, 5), campus: 'model' });
    const sand = structuredClone(real);
    makeSandbox(sand);
    expect(sand.sandbox).toBe(true);
    expect(sand.money.cash).toBe(SANDBOX_CASH);
    // Spent down, it is topped up on the next minute.
    sand.money.cash = 5;
    const later = advance(sand, sand.clock.lastSimulatedAt, sand.clock.lastSimulatedAt + 2 * TICK_MS).state;
    expect(later.money.cash).toBeGreaterThanOrEqual(SANDBOX_CASH);
    for (const spec of MEDDLE) {
      expect(meddleCost(later, spec)).toEqual({ cash: 0, seals: 0 });
    }
    const used = applyAction(later, { type: 'meddle', id: 'festival' });
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    expect(cooldownLeft(used.state, 'festival')).toBe(0);
    expect(applyAction(used.state, { type: 'meddle', id: 'festival' }).ok).toBe(true);
    expect(meddleView(used.state)?.sandbox).toBe(true);
    // Two Rowdy weeks in a row: the real campus's trustees write; a sandbox has none.
    const letters = (state: GameState): number => {
      const log: LogEntry[] = [];
      state.chaos.week = Math.floor(state.clock.tick / WEB_WEEK_TICKS);
      for (let k = 0; k < 4; k++) {
        state.chaos.tally.dustUp = 100_000;
        state.clock.tick += WEB_WEEK_TICKS;
        stepChaos(state, log);
      }
      return state.chaos.letters.sent;
    };
    expect(letters(structuredClone(real))).toBeGreaterThan(0);
    const quiet = structuredClone(real);
    makeSandbox(quiet);
    expect(letters(quiet)).toBe(0);
  });

  it("leaves the player's own campus exactly as it was: a full round trip on a mature save, nothing written under its keys", async () => {
    const store = await opened();
    expect(store.inSandbox).toBe(false);
    const real = store.state;
    expect(real.sandbox).toBeUndefined();
    expect(real.daily.level).toBeGreaterThan(10);
    await store.flush();
    const realText = h.disk.get('real:save')!;
    const realWeb = h.disk.get('real:web');
    const told: boolean[] = [];
    store.onSaved((away) => told.push(away));

    // Into the sandbox: the player's own campus saved first, as it was (the same text), then a copy under its own keys,
    // its social web copied too. From here on nothing goes under the real campus's keys.
    expect(await store.copyToSandbox()).toBeNull();
    expect(h.disk.get('real:save')).toBe(realText);
    told.length = 0;
    const mark = h.writes.length;
    expect(store.inSandbox).toBe(true);
    expect(store.state.sandbox).toBe(true);
    expect(store.state.school.name).toBe(real.school.name);
    expect(h.disk.get('sandbox:web')).toBe(realWeb);
    expect(JSON.parse(h.disk.get('slots')!).open).toBe('sandbox');

    // Everything a player might do there: spend, meddle with every tool, clear and build, change the colour, let days
    // pass, level up, collect.
    for (const spec of MEDDLE) store.dispatch({ type: 'meddle', id: spec.id });
    const dorm = store.state.map.buildings.find((b) => b && b.zone === 'housing' && b.stage > 0)!;
    expect(store.dispatch({ type: 'paint', tool: 'clear', cells: [[dorm.x, dorm.y]] }).ok).toBe(true);
    store.dispatch({ type: 'colour', colour: real.football.colour === 'gold' ? 'teal' : 'gold' });
    store.dispatch({ type: 'instruction', step: 3 });
    store.dispatch({ type: 'marketing', step: 5 });
    store.dispatch({ type: 'collectAll' });
    store.dispatch({ type: 'takeGift' });
    store.dispatch({ type: 'policy', id: 'quietHours', on: !real.policies.on.includes('quietHours') });
    h.now += 2 * DAY;
    store.catchUp();
    for (const spec of MEDDLE) store.dispatch({ type: 'meddle', id: spec.id });
    await store.flush();
    const sandboxState = structuredClone(store.state);
    expect(sandboxState.money.cash).toBeGreaterThanOrEqual(SANDBOX_CASH - 1e9);

    // Nothing was ever written under the real campus's keys, and the cloud was never told.
    expect(realKeysWritten(mark)).toEqual([]);
    expect(h.disk.get('real:save')).toBe(realText);
    expect(h.disk.get('real:web')).toBe(realWeb);
    expect(told).toEqual([]);

    // Back home: the player's own campus is what its save makes of now, exactly as a phone that never had a sandbox.
    expect(await store.switchTo('real')).toBe(true);
    expect(store.inSandbox).toBe(false);
    const control = new Store();
    h.disk.set('real:save', realText);
    const keep = new Map(h.disk);
    h.disk = new Map([['real:save', realText]]);
    expect(await control.load()).toBe(true);
    h.disk = keep;
    expect(store.state).toEqual(control.state);
    expect(store.state.sandbox).toBeUndefined();
    expect(store.state.daily.level).toBe(real.daily.level);
    expect(store.state.daily.seals).toBe(control.state.daily.seals);
    expect(store.state.chaos.meddle.used).toEqual(real.chaos.meddle.used);

    // And the sandbox is still there as it was left, its levels and Seals its own.
    expect(await store.switchTo('sandbox')).toBe(true);
    expect(store.state.sandbox).toBe(true);
    expect(store.state.chaos.meddle.used).toEqual(sandboxState.chaos.meddle.used);
    expect(store.state.map.buildings.find((b) => b?.id === dorm.id)).toBeFalsy();
  });

  it('opens where it was left, never puts a sandbox into the real campus, and deleting the sandbox goes home untouched', async () => {
    const store = await opened();
    await store.flush();
    const realText = h.disk.get('real:save')!;
    await store.copyToSandbox();
    store.dispatch({ type: 'meddle', id: 'party' });
    await store.flush();
    // A reload in the sandbox opens the sandbox.
    const again = new Store();
    expect(await again.load()).toBe(true);
    expect(again.inSandbox).toBe(true);
    expect(again.state.sandbox).toBe(true);
    expect(again.realName).toBe(store.state.school.name);
    // A sandbox's save cannot become the player's own campus, and nothing is loaded into the sandbox.
    expect(again.importSave(realText)).toMatch(/your own campus/);
    await again.switchTo('real');
    const sandboxText = h.disk.get('sandbox:save')!;
    expect(parseSave(sandboxText).ok).toBe(true);
    expect(again.importSave(sandboxText)).toMatch(/sandbox/);
    expect(h.disk.get('real:save')).toBe(realText);
    // Deleting the sandbox forgets it alone, and the player's own campus opens.
    await again.switchTo('sandbox');
    const mark = h.writes.length;
    await again.deleteGame();
    expect(again.inSandbox).toBe(false);
    expect(again.hasGame).toBe(true);
    expect(again.state.sandbox).toBeUndefined();
    expect(h.disk.has('sandbox:save')).toBe(false);
    expect(again.hasSandbox).toBe(false);
    expect(realKeysWritten(mark)).toEqual([]);
    expect(h.disk.get('real:save')).toBe(realText);
  });

  it('a sandbox founded from the first screen is its own campus, and a phone with no campus of its own stays without one', async () => {
    h.disk = new Map();
    const store = new Store();
    expect(await store.load()).toBe(false);
    await store.foundSandbox('Try-Out University');
    expect(store.inSandbox).toBe(true);
    expect(store.state.sandbox).toBe(true);
    expect(store.state.money.cash).toBe(SANDBOX_CASH);
    expect(store.realName).toBeNull();
    expect(h.disk.has('real:save')).toBe(false);
    expect([...h.disk.keys()].filter((k) => k.startsWith('real:'))).toEqual([]);
    // A real campus founded later goes under its own keys, and the sandbox waits.
    store.foundUniversity('Test University');
    await store.flush();
    expect(store.inSandbox).toBe(false);
    expect(store.state.sandbox).toBeUndefined();
    expect(h.disk.has('real:save')).toBe(true);
    expect(h.disk.has('sandbox:save')).toBe(true);
    expect(store.hasSandbox).toBe(true);
  });

  it('the fixture is a mature campus, saved at version 39', () => {
    const parsed = parseSave(MATURE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.migratedFrom === null || parsed.migratedFrom === 39).toBe(true);
    expect(parsed.state.story?.mc).toBeTruthy();
    expect(parsed.state.daily.level).toBeGreaterThanOrEqual(20);
    expect(serialize(parsed.state, savedAt()).length).toBeGreaterThan(200_000);
  });
});
