import { describe, expect, it } from 'vitest';
import { applyAction, advance, isBikeKind, isPathKind, newGame, paintCost, scaleOf, toneProblem, type GameState, type Point } from '../src/sim';
import { CAUSE_POSTS, CAUSE_TOPICS, POST } from '../src/sim/config/quadline';
import { hardLineProblem } from '../src/sim/config/hardLines';
import { ownedAt } from '../src/sim/systems/town';
import { touchesPath } from '../src/sim/systems/growth';
import { laneCount, lanePosts, lanesShort, LANE_POSTS_A_WEEK, PATH_CELLS_PER_LANE } from '../src/app/wheels';
import { searchRide } from '../src/game/afoot';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';
import { viewOf } from '../src/app/socialView';
import { feedOf } from '../src/app/quadline';

/**
 * Bike paths (DESIGN.md 71, the owner's "a bike path exclusive for skateboarders and bikers"): a tool beside Path, for
 * riders only, about a path's price. Walkers cross only where a footpath crosses it. Visual and travel only: nothing
 * else in the game changes for one.
 */

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const small = (): GameState => newGame({ seed: 35, name: 'Test University', now: T0 });
const kindAt = (state: GameState, [x, y]: Point): string => state.map.cells[y * state.map.width + x]!.kind;
const paint = (state: GameState, tool: 'bike' | 'path' | 'road' | 'clear', cells: Point[]): GameState => {
  const done = applyAction(state, { type: 'paint', tool, cells });
  if (!done.ok) throw new Error(done.error);
  return done.state;
};

/** A run of open ground the campus owns, `n` cells along a row, with open ground on both sides. */
function openRow(state: GameState, n: number): Point[] {
  const { width, height, cells } = state.map;
  const open = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x]!.kind === 'empty' && ownedAt(state.map, x, y);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 0; x + n <= width; x++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = open(x + k, y) && open(x + k, y - 1) && open(x + k, y + 1);
      if (ok) return Array.from({ length: n }, (_, k) => [x + k, y] as Point);
    }
  }
  throw new Error('no open row');
}

describe('the bike path tool', () => {
  it('lays a bike path on open ground at a path’s price, and is cleared like one', () => {
    const state = small();
    const row = openRow(state, 4);
    const cash = state.money.cash;
    const laid = paint(state, 'bike', row);
    for (const cell of row) expect(kindAt(laid, cell)).toBe('bike');
    expect(cash - laid.money.cash).toBe(4 * paintCost('bike', scaleOf(state)));
    expect(paintCost('bike', 1)).toBe(paintCost('path', 1));
    // Cleared inside the undo minute, the whole price comes back.
    const cleared = paint(laid, 'clear', row);
    for (const cell of row) expect(kindAt(cleared, cell)).toBe('empty');
    expect(cleared.money.cash).toBe(cash);
  });

  it('makes the walkers’ crossing where it meets a footpath, either way round, and a road cannot go on it', () => {
    const state = small();
    const [a, b, c] = openRow(state, 3) as [Point, Point, Point];
    const path = paint(state, 'path', [a, b, c]);
    // A bike path laid over a footpath: a crossing, both at once.
    const over = paint(path, 'bike', [b]);
    expect(kindAt(over, b)).toBe('bikeCrossing');
    // A footpath laid over a bike path: the same.
    const lane = paint(state, 'bike', [a, b, c]);
    const across = paint(lane, 'path', [b]);
    expect(kindAt(across, b)).toBe('bikeCrossing');
    expect(applyAction(lane, { type: 'paint', tool: 'road', cells: [b] }).ok).toBe(false);
    // The crossing is a footpath for walkers and lots; the bike path alone is not.
    expect(isPathKind('bikeCrossing')).toBe(true);
    expect(isPathKind('bike')).toBe(false);
    expect(isBikeKind('bike') && isBikeKind('bikeCrossing')).toBe(true);
    expect(isBikeKind('path')).toBe(false);
    // Cleared inside the undo minute, a crossing gives back both.
    const back = paint(over, 'clear', [b]);
    expect(kindAt(back, b)).toBe('empty');
    expect(back.money.cash - over.money.cash).toBe(paintCost('bike', scaleOf(state)) + paintCost('path', scaleOf(state)));
  });

  it('gives a lot no way in: a lot must touch a footpath, and a bike path is not one', () => {
    const state = small();
    const [a, b] = openRow(state, 2) as [Point, Point];
    const lane = paint(state, 'bike', [b]);
    expect(touchesPath(lane.map, a[0], a[1])).toBe(touchesPath(state.map, a[0], a[1]));
    const crossing = paint(paint(state, 'path', [b]), 'bike', [b]);
    expect(touchesPath(crossing.map, a[0], a[1])).toBe(true);
  });

  it('changes nothing else in the game: no walk times, no looks, no upkeep, nothing a day on', () => {
    const state = small();
    const row = openRow(state, 5);
    const lane = paint(state, 'bike', row);
    // As the ground was before, but for what it cost.
    expect(lane.map.score).toEqual(state.map.score);
    expect(lane.map.walkMinutes).toEqual(state.map.walkMinutes);
    // Nothing in the game reads a bike path: the same campus with one and without, a day on. (Laying anything wakes the
    // lots' growth, so the bike path is put down as the cell alone, as it would stand there.)
    const withLane = structuredClone(state);
    for (const [x, y] of row) {
      const cell = withLane.map.cells[y * withLane.map.width + x]!;
      cell.kind = 'bike';
      cell.builtTick = withLane.clock.tick;
    }
    const day = 86_400_000;
    const a = advance(withLane, T0, T0 + day).state;
    const b = advance(state, T0, T0 + day).state;
    for (const key of Object.keys(a) as Array<keyof GameState>) if (key !== 'map') expect(a[key]).toEqual(b[key]);
    expect(a.map.score).toEqual(b.map.score);
    expect(a.map.buildings).toEqual(b.map.buildings);
  });

  it('leaves a footpath a footpath where a bike path crosses it: its lamp, its lots and its walkers, a day on', () => {
    const state = small();
    const paths = state.map.cells.map((cell, i) => (cell.kind === 'path' ? i : -1)).filter((i) => i >= 0);
    expect(paths.length).toBeGreaterThan(5);
    const crossed = structuredClone(state);
    for (const i of paths) crossed.map.cells[i]!.kind = 'bikeCrossing';
    const day = 86_400_000;
    const a = advance(crossed, T0, T0 + day).state;
    const b = advance(state, T0, T0 + day).state;
    for (const key of Object.keys(a) as Array<keyof GameState>) if (key !== 'map') expect(a[key]).toEqual(b[key]);
    expect(a.map.score).toEqual(b.map.score);
    expect(a.map.walkMinutes).toEqual(b.map.walkMinutes);
    expect(a.map.buildings).toEqual(b.map.buildings);
  });
});

describe('riders on the bike path', () => {
  // A 15 by 5 map: a footpath along the top row; a bike path along the middle row, joined to it at both ends.
  const width = 15;
  const height = 5;
  const at = (x: number, y: number): number => y * width + x;
  const ride = new Array<boolean>(width * height).fill(false);
  const lane = new Array<boolean>(width * height).fill(false);
  for (let x = 0; x < width; x++) ride[at(x, 0)] = true;
  for (let x = 0; x < width; x++) {
    ride[at(x, 2)] = true;
    lane[at(x, 2)] = true;
  }
  ride[at(0, 1)] = true;
  ride[at(14, 1)] = true;

  it('takes the bike path when it is on the way, even a little longer, and keeps to the footpath when it is far off', () => {
    const along = searchRide(width, height, ride, lane, at(0, 0), at(14, 0), 40);
    // Two cells down and two back up, for fifteen along the bike path: it wins over the footpath's straight fifteen.
    expect(along!.lane).toBe(15);
    expect(along!.cells.length).toBe(19);
    // A short hop stays on the footpath.
    const hop = searchRide(width, height, ride, lane, at(2, 0), at(4, 0), 40);
    expect(hop!.lane).toBe(0);
    // With no bike path, the footpath, as a walker goes.
    const none = searchRide(width, height, ride, new Array<boolean>(width * height).fill(false), at(0, 0), at(14, 0), 40);
    expect(none!.cells.length).toBe(15);
    // No further than it may go, and nowhere it may not ride.
    expect(searchRide(width, height, ride, lane, at(0, 0), at(14, 0), 10)).toBeNull();
    expect(searchRide(width, height, ride, lane, at(0, 0), at(4, 4), 40)).toBeNull();
  });
});

describe('bike paths on Quadline', () => {
  const model = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + 86_400_000).state;
  // The model campus opens with its bike network (DESIGN.md 73); the same campus without it, as a player's could be.
  const state = structuredClone(model);
  for (const cell of state.map.cells) {
    if (cell.kind === 'bike') cell.kind = 'empty';
    else if (cell.kind === 'bikeCrossing') cell.kind = 'path';
  }
  const web = newWeb(state.seed, 1024);
  catchUp(web, state, webWeekOf(state));
  const view = viewOf(web, false);
  const topic = CAUSE_TOPICS.indexOf('lanes');

  it('says "bikes on the sidewalk" while riders share the footpaths, two a week, never viral, and stops with enough bike path', () => {
    expect(lanesShort(state)).toBe(true);
    const posts = lanePosts(view, state);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(LANE_POSTS_A_WEEK);
    for (const post of posts) {
      expect(post.viral).toBe(false);
      expect(post.kind).toBe(POST.complaint);
      expect(post.a).toBe(topic);
    }
    expect(CAUSE_POSTS.lanes.rough[0]).toMatch(/^bikes on the sidewalk again/);
    const feed = feedOf(view, state);
    for (const post of posts) expect(feed).toContainEqual(post);
    // A tenth as much bike path as footpath is what the campus wants; half that ends the complaints.
    const { paths } = laneCount(state);
    expect(PATH_CELLS_PER_LANE).toBe(10);
    const enough = structuredClone(state);
    let laid = 0;
    for (const cell of enough.map.cells) {
      if (laid >= Math.ceil(paths / PATH_CELLS_PER_LANE / 2)) break;
      if (cell.kind === 'empty') {
        cell.kind = 'bike';
        cell.builtTick = 0;
        laid += 1;
      }
    }
    expect(lanesShort(enough)).toBe(false);
    expect(lanePosts(view, enough).filter((post) => post.kind === POST.complaint)).toEqual([]);
    // The model campus every new game opens on has more than enough: nobody complains of bikes on its sidewalks.
    expect(lanesShort(model)).toBe(false);
    expect(lanePosts(view, model).filter((post) => post.kind === POST.complaint)).toEqual([]);
  });

  it('praises a new bike path within two hours of it opening, and shows it for a day', () => {
    const opened = structuredClone(state);
    const cell = opened.map.cells.find((one) => one.kind === 'empty')!;
    cell.kind = 'bike';
    cell.builtTick = opened.clock.tick - 30;
    const soon = lanePosts(view, opened).filter((post) => post.kind === POST.praise);
    const later = structuredClone(opened);
    later.clock.tick += 2 * 60;
    const praise = lanePosts(view, later).filter((post) => post.kind === POST.praise);
    expect(praise.length).toBe(2);
    expect(soon.length).toBeLessThanOrEqual(praise.length);
    for (const post of praise) expect(post.a).toBe(topic);
    const old = structuredClone(opened);
    old.clock.tick += 24 * 60;
    expect(lanePosts(view, old).filter((post) => post.kind === POST.praise)).toEqual([]);
  });

  it('are worded inside the tone guide and its hard lines', () => {
    for (const line of [...CAUSE_POSTS.lanes.rough, ...CAUSE_POSTS.lanes.good]) {
      expect(toneProblem(line)).toBeNull();
      expect(hardLineProblem(line)).toBeNull();
    }
  });
});
