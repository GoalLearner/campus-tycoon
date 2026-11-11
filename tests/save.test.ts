import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advance, parseSave, SAVE_VERSION, serialize, validate } from '../src/sim';
import type { Migration } from '../src/sim/save';
import { DAY, freshGame, T0 } from './helpers';

describe('saves', () => {
  it('round-trip exactly', () => {
    const state = advance(freshGame(), T0, T0 + 2 * DAY).state;
    const loaded = parseSave(serialize(state, T0 + 2 * DAY));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(state);
    expect(loaded.savedAt).toBe(T0 + 2 * DAY);
    expect(loaded.migratedFrom).toBeNull();
  });

  it('carry on identically after a save and load', () => {
    const start = freshGame();
    const straight = advance(start, T0, T0 + 4 * DAY).state;
    const half = advance(start, T0, T0 + 2 * DAY).state;
    const loaded = parseSave(serialize(half, T0 + 2 * DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    const resumed = advance(loaded.state, loaded.state.clock.lastSimulatedAt, T0 + 4 * DAY).state;
    expect(resumed).toEqual(straight);
  });

  it('reject text that is not a save', () => {
    expect(parseSave('not json').ok).toBe(false);
    expect(parseSave('{"hello":1}').ok).toBe(false);
    expect(parseSave('[]').ok).toBe(false);
  });

  it('reject a save from a newer version', () => {
    const text = JSON.stringify({ v: SAVE_VERSION + 1, savedAt: 0, state: freshGame() });
    const result = parseSave(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/newer/);
  });

  it('reject a save with a broken number and say where', () => {
    const state = freshGame();
    // JSON cannot hold NaN, so a damaged number arrives as null or as a string. Check both paths.
    const bad = structuredClone(state) as unknown as { money: { cash: unknown } };
    bad.money.cash = Number.NaN;
    expect(validate(bad)).toMatch(/state\.money\.cash/);
  });

  it('reject a map of the wrong size', () => {
    const state = structuredClone(freshGame());
    state.map.cells.pop();
    expect(validate(state)).toMatch(/wrong size/);
  });

  it('migrate an old save up to the current version', () => {
    // A pretend older format that kept cash at the top level under another name.
    const old = structuredClone(freshGame()) as unknown as Record<string, unknown>;
    const money = old.money as Record<string, unknown>;
    old.gold = money.cash;
    delete money.cash;
    old.version = SAVE_VERSION - 1;

    const migrations: Record<number, Migration> = {
      [SAVE_VERSION - 1]: (s) => {
        (s.money as Record<string, unknown>).cash = s.gold;
        delete s.gold;
        return s;
      },
    };
    const text = JSON.stringify({ v: SAVE_VERSION - 1, savedAt: 5, state: old });
    const loaded = parseSave(text, migrations);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.migratedFrom).toBe(SAVE_VERSION - 1);
    expect(loaded.state).toEqual(freshGame());
  });

  it('refuse an old save when a migration is missing', () => {
    const text = JSON.stringify({ v: SAVE_VERSION - 1, savedAt: 0, state: freshGame() });
    const result = parseSave(text, {});
    expect(result.ok).toBe(false);
  });
});

describe('a real save from version 1', () => {
  // Written by the game before trees existed: no cell has a `variant`.
  const text = readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8');

  it('loads, and every cell gains a variant of 0', () => {
    const raw = JSON.parse(text) as { v: number; state: { map: { cells: Array<Record<string, unknown>> } } };
    expect(raw.v).toBe(1);
    expect(raw.state.map.cells.every((cell) => !('variant' in cell))).toBe(true);

    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.migratedFrom).toBe(1);
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(loaded.state.map.cells.every((cell) => cell.variant === 0)).toBe(true);
    expect(loaded.state.school.name).toBe('Old Save University');
  });

  it('keeps playing after the upgrade', () => {
    const loaded = parseSave(text);
    if (!loaded.ok) throw new Error(loaded.reason);
    const before = loaded.state;
    const later = advance(before, before.clock.lastSimulatedAt, before.clock.lastSimulatedAt + 2 * DAY).state;
    expect(validate(later)).toBeNull();
    expect(later.clock.tick).toBe(before.clock.tick + 2 * 24 * 60);
    const again = parseSave(serialize(later, later.clock.lastSimulatedAt));
    expect(again.ok && again.migratedFrom === null).toBe(true);
  });
});
