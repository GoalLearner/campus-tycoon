import { describe, expect, it } from 'vitest';
import { viewOf } from '../src/app/socialView';
import { academicInputs, advance, applyAction, campusHappiness, newGame, parseSave, retentionRate, sampleStudents, serialize, studentCard, type GameState } from '../src/sim';
import { SEASON_CURVE } from '../src/sim/config/season';
import {
  EX_START,
  FRESH_EX_FROM,
  FRIENDS_CAMPUS_HAPPY,
  FRIENDS_CAMPUS_STRESS,
  FRIENDS_GPA_MOST,
  FRIENDS_HAPPY,
  FRIENDS_HAPPY_LEAST,
  FRIENDS_HAPPY_MOST,
  FRIENDS_LEAVE,
  FRIENDS_STAY_MOST,
} from '../src/sim/config/social';
import { FEEL, KIND, SLOTS } from '../src/sim/config/web';
import { INTEREST } from '../src/sim/systems/identity';
import { effectsSound, friendsEffectsOf, friendsStay, friendsStress, studentFriends, type Ties } from '../src/sim/systems/friends';
import { semesterEnd } from '../src/sim/systems/admissions';
import { seasonLine, stressRead } from '../src/sim/systems/season';
import { campusLevels } from '../src/sim/systems/happiness';
import { catchUp, idOf, newWeb, webWeekOf } from '../src/sim/systems/web';
import type { SocialEffects } from '../src/sim/types';
import { DAY, T0 } from './helpers';

/**
 * What ties change, stop 6 (DESIGN.md 63.10): a student's friends, partner, a fresh breakup, a rival or nobody close
 * move their Happiness, exam Stress, grades and how likely they are to leave; the campus keeps the average, capped.
 */

const MODEL = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const WEB = newWeb(MODEL.seed, 1024);
catchUp(WEB, MODEL, webWeekOf(MODEL));
for (let w = 1; w <= 4; w++) catchUp(WEB, MODEL, webWeekOf(MODEL) + w);
const EFFECTS = friendsEffectsOf(WEB)!;

/** A web of a few students, tie by tie: student 0 and whoever they are tied to. */
function ties(list: Array<{ kind: number; strength: number; feeling?: number; studies?: boolean }>, opts: { group?: boolean; studies?: boolean } = {}): Ties {
  const n = list.length + 1;
  const t: Ties = {
    other: new Int32Array(n * SLOTS).fill(-1),
    kind: new Uint8Array(n * SLOTS),
    strength: new Uint8Array(n * SLOTS),
    feeling: new Uint8Array(n * SLOTS),
    identity: new Uint32Array(n).fill(1),
    groupOf: new Int32Array(n).fill(-1),
  };
  const study = (on: boolean | undefined): number => (on ? 1 << (18 + INTEREST.studying) : 0);
  t.identity[0] = 1 | study(opts.studies);
  if (opts.group) t.groupOf[0] = 0;
  list.forEach((one, k) => {
    t.other[k] = k + 1;
    t.kind[k] = one.kind;
    t.strength[k] = one.strength;
    t.feeling[k] = one.feeling ?? FEEL.warm;
    t.identity[k + 1] = 1 | study(one.studies);
  });
  return t;
}

describe('a student’s ties', () => {
  it('read as the table has them: friends, a partner good or strained, an ex who stings, a rival, nobody', () => {
    expect(studentFriends(ties([{ kind: KIND.friend, strength: 40 }]), 0).happiness).toBe(FRIENDS_HAPPY.close);
    expect(studentFriends(ties([]), 0)).toMatchObject({ alone: true, happiness: FRIENDS_HAPPY.alone, leave: FRIENDS_LEAVE.alone });
    expect(studentFriends(ties([], { group: true }), 0)).toMatchObject({ alone: false, group: true, leave: FRIENDS_LEAVE.group });
    const couple = studentFriends(ties([{ kind: KIND.dating, strength: 60 }, { kind: KIND.friend, strength: 40 }]), 0);
    expect(couple.happiness).toBe(FRIENDS_HAPPY.close + FRIENDS_HAPPY.partner);
    expect(couple.partner).toBe(1);
    const rocky = studentFriends(ties([{ kind: KIND.exclusive, strength: 60, feeling: FEEL.complicated }]), 0);
    expect(rocky).toMatchObject({ strained: true, happiness: FRIENDS_HAPPY.strained });
    const messy = studentFriends(ties([{ kind: KIND.ex, strength: EX_START, feeling: FEEL.tense }, { kind: KIND.friend, strength: 40 }]), 0);
    expect(messy).toMatchObject({ split: 1, messy: true, happiness: FRIENDS_HAPPY.close + FRIENDS_HAPPY.splitMessy });
    // An old ex no longer stings.
    expect(studentFriends(ties([{ kind: KIND.ex, strength: FRESH_EX_FROM - 1, feeling: FEEL.tense }, { kind: KIND.friend, strength: 40 }]), 0).split).toBe(-1);
    const rival = studentFriends(ties([{ kind: KIND.enemy, strength: 90, feeling: FEEL.tense }, { kind: KIND.friend, strength: 40 }]), 0);
    expect(rival).toMatchObject({ rival: 1, fight: true, happiness: FRIENDS_HAPPY.close + FRIENDS_HAPPY.rival });
    // A roommate they do not get on with is a fight, and not a close tie.
    expect(studentFriends(ties([{ kind: KIND.roommate, strength: 50, feeling: FEEL.tense }]), 0)).toMatchObject({ fight: true, close: 0, alone: true });
  });

  it('stay within a student’s caps, and their exam Stress, grades and leaving within theirs', () => {
    const worst = studentFriends(ties([{ kind: KIND.ex, strength: 45, feeling: FEEL.tense }, { kind: KIND.enemy, strength: 90, feeling: FEEL.tense }]), 0);
    expect(worst.happiness).toBe(Math.max(FRIENDS_HAPPY_LEAST, FRIENDS_HAPPY.splitMessy + FRIENDS_HAPPY.rival + FRIENDS_HAPPY.alone));
    expect(worst.examStress).toBe(10);
    const studious = studentFriends(ties([{ kind: KIND.best, strength: 90, studies: true }, { kind: KIND.friend, strength: 40 }], { studies: true, group: true }), 0);
    expect(studious).toMatchObject({ study: 1, gpa: 0.05, examStress: -5 });
    const both = studentFriends(ties([{ kind: KIND.friend, strength: 40, studies: true }, { kind: KIND.ex, strength: 40, feeling: FEEL.tense }], { studies: true }), 0);
    expect(both.gpaInExams).toBeCloseTo(0.05 - 0.1, 9);
    for (let id = 0; id < WEB.n; id++) {
      if (WEB.year[id]! < 0) continue;
      const one = studentFriends(WEB, id);
      expect(one.happiness).toBeGreaterThanOrEqual(FRIENDS_HAPPY_LEAST);
      expect(one.happiness).toBeLessThanOrEqual(FRIENDS_HAPPY_MOST);
      expect(Math.abs(one.gpaInExams)).toBeLessThanOrEqual(FRIENDS_GPA_MOST + 1e-9);
      expect([FRIENDS_LEAVE.alone, FRIENDS_LEAVE.group, 1]).toContain(one.leave);
    }
  });
});

describe('the campus’s share', () => {
  it('is read from every student, within its caps: light, as decision 7 asked', () => {
    expect(effectsSound(EFFECTS)).toBe(true);
    expect(Math.abs(EFFECTS.happiness)).toBeLessThanOrEqual(FRIENDS_CAMPUS_HAPPY);
    expect(EFFECTS.happiness).toBeGreaterThan(0.5);
    expect(Math.abs(EFFECTS.examStress)).toBeLessThanOrEqual(FRIENDS_CAMPUS_STRESS);
    expect(EFFECTS.examStress).toBeLessThan(0);
    expect(EFFECTS.leave).toBeLessThan(1);
    expect(EFFECTS.group).toBeGreaterThan(0.6);
    expect(EFFECTS.alone).toBeLessThan(0.15);
    // Every card read with its ties averages to the campus's line: the scale makes them agree when the cap bites.
    let sum = 0;
    let n = 0;
    for (let id = 0; id < WEB.n; id++) {
      if (WEB.year[id]! < 0) continue;
      sum += studentFriends(WEB, id).happiness * EFFECTS.scale;
      n += 1;
    }
    expect(sum / n).toBeCloseTo(EFFECTS.happiness, 6);
  });

  it('moves Happiness by its line, beside the season’s, and not the base that retention and the rank follow', () => {
    const before = campusHappiness(MODEL);
    const after = campusHappiness(withEffects(MODEL, EFFECTS));
    expect(after.base).toBe(before.base);
    expect(after.score).toBeCloseTo(Math.min(100, before.score + EFFECTS.happiness), 6);
    expect(after.season.parts.find((part) => part.id === 'friends')?.points).toBeCloseTo(EFFECTS.happiness, 9);
    expect(before.season.parts.some((part) => part.id === 'friends')).toBe(false);
  });

  it('moves Stress only in an exam week: the whole in finals, nothing at an ordinary one', () => {
    const state = withEffects(MODEL, EFFECTS);
    expect(friendsStress(state, SEASON_CURVE.finals)).toBe(Math.round(EFFECTS.examStress));
    expect(friendsStress(state, 0.2)).toBe(0);
    expect(friendsStress(MODEL, SEASON_CURVE.finals)).toBe(0);
    const read = stressRead(state, campusLevels(state), SEASON_CURVE.finals);
    const plain = stressRead(MODEL, campusLevels(MODEL), SEASON_CURVE.finals);
    expect(read.friends).toBe(Math.round(EFFECTS.examStress));
    expect(read.score).toBe(Math.max(0, plain.score + read.friends));
  });

  it('keeps a few more each semester, never more than 0.3 points, and the rank and the Scorecard count it', () => {
    const state = withEffects(MODEL, EFFECTS);
    const retention = campusHappiness(state).retention;
    const stay = friendsStay(state, retention);
    expect(stay).toBeGreaterThan(0);
    expect(stay).toBeLessThanOrEqual(FRIENDS_STAY_MOST);
    expect(stay).toBeCloseTo((1 - retention) * (1 - EFFECTS.leave), 9);
    expect(retentionRate(state)).toBeCloseTo(retention + stay, 12);
    // At the most and the least: within 0.3 points either way, whatever is read.
    expect(friendsStay(withEffects(MODEL, { ...EFFECTS, leave: 0 }), 0.5)).toBe(FRIENDS_STAY_MOST);
    expect(friendsStay(withEffects(MODEL, { ...EFFECTS, leave: 2 }), 0.5)).toBe(-FRIENDS_STAY_MOST);
    // A semester ends: more stay than without, and the save says by how much.
    const a = structuredClone(MODEL) as GameState;
    const b = structuredClone(state) as GameState;
    semesterEnd(a);
    semesterEnd(b);
    expect(b.cohorts.reduce((x, y) => x + y, 0)).toBeGreaterThan(a.cohorts.reduce((x, y) => x + y, 0));
    expect(b.admissions.lastSemester!.friends).toBeCloseTo(stay, 12);
    expect(a.admissions.lastSemester!.friends).toBeUndefined();
    const level = (s: GameState): number => academicInputs(s).find((one) => one.id === 'retention')!.level!;
    expect(level(b)).toBeGreaterThan(level(a));
  });
});

describe('a card', () => {
  const view = viewOf(WEB, false);
  const state = withEffects(MODEL, EFFECTS);

  it('counts its own ties in place of the old guess at its relationship, and its own exam Stress and grades', () => {
    let tried = 0;
    for (const ref of sampleStudents(state, 300)) {
      const id = idOf(WEB, ref);
      if (id < 0) continue;
      const own = studentFriends(view, id);
      const plain = studentCard(state, ref)!;
      const read = studentCard(state, ref, own)!;
      expect(plain.friends).toBeNull();
      expect(read.friends!.happiness).toBe(Math.round(own.happiness * EFFECTS.scale));
      // The same student, the same spot: only the nudge differs, so the difference is the ties less the old guess.
      expect(read.happiness - plain.happiness).toBeLessThanOrEqual(Math.abs(read.friends!.happiness - plain.relationship.points) + 1);
      expect(Math.abs(read.gpa - plain.gpa)).toBeLessThanOrEqual(FRIENDS_GPA_MOST + 0.05 + 1e-9);
      tried += 1;
    }
    expect(tried).toBeGreaterThan(100);
  });
});

describe('the save', () => {
  it('keeps the reading through a save and a load, refuses one out of range, and an older save has none and works', () => {
    const done = applyAction(MODEL, { type: 'socialEffects', effects: EFFECTS });
    expect(done.ok).toBe(true);
    const state = done.ok ? done.state : MODEL;
    expect(state.web.effects).toEqual(EFFECTS);
    expect(applyAction(MODEL, { type: 'socialEffects', effects: { ...EFFECTS, happiness: 9 } }).ok).toBe(false);
    const back = parseSave(serialize(state, T0 + DAY));
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.web.effects).toEqual(EFFECTS);
    // A reading out of range in a save is dropped, and the campus carries on without it.
    const bad = structuredClone(state) as GameState;
    bad.web.effects = { ...EFFECTS, leave: 5 };
    const loaded = parseSave(serialize(bad, T0 + DAY));
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.state.web.effects).toBeUndefined();
    // Without a reading, nothing moves: the campus is as it was before this stop.
    const plain = seasonLine(MODEL, campusLevels(MODEL));
    expect(plain.parts.some((part) => part.id === 'friends')).toBe(false);
    expect(plain.stress.friends).toBe(0);
  });
});

describe('the web', () => {
  it('starts every ex where a split does, a cheating one too, so a fresh breakup reads the same however it ended', () => {
    // A campus lived for a few weeks: every ex is at the start or below it, unless they kept meeting and got on.
    let exes = 0;
    let atStart = 0;
    for (let s = 0; s < WEB.other.length; s++) {
      if (WEB.other[s]! < 0 || WEB.kind[s] !== KIND.ex) continue;
      exes += 1;
      if (WEB.strength[s]! <= EX_START) atStart += 1;
    }
    expect(exes).toBeGreaterThan(0);
    expect(atStart / exes).toBeGreaterThan(0.8);
  });
});

function withEffects(state: GameState, effects: SocialEffects): GameState {
  const next = structuredClone(state) as GameState;
  next.web.effects = effects;
  return next;
}
