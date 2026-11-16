import { describe, expect, it } from 'vitest';
import { BALL_MOST, Game, GAME_CAP, RUN, type Area, type GameEvent, type Sport } from '../src/app/games';

/**
 * Real games (DESIGN.md 72): the play on a court, for show and seeded. Players never run faster than a player can, the
 * ball never jumps from one place to another, only as many play as the court holds, and each game scores.
 */

const AREAS: Record<Sport, Area> = {
  basketball: { x0: 0.14, x1: 1.86, y0: 0.14, y1: 2.86 },
  tennis: { x0: 0.18, x1: 1.82, y0: 0.18, y1: 2.82 },
  volleyball: { x0: 0.22, x1: 1.78, y0: 0.22, y1: 2.78 },
  soccer: { x0: 0.16, x1: 2.84, y0: 0.16, y1: 3.84 },
};

function lineUp(game: Game, n: number): void {
  const area = game.area;
  game.roster(Array.from({ length: n }, (_, slot) => ({ slot, x: area.x0 + ((slot % 4) + 0.5) * ((area.x1 - area.x0) / 4), y: area.y0 + 0.2 + (slot % 3) * 0.3 })));
}

/** Plays `seconds` at 60 frames a second, checking every frame; the events it made. */
function play(game: Game, seconds: number, check?: (dt: number, before: { ball: { x: number; y: number }; players: Array<{ x: number; y: number }> }) => void): GameEvent[] {
  const events: GameEvent[] = [];
  const dt = 1000 / 60;
  for (let f = 0; f < seconds * 60; f++) {
    const before = { ball: { x: game.ball.x, y: game.ball.y }, players: game.players.map((p) => ({ x: p.x, y: p.y })) };
    game.step(dt);
    check?.(dt / 1000, before);
    events.push(...game.take());
  }
  return events;
}

describe('real games', () => {
  for (const sport of ['basketball', 'tennis', 'volleyball', 'soccer'] as const) {
    it(`${sport}: no faster than a player runs, the ball never jumps, and everyone stays on the court`, () => {
      const game = new Game(sport, AREAS[sport], 41);
      lineUp(game, GAME_CAP[sport]);
      const area = game.area;
      let worstBall = 0;
      let worstRun = 0;
      play(game, 240, (dt, before) => {
        worstBall = Math.max(worstBall, Math.hypot(game.ball.x - before.ball.x, game.ball.y - before.ball.y) / dt);
        game.players.forEach((p, i) => {
          const was = before.players[i];
          if (was) worstRun = Math.max(worstRun, Math.hypot(p.x - was.x, p.y - was.y) / dt);
          expect(p.x).toBeGreaterThan(area.x0 - 0.3);
          expect(p.x).toBeLessThan(area.x1 + 0.3);
          expect(p.y).toBeGreaterThan(area.y0 - 0.3);
          expect(p.y).toBeLessThan(area.y1 + 0.3);
        });
        expect(game.ball.z).toBeGreaterThanOrEqual(0);
        expect(game.ball.x).toBeGreaterThan(area.x0 - 0.6);
        expect(game.ball.x).toBeLessThan(area.x1 + 0.6);
      });
      expect(worstRun).toBeLessThanOrEqual(RUN + 1e-6);
      expect(worstBall).toBeLessThanOrEqual(BALL_MOST + 1e-6);
    });
  }

  it('lets on only as many as the court holds: tennis 4, volleyball 12, basketball 10, soccer 10', () => {
    for (const sport of ['basketball', 'tennis', 'volleyball', 'soccer'] as const) {
      const game = new Game(sport, AREAS[sport], 7);
      lineUp(game, 16);
      expect(game.players.length).toBe(GAME_CAP[sport]);
      expect(game.players.filter((p) => p.team === 0).length - game.players.filter((p) => p.team === 1).length).toBeLessThanOrEqual(1);
    }
    expect(GAME_CAP).toEqual({ basketball: 10, tennis: 4, volleyball: 12, soccer: 10 });
  });

  it('plays basketball with baskets and misses, twos and threes, at both ends with ten and at one with six', () => {
    const full = new Game('basketball', AREAS.basketball, 3);
    lineUp(full, 10);
    const events = play(full, 300);
    const scores = events.filter((e) => e.kind === 'score');
    expect(scores.length).toBeGreaterThan(5);
    expect(events.filter((e) => e.kind === 'miss').length).toBeGreaterThan(3);
    expect(new Set(scores.map((e) => e.points))).toEqual(new Set([2, 3]));
    expect(new Set(scores.map((e) => e.team)).size).toBe(2);
    // Six play at one end: every shot goes to the far basket.
    const half = new Game('basketball', AREAS.basketball, 3);
    lineUp(half, 6);
    let lowest = Infinity;
    play(half, 200, () => {
      if (half.ball.z > 0.9) lowest = Math.min(lowest, half.ball.y);
    });
    expect(lowest).toBeLessThan(1);
    play(half, 1, () => undefined);
  });

  it('plays soccer with goals and saves, and keepers who stay in goal', () => {
    const game = new Game('soccer', AREAS.soccer, 11);
    lineUp(game, 10);
    const keepers = game.players.filter((p) => p.keeper);
    expect(keepers.length).toBe(2);
    let wandered = 0;
    // Once they have walked into goal from where they came on.
    const early = play(game, 15);
    const events = [...early, ...play(game, 400, () => {
      for (const k of keepers) wandered = Math.max(wandered, Math.min(Math.abs(k.y - game.area.y0), Math.abs(k.y - game.area.y1)));
    })];
    expect(events.filter((e) => e.kind === 'score').length).toBeGreaterThan(1);
    expect(events.filter((e) => e.kind === 'save').length).toBeGreaterThan(0);
    expect(wandered).toBeLessThan(0.35);
  });

  it('plays tennis and volleyball in rallies, and someone wins each point', () => {
    for (const [sport, n] of [['tennis', 2], ['tennis', 4], ['volleyball', 4], ['volleyball', 12]] as const) {
      const game = new Game(sport, AREAS[sport], 19);
      lineUp(game, n);
      const points = play(game, 200).filter((e) => e.kind === 'point');
      expect(points.length, `${sport} ${n}`).toBeGreaterThan(5);
      expect(new Set(points.map((e) => e.team)).size, `${sport} ${n}`).toBe(2);
    }
  });

  it('plays the same way for the same seed', () => {
    const a = new Game('basketball', AREAS.basketball, 5);
    const b = new Game('basketball', AREAS.basketball, 5);
    lineUp(a, 10);
    lineUp(b, 10);
    play(a, 60);
    play(b, 60);
    expect([a.ball.x, a.ball.y, a.ball.z]).toEqual([b.ball.x, b.ball.y, b.ball.z]);
  });

  it('keeps the ball where it was when the one holding it leaves, and goes on with who is left', () => {
    const game = new Game('basketball', AREAS.basketball, 9);
    lineUp(game, 6);
    let left = false;
    play(game, 60, (dt, before) => {
      const holder = game.holder();
      if (!left && holder) {
        left = true;
        game.roster(game.players.filter((p) => p !== holder).map((p) => ({ slot: p.slot, x: p.x, y: p.y })));
      }
      expect(Math.hypot(game.ball.x - before.ball.x, game.ball.y - before.ball.y) / dt).toBeLessThanOrEqual(BALL_MOST + 1e-6);
    });
    expect(left).toBe(true);
    expect(game.players.length).toBe(5);
    const events = play(game, 120);
    expect(events.length).toBeGreaterThan(0);
  });
});
