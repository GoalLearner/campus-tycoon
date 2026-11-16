import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { momentWeights, MOMENT_KINDS, watchWords, actorWords, type MomentFacts } from '../src/app/crowdMoments';
import {
  alongBy,
  CHAOS_CROWD,
  chaosCrowd,
  dustupBeat,
  DUSTUP_BEATS,
  DUSTUP_ROUNDS,
  FLEE,
  LEFT_ALONE_MS,
  NO_CHAOS,
  RALLY_AT_STEP,
  rallySize,
  RUN,
  setOff,
  shoutTurn,
  showsFor,
  showWords,
  signKey,
  SHOWS_AT_ONCE,
  WATCH_RUN,
  type ShowRole,
} from '../src/app/mayhemShow';
import { toneProblem } from '../src/sim';
import { hardLineProblem } from '../src/sim/config/hardLines';
import type { ProtestTopic } from '../src/sim/config/chaos';

/**
 * The chaos sandbox, C2 (DESIGN.md 76): the crowd shows it. The plain rules for staging chaos's incidents where they
 * happen and for how the Chaos meter shows in the everyday crowd. All for show: nothing here is saved.
 */

const TOPICS: ProtestTopic[] = ['beds', 'food', 'parking', 'policy'];
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('the meter in the everyday crowd', () => {
  it('leaves a campus with no chaos as it was', () => {
    expect(chaosCrowd(null)).toEqual(NO_CHAOS);
    expect(NO_CHAOS).toEqual({ moments: 1, shouting: 0, bump: 0, gap: 1, daytime: false });
  });

  it('grows rowdier step by step, from Serene to Pandemonium', () => {
    expect(CHAOS_CROWD).toHaveLength(6);
    for (let step = 1; step < CHAOS_CROWD.length; step++) {
      const was = CHAOS_CROWD[step - 1]!;
      const now = CHAOS_CROWD[step]!;
      expect(now.moments).toBeGreaterThan(was.moments);
      expect(now.shouting).toBeGreaterThanOrEqual(was.shouting);
      expect(now.bump).toBeGreaterThanOrEqual(was.bump);
      expect(now.gap).toBeLessThanOrEqual(was.gap);
    }
    // Serene is calmer than a campus with no chaos; Calm is as it was; scuffles in daylight from Rowdy.
    expect(chaosCrowd(0).moments).toBeLessThan(1);
    expect(chaosCrowd(1).moments).toBe(1);
    expect(CHAOS_CROWD.map((one) => one.daytime)).toEqual([false, false, false, true, true, true]);
    expect(chaosCrowd(9)).toEqual(CHAOS_CROWD[5]);
    expect(chaosCrowd(-2)).toEqual(CHAOS_CROWD[0]);
  });

  it('scales the crowd moments: more scuffles and arguments, a shouting match, daytime scuffles from Rowdy', () => {
    const facts: MomentFacts = { period: 'afternoon', weather: 'clear', partyNight: false, commencement: false, busker: false, dance: false, courts: false, fountain: false, couples: true, pairs: true };
    // As before with no chaos given.
    expect(momentWeights(facts)).toEqual({ coupleFight: 0.8 });
    expect(momentWeights({ ...facts, chaos: chaosCrowd(1) })).toEqual({ coupleFight: 0.8 });
    const rowdy = momentWeights({ ...facts, chaos: chaosCrowd(3) });
    expect(rowdy.dustup).toBeGreaterThan(0);
    expect(rowdy.shouting).toBeGreaterThan(0);
    expect(rowdy.coupleFight).toBeGreaterThan(0.8);
    const wild = momentWeights({ ...facts, chaos: chaosCrowd(5) });
    expect(wild.dustup!).toBeGreaterThan(rowdy.dustup!);
    expect(momentWeights({ ...facts, chaos: chaosCrowd(0) }).coupleFight).toBeLessThan(0.8);
    // Never a scuffle in the snow.
    expect(momentWeights({ ...facts, weather: 'snow', chaos: chaosCrowd(5) }).dustup).toBeUndefined();
    // The rally and the chase are staged at an incident, never chosen by the crowd.
    expect(wild.rally).toBeUndefined();
    expect(wild.prank).toBeUndefined();
  });

  it('runs watchers over to a dust-up, quicker than a walk', () => {
    expect(WATCH_RUN).toBeGreaterThan(1.5);
    expect(RUN).toBeGreaterThan(0.85 * 2);
    expect(FLEE).toBeGreaterThan(RUN);
  });
});

describe('a staged incident', () => {
  it('plays a dust-up in rounds: an argument, the cloud, apart; then a glare', () => {
    expect(dustupBeat(0).phase).toBe('argue');
    expect(dustupBeat(DUSTUP_BEATS.argue + 10).phase).toBe('cloud');
    expect(dustupBeat(DUSTUP_BEATS.argue + DUSTUP_BEATS.cloud + 10).phase).toBe('apart');
    const round = DUSTUP_BEATS.argue + DUSTUP_BEATS.cloud + DUSTUP_BEATS.apart;
    expect(dustupBeat(round + 5)).toEqual({ phase: 'argue', round: 1, into: 5 });
    expect(dustupBeat(round * DUSTUP_ROUNDS + 100).phase).toBe('glare');
    // The cloud is the crowd's own length, so both kinds of scuffle look alike.
    expect(DUSTUP_BEATS.cloud).toBe(2800);
    // Left alone, they part after the rounds.
    expect(LEFT_ALONE_MS.dustUp).toBeGreaterThan(round * DUSTUP_ROUNDS);
  });

  it('takes turns in a shouting match', () => {
    expect(shoutTurn(0)).toBe(0);
    expect(shoutTurn(1800)).toBe(1);
    expect(shoutTurn(3500)).toBe(0);
  });

  it('runs Campus Safety in: setting off later than a walk, arriving on the minute the simulation gave', () => {
    const began = 1_000_000;
    const ends = began + 4 * 60_000;
    const from = setOff(began, ends, 11);
    expect(from).toBeGreaterThan(began);
    expect(ends - from).toBeCloseTo((11 / RUN) * 1000, 6);
    expect(alongBy(from, ends, from - 1)).toBe(0);
    expect(alongBy(from, ends, ends)).toBe(1);
    expect(alongBy(from, ends, (from + ends) / 2)).toBeCloseTo(0.5, 6);
    // Too far to run in the time: they set off at once.
    expect(setOff(began, began + 1000, 50)).toBe(began);
  });

  it('holds up a sign of its own for each thing students protest about, and rallies bigger at a higher crowd setting', () => {
    for (const topic of TOPICS) expect(signKey(topic)).toBe(`emote.sign-${topic}`);
    for (let step = 1; step < RALLY_AT_STEP.length; step++) expect(rallySize(step)).toBeGreaterThan(rallySize(step - 1));
    expect(rallySize(0)).toBeGreaterThanOrEqual(4);
    expect(rallySize(9)).toBe(RALLY_AT_STEP[RALLY_AT_STEP.length - 1]);
  });

  it('stages chaos only, where the player is looking, nearest first, a few at most', () => {
    const incidents = [
      { id: 1, chaos: 'dustUp' as const },
      { id: 2 },
      { id: 3, chaos: 'protest' as const },
      { id: 4, chaos: 'prank' as const },
      { id: 5, chaos: 'shouting' as const },
      { id: 6, chaos: 'graffiti' as const },
    ];
    const far: Record<number, number | null> = { 1: 300, 2: 10, 3: 50, 4: null, 5: 120, 6: 900 };
    expect(showsFor(incidents, (one) => far[one.id]!).map((one) => one.id)).toEqual([3, 5, 1]);
    expect(showsFor(incidents, (one) => far[one.id]!, 1).map((one) => one.id)).toEqual([3]);
    expect(SHOWS_AT_ONCE).toBeLessThanOrEqual(3);
  });

  it('says what each is doing on their card in comic words, inside the tone guide and its hard lines', () => {
    const roles: ShowRole[] = ['dustUp', 'shouting', 'prank', 'graffiti', 'protest', 'patched'];
    const lines = [...roles.map((role) => showWords(role)), ...TOPICS.map((topic) => showWords('protest', topic))];
    for (const kind of MOMENT_KINDS) lines.push(watchWords(kind), actorWords(kind, 'Sasha'), actorWords(kind, null));
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(5);
      expect(toneProblem(line), line).toBeNull();
      expect(hardLineProblem(line), line).toBeNull();
      // Comic words (16.2, 68): never a riot, a brawl, a crime or vandalism.
      expect(line.toLowerCase()).not.toMatch(/riot|brawl|crime|vandal|fight|punch/);
    }
    expect(showWords('protest', 'beds')).toContain('more beds');
  });
});

describe('the art', () => {
  it('has the plaster and the four signs in the built-in atlas, named in both recipes and credited', () => {
    const atlas = JSON.parse(read('../public/assets/atlas.json')) as { frames: Record<string, unknown> };
    const kenney = read('../art/recipes/kenney.json');
    const penzilla = read('../art/recipes/penzilla.json');
    for (const key of ['emote.bandage', ...TOPICS.map(signKey)]) {
      expect(atlas.frames[key], key).toBeDefined();
      expect(kenney).toContain(`"${key}"`);
      expect(penzilla).toContain(`"${key}"`);
    }
    expect(read('../CREDITS.md')).toContain('four rally signs for the chaos sandbox');
  });
});
