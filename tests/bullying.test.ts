import { describe, expect, it } from 'vitest';
import { advance, applyAction, newGame, type GameState } from '../src/sim';
import { FRIENDS_GPA, FRIENDS_HAPPY, FRIENDS_LEAVE } from '../src/sim/config/social';
import { BULLIED_FROM, EVENT, FEEL, KIND, SLOTS } from '../src/sim/config/web';
import { friendsEffectsOf, studentFriends, type Ties } from '../src/sim/systems/friends';
import { TRAIT, traitOf } from '../src/sim/systems/identity';
import { bullyingTimes } from '../src/sim/systems/policies';
import { catchUp, newWeb, webWeekOf, type Web } from '../src/sim/systems/web';
import { DAY, T0, erasByRank } from './helpers';

/**
 * Picking on someone, stop 7 (DESIGN.md 63.11): from who students are; joined in, stood up against, reported; felt
 * through what ties do (63.10); and less of it with the anti-bullying program.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;

/** A campus's web lived for some weeks after it is grown, with what happened counted from the start of the living. */
function lived(state: GameState, weeks: number): { web: Web; counts: number[] } {
  const web = newWeb(state.seed, 1024);
  catchUp(web, state, webWeekOf(state));
  const before = [...web.events];
  for (let w = 1; w <= weeks; w++) catchUp(web, state, webWeekOf(state) + w);
  return { web, counts: [...web.events].map((n, k) => n - before[k]!) };
}

const LIVED = lived(MODEL, 12);
const WEB = LIVED.web;

describe('picking on someone', () => {
  it('happens on a lived campus, in every way, to a few in a hundred at a time', () => {
    const counts = LIVED.counts;
    for (const kind of [EVENT.bullying, EVENT.shutOut, EVENT.pettiness, EVENT.stoodUp, EVENT.reported]) expect(counts[kind], String(kind)).toBeGreaterThan(0);
    const effects = friendsEffectsOf(WEB)!;
    expect(effects.bullied).toBeGreaterThan(0.005);
    expect(effects.bullied).toBeLessThan(0.06);
  });

  it('is started by the unkind who are jealous or short-tempered, joined by the unkind who are outgoing, at both ends', () => {
    let ties = 0;
    for (let s = 0; s < WEB.n * SLOTS; s++) {
      if (WEB.other[s]! < 0 || WEB.kind[s] !== KIND.bully) continue;
      ties += 1;
      const a = Math.floor(s / SLOTS);
      const bits = WEB.identity[a]!;
      const unkind = traitOf(bits, TRAIT.kind) <= 1;
      const starter = unkind && (traitOf(bits, TRAIT.loyal) <= 1 || traitOf(bits, TRAIT.calm) <= 1);
      const joiner = unkind && traitOf(bits, TRAIT.outgoing) >= 2;
      expect(starter || joiner).toBe(true);
      expect(WEB.kind[WEB.back[s]!]).toBe(KIND.bullied);
      expect(WEB.feeling[s]).toBe(FEEL.tense);
    }
    expect(ties).toBeGreaterThan(100);
  });

  it('is never started by the Main Character, and their romances stay their story’s', () => {
    // The student who would start most often is made the Main Character: they start on nobody.
    const starterIds: number[] = [];
    for (let s = 0; s < WEB.n * SLOTS; s++) if (WEB.other[s]! >= 0 && WEB.kind[s] === KIND.bully) starterIds.push(Math.floor(s / SLOTS));
    const pick = starterIds[0]!;
    const ring = Math.floor(pick / WEB.classSlot);
    const ref = { entryYear: WEB.ring[ring]!, index: pick % WEB.classSlot };
    const state = structuredClone(MODEL) as GameState;
    (state.story as { mc: unknown }).mc = { ...(MODEL.story.mc ?? {}), ref, cast: [] };
    const web = newWeb(state.seed, 1024);
    catchUp(web, state, webWeekOf(state));
    for (let w = 1; w <= 8; w++) catchUp(web, state, webWeekOf(state) + w);
    for (let k = 0; k < SLOTS; k++) {
      const kind = web.kind[pick * SLOTS + k]!;
      if (web.other[pick * SLOTS + k]! < 0) continue;
      // What they had started before the web knew them is let be; nothing new, and no romance the story has not made.
      expect(kind >= KIND.dating && kind <= KIND.longterm).toBe(false);
      expect(kind).not.toBe(KIND.crush);
    }
    // A model campus's web grown and lived eight weeks: a few seconds on a quiet PC, more when it is busy.
  }, 60_000);

  it('is felt by the one picked on: Happiness, Stress in exams, grades, and likelier to leave unless friends stand behind them', () => {
    const t: Ties = {
      other: new Int32Array(3 * SLOTS).fill(-1),
      kind: new Uint8Array(3 * SLOTS),
      strength: new Uint8Array(3 * SLOTS),
      feeling: new Uint8Array(3 * SLOTS),
      identity: new Uint32Array(3).fill(1),
      groupOf: new Int32Array(3).fill(-1),
    };
    t.other[0] = 1;
    t.kind[0] = KIND.bullied;
    t.strength[0] = BULLIED_FROM + 20;
    t.other[1] = 2;
    t.kind[1] = KIND.friend;
    t.strength[1] = 50;
    const one = studentFriends(t, 0);
    expect(one.bullied).toBe(1);
    expect(one.reasons.find((r) => r.id === 'bullied')?.points).toBe(FRIENDS_HAPPY.bullied);
    expect(one.examStress).toBe(10);
    expect(one.gpa).toBeCloseTo(FRIENDS_GPA.bullied, 9);
    expect(one.leave).toBe(FRIENDS_LEAVE.alone);
    t.groupOf[0] = 0;
    expect(studentFriends(t, 0).leave).toBe(1);
    // A tie that has faded below the line is not felt.
    t.strength[0] = BULLIED_FROM - 1;
    expect(studentFriends(t, 0).bullied).toBe(-1);
  });

  it('is less with the anti-bullying program: half as often started, twice as often reported, and it costs money', () => {
    const growth = structuredClone(MODEL) as GameState;
    growth.goals = { size: 1, rank: 3, reached: [], rewards: 0 };
    erasByRank(growth);
    const on = applyAction(growth, { type: 'policy', id: 'antiBullying', on: true });
    expect(on.ok).toBe(true);
    const program = on.ok ? on.state : growth;
    expect(bullyingTimes(program)).toEqual({ start: 0.5, reported: 2 });
    expect(bullyingTimes(growth)).toEqual({ start: 1, reported: 1 });
    const without = lived(growth, 12).counts;
    const withIt = lived(program, 12).counts;
    const started = (c: number[]): number => c[EVENT.bullying]! + c[EVENT.shutOut]!;
    expect(started(withIt)).toBeLessThan(started(without) * 0.75);
    expect(withIt[EVENT.reported]! / Math.max(1, started(withIt))).toBeGreaterThan(without[EVENT.reported]! / Math.max(1, started(without)));
    // Two campuses of 46,000 lived twelve weeks each: about 10 s on a quiet PC, more than twice that when it is busy.
  }, 90_000);
});
