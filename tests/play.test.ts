import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  approvalAt,
  campusHappiness,
  CROWD_LIFT_FLOOR,
  CROWD_WORST_AT,
  crowdedNear,
  crowdLift,
  parseSave,
  partLevel,
  PLACED,
  PLAY_SHARE,
  playCapacity,
  playLine,
  playUse,
  recreationAt,
  sampleStudents,
  SAVE_VERSION,
  serialize,
  studentCard,
  waitMinutes,
  type Action,
  type GameState,
  type Placed,
} from '../src/sim';
import { placedSummary } from '../src/ui/buildUi';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, freshGame, HOUR, MIN, T0 } from './helpers';

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The starter campus with a given number of students and money to build. Its dorms stand at 10 to 12, 13. */
function campus(students: number): GameState {
  const state = structuredClone(advance(freshGame(), T0, T0 + 20 * MIN).state);
  state.money.cash = 10_000_000;
  state.cohorts = [students, 0, 0, 0];
  state.admissions.waitlist = 0;
  return state;
}

const first = (state: GameState, type: string): Placed => state.map.placed.find((placed) => placed?.type === type)!;
const all = (state: GameState, type: string): Placed[] => state.map.placed.filter((placed): placed is Placed => placed?.type === type);
/**
 * A court just south of the starter dorms. The three dorms are within its four
 * cells and the three lecture halls are not, so it has half the campus's lots:
 * one student in forty wants it at the busiest hour.
 */
const withCourt = (state: GameState): GameState => act(state, { type: 'place', building: 'courts', x: 9, y: 15 });
/** Students on campus for this many to want the court at peak. */
const wanting = (players: number): number => (players * 2) / PLAY_SHARE;

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

  it('takes its demand from the students around it: a share of them at the busiest hour', () => {
    const state = withCourt(campus(200));
    const use = playUse(state, first(state, 'courts'))!;
    // Half the campus's lots are in the court's reach, and it is the only place to play.
    expect(use.demand).toBeCloseTo(200 * 0.5 * PLAY_SHARE, 9);
    expect(use.playing).toBe(5);
    expect(use.waiting).toBe(0);
    expect(use.lift).toBe(1);
    // Twice the students, twice the demand.
    expect(playUse(withCourt(campus(400)), first(state, 'courts'))!.demand).toBeCloseTo(400 * 0.5 * PLAY_SHARE, 9);
    // Nobody enrolled, nobody playing.
    expect(playUse(withCourt(campus(0)), first(state, 'courts'))!.demand).toBe(0);
  });
});

describe('when more want to play than fit', () => {
  it('lets everyone play, with the whole lift, while demand is under what it holds', () => {
    const state = withCourt(campus(wanting(8)));
    const use = playUse(state, first(state, 'courts'))!;
    expect(use.demand).toBeCloseTo(8, 9);
    expect(use.waiting).toBe(0);
    expect(use.lift).toBe(1);
    expect(waitMinutes(use)).toBe(0);
    expect(recreationAt(state, 10, 13)).toBeCloseTo(PLACED.courts.strength, 9);
    expect(crowdedNear(state, 10, 13)).toBeNull();
  });

  it('makes the rest wait, and takes a little off the lift, never below its floor', () => {
    // Twelve want the court and it holds eight.
    const busy = withCourt(campus(wanting(12)));
    const use = playUse(busy, first(busy, 'courts'))!;
    expect(use.playing).toBe(8);
    expect(use.waiting).toBe(4);
    expect(use.ratio).toBeCloseTo(1.5, 9);
    expect(use.lift).toBeCloseTo(1 - (1 - CROWD_LIFT_FLOOR) / 2, 9);
    expect(waitMinutes(use)).toBe(10);
    expect(recreationAt(busy, 10, 13)).toBeCloseTo(PLACED.courts.strength * use.lift, 9);
    // Twice what it holds is as bad as it gets. Ten times is no worse.
    const full = playUse(withCourt(campus(wanting(16))), first(busy, 'courts'))!;
    const swamped = playUse(withCourt(campus(3000)), first(busy, 'courts'))!;
    expect(full.lift).toBeCloseTo(CROWD_LIFT_FLOOR, 9);
    expect(swamped.lift).toBe(CROWD_LIFT_FLOOR);
    expect(swamped.waiting).toBe(Math.round(3000 * 0.5 * PLAY_SHARE) - 8);
    expect(waitMinutes(swamped)).toBe(20);
    expect(crowdLift(CROWD_WORST_AT)).toBeCloseTo(CROWD_LIFT_FLOOR, 9);
    for (const ratio of [0, 0.5, 1, 1.2, 1.7, 2, 5, 50]) {
      expect(crowdLift(ratio)).toBeGreaterThanOrEqual(CROWD_LIFT_FLOOR);
      expect(crowdLift(ratio)).toBeLessThanOrEqual(1);
    }
  });

  it('costs Happiness only a little, and touches nothing else', () => {
    const quiet = withCourt(campus(wanting(8)));
    const swamped = withCourt(campus(3000));
    // The same campus with the same students, once with a court that could hold them all.
    const roomy = structuredClone(swamped);
    roomy.map.care.play = { [first(roomy, 'courts').id]: 0 };
    const cell = 13 * swamped.map.width + 10;
    const lost = approvalAt(roomy, cell).score - approvalAt(swamped, cell).score;
    expect(lost).toBeGreaterThan(0);
    // Things to do is half of one of four causes, and the court is 0.4 of that: 30% of it is 1.5 points.
    expect(lost).toBeLessThan(2);
    expect(partLevel(approvalAt(swamped, cell).causes, 'recreation')).toBeCloseTo(PLACED.courts.strength * CROWD_LIFT_FLOOR, 9);
    expect(partLevel(approvalAt(quiet, cell).causes, 'recreation')).toBeCloseTo(PLACED.courts.strength, 9);
    // Money, room and growth do not ask about the line.
    const before = advance(swamped, swamped.clock.lastSimulatedAt, swamped.clock.lastSimulatedAt + HOUR).state;
    const after = advance(roomy, roomy.clock.lastSimulatedAt, roomy.clock.lastSimulatedAt + HOUR).state;
    expect(before.money).toEqual(after.money);
    expect(before.cohorts).toEqual(after.cohorts);
    expect(before.map.buildings).toEqual(after.map.buildings);
  });

  it('clears the line when a second court is built beside the first, each with its own game', () => {
    const one = withCourt(campus(wanting(12)));
    expect(playUse(one, first(one, 'courts'))!.waiting).toBe(4);
    const two = act(one, { type: 'place', building: 'courts', x: 11, y: 15 });
    const courts = all(two, 'courts');
    expect(courts.length).toBe(2);
    for (const court of courts) {
      const use = playUse(two, court)!;
      expect(use.demand).toBeCloseTo(6, 9);
      expect(use.playing).toBe(6);
      expect(use.waiting).toBe(0);
      expect(use.lift).toBe(1);
    }
    // The lift at the dorm is whole again, and there are now two of them.
    expect(recreationAt(two, 10, 13)).toBeCloseTo(2 * PLACED.courts.strength, 9);
    // Demand is shared, never made: the two together are asked for what the one was.
    expect(courts.reduce((sum, court) => sum + playUse(two, court)!.demand, 0)).toBeCloseTo(playUse(one, first(one, 'courts'))!.demand, 9);
  });

  it('shares by size: a gym beside a court takes most of the crowd', () => {
    let state = withCourt(campus(wanting(48)));
    expect(playUse(state, first(state, 'courts'))!.waiting).toBe(40);
    // A gym whose eight cells reach the same three dorms and no lecture hall.
    state = act(state, { type: 'place', building: 'gym', x: 5, y: 13 });
    const court = playUse(state, first(state, 'courts'))!;
    const gym = playUse(state, first(state, 'gym'))!;
    // 48 want to play. The court holds 8 of the 48 places and the gym 40.
    expect(court.demand).toBeCloseTo(8, 9);
    expect(gym.demand).toBeCloseTo(40, 9);
    expect(court.waiting).toBe(0);
    expect(gym.waiting).toBe(0);
    // A court out of everyone's reach shares nothing and has nobody.
    state = act(state, { type: 'place', building: 'courts', x: 3, y: 28 });
    const far = all(state, 'courts').find((placed) => placed.y === 28)!;
    expect(playUse(state, far)!.demand).toBe(0);
    expect(playUse(state, first(state, 'gym'))!.demand).toBeCloseTo(40, 9);
  });
});

describe('what the player is told', () => {
  it('says on the building how full it is at peak, who waits, and when to build another', () => {
    const line = (students: number): string => {
      const state = withCourt(campus(students));
      return playLine(playUse(state, first(state, 'courts'))!);
    };
    expect(line(0)).toBe('Nobody near enough to use it yet. It holds 8.');
    expect(line(wanting(3))).toBe('Room to spare: 3 of 8 playing at peak.');
    expect(line(wanting(6))).toBe('Busy: 6 of 8 playing at peak.');
    expect(line(wanting(8))).toBe('Full at peak, and nobody waiting.');
    expect(line(wanting(9))).toBe('Full, 1 waiting at peak.');
    expect(line(wanting(16))).toBe('Full, 8 waiting at peak. Build another nearby to share the crowd.');
    // The card carries it.
    const state = withCourt(campus(wanting(16)));
    expect(placedSummary(state, first(state, 'courts'))).toMatch(/Full, 8 waiting at peak\. Build another nearby to share the crowd\./);
  });

  it('has about a third of the students near a crowded court say they waited, and nobody when there is room', () => {
    const state = withCourt(campus(3000));
    const court = first(state, 'courts');
    const cards = sampleStudents(state).slice(0, 600).map((ref) => studentCard(state, ref)!);
    const waited = cards.filter((card) => /Waited|line at/.test(card.reason?.thought ?? ''));
    // Only those who live in the dorms beside it: a commuter's lecture hall is out of the court's reach.
    const residents = cards.filter((card) => card.residence === 'dorm');
    expect(residents.length).toBeGreaterThan(100);
    expect(waited.length).toBeGreaterThan(residents.length * 0.2);
    expect(waited.length).toBeLessThan(residents.length * 0.5);
    for (const card of waited) {
      expect(card.residence).toBe('dorm');
      expect(card.reason!.thought).toMatch(/^(Waited 20 minutes for a court\. Another one nearby would clear the line\.|The line at a court was 20 minutes long today\. It needs a second one nearby\.)$/);
      expect(card.reason).toMatchObject({ cause: 'life', part: 'recreation', positive: false });
      // Tapping the thought goes to the court itself.
      expect(card.reason!.cell).toBe(court.y * state.map.width + court.x);
    }
    // With room for everyone nobody mentions a line.
    const calm = withCourt(campus(100));
    for (const ref of sampleStudents(calm).slice(0, 100)) expect(studentCard(calm, ref)!.reason?.thought ?? '').not.toMatch(/Waited|line at/);
  });

  it('tells a player with an older save, once', () => {
    expect(upgradeNotes(9).some((note) => /hold so many students at once/.test(note))).toBe(true);
    expect(upgradeNotes(10)).toEqual([]);
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
    // The same campus at four hours of the day and night: the simulation's own clock moves, the answer does not.
    const state = withCourt(campus(wanting(12)));
    const use = playUse(state, first(state, 'courts'));
    for (const hours of [0, 6, 13, 21]) {
      const later = structuredClone(state);
      later.clock.tick += hours * 60;
      later.clock.lastSimulatedAt += hours * HOUR;
      later.clock.nextTickAt += hours * HOUR;
      expect(playUse(later, first(later, 'courts'))).toEqual(use);
      expect(recreationAt(later, 10, 13)).toBe(recreationAt(state, 10, 13));
    }
  });
});
