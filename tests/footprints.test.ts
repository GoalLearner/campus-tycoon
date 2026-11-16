import { describe, expect, it } from 'vitest';
import { Footprints } from '../src/game/footprints';
import { Iso, type Turn } from '../src/game/iso';
import type { GameState } from '../src/sim';

/**
 * Nobody drawn on a wall (DESIGN.md 69.5, the owner's "This guy is stuck on building"): at every turn of the view, a
 * person in front of a building next to them is drawn over it, and one behind it under it, a wide building and a
 * shallow one alike.
 */

const W = 10;
const H = 10;

/** A small map: a library two cells by two at (3, 3), and a hall on a lot at (7, 2). Everything else open grass. */
function map(): GameState {
  const cells = Array.from({ length: W * H }, () => ({ kind: 'empty', zone: null, buildingId: null as number | null, placedId: null as number | null }));
  for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) Object.assign(cells[y * W + x]!, { kind: 'placed', placedId: 0 });
  Object.assign(cells[2 * W + 7]!, { kind: 'lot', zone: 'academic', buildingId: 0 });
  return {
    map: {
      width: W,
      height: H,
      cells,
      buildings: [{ id: 0, x: 7, y: 2, w: 1, h: 1, zone: 'academic', stage: 1, variant: 0, rebuild: null }],
      placed: [{ id: 0, type: 'library', x: 3, y: 3, w: 2, h: 2 }],
    },
  } as unknown as GameState;
}

/** A person's own order, by their feet, as every crowd system works it out. */
const own = (iso: Iso, x: number, y: number): number => (iso.sum(x, y) - 1) * 4 + 2.5;

describe('footprints', () => {
  it('keeps a person beside a building on the right side of it, at all four turns', () => {
    for (const turn of [0, 1, 2, 3] as Turn[]) {
      const iso = new Iso(66, 33);
      iso.setMap(W, H);
      iso.setTurn(turn);
      const feet = new Footprints(iso);
      feet.setMap(map());
      for (const box of [
        { x: 3, y: 3, w: 2, h: 2 },
        { x: 7, y: 2, w: 1, h: 1 },
      ]) {
        const view = iso.viewBox(box.x, box.y, box.w, box.h);
        const drawn = (view.x + view.w - 1 + view.y + view.h - 1) * 4 + 1;
        // Every spot a tenth of a cell apart in the ring of cells round it.
        for (let y = box.y - 1; y < box.y + box.h + 1; y += 0.1) {
          for (let x = box.x - 1; x < box.x + box.w + 1; x += 0.1) {
            const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
            if (inside) {
              expect(feet.inside(x, y)).toBe(true);
              continue;
            }
            const v = iso.view(x, y);
            const before = v.x >= view.x + view.w || v.y >= view.y + view.h;
            const behind = v.x < view.x || v.y < view.y;
            const depth = feet.depth(x, y, own(iso, x, y));
            if (before && !behind) expect(depth, `turn ${turn}, (${x.toFixed(1)}, ${y.toFixed(1)}) in front`).toBeGreaterThan(drawn);
            if (behind && !before) expect(depth, `turn ${turn}, (${x.toFixed(1)}, ${y.toFixed(1)}) behind`).toBeLessThan(drawn);
          }
        }
      }
    }
  });

  it('was wrong before beside a wide building and behind a shallow one: the cases the owner saw', () => {
    const iso = new Iso(66, 33);
    iso.setMap(W, H);
    iso.setTurn(0);
    // In front of the library's far corner: by the feet alone, under it.
    const library = (3 + 1 + 3 + 1) * 4 + 1;
    expect(own(iso, 3.1, 5.1)).toBeLessThan(library);
    // Just behind the hall's back wall, at its right end: by the feet alone, over it, "on the wall".
    const hall = (7 + 2) * 4 + 1;
    expect(own(iso, 7.9, 1.9)).toBeGreaterThan(hall);
    const feet = new Footprints(iso);
    feet.setMap(map());
    expect(feet.depth(3.1, 5.1, own(iso, 3.1, 5.1))).toBeGreaterThan(library);
    expect(feet.depth(7.9, 1.9, own(iso, 7.9, 1.9))).toBeLessThan(hall);
  });
});

describe('people on a big court', () => {
  it('are drawn after the court, however near its far end, and before what stands in front of it, at all four turns (DESIGN.md 72)', () => {
    for (const turn of [0, 1, 2, 3] as Turn[]) {
      const iso = new Iso(66, 33);
      iso.setMap(W, H);
      iso.setTurn(turn);
      for (const box of [
        { x: 3, y: 3, w: 2, h: 3 },
        { x: 2, y: 2, w: 3, h: 4 },
      ]) {
        const court = iso.groundDepth(box.x, box.y, box.w, box.h);
        let under = 0;
        for (let fy = 0.1; fy < box.h; fy += 0.2) {
          for (let fx = 0.1; fx < box.w; fx += 0.2) {
            const mine = own(iso, box.x + fx, box.y + fy);
            if (mine <= court) under += 1;
            // As the map draws a player on a court: never under it.
            expect(Math.max(mine, court + 0.2)).toBeGreaterThan(court);
          }
        }
        // Without the rule some would be under it: the far end of a court longer than two cells.
        expect(under, `turn ${turn}`).toBeGreaterThan(0);
        // A building standing just in front of the court, as the view is turned, is still drawn after anyone on it.
        const beside = [
          [box.x + 1, box.y + box.h],
          [box.x + box.w, box.y + 1],
          [box.x + 1, box.y - 1],
          [box.x - 1, box.y + 1],
        ] as const;
        const [fx, fy] = [...beside].sort((a, b) => iso.sum(b[0] + 0.5, b[1] + 0.5) - iso.sum(a[0] + 0.5, a[1] + 0.5))[0]!;
        expect(iso.front(fx, fy, 1, 1) * 4 + 1, `turn ${turn}`).toBeGreaterThan(court + 0.2);
      }
    }
  });
});
