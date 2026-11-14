import type { GameState } from '../sim';
import { calendarAt } from '../sim/calendar';
import { EVENT, FEEL, FRIEND_AT, HEAVY_EVENTS, KIND, SLOTS } from '../sim/config/web';
import { classYearOf, firstNameOf, studentName, type StudentRef } from '../sim/systems/students';
import { HAPPENING_FIELDS, type Web } from '../sim/systems/web';

/**
 * The social web as the screens read it (DESIGN.md 63.6): a student's people for their card, the Campus social view,
 * the drama of the week and the paper's gossip. Pure: it reads the copy of the web the worker sends (src/app/socialWeb.ts)
 * and the campus, and writes nothing.
 *
 * Heavy happenings (a messy breakup, cheating, a love triangle) are shown at most one a campus week, in the paper and
 * the Campus social view together (63.3, decision 6): the web picks it, the first of the week, and nothing else heavy
 * is ever told. Cards state facts plainly: an ex is a face marked Ex.
 */

/** The web as the worker sends it to the main thread. */
export interface WebView {
  seed: number;
  classSlot: number;
  ring: number[];
  week: number;
  other: Int32Array;
  kind: Uint8Array;
  strength: Uint8Array;
  feeling: Uint8Array;
  identity: Uint32Array;
  /** The campus year the web was last stepped in. */
  calYear: number;
  /** What happened by name, and each kept week's counts, as the web keeps them. */
  happenings: Int32Array;
  weekly: Float64Array;
  weeklyWeek: Int32Array;
  weeklyYear: Int32Array;
  /** The one heavy happening that may be shown in the campus year `rationFor`, or all -1. */
  ration: Int32Array;
  rationFor: number;
  /** Friend groups: each student's group or -1, each group's members, each group's vibe. */
  groupOf: Int32Array;
  groupStart: Int32Array;
  groupMembers: Int32Array;
  groupVibe: Uint8Array;
}

/** The web's view: copied for sending from the worker, or shared for reading in place. */
export function viewOf(web: Web, copy: boolean): WebView {
  return {
    seed: web.seed,
    classSlot: web.classSlot,
    ring: [...web.ring],
    week: web.week,
    other: copy ? web.other.slice() : web.other,
    kind: copy ? web.kind.slice() : web.kind,
    strength: copy ? web.strength.slice() : web.strength,
    feeling: copy ? web.feeling.slice() : web.feeling,
    identity: copy ? web.identity.slice() : web.identity,
    calYear: web.calYear,
    happenings: copy ? web.happenings.slice() : web.happenings,
    weekly: copy ? web.weekly.slice() : web.weekly,
    weeklyWeek: copy ? web.weeklyWeek.slice() : web.weeklyWeek,
    weeklyYear: copy ? web.weeklyYear.slice() : web.weeklyYear,
    ration: copy ? web.ration.slice() : web.ration,
    rationFor: web.rationFor,
    groupOf: copy ? web.groupOf.slice() : web.groupOf,
    groupStart: copy ? web.friendGroups.start.slice() : web.friendGroups.start,
    groupMembers: copy ? web.friendGroups.members.slice() : web.friendGroups.members,
    groupVibe: copy ? web.groupVibe.slice() : web.groupVibe,
  };
}

/** The buffers a view is made of, for moving it between threads without a copy. */
export function viewBuffers(view: WebView): ArrayBufferLike[] {
  return [view.other, view.kind, view.strength, view.feeling, view.identity, view.happenings, view.weekly, view.weeklyWeek, view.weeklyYear, view.ration, view.groupOf, view.groupStart, view.groupMembers, view.groupVibe].map((one) => one.buffer);
}

/** A student's place in the view, or -1. */
export function idIn(view: WebView, ref: StudentRef): number {
  const r = ((ref.entryYear % 4) + 4) % 4;
  if (view.ring[r] !== ref.entryYear || ref.index < 0 || ref.index >= view.classSlot) return -1;
  return r * view.classSlot + ref.index;
}

export function refIn(view: WebView, id: number): StudentRef {
  return { entryYear: view.ring[Math.floor(id / view.classSlot)]!, index: id % view.classSlot };
}

const same = (a: StudentRef, b: StudentRef): boolean => a.entryYear === b.entryYear && a.index === b.index;
const enrolled = (state: GameState, ref: StudentRef): boolean => classYearOf(state, ref) !== null;

/** The Main Character's romances are their story's (63.2): the web's are not told about them until stop 7. */
export function isMain(state: GameState, ref: StudentRef): boolean {
  const main = state.story?.mc?.ref;
  return !!main && same(main, ref);
}

// ------------------------------------------------------------ the card --

export type Role = 'partner' | 'best' | 'roommate' | 'friend' | 'ex' | 'rival';

export interface Person {
  ref: StudentRef;
  role: Role;
  /** Under their face: "Dating", "Best friend", "Roommate", "Friend", "Ex", "Rival". */
  label: string;
  strength: number;
}

const PARTNER_LABEL: Record<number, string> = { [KIND.dating]: 'Dating', [KIND.exclusive]: 'Exclusive', [KIND.longterm]: 'Long-term' };

/**
 * A student's people for their card, in the order a friend would tell them: a partner, a best friend, a roommate,
 * friends from the closest, then an ex and a rival. Acquaintances are left out; so are crushes, which are their own.
 * At most `max`, friends cut first.
 */
export function peopleOf(view: WebView, state: GameState, ref: StudentRef, max = 8): Person[] {
  const id = idIn(view, ref);
  if (id < 0) return [];
  const by: Record<Role, Person[]> = { partner: [], best: [], roommate: [], friend: [], ex: [], rival: [] };
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = view.other[s]!;
    if (b < 0) continue;
    const other = refIn(view, b);
    if (!enrolled(state, other)) continue;
    const kind = view.kind[s]!;
    const strength = view.strength[s]!;
    const add = (role: Role, label: string): void => void by[role].push({ ref: other, role, label, strength });
    if (PARTNER_LABEL[kind]) add('partner', PARTNER_LABEL[kind]!);
    else if (kind === KIND.best) add('best', 'Best friend');
    else if (kind === KIND.roommate) add('roommate', 'Roommate');
    else if ((kind === KIND.friend || kind === KIND.crush) && strength >= FRIEND_AT - 5) add('friend', 'Friend');
    else if (kind === KIND.ex) add('ex', 'Ex');
    else if (kind === KIND.enemy) add('rival', 'Arch-rival');
    else if (kind === KIND.rival) add('rival', 'Rival');
  }
  const closest = (a: Person, b: Person): number => b.strength - a.strength;
  by.friend.sort(closest);
  by.ex.sort(closest);
  by.rival.sort((a, b) => (a.label === b.label ? closest(a, b) : a.label === 'Arch-rival' ? -1 : 1));
  const fixed = [...by.partner, ...by.best, ...by.roommate];
  const after = [...by.ex.slice(0, 1), ...by.rival.slice(0, 1)];
  const room = Math.max(0, max - fixed.length - after.length);
  return [...fixed, ...by.friend.slice(0, room), ...after].slice(0, max);
}

/** Who they are dating, in the card's words, or null for nobody on campus. */
export function partnerLine(view: WebView, state: GameState, ref: StudentRef): { text: string; note: string; ref: StudentRef } | null {
  const partner = peopleOf(view, state, ref).find((one) => one.role === 'partner');
  if (!partner) return null;
  const id = idIn(view, ref);
  let feeling = 0;
  for (let k = 0; k < SLOTS; k++) if (view.other[id * SLOTS + k] === idIn(view, partner.ref)) feeling = view.feeling[id * SLOTS + k]!;
  const first = firstNameOf(state, partner.ref);
  const text = partner.label === 'Dating' ? `Dating ${first}` : partner.label === 'Exclusive' ? `Together with ${first}` : `Together a long while with ${first}`;
  return { text, note: feeling === FEEL.complicated ? "It's complicated" : 'Happy together', ref: partner.ref };
}

/**
 * The card's relationship line: whom they are dating on campus, from the web. With nobody on campus, the status they
 * arrived with: single, or long-distance with someone back home; a student the old status had in a couple on campus
 * reads as single, happily or looking, as that status was happy or not. The Main Character keeps their story's, and
 * so does everyone until the web first answers.
 */
export function relationshipWords(view: WebView | null, state: GameState, ref: StudentRef, seeded: { id: string; name: string; note: string }): { name: string; note: string } {
  if (!view || isMain(state, ref)) return { name: seeded.name, note: seeded.note };
  const partner = partnerLine(view, state, ref);
  if (partner) return { name: partner.text, note: partner.note };
  if (seeded.id === 'togetherHappy') return { name: 'Happily single', note: seeded.note };
  if (seeded.id === 'togetherUnhappy') return { name: 'Single and looking', note: seeded.note };
  return { name: seeded.name, note: seeded.note };
}

// ---------------------------------------------------------- happenings --

export interface Happening {
  week: number;
  event: number;
  year: number;
  luck: number;
  /** One to three students: for cheating, who cheated, their partner, and the one they started seeing. */
  people: StudentRef[];
}

function happeningAt(fields: Int32Array, f: number): Happening | null {
  if (fields[f] === -1 || fields[f] === undefined) return null;
  const people: StudentRef[] = [];
  for (let p = 4; p < HAPPENING_FIELDS; p += 2) if (fields[f + p]! >= 0 || fields[f + p + 1]! >= 0) people.push({ entryYear: fields[f + p]!, index: fields[f + p + 1]! });
  return { week: fields[f]!, event: fields[f + 1]!, year: fields[f + 2]!, luck: fields[f + 3]!, people };
}

/** Every happening the view keeps, newest first. */
export function happeningsOf(view: WebView): Happening[] {
  const out: Happening[] = [];
  for (let f = 0; f + HAPPENING_FIELDS <= view.happenings.length; f += HAPPENING_FIELDS) {
    const one = happeningAt(view.happenings, f);
    if (one) out.push(one);
  }
  return out.sort((a, b) => b.week - a.week || a.luck - b.luck);
}

/** The one heavy happening that may be shown in this campus year, or null. */
export function heavyOfTheWeek(view: WebView, year: number): Happening | null {
  if (view.rationFor !== year) return null;
  return happeningAt(view.ration, 0);
}

const isHeavy = (one: Happening): boolean => HEAVY_EVENTS.includes(one.event);

/** A happening in a line of the paper: plain, light, never dwelling. null when someone in it has left the school. */
export function happeningLine(state: GameState, one: Happening): string | null {
  if (one.people.some((ref) => !enrolled(state, ref))) return null;
  const [a, b, c] = one.people.map((ref) => studentName(state, ref));
  if (!a || !b) return null;
  switch (one.event) {
    case EVENT.best:
      return `${a} and ${b} are best friends now.`;
    case EVENT.dating:
      return `${a} and ${b} are dating.`;
    case EVENT.longterm:
      return `${a} and ${b} are getting serious.`;
    case EVENT.splitMutual:
      return `${a} and ${b} have split up, and are still on good terms.`;
    case EVENT.splitMessy:
      return `${a} and ${b} have split up, and not quietly.`;
    case EVENT.cheating:
      return c ? `${a} and ${b} are over: ${a.split(' ')[0]} was seeing ${c}.` : null;
    case EVENT.backTogether:
      return `${a} and ${b} are back together.`;
    case EVENT.enemies:
      return `${a} and ${b} are no longer speaking.`;
    case EVENT.triangle:
      return c ? `${a} and ${c} both have a crush on ${b}.` : null;
    default:
      return null;
  }
}

/** Light kinds, in the order the paper reaches for them. */
const LIGHT_ORDER = [EVENT.dating, EVENT.backTogether, EVENT.splitMutual, EVENT.best, EVENT.longterm, EVENT.enemies];

export interface Told {
  line: string;
  /** Who it is about: the first opens their card. */
  people: StudentRef[];
  heavy: boolean;
}

function tell(state: GameState, one: Happening): Told | null {
  if (one.people.some((ref) => isMain(state, ref))) return null;
  const line = happeningLine(state, one);
  return line ? { line, people: one.people, heavy: isHeavy(one) } : null;
}

/**
 * Light happenings after `sinceWeek`, a kind at a time so the lines vary, newest first: at most `max`. Never heavy.
 */
function lightSince(view: WebView, state: GameState, sinceWeek: number, year: number | null, max: number): Told[] {
  const pool = happeningsOf(view).filter((one) => one.week > sinceWeek && !isHeavy(one) && (year === null || one.year === year));
  const byKind = LIGHT_ORDER.map((event) => pool.filter((one) => one.event === event));
  const out: Told[] = [];
  const used = new Set<string>();
  for (let pass = 0; out.length < max && byKind.some((list) => list.length > pass); pass++) {
    for (const list of byKind) {
      const one = list[pass];
      if (!one || out.length >= max) continue;
      const key = one.people.map((ref) => `${ref.entryYear}:${ref.index}`).sort().join('|');
      if (used.has(key)) continue;
      const told = tell(state, one);
      if (!told) continue;
      used.add(key);
      out.push(told);
    }
  }
  return out;
}

/**
 * The paper's gossip after an absence (DESIGN.md 63.6): what happened on campus since `sinceWeek`, at most `max`
 * lines. The week's one heavy item leads, when it happened in that time.
 */
export function gossip(view: WebView, state: GameState, sinceWeek: number, max = 4): Told[] {
  const out: Told[] = [];
  const heavy = heavyOfTheWeek(view, calendarAt(state.clock).year);
  const told = heavy && heavy.week > sinceWeek ? tell(state, heavy) : null;
  if (told) out.push(told);
  return [...out, ...lightSince(view, state, sinceWeek, null, max - out.length)];
}

/** The drama of the week: its one heavy item when there is one, otherwise the biggest light one. */
export function dramaOfTheWeek(view: WebView, state: GameState): Told | null {
  const year = calendarAt(state.clock).year;
  const heavy = heavyOfTheWeek(view, year);
  const told = heavy ? tell(state, heavy) : null;
  if (told) return told;
  for (const event of [EVENT.backTogether, EVENT.enemies, EVENT.longterm, EVENT.splitMutual, EVENT.dating, EVENT.best]) {
    for (const one of happeningsOf(view)) {
      if (one.event !== event || one.year !== year) continue;
      const light = tell(state, one);
      if (light) return light;
    }
  }
  return null;
}

// ------------------------------------------------------- campus social --

const VIBES = ['the sports crowd', 'the gamers', 'the music crowd', 'the gym crew', 'the party group', 'the study crew', 'the theatre kids', 'the faith group', 'the fashion crowd'];

export interface CampusSocial {
  couples: number;
  groups: number;
  /** The share of students in a friend group, 0 to 1. */
  inGroups: number;
  /** This campus week: new couples (and couples back together), splits and new best friends. */
  week: { couples: number; splits: number; best: number };
  /**
   * The five most popular (DESIGN.md 63.7): by how many students they reach, their friends and their friends'
   * friends, each counted once. A student holds twelve ties at most, so a count of friends alone stops at twelve.
   */
  popular: Array<{ ref: StudentRef; friends: number; known: number }>;
  /** The three biggest friend groups: their vibe and their members. */
  groups3: Array<{ vibe: string; members: StudentRef[] }>;
  drama: Told | null;
  /** This week's light happenings, a kind at a time. */
  lines: Told[];
}

const isFriendKind = (kind: number): boolean => kind === KIND.friend || kind === KIND.best || kind === KIND.crush || kind === KIND.roommate;

export function campusSocial(view: WebView, state: GameState): CampusSocial {
  const year = calendarAt(state.clock).year;
  const n = view.other.length / SLOTS;
  let couples = 0;
  let students = 0;
  const here = new Uint8Array(n);
  const friendsOf = new Uint8Array(n);
  const closeness = new Uint16Array(n);
  const isFriendSlot = (s: number): boolean => view.other[s]! >= 0 && isFriendKind(view.kind[s]!) && view.strength[s]! >= FRIEND_AT;
  for (let a = 0; a < n; a++) {
    const ref = refIn(view, a);
    if (view.identity[a] === 0 || !enrolled(state, ref)) continue;
    here[a] = 1;
    students += 1;
    for (let k = 0; k < SLOTS; k++) {
      const s = a * SLOTS + k;
      const b = view.other[s]!;
      if (b < 0) continue;
      if (b > a && PARTNER_LABEL[view.kind[s]!]) couples += 1;
      if (isFriendSlot(s)) {
        friendsOf[a] = friendsOf[a]! + 1;
        closeness[a] = closeness[a]! + view.strength[s]!;
      }
    }
  }
  // How far each reaches: their friends and their friends' friends. Summed first, which counts a shared friend twice,
  // to find the forty likeliest; then counted exactly, each student once, for those forty.
  const rough: Array<{ id: number; reach: number }> = [];
  for (let a = 0; a < n; a++) {
    if (!here[a] || isMain(state, refIn(view, a))) continue;
    let reach = friendsOf[a]!;
    for (let k = 0; k < SLOTS; k++) {
      const s = a * SLOTS + k;
      if (isFriendSlot(s)) reach += friendsOf[view.other[s]!]!;
    }
    if (rough.length < 40 || reach > rough[rough.length - 1]!.reach) {
      rough.push({ id: a, reach });
      rough.sort((x, y) => y.reach - x.reach || x.id - y.id);
      if (rough.length > 40) rough.pop();
    }
  }
  const top = rough
    .map(({ id }) => {
      const known = new Set<number>();
      for (let k = 0; k < SLOTS; k++) {
        const s = id * SLOTS + k;
        if (!isFriendSlot(s)) continue;
        const b = view.other[s]!;
        if (here[b]) known.add(b);
        for (let j = 0; j < SLOTS; j++) {
          const t = b * SLOTS + j;
          const c = view.other[t]!;
          if (c !== id && here[c] && isFriendSlot(t)) known.add(c);
        }
      }
      return { id, friends: friendsOf[id]!, known: known.size, close: closeness[id]! };
    })
    .sort((x, y) => y.known - x.known || y.close - x.close || x.id - y.id)
    .slice(0, 5);
  const week = { couples: 0, splits: 0, best: 0 };
  for (let row = 0; row < view.weeklyWeek.length; row++) {
    if (view.weeklyWeek[row]! < 0 || view.weeklyYear[row] !== year) continue;
    const at = (event: number): number => view.weekly[row * (view.weekly.length / view.weeklyWeek.length) + event]!;
    // New couples, and couples back together: what makes the number of couples go up.
    week.couples += at(EVENT.dating) + at(EVENT.backTogether);
    week.splits += at(EVENT.splitMutual) + at(EVENT.splitMessy);
    week.best += at(EVENT.best);
  }
  const groups = view.groupStart.length - 1;
  const sizes: Array<{ g: number; size: number }> = [];
  for (let g = 0; g < groups; g++) sizes.push({ g, size: view.groupStart[g + 1]! - view.groupStart[g]! });
  sizes.sort((x, y) => y.size - x.size || x.g - y.g);
  const groups3: CampusSocial['groups3'] = [];
  for (const { g } of sizes) {
    if (groups3.length >= 3) break;
    const members: StudentRef[] = [];
    for (let i = view.groupStart[g]!; i < view.groupStart[g + 1]!; i++) members.push(refIn(view, view.groupMembers[i]!));
    if (members.some((ref) => !enrolled(state, ref) || isMain(state, ref))) continue;
    groups3.push({ vibe: VIBES[view.groupVibe[g]!] ?? 'a group of friends', members });
  }
  return {
    couples,
    groups,
    inGroups: students > 0 ? view.groupMembers.length / students : 0,
    week,
    popular: top.map((one) => ({ ref: refIn(view, one.id), friends: one.friends, known: one.known })),
    groups3,
    drama: dramaOfTheWeek(view, state),
    lines: lightSince(view, state, -1, year, 4),
  };
}
