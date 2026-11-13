import { describe, expect, it } from 'vitest';
import { facingOf, Iso, mirrorFacing, mirrorHeading, nextTurn, type Facing, type Heading, type Turn } from '../src/game/iso';
import { PLACED } from '../src/sim';

/**
 * Turning the view (DESIGN.md section 43). The map keeps its own cells; the
 * view lays them down a quarter at a time. These are the rules every drawing,
 * tap and draw order goes through, checked without Phaser.
 */

const TURNS: Turn[] = [0, 1, 2, 3];
const W = 7;
const H = 4;

function iso(turn: Turn): Iso {
  const out = new Iso(66, 37.640625);
  out.setMap(W, H);
  out.setTurn(turn);
  return out;
}

const cells = (): Array<[number, number]> => Array.from({ length: W * H }, (_, i) => [i % W, Math.floor(i / W)] as [number, number]);

describe('turning a cell and back', () => {
  it('turns every point and every cell and brings it back, at every turn', () => {
    for (const turn of TURNS) {
      const view = iso(turn);
      for (const [x, y] of cells()) {
        const at = view.view(x + 0.3, y + 0.7);
        const back = view.unview(at.x, at.y);
        expect(back.x).toBeCloseTo(x + 0.3, 9);
        expect(back.y).toBeCloseTo(y + 0.7, 9);
        const cell = view.viewCell(x, y);
        expect(view.unviewCell(cell.x, cell.y)).toEqual({ x, y });
        // Inside the turned map, whose sides swap on a quarter turn.
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(view.viewSize.w);
        expect(cell.y).toBeLessThan(view.viewSize.h);
      }
      // Every view cell is one map cell: nothing is lost or doubled.
      expect(new Set(cells().map(([x, y]) => JSON.stringify(view.viewCell(x, y)))).size).toBe(W * H);
    }
  });

  it('turns clockwise on the screen, and four turns come home', () => {
    expect(nextTurn(0)).toBe(1);
    expect(nextTurn(3)).toBe(0);
    expect(nextTurn(0, -1)).toBe(3);
    // The map's south-east axis turns to the south-west on a quarter turn: clockwise.
    const east = iso(1).dir(1, 0);
    expect(east).toEqual({ x: 0, y: 1 });
    let turn: Turn = 0;
    for (let n = 0; n < 4; n++) turn = nextTurn(turn);
    expect(turn).toBe(0);
  });

  it('lays a footprint on exactly the view cells of its own cells', () => {
    for (const turn of TURNS) {
      const view = iso(turn);
      for (const [w, h] of [[1, 1], [2, 1], [1, 2], [2, 2], [2, 3], [3, 3]] as const) {
        const box = view.viewBox(2, 1, w, h);
        const want = new Set<string>();
        for (let y = 1; y < 1 + h; y++) for (let x = 2; x < 2 + w; x++) want.add(JSON.stringify(view.viewCell(x, y)));
        const got = new Set<string>();
        for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) got.add(JSON.stringify({ x, y }));
        expect(got).toEqual(want);
        // A footprint that is not square lies along the other side of the screen on a quarter turn.
        expect([box.w, box.h]).toEqual(turn % 2 === 1 ? [h, w] : [w, h]);
      }
    }
  });
});

describe('a tap at each turn', () => {
  it('lands on the cell drawn under the finger', () => {
    for (const turn of TURNS) {
      const view = iso(turn);
      for (const [x, y] of cells()) {
        // The middle of the cell's diamond, and points well inside each of its four corners.
        const [top, right, bottom, left] = view.diamond(x, y);
        const middle = { x: (top!.x + bottom!.x) / 2, y: (top!.y + bottom!.y) / 2 };
        expect(view.toCell(middle.x, middle.y)).toEqual({ x, y });
        for (const corner of [top!, right!, bottom!, left!]) {
          const near = { x: corner.x + (middle.x - corner.x) * 0.2, y: corner.y + (middle.y - corner.y) * 0.2 };
          expect(view.toCell(near.x, near.y)).toEqual({ x, y });
        }
        // The point of the map under the middle is the cell's middle.
        const under = view.toMap(middle.x, middle.y);
        expect(under.x).toBeCloseTo(x + 0.5, 9);
        expect(under.y).toBeCloseTo(y + 0.5, 9);
      }
    }
  });

  it('finds the map cell one step of the view away', () => {
    for (const turn of TURNS) {
      const view = iso(turn);
      const front = view.step(3, 2, 1, 1);
      const at = view.viewCell(3, 2);
      expect(view.viewCell(front.x, front.y)).toEqual({ x: at.x + 1, y: at.y + 1 });
    }
  });
});

describe('draw order at each turn', () => {
  it('draws what is nearer the viewer later', () => {
    for (const turn of TURNS) {
      const view = iso(turn);
      for (const [x, y] of cells()) {
        const at = view.viewCell(x, y);
        // The cell in front of this one, on the screen, is drawn after it, and things on a cell after its ground.
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]] as const) {
          const ahead = view.unviewCell(at.x + dx, at.y + dy);
          if (ahead.x < 0 || ahead.y < 0 || ahead.x >= W || ahead.y >= H) continue;
          expect(view.depth(ahead.x, ahead.y, 0)).toBeGreaterThan(view.depth(x, y, 2));
        }
        expect(view.depth(x, y, 1)).toBeGreaterThan(view.depth(x, y, 0));
        // A point inside the cell draws with it: its sum is within one of the cell's.
        expect(Math.abs(view.sum(x + 0.5, y + 0.5) - (at.x + at.y + 1))).toBeLessThan(1e-9);
      }
    }
  });

  it('puts a building behind someone standing in front of it, at every turn', () => {
    for (const turn of TURNS) {
      const view = iso(turn);
      const box = view.viewBox(2, 1, 2, 1);
      // A person half a cell in front of the building's front cell, on the screen.
      const person = view.unview(box.x + box.w + 0.5, box.y + box.h - 0.5);
      expect((view.sum(person.x, person.y) - 1) * 4 + 2.5).toBeGreaterThan(view.front(2, 1, 2, 1) * 4 + 1);
      // And one behind it, behind.
      const behind = view.unview(box.x - 0.5, box.y + 0.5);
      expect((view.sum(behind.x, behind.y) - 1) * 4 + 2.5).toBeLessThan(view.front(2, 1, 2, 1) * 4 + 1);
    }
  });
});

describe('the pieces that follow the grid', () => {
  it('turns a road or a path piece to the one the turned grid would choose', () => {
    // A small campus of roads, with straights, corners, a junction and a dead end.
    const road = new Set(['1,0', '1,1', '1,2', '2,1', '3,1', '4,1', '4,2', '4,3', '5,3', '6,3', '0,2']);
    const is = (x: number, y: number): boolean => road.has(`${x},${y}`);
    const maskOf = (x: number, y: number, at: (x: number, y: number) => boolean): number =>
      (at(x, y - 1) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x, y + 1) ? 4 : 0) | (at(x - 1, y) ? 8 : 0);
    for (const turn of TURNS) {
      const view = iso(turn);
      // The turned grid, in the view's own cells.
      const turned = new Set([...road].map((key) => {
        const [x, y] = key.split(',').map(Number) as [number, number];
        const at = view.viewCell(x, y);
        return `${at.x},${at.y}`;
      }));
      for (const key of road) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        const at = view.viewCell(x, y);
        expect(view.mask(maskOf(x, y, is))).toBe(maskOf(at.x, at.y, (a, b) => turned.has(`${a},${b}`)));
      }
    }
    // A straight along one side becomes a straight along the other on a quarter turn, and the crossings swap with it.
    expect(iso(1).mask(10)).toBe(5);
    expect(iso(2).mask(10)).toBe(10);
  });

  it('turns the way people and cars face with the ground they move on', () => {
    const moves: Array<[Facing, Heading, number, number]> = [
      ['se', 'px', 1, 0],
      ['sw', 'py', 0, 1],
      ['nw', 'nx', -1, 0],
      ['ne', 'ny', 0, -1],
    ];
    for (const turn of TURNS) {
      const view = iso(turn);
      for (const [facing, heading, dx, dy] of moves) {
        const on = view.dir(dx, dy);
        // Moving this way across the map is moving this way across the screen.
        expect(view.face(facing)).toBe(facingOf(on.x, on.y));
        const drawn = moves.find((move) => move[2] === on.x && move[3] === on.y)!;
        expect(view.heading(heading)).toBe(drawn[1]);
      }
    }
    expect(mirrorFacing('se')).toBe('sw');
    expect(mirrorFacing('ne')).toBe('nw');
    expect(mirrorHeading('ny')).toBe('nx');
  });
});

describe('which drawings are mirrored', () => {
  it('mirrors a footprint that is not square on a quarter or three-quarter turn, and nothing on a half turn', () => {
    const long = Object.entries(PLACED).filter(([, spec]) => spec.w !== spec.h).map(([type]) => type);
    const square = Object.entries(PLACED).filter(([, spec]) => spec.w === spec.h).map(([type]) => type);
    expect(long.length).toBeGreaterThan(10);
    for (const turn of TURNS) {
      const view = iso(turn);
      for (const type of long) expect(view.mirrors(PLACED[type as keyof typeof PLACED].w, PLACED[type as keyof typeof PLACED].h)).toBe(turn % 2 === 1);
      for (const type of square) expect(view.mirrors(PLACED[type as keyof typeof PLACED].w, PLACED[type as keyof typeof PLACED].h)).toBe(false);
    }
    // The stadium at tiers four and five covers two cells by three.
    expect(iso(1).mirrors(2, 3)).toBe(true);
    expect(iso(2).mirrors(2, 3)).toBe(false);
  });

  it('keeps what stands on a drawing in its place on the drawing, mirrored with it', () => {
    for (const turn of TURNS) {
      const view = iso(turn);
      for (const box of [{ x: 2, y: 1, w: 2, h: 1 }, { x: 1, y: 1, w: 2, h: 2 }]) {
        const top = view.boxTop(box.x, box.y, box.w, box.h);
        const mirrored = view.mirrors(box.w, box.h);
        // A spot 1.6 cells along and 0.3 across the drawing: always the same spot on the screen, measured from the drawing.
        const on = view.onDrawing(box, 1.6, 0.3);
        const at = view.toWorld(on.x, on.y);
        const want = mirrored ? view.offset(0.3, 1.6) : view.offset(1.6, 0.3);
        expect(at.x - top.x).toBeCloseTo(mirrored ? -view.offset(1.6, 0.3).x : view.offset(1.6, 0.3).x, 9);
        expect(at.x - top.x).toBeCloseTo(want.x, 9);
        expect(at.y - top.y).toBeCloseTo(want.y, 9);
      }
    }
    // With no turn, a spot on a drawing is that spot of the map.
    expect(iso(0).onDrawing({ x: 2, y: 1, w: 2, h: 1 }, 1.6, 0.3)).toEqual({ x: 3.6, y: 1.3 });
  });

  it('gives the camera the turned map to roam over', () => {
    const flat = iso(0).bounds(W, H);
    const quarter = iso(1).bounds(W, H);
    expect(quarter.width).toBe(flat.width);
    expect(quarter.x).not.toBe(flat.x);
    expect(iso(2).bounds(W, H)).toEqual(flat);
  });
});
