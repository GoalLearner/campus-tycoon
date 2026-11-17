import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  approvalAt,
  campusHappiness,
  campusPlay,
  CROWD_WORST_AT,
  habitsOf,
  parseSave,
  partLevel,
  PASTIME_OF,
  PASTIMES,
  PLACED,
  PLAY_SHARE,
  playCapacity,
  playLine,
  playOf,
  playPlaceFor,
  playUse,
  sampleStudents,
  SAVE_VERSION,
  serialize,
  spillOver,
  studentCard,
  waitMinutes,
  type Action,
  type GameState,
  type Placed,
  type StudentRef,
} from '../src/sim';
import { movedAway, natureOf, usesWords } from '../src/sim/systems/students';
import { placedSummary } from '../src/ui/buildUi';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

/**
 * Places to play serve the students who use them, wherever they live (the owner, 2026-11-17: "It's whether the student
 * actually uses these facilities or not"; DESIGN.md 83.2).
 */

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The starter campus with a given number of students and money to build. Its dorms stand at 10 to 12, 13; its lecture halls at 19 to 21, 18. */
function campus(students: number): GameState {
  const state = structuredClone(advance(freshGame(), T0, T0 + 20 * MIN).state);
  state.money.cash = 10_000_000;
  state.cohorts = [students, 0, 0, 0, 0, 0];
  state.admissions.waitlist = 0;
  return state;
}

const first = (state: GameState, type: string): Placed => state.map.placed.find((placed) => placed?.type === type)!;
const all = (state: GameState, type: string): Placed[] => state.map.placed.filter((placed): placed is Placed => placed?.type === type);
/** A court just south of the starter dorms: basketball. */
const withCourt = (state: GameState): GameState => act(state, { type: 'place', building: 'courts', x: 9, y: 15 });
const habits = (state: GameState, ref: StudentRef) => habitsOf(state.seed, ref, natureOf(state.seed, ref, movedAway(state.seed, ref)));
/** Students on campus for this many to want the courts at the busiest hour. */
function wanting(players: number): number {
  return Math.round(players / (PLAY_SHARE * campusPlay(campus(1000)).rooms.basketball.share));
}

describe('how many a recreation building holds', () => {
  it('fits a game or two on a court, more on the track and in the pool, and most in the gym', () => {
    const holds = (type: 'courts' | 'field' | 'pool' | 'track' | 'gym'): number => PLACED[type].capacity ?? 0;
    expect(holds('courts')).toBe(8);
    expect(holds('courts')).toBeLessThan(holds('field'));
    expect(holds('field')).toBeLessThan(holds('pool'));
    expect(holds('track')).toBeGreaterThanOrEqual(holds('pool'));
    expect(holds('gym')).toBeGreaterThan(holds('track'));
    const state = withCourt(campus(100));
    expect(playCapacity(first(state, 'courts'))).toBe(8);
    expect(playCapacity(first(state, 'dining'))).toBe(0);
    expect(playUse(state, first(state, 'dining'))).toBeNull();
  });

  it('is for one thing students do: every place to play has its pastime', () => {
    for (const type of Object.keys(PLACED) as Array<keyof typeof PLACED>) {
      if (PLACED[type].family === 'recreation') expect(PASTIME_OF[type], type).toBeDefined();
    }
    expect(PASTIME_OF.courts).toBe('basketball');
    expect(PASTIME_OF.soccer).toBe('field');
  });
});

describe('what students do for fun', () => {
  const state = campus(2000);
  const refs = sampleStudents(state).slice(0, 2000);

  it('is their own, from who they are, and the same every time', () => {
    for (const ref of refs.slice(0, 50)) expect(habits(state, ref)).toEqual(habits(state, ref));
    // The same student a year on does the same things.
    const later = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 3 * DAY).state;
    for (const ref of refs.slice(0, 50)) expect(habitsOf(later.seed, ref, natureOf(later.seed, ref, movedAway(later.seed, ref)))).toEqual(habits(state, ref));
  });

  it('is at the real shares: most work out, some swim or play, a third do nothing at the rec at all', () => {
    const share = (test: (one: ReturnType<typeof habits>) => boolean): number => refs.filter((ref) => test(habits(state, ref))).length / refs.length;
    expect(share((one) => one.activities.includes('workout'))).toBeGreaterThan(0.36);
    expect(share((one) => one.activities.includes('workout'))).toBeLessThan(0.54);
    expect(share((one) => one.activities.includes('swim'))).toBeGreaterThan(0.08);
    expect(share((one) => one.activities.includes('swim'))).toBeLessThan(0.22);
    expect(share((one) => one.activities.includes('tennis'))).toBeLessThan(0.1);
    const any = share((one) => one.activities.length > 0);
    expect(any).toBeGreaterThan(0.55);
    expect(any).toBeLessThan(0.78);
  });
});

describe('who it lifts', () => {
  it('lifts those who play basketball, wherever they live, and nobody else', () => {
    const state = withCourt(campus(200));
    let players = 0;
    for (const ref of sampleStudents(state).slice(0, 300)) {
      const own = habits(state, ref);
      const play = playOf(state, ref, own);
      if (own.activities.length === 0) {
        // Doing nothing for fun, they are neither helped nor hurt: no recreation part at all.
        expect(play.level).toBeNull();
        const card = studentCard(state, ref)!;
        expect(card.uses.got).toEqual([]);
        continue;
      }
      // What they can do is basketball, and only for those who play it.
      expect(play.got).toEqual(own.activities.filter((one) => one === 'basketball'));
      expect(play.missing).toEqual(own.activities.filter((one) => one !== 'basketball'));
      // Its own lift: an outdoor court's 0.4, to those who play basketball, and nothing for the rest of what they do.
      expect(play.level).toBeCloseTo(play.got.length > 0 ? PLACED.courts.strength : 0, 9);
      if (play.got.length > 0) players += 1;
    }
    expect(players).toBeGreaterThan(5);
  });

  it('gives a student the same Food & fun in a dorm beside it as in a lecture hall across campus', () => {
    const state = withCourt(campus(200));
    const who = { recreation: 0.5, dining: 1 };
    const life = (cell: number) => approvalAt(state, cell, undefined, who).causes.find((cause) => cause.id === 'life')!;
    expect(life(13 * state.map.width + 10)).toEqual(life(18 * state.map.width + 20));
    // No recreation part for one who does nothing for fun: their Food & fun is their food.
    const none = approvalAt(state, 13 * state.map.width + 10, undefined, { recreation: null, dining: 1 });
    expect(partLevel(none.causes, 'recreation')).toBeUndefined();
  });

  it('pays to build what students use: a pool anywhere lifts every swimmer, and a second court of the same kind adds nothing while there is room', () => {
    const court = withCourt(campus(200));
    const pool = act(court, { type: 'place', building: 'pool', x: 3, y: 28 });
    expect(campusPlay(pool).rooms.swim.has).toBe(true);
    expect(campusPlay(pool).level).toBeGreaterThan(campusPlay(court).level);
    expect(campusHappiness(pool).score).toBeGreaterThan(campusHappiness(court).score);
    const swimmer = sampleStudents(court).find((ref) => habits(court, ref).activities.includes('swim'))!;
    expect(playOf(court, swimmer, habits(court, swimmer)).missing).toContain('swim');
    expect(playOf(pool, swimmer, habits(pool, swimmer)).got).toContain('swim');
    const two = act(court, { type: 'place', building: 'courts', x: 3, y: 28 });
    expect(campusPlay(two).level).toBeCloseTo(campusPlay(court).level, 9);
  });
});

describe('when more want to play than the campus holds', () => {
  it('lets everyone play while there is room', () => {
    const state = withCourt(campus(wanting(7)));
    const use = playUse(state, first(state, 'courts'))!;
    expect(use.waiting).toBe(0);
    expect(use.served).toBe(1);
    expect(waitMinutes(use)).toBe(0);
  });

  it('turns the rest away when every place of its kind is full, and they miss it', () => {
    const busy = withCourt(campus(wanting(16)));
    const room = campusPlay(busy).rooms.basketball;
    expect(room.demand).toBeGreaterThan(14);
    expect(room.served).toBeCloseTo(8 / room.demand, 9);
    const use = playUse(busy, first(busy, 'courts'))!;
    expect(use.playing).toBe(8);
    expect(use.waiting).toBe(Math.round(room.demand) - 8);
    expect(waitMinutes(use)).toBeGreaterThan(0);
    expect(waitMinutes({ waiting: 1, ratio: CROWD_WORST_AT })).toBe(20);
    // About half of those who play basketball are turned away, and miss it; the rest play.
    let full = 0;
    let got = 0;
    for (const ref of sampleStudents(busy).slice(0, 800)) {
      const play = playOf(busy, ref, habits(busy, ref));
      if (play.full.includes('basketball')) full += 1;
      if (play.got.includes('basketball')) got += 1;
    }
    expect(full / (full + got)).toBeGreaterThan(1 - room.served - 0.15);
    expect(full / (full + got)).toBeLessThan(1 - room.served + 0.15);
  });

  it('lets them in again when a second court goes up anywhere on the campus, even far from everyone', () => {
    const one = withCourt(campus(wanting(12)));
    expect(campusPlay(one).rooms.basketball.served).toBeLessThan(1);
    const two = act(one, { type: 'place', building: 'courts', x: 3, y: 28 });
    expect(campusPlay(two).rooms.basketball.served).toBe(1);
    for (const court of all(two, 'courts')) expect(playUse(two, court)!.waiting).toBe(0);
    expect(campusPlay(two).level).toBeGreaterThan(campusPlay(one).level);
    // Demand is shared, never made: the two together are asked for what the one was.
    expect(all(two, 'courts').reduce((sum, court) => sum + playUse(two, court)!.demand, 0)).toBeCloseTo(playUse(one, first(one, 'courts'))!.demand, 9);
  });

  it('shares a kind out by size and nearness: the court beside the dorms has more who come first than one in the far corner', () => {
    const state = act(withCourt(campus(wanting(4))), { type: 'place', building: 'courts', x: 3, y: 28 });
    const near = first(state, 'courts');
    const far = all(state, 'courts').find((placed) => placed.y === 28)!;
    expect(campusPlay(state).firsts.get(far.id)!).toBeGreaterThan(0);
    expect(campusPlay(state).firsts.get(far.id)!).toBeLessThan(campusPlay(state).firsts.get(near.id)!);
  });

  it('sends a student most often to the nearest, on from a full one to one with room, and has them wait where they came first when all are full', () => {
    const state = act(withCourt(campus(wanting(14))), { type: 'place', building: 'courts', x: 3, y: 28 });
    const near = first(state, 'courts');
    const far = all(state, 'courts').find((placed) => placed.y === 28)!;
    expect(campusPlay(state).firsts.get(near.id)!).toBeGreaterThan(8);
    const picks = (one: GameState): number[] => Array.from({ length: 200 }, (_, i) => playPlaceFor(one, 10, 13, (i + 0.5) / 200, 'basketball')!.id);
    const roomy = picks(state);
    const wentOn = roomy.filter((id) => id === far.id).length;
    expect(wentOn).toBeGreaterThan(0);
    expect(roomy.filter((id) => id === near.id).length).toBeGreaterThan(wentOn);
    const swamped = act(withCourt(campus(3000)), { type: 'place', building: 'courts', x: 3, y: 28 });
    expect(picks(swamped).filter((id) => id === far.id).length).toBeLessThan(wentOn);
    // Nobody goes to a place for a pastime it is not for.
    expect(playPlaceFor(state, 10, 13, 0.5, 'swim')).toBeNull();
  });

  it('spills what one place cannot take to those with room, and waits where it came first only when every one is full', () => {
    expect(spillOver([12, 0], [8, 8])).toEqual([8, 4]);
    expect(spillOver([6, 2], [8, 8])).toEqual([6, 2]);
    const over = spillOver([18, 2], [8, 8]);
    expect(over[0]).toBeCloseTo(12, 9);
    expect(over[1]).toBeCloseTo(8, 9);
  });
});

describe('what the player is told', () => {
  it('says on the building how full it is at peak, who is turned away, and that another of its kind lets them in', () => {
    const line = (players: number): string => {
      const state = withCourt(campus(wanting(players)));
      return playLine(playUse(state, first(state, 'courts'))!);
    };
    expect(playLine(playUse(withCourt(campus(0)), first(withCourt(campus(0)), 'courts'))!)).toBe('Nobody playing here yet. It holds 8.');
    expect(line(3)).toMatch(/^Room to spare: 3 of 8 playing at peak\.$/);
    expect(line(16)).toMatch(/^Full, \d+ turned away at peak\. Every place of its kind is full: another anywhere on campus lets them in\.$/);
    const state = withCourt(campus(wanting(16)));
    const summary = placedSummary(state, first(state, 'courts'));
    expect(summary).toMatch(/^Raises happiness for students who use it\. Full, \d+ turned away at peak\./);
    expect(summary.split('. ').slice(0, 2).join('. ')).not.toMatch(/within|cells/);
  });

  it('has a student say what they miss: a kind the campus lacks, or a full place, and names it', () => {
    const state = withCourt(campus(wanting(16)));
    const said: string[] = [];
    for (const ref of sampleStudents(state).slice(0, 800)) {
      const card = studentCard(state, ref)!;
      if (card.reason?.part !== 'recreation' || card.reason.positive) continue;
      said.push(card.reason.thought);
      // Never about a pastime they do not have.
      if (/swim/.test(card.reason.thought)) expect([...card.uses.missing, ...card.uses.full]).toContain('swim');
    }
    expect(said.some((line) => /full|Could not get into/.test(line))).toBe(true);
    expect(said.some((line) => /if the campus had|nowhere to do it/.test(line))).toBe(true);
    // A student who does nothing for fun never names it.
    for (const ref of sampleStudents(state).slice(0, 800)) {
      const card = studentCard(state, ref)!;
      if (card.uses.got.length + card.uses.full.length + card.uses.missing.length === 0) expect(card.reason?.part).not.toBe('recreation');
    }
  });

  it('says on a card, briefly, what the student uses', () => {
    expect(usesWords({ got: ['workout', 'basketball'], full: [], missing: [], union: false, food: 'taco', fed: true })).toBe('The gym and basketball · eats at the taco stand');
    expect(usesWords({ got: [], full: [], missing: ['swim'], union: false, food: 'dining', fed: true })).toBe('Nothing for fun · eats at the dining hall · wants a pool');
    expect(usesWords({ got: ['workout'], full: ['swim'], missing: [], union: true, food: null, fed: false })).toBe('The gym, the pool and the Union · nowhere to eat · the pool was full');
    const state = withCourt(campus(200));
    const card = studentCard(state, sampleStudents(state)[0]!)!;
    expect(usesWords(card.uses).length).toBeLessThan(90);
  });

  it('tells a player with an older save, once', () => {
    expect(upgradeNotes(9).some((note) => /hold so many students at once/.test(note))).toBe(true);
    expect(upgradeNotes(41).some((note) => /students who use them, wherever they live/.test(note))).toBe(true);
    expect(upgradeNotes(42)).toEqual([]);
  });
});

describe('the numbers behind it', () => {
  it('are the same however the time is cut up, and survive a save', () => {
    const start = withCourt(campus(900));
    const end = start.clock.lastSimulatedAt + 2 * DAY;
    const once = advance(start, start.clock.lastSimulatedAt, end).state;
    let stepped = start;
    for (let at = start.clock.lastSimulatedAt + 5 * HOUR + 7 * MIN; at < end; at += 5 * HOUR + 7 * MIN) stepped = advance(stepped, stepped.clock.lastSimulatedAt, at).state;
    stepped = advance(stepped, stepped.clock.lastSimulatedAt, end).state;
    expect(stepped).toEqual(once);
    expect(playUse(stepped, first(stepped, 'courts'))).toEqual(playUse(once, first(once, 'courts')));
    expect(campusHappiness(stepped).score).toBe(campusHappiness(once).score);
    const loaded = parseSave(serialize(once, end));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(playUse(loaded.state, first(loaded.state, 'courts'))).toEqual(playUse(once, first(once, 'courts')));
  });

  it('never ask what time it is', () => {
    const state = withCourt(campus(wanting(12)));
    const use = playUse(state, first(state, 'courts'));
    const level = campusPlay(state).level;
    for (const hours of [0, 6, 13, 21]) {
      const later = structuredClone(state);
      later.clock.tick += hours * 60;
      later.clock.lastSimulatedAt += hours * HOUR;
      later.clock.nextTickAt += hours * HOUR;
      expect(playUse(later, first(later, 'courts'))).toEqual(use);
      expect(campusPlay(later).level).toBe(level);
    }
  });
});
