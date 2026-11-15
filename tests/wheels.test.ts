import { describe, expect, it } from 'vitest';
import { PARKS, racksBuilt, racksShort, racksWanted, rackPosts, rideMomentOf, WHEEL_NAMES, WHEEL_SPEED, wheelOf, WHEELS, type RiderFacts, type Wheel } from '../src/app/wheels';
import { applyAction, advance, enrollment, newGame, toneProblem, type GameState } from '../src/sim';
import { CAUSE_POSTS } from '../src/sim/config/quadline';
import { hardLineProblem } from '../src/sim/config/hardLines';
import { PLACED, utilitiesOf } from '../src/sim/config/placed';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';
import { viewOf } from '../src/app/socialView';
import { feedOf } from '../src/app/quadline';

/**
 * The living campus, L5 (DESIGN.md 64.6): wheels. Who rides is a plain rule; the map draws it. The bike rack is the
 * one new thing to build, and it costs its price and nothing else; the complaints about bike parking are the app's.
 */

const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const facts = (over: Partial<RiderFacts> = {}): RiderFacts => ({ weather: 'clear', period: 'afternoon', quirk: null, likes: new Set(), commuter: false, distance: 20, roll: 0.5, pick: 0.5, ...over });

const share = (over: Partial<RiderFacts>): Map<Wheel | null, number> => {
  const out = new Map<Wheel | null, number>();
  for (let i = 0; i < 400; i++) {
    for (let j = 0; j < 5; j++) {
      const wheel = wheelOf(facts({ ...over, roll: (i + 0.5) / 400, pick: (j + 0.5) / 5 }));
      out.set(wheel, (out.get(wheel) ?? 0) + 1);
    }
  }
  return out;
};
const riding = (m: Map<Wheel | null, number>): number => 2000 - (m.get(null) ?? 0);

describe('who rides', () => {
  it('has about one in ten riding on a fine day, more on a long trip, few in the rain and fewer in snow', () => {
    const fine = riding(share({}));
    expect(fine / 2000).toBeGreaterThan(0.08);
    expect(fine / 2000).toBeLessThan(0.25);
    expect(riding(share({ distance: 60 }))).toBeGreaterThan(fine);
    expect(riding(share({ weather: 'rain' }))).toBeLessThan(fine / 2);
    expect(riding(share({ weather: 'snow' }))).toBeLessThan(riding(share({ weather: 'rain' })));
    expect(riding(share({ period: 'night' }))).toBeLessThan(fine);
  });

  it('puts the skateboarders on boards, sporty students on bikes, commuters on e-scooters', () => {
    const skater = share({ quirk: 'Skateboards everywhere' });
    expect(riding(skater) / 2000).toBeGreaterThan(0.6);
    expect((skater.get('skateboard') ?? 0) + (skater.get('longboard') ?? 0)).toBeGreaterThanOrEqual(riding(skater) * 0.8);
    const sporty = share({ likes: new Set(['fitness']) });
    expect(sporty.get('bike') ?? 0).toBeGreaterThan(riding(sporty) / 2);
    const commuter = share({ commuter: true });
    expect(commuter.get('escooter') ?? 0).toBeGreaterThan(riding(commuter) / 3);
  });

  it('is the same for the same trip, and every wheel is faster than walking and has words for a card', () => {
    expect(wheelOf(facts({ roll: 0.05, pick: 0.3 }))).toBe(wheelOf(facts({ roll: 0.05, pick: 0.3 })));
    for (const wheel of WHEELS) {
      expect(WHEEL_SPEED[wheel]).toBeGreaterThan(1.4);
      expect(WHEEL_SPEED[wheel]).toBeLessThan(2.6);
      expect(WHEEL_NAMES[wheel].startsWith('on ')).toBe(true);
    }
    expect(PARKS.bike && PARKS.escooter).toBe(true);
    expect(PARKS.skateboard || PARKS.kick || PARKS.skates).toBe(false);
  });

  it('gives a rider at most one small moment: a bell or a near miss on a bike, a trick or a rare wipeout on a board', () => {
    const count = (wheel: Wheel, moment: string): number => Array.from({ length: 1000 }, (_, i) => rideMomentOf(wheel, (i + 0.5) / 1000)).filter((one) => one === moment).length;
    expect(count('bike', 'bell')).toBeGreaterThan(250);
    expect(count('bike', 'nearMiss')).toBeLessThan(100);
    expect(count('skateboard', 'trick')).toBeGreaterThan(300);
    expect(count('skateboard', 'wipeout')).toBeLessThan(80);
    expect(count('bike', 'wipeout')).toBe(0);
  });
});

describe('the bike rack', () => {
  it('costs its price and nothing more: no upkeep, no utilities, no reach that counts for anything', () => {
    const rack = PLACED.rack;
    expect(rack.category).toBe('Grounds');
    expect(rack.cost).toBeGreaterThan(0);
    expect(rack.cost).toBeLessThan(PLACED.bench.cost);
    expect(rack.upkeepPerYear).toBe(0);
    expect(rack.strength).toBe(0);
    expect(utilitiesOf('rack')).toBe(0);
  });

  it('is built from the Build menu like a bench, and counted', () => {
    const state: GameState = advance(newGame({ seed: 7, name: 'Test University', now: T0 }), T0, T0 + 60_000).state;
    const cash = state.money.cash;
    const cell = state.map.cells.findIndex((one, i) => one.kind === 'empty' && applyAction(state, { type: 'place', building: 'rack', x: i % state.map.width, y: Math.floor(i / state.map.width) }).ok);
    expect(cell).toBeGreaterThanOrEqual(0);
    const done = applyAction(state, { type: 'place', building: 'rack', x: cell % state.map.width, y: Math.floor(cell / state.map.width) });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(racksBuilt(done.state)).toBe(1);
    expect(done.state.money.cash).toBeLessThan(cash);
  });

  it('wants one for every 500 students, and is short below half that', () => {
    expect(racksWanted(0)).toBe(0);
    expect(racksWanted(1200)).toBe(3);
    const state = newGame({ seed: 7, name: 'Test University', now: T0, campus: 'model' });
    expect(racksBuilt(state)).toBe(0);
    expect(racksShort(state, enrollment(state))).toBe(true);
    expect(racksShort(state, 0)).toBe(false);
  });
});

describe('complaints about bike parking', () => {
  const state = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + 86_400_000).state;
  const web = newWeb(state.seed, 1024);
  catchUp(web, state, webWeekOf(state));
  const view = viewOf(web, false);

  it('come while racks are short, two a week, from students, and never go viral', () => {
    const posts = rackPosts(view, state, enrollment(state));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(2);
    for (const post of posts) expect(post.viral).toBe(false);
    expect(rackPosts(view, state, 0)).toEqual([]);
    // In the feed among the rest, newest first.
    const feed = feedOf(view, state);
    for (const post of posts) expect(feed).toContainEqual(post);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1]!.week * 1e6 + feed[i - 1]!.minute).toBeGreaterThanOrEqual(feed[i]!.week * 1e6 + feed[i]!.minute);
  });

  it('are worded inside the tone guide and its hard lines', () => {
    for (const line of [...CAUSE_POSTS.racks.rough, ...CAUSE_POSTS.racks.good]) {
      expect(toneProblem(line)).toBeNull();
      expect(hardLineProblem(line)).toBeNull();
    }
  });
});
