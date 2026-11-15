import { activeEntries, dateAt, plainWeek } from '../calendar';
import { CAUSE_OF, CLUBS } from '../config/students';
import {
  CAMPUS_POSTS_A_WEEK,
  CAUSE_TOPICS,
  FEATURED_POSTS,
  HAPPENING_POSTS,
  postLines,
  POST,
  POST_FIELDS,
  POST_RATE,
  POST_WORDS,
  POSTS_KEPT,
  SCENE,
  SHADE_POSTS,
  TONE,
  VIRAL_KEPT,
  type CauseTopic,
  type PostKind,
} from '../config/quadline';
import { FAVOURITES } from '../config/students';
import { TRADITIONS } from '../config/traditions';
import { EVENT, FEEL, HAPPENING_KINDS, HAPPENING_WEEKS, HAPPENINGS_KEPT, KIND, SLOTS, WEB_WEEK_TICKS } from '../config/web';
import { hashInts } from '../rng';
import type { GameState, Week } from '../types';
import { capacity } from './capacity';
import { athleteShare } from './football';
import { nextGreekDay } from './greek';
import { campusHappiness } from './happiness';
import { INTEREST, TRAIT, traitOf } from './identity';
import { regularsNow } from './regulars';
import { weatherAt } from './season';
import { placeIndex, socialProfile, type PlaceIndex, type SocialProfile, type StudentRef } from './students';
import { nextDay } from './traditions';
import type { Web } from './web';

/**
 * Quadline's posts (DESIGN.md 63.13), made as the web lives each game week: from what really happened to students
 * that week (a new couple, a new best friend, a roommate they do not get on with), from the calendar (midterms, a
 * snow day, the 8 AM), and from the campus (its weakest spot, a home game, a tradition, a new building). A sample of
 * the campus posts each week, and the Main Character, followed students and named regulars every time. Each post is
 * kept as POST_FIELDS numbers: the words are rebuilt when it is shown (`src/app/quadline.ts`).
 *
 * Everything is rolled from the seed, the week and the students, never from the game's random streams: the same web
 * and the same campus make the same feed, however it is caught up.
 */

/** A post as its numbers say. */
export interface Post {
  week: number;
  /** The minute of the game week it went up, 0 to WEB_WEEK_TICKS - 1. */
  minute: number;
  author: StudentRef;
  kind: PostKind;
  /** Picks its line, and how its likes and comments fall. */
  luck: number;
  /** What it is about: another student (entry year and index), or a place's cell and a number, by kind. */
  a: number;
  b: number;
  tone: number;
  /** Which of its kind's lines, in turn through the week. */
  line: number;
  scene: number;
  /** True for one kept as viral (stop 10). */
  viral: boolean;
}

/** The numbers 6 and 7 hold, by kind: another student, or a topic and a cell, or a game's numbers. */
const ABOUT_STUDENT: ReadonlySet<number> = new Set([POST.couple, POST.best, POST.longterm, POST.backTogether, POST.shade]);
export const aboutStudent = (kind: number): boolean => ABOUT_STUDENT.has(kind);

const share = (h: number): number => (h >>> 0) / 4294967296;
/** A happening's numbers, as the web keeps them (HAPPENING_FIELDS in web.ts, held equal by a test). */
export const FIELDS = 10;

/** What a week's posts are made from that is read from the campus once per catch-up, not once a week. */
export interface PostContext {
  state: GameState;
  seed: number;
  housing: PlaceIndex;
  athletes: number;
  /** The Main Character, followed students and named regulars, by place in the web. */
  featured: Array<{ id: number; most: number }>;
  /** The campus's weakest and strongest parts of Happiness, by level (0 to 1), and beds and seats when short. */
  weak: Array<{ topic: CauseTopic; level: number }>;
  strong: Array<{ topic: CauseTopic; level: number }>;
  /** Lecture halls' and dorms' cells, for a post's place. */
  halls: number[];
  dorms: number[];
  /** Home games and results, by kick tick: [kick, opponent, us, them, played]. */
  games: Array<{ kick: number; opp: number; us: number; them: number; played: boolean; home: boolean }>;
  /** Traditions coming up soon: the tick and the tradition's place in TRADITIONS. */
  traditions: Array<{ at: number; index: number }>;
  /** Rush week, if it is near: its tick. */
  rush: number | null;
  /** Buildings opened since the last read: their cells. Told in the newest week lived only. */
  opened: number[];
  /** The clock's week, for reading the calendar of a week lived. */
  week: Week;
  now: number;
  /** The newest week this catch-up lives, so the things of now (a new building, a tradition coming) post once. */
  last: number;
}

/** Read what the campus is doing once, for every week this catch-up lives. */
export function postContext(web: Web, state: GameState, toWeek: number): PostContext {
  const housing = placeIndex(state, 'housing');
  const idOf = (ref: StudentRef): number => {
    const r = ((ref.entryYear % 4) + 4) % 4;
    return web.ring[r] === ref.entryYear && ref.index >= 0 && ref.index < web.classSlot ? r * web.classSlot + ref.index : -1;
  };
  const featured: PostContext['featured'] = [];
  for (const one of regularsNow(state)) {
    const id = idOf(one.ref);
    if (id >= 0) featured.push({ id, most: FEATURED_POSTS[one.why] });
  }
  // The campus's weak and strong spots: the parts of Happiness, and capacity where it is short.
  const weak: PostContext['weak'] = [];
  const strong: PostContext['strong'] = [];
  const happiness = campusHappiness(state);
  for (const cause of happiness.causes) {
    for (const part of cause.parts) {
      const topic = part.id as CauseTopic;
      if (!CAUSE_TOPICS.includes(topic) || CAUSE_OF[part.id] === undefined) continue;
      if (part.level < 0.45) weak.push({ topic, level: part.level });
      else if (part.level >= 0.75) strong.push({ topic, level: part.level });
    }
  }
  const needs = capacity(state).needs;
  for (const id of ['beds', 'seats'] as const) {
    const need = needs.find((one) => one.id === id);
    if (need?.status === 'short') weak.push({ topic: id, level: 0.2 });
    else if (need?.status === 'ok' && need.have > need.want * 1.15) strong.push({ topic: id, level: 0.8 });
  }
  weak.sort((x, y) => x.level - y.level);
  strong.sort((x, y) => y.level - x.level);
  const halls: number[] = [];
  const dorms: number[] = [];
  for (const b of state.map.buildings) {
    if (!b || b.stage < 1) continue;
    (b.zone === 'academic' ? halls : dorms).push(b.y * state.map.width + b.x);
  }
  const games: PostContext['games'] = [];
  for (const game of state.football?.season?.games ?? []) {
    if (game.opp < 0) continue;
    const us = game.us.reduce((sum, n) => sum + n, 0);
    const them = game.them.reduce((sum, n) => sum + n, 0);
    games.push({ kick: game.kick, opp: game.opp, us, them, played: game.us.length >= 4, home: game.home });
  }
  const traditions: PostContext['traditions'] = [];
  for (const kept of state.traditions?.chosen ?? []) {
    const index = TRADITIONS.findIndex((spec) => spec.id === kept.id);
    const spec = TRADITIONS[index];
    if (!spec) continue;
    const next = nextDay(state, spec.day);
    if (next) traditions.push({ at: next.at, index });
  }
  const rush = (state.greek?.chapters.length ?? 0) > 0 ? nextGreekDay(state, 0) : null;
  // A building that has opened since the web last read the campus: told once, by those who live or study near it.
  const opened: number[] = [];
  const seen = web.postSeen;
  const nowSeen = new Set<number>();
  for (const b of state.map.buildings) {
    if (!b || b.stage < 1) continue;
    nowSeen.add(b.id);
    if (seen && !seen.has(b.id)) opened.push(b.y * state.map.width + b.x);
  }
  web.postSeen = nowSeen;
  return {
    state,
    seed: web.seed,
    housing,
    athletes: athleteShare(state),
    featured,
    weak,
    strong,
    halls,
    dorms,
    games,
    traditions,
    rush,
    opened,
    week: state.clock.week,
    now: state.clock.tick,
    last: toWeek,
  };
}

// ----------------------------------------------------------- the writing --

/** The week being posted: how many of each kind so far, so its lines take turns and no topic swamps the feed. */
interface Posting {
  week: number;
  counts: Map<number, number>;
}

function put(web: Web, ctx: PostContext, posting: Posting, minute: number, author: number, kind: PostKind, luck: number, a: number, b: number, tone: number, scene: number): void {
  const week = posting.week;
  // Its line: the kind's lines in turn this week from a start of the week's own, so two posts of a kind differ.
  const lines = postLines(kind, tone, a).length;
  const made = posting.counts.get(kind) ?? 0;
  posting.counts.set(kind, made + 1);
  const line = (hashInts(ctx.seed, 7301, week, kind) + made) % Math.max(1, lines);
  const at = (web.postNext % POSTS_KEPT) * POST_FIELDS;
  web.postNext += 1;
  const r = Math.floor(author / web.classSlot);
  const p = web.posts;
  p[at] = week;
  p[at + 1] = minute;
  p[at + 2] = web.ring[r]!;
  p[at + 3] = author % web.classSlot;
  p[at + 4] = kind;
  p[at + 5] = luck | 0;
  p[at + 6] = a;
  p[at + 7] = b;
  p[at + 8] = tone + 16 * line;
  p[at + 9] = scene;
}

const refOf = (web: Web, id: number): StudentRef => ({ entryYear: web.ring[Math.floor(id / web.classSlot)]!, index: id % web.classSlot });

/** A post about another student: their entry year and index in a and b. */
function putAbout(web: Web, ctx: PostContext, posting: Posting, minute: number, author: number, kind: PostKind, luck: number, other: number, tone: number): void {
  const ref = refOf(web, other);
  put(web, ctx, posting, minute, author, kind, luck, ref.entryYear, ref.index, tone, sceneFor(kind, luck));
}

function sceneFor(kind: PostKind, luck: number): number {
  const words = POST_WORDS[kind];
  if (!words.scene) return SCENE.none;
  return share(hashInts(luck, 7)) < (words.sceneShare ?? 0) ? words.scene : SCENE.none;
}

/** How likely a student posts when their turn comes, from who they are (decision: personality sets how often). */
function rateOf(profile: SocialProfile | null, bits: number): number {
  const base = profile ? (POST_RATE[profile.nature] ?? 0.3) : 0.3;
  return Math.min(1, base * (0.7 + 0.15 * traitOf(bits, TRAIT.outgoing)));
}

/** Their mood, for the tone (decision: mood colours it): rough when life is hard, by who they are and their ties. */
function moodOf(web: Web, id: number, profile: SocialProfile | null, h: number): number {
  const nature = profile?.nature;
  let close = 0;
  let sore = 0;
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    if (web.other[s]! < 0) continue;
    const kind = web.kind[s]!;
    if (kind === KIND.best || (kind >= KIND.dating && kind <= KIND.longterm)) close += 1;
    if (kind === KIND.bullied || web.feeling[s] === FEEL.tense) sore += 1;
  }
  let rough = 0.4 - 0.12 * close + 0.12 * sore;
  if (nature === 'stressed' || nature === 'heartbroken' || nature === 'homesick' || nature === 'allNighter') rough += 0.3;
  if (nature === 'slacker' || nature === 'party' || nature === 'clown' || traitOf(web.identity[id]!, TRAIT.laidBack) >= 2) rough -= 0.2;
  return share(h) < rough ? TONE.rough : TONE.good;
}

/** Whether the tie between them is still as the post says: a couple, best friends, or no longer a couple. */
function stillSo(web: Web, a: number, b: number, kind: PostKind): boolean {
  let tie = -1;
  for (let k = 0; k < SLOTS; k++) if (web.other[a * SLOTS + k] === b) tie = web.kind[a * SLOTS + k]!;
  const couple = tie >= KIND.dating && tie <= KIND.longterm;
  if (kind === POST.couple || kind === POST.longterm || kind === POST.backTogether) return couple;
  if (kind === POST.best) return tie === KIND.best;
  return !couple;
}

/** Their roommate, if they do not get on: -1 otherwise. */
function soreRoommate(web: Web, id: number): number {
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    if (web.other[s]! >= 0 && web.kind[s] === KIND.roommate && web.feeling[s] === FEEL.tense) return web.other[s]!;
  }
  return -1;
}

/** An ex or a rival who would post shade at them, -1 for none. */
function sorePerson(web: Web, id: number, h: number): number {
  let pick = -1;
  let best = -1;
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = web.other[s]!;
    if (b < 0 || web.year[b]! < 0) continue;
    const kind = web.kind[s]!;
    if (kind !== KIND.ex && kind !== KIND.rival && kind !== KIND.enemy) continue;
    const score = (hashInts(h, b) >>> 8) + (web.feeling[s] === FEEL.tense ? 1 << 24 : 0);
    if (score > best) {
      best = score;
      pick = b;
    }
  }
  return pick;
}

const has = (bits: number, interest: number): boolean => ((bits >>> 18) & (1 << interest)) !== 0;

/** The week's calendar, read at the middle of the week: what the term is doing, and the sky. */
function weekRead(ctx: PostContext, week: number): { kinds: Set<string>; ids: Set<string>; month: number; weather: string } {
  const tick = week * WEB_WEEK_TICKS + Math.floor(WEB_WEEK_TICKS / 2);
  const at = { tick, week: tick >= ctx.week.start ? ctx.week : plainWeek(tick) };
  const entries = activeEntries(at);
  return { kinds: new Set(entries.map((entry) => entry.kind as string)), ids: new Set(entries.map((entry) => entry.id)), month: dateAt(at).month, weather: weatherAt(ctx.seed, at) };
}

/** A topic for a campus post, weighed for this author this week. */
function campusTopic(web: Web, ctx: PostContext, posting: Posting, id: number, profile: SocialProfile, read: ReturnType<typeof weekRead>, week: number, h: number): { kind: PostKind; a: number; b: number } | null {
  const bits = web.identity[id]!;
  const year = profile.classYear;
  const options: Array<{ kind: PostKind; weight: number; a?: number; b?: number }> = [];
  // Each kind weighs less the more of it the week has: the weakest spot is told, not told forty times.
  const add = (kind: PostKind, weight: number, a = -1, b = -1): void => {
    if (weight > 0) options.push({ kind, weight: weight / (1 + 0.8 * (posting.counts.get(kind) ?? 0)), a, b });
  };
  const inClass = read.kinds.has('classes') || read.kinds.has('midterms') || read.kinds.has('finals') || (!read.kinds.has('break') && !read.kinds.has('commencement') && read.kinds.size === 0);
  const home = profile.home ?? (ctx.dorms[(h >>> 4) % Math.max(1, ctx.dorms.length)] ?? -1);
  const hall = ctx.halls[(h >>> 6) % Math.max(1, ctx.halls.length)] ?? -1;
  if (read.ids.has('fallStart') || read.ids.has('springStart')) add(year === 0 && read.ids.has('fallStart') ? POST.moveIn : POST.firstWeek, 3, home);
  if (read.kinds.has('midterms')) add(POST.midterms, 3 + (has(bits, INTEREST.studying) ? 2 : 0));
  if (read.kinds.has('finals')) add(POST.finals, 4 + (has(bits, INTEREST.studying) ? 2 : 0), hall);
  if (read.kinds.has('midterms') || read.kinds.has('finals')) add(POST.studyGroup, 1.5, hall);
  if (read.kinds.has('break')) add(POST.breakHome, 3);
  if (read.kinds.has('commencement')) add(POST.commencement, year === 3 ? 6 : 0.3);
  if (inClass) add(POST.eightAm, 0.8);
  if (read.weather === 'snow') add(POST.snow, 3, home);
  if (read.weather === 'rain') add(POST.rain, 1.2);
  if ((read.weather === 'fair' || read.weather === 'sunny') && read.month >= 3 && read.month <= 5) add(POST.warm, 1);
  // A home game this week, or one just played.
  const from = week * WEB_WEEK_TICKS;
  const to = from + WEB_WEEK_TICKS;
  const fan = has(bits, INTEREST.sports) || profile.team || profile.nature === 'superfan';
  for (const game of ctx.games) {
    if (game.kick < from || game.kick >= to) continue;
    const kind = !game.played ? POST.gameDay : game.us > game.them ? POST.gameWon : POST.gameLost;
    add(kind, (fan ? 5 : 1) * (game.home ? 1.5 : 1), game.opp, game.us * 1000 + game.them);
  }
  if (week === ctx.last) {
    for (const tradition of ctx.traditions) if (tradition.at - ctx.now < 2 * WEB_WEEK_TICKS) add(POST.tradition, 3, tradition.index);
    if (ctx.rush !== null && ctx.rush - ctx.now < 2 * WEB_WEEK_TICKS && profile.chapter) add(POST.bidDay, 5, -1);
    for (const cell of ctx.opened) add(POST.newBuilding, 4, cell);
  }
  // The campus's weakest spot, or its best.
  const weak = ctx.weak[(h >>> 9) % Math.max(1, Math.min(2, ctx.weak.length))];
  if (weak) add(POST.complaint, 2.5, CAUSE_TOPICS.indexOf(weak.topic), weak.topic === 'seats' ? hall : home);
  const strong = ctx.strong[(h >>> 11) % Math.max(1, Math.min(2, ctx.strong.length))];
  if (strong) add(POST.praise, 1.5, CAUSE_TOPICS.indexOf(strong.topic), strong.topic === 'seats' ? hall : home);
  // The week's days: Thursday to Saturday, the party nights; any day, a club, a meal, the gym.
  add(POST.party, has(bits, INTEREST.partying) ? 2.5 : 0.3);
  if (profile.club) add(POST.club, 1, CLUBS.findIndex((club) => club.name === profile.club));
  add(POST.food, 0.8, (h >>> 13) % Object.keys(FAVOURITES).length);
  if (has(bits, INTEREST.fitness)) add(POST.gym, 1.2);
  if (soreRoommate(web, id) >= 0) add(POST.roommate, 2.5);
  const total = options.reduce((sum, one) => sum + one.weight, 0);
  if (total <= 0) return null;
  let roll = share(hashInts(h, 31)) * total;
  for (const one of options) {
    roll -= one.weight;
    if (roll < 0) return { kind: one.kind, a: one.a ?? -1, b: one.b ?? -1 };
  }
  return null;
}

/** What one author posts about the campus this week. */
function campusPost(web: Web, ctx: PostContext, posting: Posting, id: number, profile: SocialProfile, read: ReturnType<typeof weekRead>, week: number, h: number): void {
  const topic = campusTopic(web, ctx, posting, id, profile, read, week, h);
  if (!topic) return;
  const luck = hashInts(h, 41);
  const minute = hashInts(h, 43) % WEB_WEEK_TICKS;
  let tone = moodOf(web, id, profile, hashInts(h, 47));
  if (topic.kind === POST.complaint) tone = TONE.rough;
  if (topic.kind === POST.praise) tone = TONE.good;
  put(web, ctx, posting, minute, id, topic.kind, luck, topic.a, topic.b, tone, sceneFor(topic.kind, luck));
}

/** The relationship kinds a post may be about, from the week's happenings by name. */
const HAPPENING_POST: Partial<Record<number, PostKind>> = {
  [EVENT.dating]: POST.couple,
  [EVENT.best]: POST.best,
  [EVENT.longterm]: POST.longterm,
  [EVENT.splitMutual]: POST.split,
  [EVENT.splitMessy]: POST.splitMessy,
  [EVENT.backTogether]: POST.backTogether,
};

/**
 * One game week's posts, after the web has lived it. `campusOnly` for the weeks a regrow lives: what happened by
 * name then is part of the regrowing (63.12), so only the campus is posted about.
 */
export function postWeek(web: Web, ctx: PostContext, campusOnly: boolean): void {
  const week = web.week;
  const read = weekRead(ctx, week);
  const profiles = new Map<number, SocialProfile | null>();
  const profileOf = (id: number): SocialProfile | null => {
    if (!profiles.has(id)) profiles.set(id, socialProfile(ctx.state, refOf(web, id), ctx.housing, ctx.athletes));
    return profiles.get(id)!;
  };
  const featured = new Map(ctx.featured.map((one) => [one.id, one.most]));
  const posting: Posting = { week, counts: new Map() };
  // What happened by name this week: one of the two posts about it, the more outgoing; an ex or a rival may answer.
  if (!campusOnly) {
    const row = ((week % HAPPENING_WEEKS) + HAPPENING_WEEKS) % HAPPENING_WEEKS;
    const per = HAPPENING_KINDS.length * HAPPENINGS_KEPT;
    for (let f = row * per * FIELDS; f < (row + 1) * per * FIELDS; f += FIELDS) {
      const h = web.happenings;
      if (h[f] !== week) continue;
      const kind = HAPPENING_POST[h[f + 1]!];
      if (kind === undefined) continue;
      const idOfRef = (entryYear: number, index: number): number => {
        const r = ((entryYear % 4) + 4) % 4;
        return web.ring[r] === entryYear && index >= 0 && index < web.classSlot ? r * web.classSlot + index : -1;
      };
      const a = idOfRef(h[f + 4]!, h[f + 5]!);
      const b = idOfRef(h[f + 6]!, h[f + 7]!);
      if (a < 0 || b < 0 || web.year[a]! < 0 || web.year[b]! < 0) continue;
      // The Main Character's romances are their story's (63.11): the web's happenings never post them.
      if ((a === web.mainId || b === web.mainId) && kind !== POST.best) continue;
      const author = traitOf(web.identity[b]!, TRAIT.outgoing) > traitOf(web.identity[a]!, TRAIT.outgoing) || featured.has(b) ? b : a;
      const other = author === a ? b : a;
      const hh = hashInts(ctx.seed, 7001, week, author, other);
      const chance = featured.has(author) ? 1 : Math.min(1, (HAPPENING_POSTS[kind] ?? 0.3) * (0.6 + rateOf(profileOf(author), web.identity[author]!)));
      if (share(hh) >= chance) continue;
      // Posted as things stand: a couple who split again the same week posts nothing about getting together.
      if (!stillSo(web, author, other, kind)) continue;
      const minute = hashInts(hh, 3) % WEB_WEEK_TICKS;
      putAbout(web, ctx, posting, minute, author, kind, hashInts(hh, 5), other, kind === POST.split || kind === POST.splitMessy ? TONE.rough : TONE.good);
      // Named shade (decision 5): an ex or a rival of the one who posted good news answers with a post of their own.
      if (kind === POST.couple || kind === POST.best || kind === POST.backTogether) {
        const sore = sorePerson(web, author, hh);
        if (sore >= 0 && share(hashInts(hh, 9)) < SHADE_POSTS) putAbout(web, ctx, posting, Math.min(WEB_WEEK_TICKS - 1, minute + 30 + (hashInts(hh, 11) % 240)), sore, POST.shade, hashInts(hh, 13), author, TONE.rough);
      }
    }
  }
  // The campus: a sample of students, each posting by who they are about what the week holds for them.
  let made = 0;
  for (let t = 0; t < CAMPUS_POSTS_A_WEEK * 6 && made < CAMPUS_POSTS_A_WEEK; t++) {
    const h = hashInts(ctx.seed, 7101, week, t);
    const id = h % web.n;
    if (web.year[id]! < 0 || featured.has(id)) continue;
    const profile = profileOf(id);
    if (!profile) continue;
    if (share(hashInts(h, 1)) >= rateOf(profile, web.identity[id]!)) continue;
    campusPost(web, ctx, posting, id, profile, read, week, h);
    made += 1;
  }
  // Every post of the featured: the Main Character, followed students and named regulars.
  for (const [id, most] of featured) {
    if (web.year[id]! < 0) continue;
    const profile = profileOf(id);
    if (!profile) continue;
    const rate = Math.max(0.5, rateOf(profile, web.identity[id]!));
    for (let p = 0; p < most; p++) {
      const h = hashInts(ctx.seed, 7201, week, id, p);
      if (share(hashInts(h, 1)) >= rate) continue;
      campusPost(web, ctx, posting, id, profile, read, week, h);
    }
  }
}

/** Every post kept, then the viral ones, as their numbers say; empty slots left out. */
export function postsOf(posts: Int32Array, viral: Int32Array): Post[] {
  const out: Post[] = [];
  const read = (from: Int32Array, kept: number, isViral: boolean): void => {
    for (let i = 0; i < kept; i++) {
      const at = i * POST_FIELDS;
      if (from[at] === -1 || from[at] === undefined) continue;
      out.push({
        week: from[at]!,
        minute: from[at + 1]!,
        author: { entryYear: from[at + 2]!, index: from[at + 3]! },
        kind: from[at + 4]! as PostKind,
        luck: from[at + 5]! >>> 0,
        a: from[at + 6]!,
        b: from[at + 7]!,
        tone: from[at + 8]! & 15,
        line: from[at + 8]! >> 4,
        scene: from[at + 9]!,
        viral: isViral,
      });
    }
  };
  read(posts, Math.floor(posts.length / POST_FIELDS), false);
  read(viral, Math.floor(viral.length / POST_FIELDS), true);
  return out.sort((x, y) => y.week - x.week || y.minute - x.minute);
}

/** A fresh, empty feed. */
export function newPosts(): { posts: Int32Array; viral: Int32Array } {
  return { posts: new Int32Array(POSTS_KEPT * POST_FIELDS).fill(-1), viral: new Int32Array(VIRAL_KEPT * POST_FIELDS).fill(-1) };
}
