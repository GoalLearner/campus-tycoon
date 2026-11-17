import { VIRAL_KEPT, VIRAL_REACH_EACH } from '../config/quadline';
import { viralReachOf } from './quadline';
import {
  FRESH_EX_FROM,
  FRIENDS_CAMPUS_HAPPY,
  FRIENDS_CAMPUS_STRESS,
  FRIENDS_EXAM_STRESS,
  FRIENDS_GPA,
  FRIENDS_GPA_MOST,
  FRIENDS_HAPPY,
  FRIENDS_HAPPY_LEAST,
  FRIENDS_HAPPY_MOST,
  FRIENDS_LEAVE,
  FRIENDS_STAY_MOST,
} from '../config/social';
import { BULLIED_FROM, FEEL, FRIEND_AT, KIND, SLOTS } from '../config/web';
import type { GameState, SocialEffects } from '../types';
import { INTEREST } from './identity';
import { examPart } from './policies';
import type { Web } from './web';

/**
 * What ties change (DESIGN.md 63.10). A student's friends, partner, a fresh breakup, a rival or having nobody close
 * moves their Happiness, their Stress in an exam week, their grades and how likely they are to leave. The web reads
 * every student once a game week and the campus keeps the average (`SocialEffects`, in the save); a card reads its
 * own student. Light, as decision 7 asked: each is capped, and the campus's share of it more tightly still.
 */

/** What both the web and the cards' copy of it have: each student's twelve ties, who they are, and their group. */
export interface Ties {
  other: Int32Array;
  kind: Uint8Array;
  strength: Uint8Array;
  feeling: Uint8Array;
  identity: Uint32Array;
  groupOf: Int32Array;
}

export type FriendsReason = keyof typeof FRIENDS_HAPPY;

export interface StudentFriends {
  /** Close ties: friends, best friends, a crush who is a friend, a roommate they get on with. */
  close: number;
  group: boolean;
  /** Their partner in the web, or -1. */
  partner: number;
  strained: boolean;
  /** An ex they split with in the last two weeks, or -1, and whether it was messy. */
  split: number;
  messy: boolean;
  /** A rival or an enemy, or -1. */
  rival: number;
  /** An enemy, or a roommate they do not get on with: a fight in an exam week. */
  fight: boolean;
  /** A close tie who likes studying, as they do, or -1. */
  study: number;
  /** Whoever picks on them most (DESIGN.md 63.11), or -1. */
  bullied: number;
  alone: boolean;
  /** What moved their Happiness, each with its points and who it is about (-1 for nobody in particular). */
  reasons: Array<{ id: FriendsReason; points: number; who: number }>;
  /** Points of Happiness, within a student's caps, before the campus's scale. */
  happiness: number;
  /** Points of Stress in a finals week, before the campus's scale. */
  examStress: number;
  /** GPA: always (a study partner), and in an exam week on top (a messy breakup). */
  gpa: number;
  gpaInExams: number;
  /** How likely they are to leave against the campus's rate. */
  leave: number;
}

const likesStudying = (identity: number): boolean => ((identity >>> (18 + INTEREST.studying)) & 1) === 1;

/** One student's ties, read. `id` is their place in the web. */
export function studentFriends(ties: Ties, id: number): StudentFriends {
  let close = 0;
  let partner = -1;
  let strained = false;
  let split = -1;
  let messy = false;
  let rival = -1;
  let fight = false;
  let study = -1;
  let bullied = -1;
  let bulliedMost = 0;
  const studies = likesStudying(ties.identity[id]!);
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = ties.other[s]!;
    if (b < 0) continue;
    const kind = ties.kind[s]!;
    const strength = ties.strength[s]!;
    const feeling = ties.feeling[s]!;
    if (kind === KIND.dating || kind === KIND.exclusive || kind === KIND.longterm) {
      partner = b;
      strained = feeling !== FEEL.warm || strength < FRIEND_AT + 10;
      if (studies && likesStudying(ties.identity[b]!) && study < 0) study = b;
      continue;
    }
    if (kind === KIND.ex && strength >= FRESH_EX_FROM) {
      if (split < 0 || feeling === FEEL.tense) {
        split = b;
        messy = feeling === FEEL.tense;
      }
      continue;
    }
    if (kind === KIND.rival || kind === KIND.enemy) {
      if (rival < 0 || kind === KIND.enemy) rival = b;
      if (kind === KIND.enemy) fight = true;
      continue;
    }
    if (kind === KIND.roommate && feeling === FEEL.tense) {
      fight = true;
      continue;
    }
    // Picked on (63.11): whoever does it most.
    if (kind === KIND.bullied) {
      if (strength >= BULLIED_FROM && strength > bulliedMost) {
        bullied = b;
        bulliedMost = strength;
      }
      continue;
    }
    if (kind === KIND.bully) continue;
    const near = kind === KIND.friend || kind === KIND.best || kind === KIND.crush || kind === KIND.roommate;
    if (near && strength >= FRIEND_AT) {
      close += 1;
      if (studies && likesStudying(ties.identity[b]!) && study < 0) study = b;
    }
  }
  const group = ties.groupOf[id]! >= 0;
  const alone = close === 0 && !group && partner < 0;
  const reasons: StudentFriends['reasons'] = [];
  if (close > 0 || group) reasons.push({ id: 'close', points: FRIENDS_HAPPY.close, who: -1 });
  if (partner >= 0) reasons.push(strained ? { id: 'strained', points: FRIENDS_HAPPY.strained, who: partner } : { id: 'partner', points: FRIENDS_HAPPY.partner, who: partner });
  if (split >= 0) reasons.push(messy ? { id: 'splitMessy', points: FRIENDS_HAPPY.splitMessy, who: split } : { id: 'split', points: FRIENDS_HAPPY.split, who: split });
  if (rival >= 0) reasons.push({ id: 'rival', points: FRIENDS_HAPPY.rival, who: rival });
  if (alone) reasons.push({ id: 'alone', points: FRIENDS_HAPPY.alone, who: -1 });
  if (bullied >= 0) reasons.push({ id: 'bullied', points: FRIENDS_HAPPY.bullied, who: bullied });
  const sum = reasons.reduce((total, one) => total + one.points, 0);
  const happiness = Math.max(FRIENDS_HAPPY_LEAST, Math.min(FRIENDS_HAPPY_MOST, sum));
  const examStress = (split >= 0 || fight || bullied >= 0 ? FRIENDS_EXAM_STRESS.upset : 0) + (group || close >= 2 ? FRIENDS_EXAM_STRESS.supported : 0);
  const gpa = (study >= 0 ? FRIENDS_GPA.study : 0) + (bullied >= 0 ? FRIENDS_GPA.bullied : 0);
  const gpaInExams = Math.max(-FRIENDS_GPA_MOST, Math.min(FRIENDS_GPA_MOST, gpa + (split >= 0 && messy ? FRIENDS_GPA.messyInExams : 0)));
  const leave = alone || (bullied >= 0 && !group) ? FRIENDS_LEAVE.alone : group && bullied < 0 ? FRIENDS_LEAVE.group : 1;
  return { close, group, partner, strained, split, messy, rival, fight, study, bullied, alone, reasons, happiness, examStress, gpa, gpaInExams, leave };
}

/** A number within plus or minus `most`, and the factor that brought it there (1 when it was already). */
function capped(mean: number, most: number): { value: number; scale: number } {
  if (Math.abs(mean) <= most || mean === 0) return { value: mean, scale: 1 };
  const scale = most / Math.abs(mean);
  return { value: mean * scale, scale };
}

/** The campus's share of what ties do, read from every student in the web: what the save keeps once a game week. */
export function friendsEffectsOf(web: Web): SocialEffects | null {
  let n = 0;
  let happy = 0;
  let stress = 0;
  let leave = 0;
  let alone = 0;
  let group = 0;
  let partnered = 0;
  let split = 0;
  let rival = 0;
  let study = 0;
  let bullied = 0;
  for (let id = 0; id < web.n; id++) {
    if (web.year[id]! < 0) continue;
    const one = studentFriends(web, id);
    n += 1;
    happy += one.happiness;
    stress += one.examStress;
    leave += one.leave;
    if (one.alone) alone += 1;
    if (one.group) group += 1;
    if (one.partner >= 0) partnered += 1;
    if (one.split >= 0) split += 1;
    if (one.rival >= 0) rival += 1;
    if (one.study >= 0) study += 1;
    if (one.bullied >= 0) bullied += 1;
  }
  if (n === 0) return null;
  const h = capped(happy / n, FRIENDS_CAMPUS_HAPPY);
  const s = capped(stress / n, FRIENDS_CAMPUS_STRESS);
  return {
    week: web.week,
    happiness: h.value,
    scale: h.scale,
    examStress: s.value,
    stressScale: s.scale,
    leave: leave / n,
    alone: alone / n,
    group: group / n,
    partnered: partnered / n,
    split: split / n,
    rival: rival / n,
    study: study / n,
    bullied: bullied / n,
    // Quadline's viral posts seen beyond campus, for the school's reach (63.14).
    viral: viralReachOf(web),
    // What the web did with each ask from the Meddle menu, for the paper (78.3).
    ...(web.asked.length > 0 ? { meddled: web.asked.slice(0, MEDDLED_KEPT) } : {}),
  };
}

/** Points ties add to the campus's Happiness now: the line "Friends" beside the season's (DESIGN.md 63.10). */
export function friendsHappiness(state: GameState): number {
  return state.web.effects?.happiness ?? 0;
}

/** Points ties add to Stress now: only in an exam week, the whole in finals and a share at midterms. */
export function friendsStress(state: GameState, curve: number): number {
  const effects = state.web.effects;
  const part = examPart(curve);
  if (!effects || part === 0) return 0;
  return Math.round(effects.examStress * part) || 0;
}

/** What ties add to the share who stay at the end of a semester, given what Happiness alone keeps: within 0.3 points. */
export function friendsStay(state: GameState, retention: number): number {
  const effects = state.web.effects;
  if (!effects) return 0;
  const shift = (1 - retention) * (1 - effects.leave);
  return Math.max(-FRIENDS_STAY_MOST, Math.min(FRIENDS_STAY_MOST, shift));
}

/** True when what the save keeps is a set of effects this version can use: every number where it may be. */
export function effectsSound(effects: SocialEffects): boolean {
  const shares = [effects.alone, effects.group, effects.partnered, effects.split, effects.rival, effects.study, effects.bullied ?? 0];
  const viral = effects.viral ?? [];
  const meddled = effects.meddled ?? [];
  return (
    Array.isArray(meddled) &&
    meddled.length <= MEDDLED_KEPT &&
    meddled.every((one) => Number.isInteger(one.id) && WEB_DID.includes(one.did)) &&
    Array.isArray(viral) &&
    viral.length <= VIRAL_KEPT &&
    viral.every((one) => Number.isInteger(one.at) && Number.isFinite(one.size) && Math.abs(one.size) <= VIRAL_REACH_EACH + 1e-9) &&
    Number.isInteger(effects.week) &&
    Math.abs(effects.happiness) <= FRIENDS_CAMPUS_HAPPY + 1e-9 &&
    Math.abs(effects.examStress) <= FRIENDS_CAMPUS_STRESS + 1e-9 &&
    effects.scale > 0 &&
    effects.scale <= 1 &&
    effects.stressScale > 0 &&
    effects.stressScale <= 1 &&
    effects.leave >= FRIENDS_LEAVE.group - 1e-9 &&
    effects.leave <= FRIENDS_LEAVE.alone + 1e-9 &&
    shares.every((share) => Number.isFinite(share) && share >= 0 && share <= 1)
  );
}

/** The most results of meddling one reading carries back (DESIGN.md 78.3), and what each may say. */
const MEDDLED_KEPT = 64;
const WEB_DID: readonly string[] = ['couple', 'complicated', 'tense', 'split', 'feud', 'friends', 'awkward', 'none'];
