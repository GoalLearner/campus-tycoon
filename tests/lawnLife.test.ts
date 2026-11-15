import { describe, expect, it } from 'vitest';
import { CROWD_STEPS } from '../src/app/crowd';
import type { DayPeriod } from '../src/app/daylight';
import type { LifeFacts, Weather } from '../src/app/life';
import { chooseLawnKind, LAWN_KINDS, LAWN_POSE, LAWN_SIZE, lawnShare, lawnWords, PARTY_SIZES, partySize, partyTonight, PLACED_KINDS, RESTING_AT_FULL, STROLL_SHARE, type LawnGroup, type LawnKind, type PartyFacts } from '../src/app/lawnLife';

/**
 * The living campus, L1 (DESIGN.md 64): who is out on the lawns and what they do. The rules are plain sums and a
 * weighted choice from a roll the map makes from the seed, so they are tested as they are; the map only draws them,
 * and none of it reaches the saved game.
 */

const PERIODS: DayPeriod[] = ['morning', 'afternoon', 'evening', 'night'];
const SKIES: Weather[] = ['clear', 'rain', 'snow'];

/** A fine Wednesday afternoon in October on a campus of 1,200. */
const life = (over: Partial<LifeFacts> = {}): LifeFacts => ({
  period: 'afternoon',
  weekend: false,
  month: 10,
  day: 14,
  term: true,
  weather: 'clear',
  students: 1200,
  reduced: false,
  ...over,
});

const group = (over: Partial<LawnGroup> = {}): LawnGroup => ({ size: 3, couple: false, vibe: null, likes: new Set(), exams: false, ...over });

/** How often each kind comes up over evenly spread rolls. */
function spread(g: LawnGroup, period: DayPeriod = 'afternoon', weather: Weather = 'clear'): Map<LawnKind, number> {
  const out = new Map<LawnKind, number>();
  for (let i = 0; i < 1000; i++) {
    const kind = chooseLawnKind(g, period, weather, (i + 0.5) / 1000);
    out.set(kind, (out.get(kind) ?? 0) + 1);
  }
  return out;
}

describe('how full the lawns are', () => {
  it('is full on a fine afternoon in term, and nobody is out on an empty campus', () => {
    expect(lawnShare(life())).toBe(1);
    expect(lawnShare(life({ students: 0 }))).toBe(0);
    expect(lawnShare(life({ presence: 0 }))).toBe(0);
  });

  it('is fullest in the afternoon and nearly empty at night', () => {
    const by = PERIODS.map((period) => lawnShare(life({ period })));
    expect(by[1]).toBeGreaterThan(by[2]!);
    expect(by[2]).toBeGreaterThan(by[0]!);
    expect(by[3]).toBeLessThan(0.1);
  });

  it('sends nearly everyone in from rain and snow', () => {
    expect(lawnShare(life({ weather: 'rain' }))).toBeLessThan(0.1);
    expect(lawnShare(life({ weather: 'snow' }))).toBeLessThanOrEqual(0.2);
  });

  it('thins in winter and in the summer break, and fills more at the weekend', () => {
    expect(lawnShare(life({ month: 1 }))).toBeLessThan(lawnShare(life()));
    expect(lawnShare(life({ month: 7, term: false }))).toBeLessThan(lawnShare(life()));
    expect(lawnShare(life({ period: 'morning', weekend: true }))).toBeGreaterThan(lawnShare(life({ period: 'morning' })));
  });

  it('halves with Reduce effects on, and with most students away', () => {
    expect(lawnShare(life({ reduced: true }))).toBeCloseTo(0.5, 5);
    expect(lawnShare(life({ presence: 0.25 }))).toBeCloseTo(0.25, 5);
  });

  it('stays between 0 and 1 whatever the day', () => {
    for (const period of PERIODS) {
      for (const weather of SKIES) {
        for (let month = 1; month <= 12; month++) {
          const share = lawnShare(life({ period, weather, month, weekend: month % 2 === 0, term: month !== 7 }));
          expect(share).toBeGreaterThanOrEqual(0);
          expect(share).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('keeps more doing than walking when the lawns are full, and scales with the density setting', () => {
    // With the lawns full, the walking crowd keeps 65% of its people and the lawns take the crowd step's lawn figures.
    expect(RESTING_AT_FULL).toBeGreaterThan(0.2);
    expect(RESTING_AT_FULL).toBeLessThan(0.6);
    for (let i = 1; i < CROWD_STEPS.length; i++) expect(CROWD_STEPS[i]!.lawn).toBeGreaterThan(CROWD_STEPS[i - 1]!.lawn);
  });
});

describe('what a group on the grass does', () => {
  it('always picks a kind their number allows', () => {
    for (let size = 1; size <= 5; size++) {
      for (const couple of size === 2 ? [false, true] : [false]) {
        for (const period of PERIODS) {
          for (const weather of SKIES) {
            for (const kind of spread(group({ size, couple }), period, weather).keys()) {
              const [least, most] = LAWN_SIZE[kind];
              expect(size).toBeGreaterThanOrEqual(least);
              expect(size).toBeLessThanOrEqual(most);
            }
          }
        }
      }
    }
  });

  it('is the same for the same group, hour, sky and roll', () => {
    const g = group({ size: 4, vibe: 'sports', likes: new Set(['music']) });
    for (let i = 0; i < 50; i++) {
      const roll = (i * 37 % 100) / 100;
      expect(chooseLawnKind(g, 'afternoon', 'clear', roll)).toBe(chooseLawnKind(g, 'afternoon', 'clear', roll));
    }
  });

  it('plays no games on the grass at night', () => {
    const kinds = spread(group({ size: 2, likes: new Set(['sports']) }), 'night', 'clear');
    for (const game of ['frisbee', 'catch', 'kick'] as const) expect(kinds.get(game) ?? 0).toBe(0);
  });

  it('plays no games on the grass in the rain or snow', () => {
    for (const weather of ['rain', 'snow'] as const) {
      const kinds = spread(group({ size: 2, likes: new Set(['sports']) }), 'afternoon', weather);
      for (const game of ['frisbee', 'catch', 'kick', 'picnic', 'sun', 'nap', 'dance'] as const) expect(kinds.get(game) ?? 0).toBe(0);
    }
  });

  it('follows what they like: a sporty group throws more, a studious one studies more, exams fill the study circles', () => {
    const sporty = spread(group({ vibe: 'sports' }));
    const studious = spread(group({ vibe: 'studying' }));
    const games = (m: Map<LawnKind, number>): number => (m.get('frisbee') ?? 0) + (m.get('kick') ?? 0);
    expect(games(sporty)).toBeGreaterThan(games(studious));
    expect(studious.get('study') ?? 0).toBeGreaterThan(sporty.get('study') ?? 0);
    expect(spread(group({ exams: true })).get('study') ?? 0).toBeGreaterThan(spread(group()).get('study') ?? 0);
  });

  it('keeps to their plan for the hour: a meal makes a picnic, a game a frisbee, a class a study group', () => {
    const count = (g: LawnGroup, kind: LawnKind): number => spread(g).get(kind) ?? 0;
    expect(count(group({ plan: 'food' }), 'picnic')).toBeGreaterThan(count(group(), 'picnic'));
    expect(count(group({ plan: 'play' }), 'frisbee')).toBeGreaterThan(count(group(), 'frisbee'));
    expect(count(group({ plan: 'class' }), 'study')).toBeGreaterThan(count(group(), 'study'));
  });

  it('shows how they feel: down to music and reading, up to company, tense to revision', () => {
    const one = (over: Partial<LawnGroup>): Map<LawnKind, number> => spread(group({ size: 1, ...over }));
    expect(one({ mood: 'down' }).get('music') ?? 0).toBeGreaterThan(one({}).get('music') ?? 0);
    const two = (over: Partial<LawnGroup>): Map<LawnKind, number> => spread(group({ size: 2, ...over }));
    const social = (m: Map<LawnKind, number>): number => ['selfie', 'goof', 'dance', 'hug'].reduce((n, k) => n + (m.get(k as LawnKind) ?? 0), 0);
    expect(social(two({ mood: 'up' }))).toBeGreaterThan(social(two({ mood: 'down' })));
    expect(one({ mood: 'tense' }).get('study') ?? 0).toBeGreaterThan(one({}).get('study') ?? 0);
  });

  it('follows their nature: the outgoing keep company, the shy do something alone, the laid back lie in the sun', () => {
    const alone = (m: Map<LawnKind, number>): number => (m.get('phone') ?? 0) + (m.get('reading') ?? 0) + (m.get('music') ?? 0);
    expect(alone(spread(group({ size: 1, traits: { outgoing: 0 } })))).toBeGreaterThan(alone(spread(group({ size: 1, traits: { outgoing: 3 } }))));
    expect(spread(group({ size: 1, traits: { laidBack: 3 } })).get('sun') ?? 0).toBeGreaterThan(spread(group({ size: 1 })).get('sun') ?? 0);
    expect(spread(group({ size: 2, traits: { funny: 3 } })).get('goof') ?? 0).toBeGreaterThan(spread(group({ size: 2 })).get('goof') ?? 0);
  });

  it('puts couples together most of the time', () => {
    const kinds = spread(group({ size: 2, couple: true }));
    expect(kinds.get('couple') ?? 0).toBeGreaterThan(300);
  });

  it('gives every kind a size, a pose and words', () => {
    for (const kind of LAWN_KINDS) {
      const [least, most] = LAWN_SIZE[kind];
      expect(least).toBeGreaterThanOrEqual(1);
      expect(most).toBeGreaterThanOrEqual(least);
      expect(LAWN_POSE[kind]).toBeTruthy();
      const words = lawnWords(kind, 'the quad', most > 1 ? ['Sasha'] : []);
      expect(words.length).toBeGreaterThan(5);
      if (most > 1 && !['jog', 'dog', 'sun', 'nap', 'phone', 'reading', 'music'].includes(kind)) expect(words).toContain('Sasha');
    }
  });

  it('names a big group by one friend and how many others', () => {
    expect(lawnWords('circle', 'the quad', ['Sasha', 'Nico', 'Toni'])).toBe('Hanging out with Sasha and 2 friends on the quad');
    expect(lawnWords('picnic', 'the lawn', ['Sasha', 'Nico'])).toBe('Having a picnic with Sasha and Nico on the lawn');
  });
});

describe('the busy quad and the party night (L6)', () => {
  it('never chooses a kind the lawns place themselves: crossing a quad, a party', () => {
    const periods: DayPeriod[] = ['morning', 'afternoon', 'evening', 'night'];
    for (const period of periods) {
      for (let size = 1; size <= 5; size++) {
        for (let n = 0; n < 200; n++) {
          const kind = chooseLawnKind(group({ size, couple: size === 2 && n % 2 === 0, likes: new Set(['partying', 'music']) }), period, 'clear', n / 200);
          expect(PLACED_KINDS.has(kind)).toBe(false);
        }
      }
    }
    expect(STROLL_SHARE).toBeGreaterThan(0);
    expect(STROLL_SHARE).toBeLessThan(0.3);
  });

  it('says where people crossing and partying are', () => {
    expect(lawnWords('stroll', 'the quad', ['Sasha'])).toBe('Walking across the quad with Sasha');
    expect(lawnWords('party', 'Greek Row', ['Sasha', 'Nico', 'Toni', 'Ali'])).toBe('At a party with Sasha and 3 friends on Greek Row');
  });

  it('has a party only Thursday to Saturday, in the evening or at night, in term, in fine weather, on a game with parties', () => {
    const night: PartyFacts = { weekday: 5, period: 'night', weather: 'clear', term: true, parties: true };
    expect(partyTonight(night)).toBe(true);
    expect(partyTonight({ ...night, weekday: 4, period: 'evening' })).toBe(true);
    expect(partyTonight({ ...night, weekday: 6 })).toBe(true);
    for (const weekday of [0, 1, 2, 3]) expect(partyTonight({ ...night, weekday })).toBe(false);
    expect(partyTonight({ ...night, period: 'afternoon' })).toBe(false);
    expect(partyTonight({ ...night, period: 'morning' })).toBe(false);
    expect(partyTonight({ ...night, weather: 'rain' })).toBe(false);
    expect(partyTonight({ ...night, weather: 'snow' })).toBe(false);
    expect(partyTonight({ ...night, term: false })).toBe(false);
    expect(partyTonight({ ...night, parties: false })).toBe(false);
  });

  it('draws 15 to 30 at a party at Normal, fewer at Low and more at High, and fills Friday and Saturday more than Thursday', () => {
    for (let n = 0; n <= 20; n++) {
      const roll = n / 20;
      for (const weekday of [4, 5, 6]) {
        const normal = partySize(2, weekday, roll);
        expect(normal).toBeGreaterThanOrEqual(15);
        expect(normal).toBeLessThanOrEqual(30);
        expect(partySize(1, weekday, roll)).toBeLessThan(normal);
        expect(partySize(3, weekday, roll)).toBeGreaterThan(normal);
        expect(partySize(0, weekday, roll)).toBeLessThanOrEqual(partySize(1, weekday, roll));
      }
      expect(partySize(2, 4, roll)).toBeLessThanOrEqual(partySize(2, 5, roll));
    }
    expect(PARTY_SIZES[2]).toEqual([15, 30]);
    expect(partySize(2, 6, 1)).toBe(30);
  });

  it('fills the lawns more at Normal than before L6, so the quad reads as the hub', () => {
    expect(CROWD_STEPS[2]!.lawn).toBeGreaterThanOrEqual(110);
    expect(CROWD_STEPS[3]!.lawn).toBeGreaterThan(CROWD_STEPS[2]!.lawn);
  });
});
