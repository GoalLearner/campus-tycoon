import { describe, expect, it } from 'vitest';
import { doorAlpha, moveEnd, pointOn, searchOnFoot, searchSpace, tripOf } from '../src/game/afoot';

/**
 * Coming and going on foot (DESIGN.md 69.2, 69.5): the way on or off the screen is found over open ground and paths,
 * never through a building; someone on a trip fades only in a doorway; a trip's end can follow a moving place.
 */

/** A small map from rows of text: '.' open, '#' a building, 'D' a door (open), 'S' the start. */
function grid(rows: string[]): { width: number; height: number; afoot: boolean[]; at: (ch: string) => number[] } {
  const width = rows[0]!.length;
  const height = rows.length;
  const afoot: boolean[] = [];
  for (const row of rows) for (const ch of row) afoot.push(ch !== '#');
  const at = (ch: string): number[] => {
    const out: number[] = [];
    rows.forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push(y * width + x)));
    return out;
  };
  return { width, height, afoot, at };
}

describe('afoot', () => {
  it('finds the nearest door on foot, round a building and never through it', () => {
    const map = grid([
      '..........',
      '.#######..',
      '.#.....#..',
      '.#..S..#..',
      '.#.....#..',
      '.####.##..',
      '.......D..',
    ]);
    const start = map.at('S')[0]!;
    const door = map.at('D')[0]!;
    const space = searchSpace(map.width * map.height);
    const way = searchOnFoot(map.width, map.height, map.afoot, start, (c) => c === door, 500, space)!;
    expect(way[0]).toBe(start);
    expect(way[way.length - 1]).toBe(door);
    // Out through the gap in the wall, every cell open, each a step from the last.
    for (const c of way) expect(map.afoot[c]).toBe(true);
    for (let k = 1; k < way.length; k++) {
      const a = way[k - 1]!;
      const b = way[k]!;
      expect(Math.abs((a % map.width) - (b % map.width)) + Math.abs(Math.floor(a / map.width) - Math.floor(b / map.width))).toBe(1);
    }
    // The shortest: six steps (three down through the gap, three across), seven cells.
    expect(way.length).toBe(7);
  });

  it('walks someone off a cell that was just built on, and finds nothing when walled in', () => {
    const map = grid([
      '.....',
      '.###.',
      '.#S#.',
      '.###.',
      '.....',
    ]);
    const start = map.at('S')[0]!;
    map.afoot[start] = false;
    const space = searchSpace(map.width * map.height);
    expect(searchOnFoot(map.width, map.height, map.afoot, start, (c) => c === 0, 500, space)).toBeNull();
    // Built over, with open ground beside: out at once.
    map.afoot[start + 1] = true;
    const out = searchOnFoot(map.width, map.height, map.afoot, start, (c) => c % map.width === 4, 500, space)!;
    expect(out[0]).toBe(start);
    expect(out.slice(1).every((c) => map.afoot[c])).toBe(true);
    // A limit stops a search that would cover the map.
    expect(searchOnFoot(map.width, map.height, map.afoot, 0, () => false, 3, space)).toBeNull();
  });

  it('fades only in the doorway: in at the start of a way in, out at the end of a way out', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ];
    const way = tripOf(pts, 0, false);
    expect(way.total).toBe(7);
    expect(doorAlpha(way, 0, 0.35)).toBe(0);
    expect(doorAlpha(way, 0.2, 0.35)).toBeCloseTo(0.2 / 0.35);
    for (let d = 0.35; d <= 7; d += 0.25) expect(doorAlpha(way, d, 0.35)).toBe(1);
    const away = tripOf([...pts].reverse(), 0, true);
    for (let d = 0.01; d <= 6.6; d += 0.25) expect(doorAlpha(away, d, 0.35)).toBe(1);
    expect(doorAlpha(away, 6.9, 0.35)).toBeLessThan(0.5);
    // Along the way, on the stretch it is on.
    expect(pointOn(way, 1.5)).toMatchObject({ x: 1.5, y: 0, ax: 0, bx: 3 });
    expect(pointOn(way, 5)).toMatchObject({ x: 3, y: 2, ay: 0, by: 4 });
    expect(pointOn(way, 99)).toMatchObject({ x: 3, y: 4 });
  });

  it('follows a place that moves: the last stretch ends where it is now', () => {
    const way = tripOf(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
      ],
      0,
      false,
    );
    moveEnd(way, 2, 3);
    expect(way.total).toBe(5);
    expect(pointOn(way, 5)).toMatchObject({ x: 2, y: 3 });
  });
});
