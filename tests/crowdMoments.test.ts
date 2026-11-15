import { describe, expect, it } from 'vitest';
import { actorWords, chooseMoment, MOMENT_GAP_MS, MOMENT_KINDS, MOMENT_MS, momentWeights, WATCH_REACTIONS, WATCHERS_AT_STEP, watchWords, type MomentFacts, type MomentKind } from '../src/app/crowdMoments';
import { toneProblem } from '../src/sim';
import { hardLineProblem } from '../src/sim/config/hardLines';

/**
 * The living campus, L3 (DESIGN.md 64.4): moments the crowd gathers round. Which moment can happen is a plain rule
 * of the hour, the sky, the calendar and what is on screen; the map stages it. Nothing here is saved.
 */

const NOTHING: MomentFacts = { period: 'afternoon', weather: 'clear', partyNight: false, commencement: false, busker: false, dance: false, courts: false, fountain: false, couples: false, pairs: false };
const ALL_ON_SCREEN: MomentFacts = { ...NOTHING, busker: true, dance: true, courts: true, fountain: true, couples: true, pairs: true };

const spread = (facts: MomentFacts): Map<MomentKind | null, number> => {
  const out = new Map<MomentKind | null, number>();
  for (let i = 0; i < 1000; i++) {
    const kind = chooseMoment(facts, (i + 0.5) / 1000);
    out.set(kind, (out.get(kind) ?? 0) + 1);
  }
  return out;
};

describe('which moment', () => {
  it('stages nothing when nothing on screen could make one', () => {
    expect(chooseMoment(NOTHING, 0.5)).toBeNull();
    expect(momentWeights(NOTHING)).toEqual({});
  });

  it('keeps each moment to its time and place', () => {
    // A scuffle only of an evening or a night, between two walking close; never in snow.
    expect(momentWeights({ ...ALL_ON_SCREEN }).dustup).toBeUndefined();
    expect(momentWeights({ ...ALL_ON_SCREEN, period: 'evening' }).dustup).toBeGreaterThan(0);
    expect(momentWeights({ ...ALL_ON_SCREEN, period: 'night', weather: 'snow' }).dustup).toBeUndefined();
    // A proposal only at commencement; a dance-off only late; a fall into a fountain only on a fine day, not at night.
    expect(momentWeights(ALL_ON_SCREEN).proposal).toBeUndefined();
    expect(momentWeights({ ...ALL_ON_SCREEN, commencement: true }).proposal).toBeGreaterThan(0);
    expect(momentWeights(ALL_ON_SCREEN).danceOff).toBeUndefined();
    expect(momentWeights({ ...ALL_ON_SCREEN, period: 'night' }).danceOff).toBeGreaterThan(0);
    expect(momentWeights({ ...ALL_ON_SCREEN, weather: 'rain' }).fountain).toBeUndefined();
    expect(momentWeights({ ...ALL_ON_SCREEN, period: 'night' }).fountain).toBeUndefined();
    // Each needs its own people or place on screen.
    expect(momentWeights({ ...ALL_ON_SCREEN, busker: false }).performer).toBeUndefined();
    expect(momentWeights({ ...ALL_ON_SCREEN, courts: false }).winningShot).toBeUndefined();
    expect(momentWeights({ ...ALL_ON_SCREEN, couples: false }).coupleFight).toBeUndefined();
  });

  it('makes a scuffle likelier on a party night, and a proposal the likeliest at commencement', () => {
    const night = { ...ALL_ON_SCREEN, period: 'evening' as const };
    expect(momentWeights({ ...night, partyNight: true }).dustup!).toBeGreaterThan(momentWeights(night).dustup!);
    const day = spread({ ...ALL_ON_SCREEN, commencement: true });
    const most = [...day.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(most).toBe('proposal');
  });

  it('chooses the same for the same roll, and only kinds that can happen', () => {
    for (let i = 0; i < 100; i++) {
      const roll = (i * 37 % 100) / 100;
      expect(chooseMoment(ALL_ON_SCREEN, roll)).toBe(chooseMoment(ALL_ON_SCREEN, roll));
    }
    for (const kind of spread(ALL_ON_SCREEN).keys()) expect(kind === null || momentWeights(ALL_ON_SCREEN)[kind]! > 0).toBe(true);
  });
});

describe('how the crowd takes it', () => {
  it('holds a moment for a few seconds, with a good while between two', () => {
    for (const kind of MOMENT_KINDS) {
      expect(MOMENT_MS[kind]).toBeGreaterThanOrEqual(5000);
      expect(MOMENT_MS[kind]).toBeLessThanOrEqual(10_000);
    }
    expect(MOMENT_GAP_MS[0]).toBeGreaterThanOrEqual(15_000);
    expect(MOMENT_GAP_MS[1]).toBeGreaterThan(MOMENT_GAP_MS[0]);
  });

  it('draws more watchers at a higher crowd setting, and none when frames are short', () => {
    expect(WATCHERS_AT_STEP[0]).toBe(0);
    for (let i = 1; i < WATCHERS_AT_STEP.length; i++) expect(WATCHERS_AT_STEP[i]!).toBeGreaterThan(WATCHERS_AT_STEP[i - 1]!);
  });

  it('reacts in kind: cheers for a win, a proposal and a dance-off, none for a scuffle or an argument', () => {
    expect(WATCH_REACTIONS.winningShot.cheer).toBe(true);
    expect(WATCH_REACTIONS.proposal.cheer).toBe(true);
    expect(WATCH_REACTIONS.danceOff.cheer).toBe(true);
    expect(WATCH_REACTIONS.dustup.cheer).toBe(false);
    expect(WATCH_REACTIONS.coupleFight.cheer).toBe(false);
    for (const kind of MOMENT_KINDS) expect(WATCH_REACTIONS[kind].emotes.length).toBeGreaterThan(0);
  });

  it('tells each on their card in plain words, inside the tone guide and its hard lines', () => {
    for (const kind of MOMENT_KINDS) {
      for (const line of [watchWords(kind), actorWords(kind, 'Sasha', true), actorWords(kind, 'Sasha', false), actorWords(kind, null)]) {
        expect(line.length).toBeGreaterThan(5);
        expect(toneProblem(line)).toBeNull();
        expect(hardLineProblem(line)).toBeNull();
      }
    }
    expect(actorWords('proposal', 'Sasha', true)).toContain('Proposed to Sasha');
    expect(actorWords('proposal', 'Sasha', false)).toContain('Said yes to Sasha');
  });
});
