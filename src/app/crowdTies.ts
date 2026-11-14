import type { GameState, StudentRef } from '../sim';
import { FRIEND_AT, KIND, SLOTS } from '../sim/config/web';
import { chemistry, INTEREST } from '../sim/systems/identity';
import { pairLuck } from '../sim/systems/web';
import { idIn, isMain, refIn, type WebView } from './socialView';

/**
 * The crowd from real ties (DESIGN.md 63.8): who walks out together, what two students who pass on a path are to each
 * other, how they greet, what they react with and what they talk about. Pure: it reads the web's copy and writes
 * nothing; the map (src/game/Walkers.ts) asks it and draws what it says.
 */

export type Greeting = 'wave' | 'highfive' | 'fistbump' | 'hug';
export type Reaction = 'heart' | 'sweat' | 'anger' | 'sparkle';

/** A tie as one end holds it: their kind and how strong it is. */
export interface TieSeen {
  kind: number;
  strength: number;
}

/** What `a` is to `b` in the web, from `a`'s end, or null for strangers. */
export function tieOf(view: WebView, a: StudentRef, b: StudentRef): TieSeen | null {
  const ia = idIn(view, a);
  const ib = idIn(view, b);
  if (ia < 0 || ib < 0) return null;
  for (let k = 0; k < SLOTS; k++) {
    const s = ia * SLOTS + k;
    if (view.other[s] === ib) return { kind: view.kind[s]!, strength: view.strength[s]! };
  }
  return null;
}

const isPartner = (kind: number): boolean => kind === KIND.dating || kind === KIND.exclusive || kind === KIND.longterm;

/**
 * Who might walk out with a student: their partner first, then the others in their friend group, closest first. The
 * Main Character's people are their story's (stop 7), so they walk out alone.
 */
export function companionsOf(view: WebView, state: GameState, ref: StudentRef): StudentRef[] {
  const id = idIn(view, ref);
  if (id < 0 || isMain(state, ref)) return [];
  const partner: StudentRef[] = [];
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    if (view.other[s]! >= 0 && isPartner(view.kind[s]!)) partner.push(refIn(view, view.other[s]!));
  }
  const group: StudentRef[] = [];
  const g = view.groupOf[id]!;
  if (g >= 0) {
    for (let i = view.groupStart[g]!; i < view.groupStart[g + 1]!; i++) {
      const other = view.groupMembers[i]!;
      if (other !== id) group.push(refIn(view, other));
    }
  }
  return [...partner, ...group].filter((one) => !isMain(state, one));
}

/**
 * How two who know each other greet as they meet on a path: an acquaintance waves; friends high-five or bump fists;
 * best friends, a partner and a close roommate hug. Rivals, enemies and exes do not greet: they react. `luck` is 0 to 1.
 */
export function greetingFor(tie: TieSeen, luck: number): Greeting | null {
  if (tie.kind === KIND.met) return 'wave';
  if (tie.kind === KIND.best || isPartner(tie.kind) || (tie.kind === KIND.roommate && tie.strength >= 60)) return 'hug';
  if (tie.kind === KIND.friend || tie.kind === KIND.crush || tie.kind === KIND.roommate) return luck < 0.5 ? 'highfive' : 'fistbump';
  return null;
}

/**
 * What a student shows on passing someone without stopping: a heart for their crush, a sweat drop for an ex, an anger
 * mark for a rival or an enemy, and a sparkle for a stranger they would click with. `chem` is the pair's chemistry.
 */
export function reactionFor(tie: TieSeen | null, chem: number): Reaction | null {
  if (!tie) return chem > SPARKLE_CHEMISTRY ? 'sparkle' : null;
  if (tie.kind === KIND.crush) return 'heart';
  if (tie.kind === KIND.ex) return 'sweat';
  if (tie.kind === KIND.rival || tie.kind === KIND.enemy) return 'anger';
  return null;
}

/** Strangers this well matched get a sparkle when they pass: about one pair in twenty. */
export const SPARKLE_CHEMISTRY = 0.6;

/** The pair's chemistry, -1 to 1, as the web works it out. */
export function chemistryOf(view: WebView, a: StudentRef, b: StudentRef): number {
  const ia = idIn(view, a);
  const ib = idIn(view, b);
  if (ia < 0 || ib < 0 || view.identity[ia] === 0 || view.identity[ib] === 0) return 0;
  return chemistry(view.identity[ia]!, view.identity[ib]!, pairLuck(view.seed, Math.min(ia, ib), Math.max(ia, ib)));
}

/** The chat bubble for each interest. Faith is talked about in a plain bubble. */
const TOPIC: Record<number, string> = {
  [INTEREST.sports]: 'chat-sports',
  [INTEREST.gaming]: 'chat-gaming',
  [INTEREST.music]: 'chat-music',
  [INTEREST.fitness]: 'chat-fitness',
  [INTEREST.partying]: 'chat-partying',
  [INTEREST.studying]: 'chat-studying',
  [INTEREST.art]: 'chat-art',
  [INTEREST.fashion]: 'chat-fashion',
};

/**
 * What two students talk about: something they both like, picked by `luck`; a couple, now and then, each other; and
 * with nothing in common, the plain bubble. Returns an `emote.` name.
 */
export function topicFor(view: WebView, a: StudentRef, b: StudentRef, luck: number): string {
  const tie = tieOf(view, a, b);
  if (tie && isPartner(tie.kind) && luck < 0.4) return 'chat-love';
  const ia = idIn(view, a);
  const ib = idIn(view, b);
  if (ia < 0 || ib < 0) return 'speech';
  const shared = (view.identity[ia]! >>> 18) & (view.identity[ib]! >>> 18) & 0x1ff;
  const topics: string[] = [];
  for (let i = 0; i < 9; i++) if ((shared >>> i) & 1 && TOPIC[i]) topics.push(TOPIC[i]!);
  if (topics.length === 0) return 'speech';
  return topics[Math.min(topics.length - 1, Math.floor(luck * topics.length))]!;
}

/** True when they know each other well enough to stop and talk: friends, best friends, a partner, a roommate. */
export function stopsToTalk(tie: TieSeen | null): boolean {
  if (!tie) return false;
  return (tie.kind === KIND.friend || tie.kind === KIND.best || tie.kind === KIND.roommate || tie.kind === KIND.crush || isPartner(tie.kind)) && tie.strength >= FRIEND_AT - 5;
}
