import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The start for every new game (DESIGN.md 35.6): the model campus, for
 * everyone. The store is the same code the web build and the iOS app run,
 * with a variable standing in for the disk.
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
  clock: { now: () => h.now, follow: () => {}, reset: () => {}, skip: () => {}, offset: () => 0, restore: () => {} },
}));

import { Store } from '../src/app/store';
import {
  advance,
  applyAction,
  budget,
  buildings,
  enrollment,
  footballBooks,
  MODEL_STUDENTS,
  newGame,
  PLACED,
  previewPaint,
  scaleOf,
  serialize,
  toneProblem,
  validate,
  welcomeEdition,
  type GameState,
  type Point,
} from '../src/sim';
import { BENEFITS_SHARE } from '../src/sim/config/money';
import { welcomeView } from '../src/ui/deskUi';
import { DAY, freshGame, T0 } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  h.now = T0;
  h.disk.save = null;
  h.disk.backup = null;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const model = (scale?: number): GameState => newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model', ...(scale ? { scale } : {}) });

describe('a game started from the app', () => {
  it('is the model campus, with 46,000 students, whatever came before', () => {
    const app = new Store();
    app.foundUniversity('Larkspur University', 7);
    expect(enrollment(app.state)).toBe(MODEL_STUDENTS);
    expect(scaleOf(app.state)).toBeGreaterThan(1);
    expect(app.state.school.name).toBe('Larkspur University');
    expect(validate(app.state)).toBeNull();
    // It is already there, so its Menu has no visit.
    expect(app.offersVisit).toBe(false);
    // Its first screen is the paper's first issue, once.
    expect(app.welcome).toBe(true);
    app.welcomeSeen();
    expect(app.welcome).toBe(false);
  });

  it('is still the model campus after the app is closed and opened again, with no visit and no second welcome', async () => {
    const app = new Store();
    app.foundUniversity('Larkspur University', 7);
    await app.flush();
    const again = new Store();
    await again.load();
    expect(enrollment(again.state)).toBe(MODEL_STUDENTS);
    expect(again.offersVisit).toBe(false);
    expect(again.welcome).toBe(false);
  });
});

describe('a game already begun on the small campus', () => {
  // A small campus two days old, with its day already anchored, as any game played in the app has.
  const old = (): GameState => advance(newGame({ seed: 42, name: 'Test University', now: T0, anchor: 540 }), T0, T0 + 2 * DAY).state;

  it('loads exactly as it was, and still offers the visit', async () => {
    const saved = old();
    h.now = T0 + 2 * DAY;
    h.disk.save = serialize(saved, h.now);
    const app = new Store();
    await app.load();
    expect(app.state).toEqual(saved);
    expect(scaleOf(app.state)).toBe(1);
    expect(app.offersVisit).toBe(true);
    expect(app.welcome).toBe(false);
  });

  it('gets the model campus from "Start a new university", and then has no visit', async () => {
    h.now = T0 + 2 * DAY;
    h.disk.save = serialize(old(), h.now);
    const app = new Store();
    await app.load();
    app.foundUniversity('Second University', 7);
    expect(enrollment(app.state)).toBe(MODEL_STUDENTS);
    expect(app.offersVisit).toBe(false);
  });

  it('is what the sim still gives when nothing is asked, for the tests and the long runs', () => {
    const small = freshGame();
    expect(scaleOf(small)).toBe(1);
    expect(enrollment(small)).toBe(0);
  });
});

describe('nothing on the model campus is locked', () => {
  const cash = (state: GameState): GameState => {
    const rich = structuredClone(state);
    rich.money.cash = 1_000_000_000;
    return rich;
  };

  it('lets every hall be cleared, and gives the ground back', () => {
    const state = cash(model());
    const halls = buildings(state.map).filter((hall) => hall.stage > 0);
    expect(halls.length).toBe(72);
    for (const hall of halls) expect(previewPaint(state, 'clear', [[hall.x, hall.y]]).cells.length, `${hall.zone} at ${hall.x},${hall.y}`).toBe(1);
    const hall = halls.find((one) => one.zone === 'housing')!;
    const spot: Point = [hall.x, hall.y];
    const cleared = applyAction(state, { type: 'paint', tool: 'clear', cells: [spot] });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(buildings(cleared.state.map).length).toBe(71);
    expect(cleared.state.map.cells[hall.y * cleared.state.map.width + hall.x]!.kind).toBe('empty');

    // The same ground takes a lot of the other kind, or a path, with the ordinary tools.
    const zoned = applyAction(cleared.state, { type: 'paint', tool: 'academic', cells: [spot] });
    expect(zoned.ok).toBe(true);
    const path = applyAction(cleared.state, { type: 'paint', tool: 'path', cells: [spot] });
    expect(path.ok).toBe(true);
    if (zoned.ok) expect(validate(zoned.state)).toBeNull();
    if (path.ok) expect(validate(path.state)).toBeNull();
  });

  it('lets everything the Build menu sells be cleared, and keeps only what no campus can sell', () => {
    const state = cash(model());
    const placed = state.map.placed.filter((item) => !!item);
    expect(placed.length).toBeGreaterThan(40);
    const stays: string[] = [];
    for (const item of placed) {
      const can = previewPaint(state, 'clear', [[item!.x, item!.y]]).cells.length === 1;
      if (!can) stays.push(item!.type);
      else expect(PLACED[item!.type].buildable || item!.type === 'stadium', item!.type).toBe(true);
    }
    // The Administration building is where the university began, on this campus as on any other.
    expect(stays).toEqual(['admin']);
  });

  it('lets a path, a quad and a tree be laid on free ground, and a path be taken up', () => {
    const state = cash(model());
    const map = state.map;
    const free: Point[] = [];
    for (let i = 0; i < map.cells.length && free.length < 3; i++) {
      const spot: Point = [i % map.width, Math.floor(i / map.width)];
      if (map.cells[i]!.kind === 'empty' && previewPaint(state, 'path', [spot]).cells.length === 1) free.push(spot);
    }
    expect(free.length).toBe(3);
    for (const tool of ['path', 'quad', 'tree'] as const) {
      const result = applyAction(state, { type: 'paint', tool, cells: [free[0]!] });
      expect(result.ok, tool).toBe(true);
    }
    const walk = map.cells.findIndex((cell) => cell.kind === 'path');
    const taken = applyAction(state, { type: 'paint', tool: 'clear', cells: [[walk % map.width, Math.floor(walk / map.width)]] });
    expect(taken.ok).toBe(true);
  });
});

describe('the money a new game opens with', () => {
  it('keeps between $11 and $20 of every $100, clear of the edge of the range the game is tuned for', () => {
    const books = budget(model());
    expect(books.kept).toBeGreaterThan(11);
    expect(books.kept).toBeLessThan(20);
    // Two days into the first fall, when the semester's money has settled.
    const later = budget(advance(model(), T0, T0 + 2 * DAY).state);
    expect(later.kept).toBeGreaterThan(11);
  });

  it('pays for one football programme of real size: the same staff, travel and game days as a small campus at the same tier', () => {
    const big = footballBooks(model());
    const one = footballBooks(model(1));
    expect(big.staff).toBe(one.staff);
    expect(big.pay).toBe(one.pay);
    expect(Math.abs(big.operations - one.operations)).toBeLessThan(100);
    expect(big.upkeep).toBe(one.upkeep);
    // The rented field sells out on both, so football stands in the same place on both.
    const net = (ball: typeof big): number => ball.tickets + ball.tv - ball.pay * (1 + BENEFITS_SHARE) - ball.operations - ball.upkeep - ball.utilities;
    expect(Math.abs(net(big) - net(one))).toBeLessThan(1000);
    // It is a small line on a campus this size: under a tenth of a cent in every dollar spent.
    expect(Math.abs(net(big)) / budget(model()).spending).toBeLessThan(0.001);
  });
});

describe("the paper's first issue", () => {
  it('greets the new president and says what the campus is short of, from the campus as it stands', () => {
    const state = model();
    const paper = welcomeEdition(state);
    expect(paper.headline).toMatch(/President/);
    expect(paper.deck).toBe('The campus is yours from today: 46,000 students, and $40,686,000 in the bank.');
    const kinds = paper.top.map((item) => item.kind);
    expect(kinds).toEqual(['intake', 'problem', 'game', 'money']);
    expect(paper.top[0]!.text).toMatch(/^The next class is [\d,]+ strong\. The campus is [\d,]+ beds and [\d,]+ classroom seats short of fitting them\.$/);
    expect(paper.top[1]!.text).toMatch(/^A Medical Center and Campus Safety both reach \d+ of the 36 residence halls\. The other \d+ are on their own\.$/);
    expect(paper.top[2]!.text).toBe('The team plays on a rented field of 3,000 seats. The stadium plot stands bare.');
    expect(paper.top[3]!.text).toBe('The campus keeps $12 of every $100 that comes in.');
    // The student poll is on the front, and nothing is folded away.
    expect(paper.poll.length).toBeGreaterThan(0);
    expect(paper.folded).toBe(0);
    expect(paper.scores).toEqual([]);
    expect(welcomeEdition(state)).toEqual(paper);
  });

  it('gives no instructions, keeps to the tone guide and writes its numbers so they can be read', () => {
    const paper = welcomeEdition(model());
    for (const line of [paper.headline, paper.deck, ...paper.top.map((item) => item.text)]) {
      expect(toneProblem(line), line).toBeNull();
      expect(line, line).not.toMatch(/\d{5,}/);
      expect(line, line).not.toMatch(/\b(build|add|place|tap|should|must|need to)\b/i);
    }
  });

  it('says only what is true: with a stadium, room for the class and every hall in reach, those lines are gone', () => {
    const state = structuredClone(model());
    state.football.stadium.tier = 1;
    const paper = welcomeEdition(state);
    expect(paper.top.some((item) => item.kind === 'game')).toBe(false);
    const view = welcomeView(model());
    expect(view.front).toBe(true);
    expect(view.restLabel).toBe('');
    expect(view.leave).toBe('See your campus');
    expect(view.awayFor).toBe('First edition');
  });
});
