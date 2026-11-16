import Phaser from 'phaser';
import { RINGS } from '../sim/systems/web';
import { fitOnMap } from './propSize';
import { swayAt } from '../app/feelingShow';
import { findStudent, type Stander } from '../app/activityPeople';
import { CROWD_STEPS } from '../app/crowd';
import { shownHour, type DayPeriod } from '../app/daylight';
import { feelingOf } from '../app/emotion';
import { itemAt, regularDay, type Where } from '../app/regularDay';
import { chooseLawnKind, LAWN_POSE, LAWN_SIZE, lawnWords, partySize, STROLL_SHARE, type LawnGroup, type LawnKind, type LawnPose } from '../app/lawnLife';
import type { Weather } from '../app/life';
import { idIn, refIn, type WebView } from '../app/socialView';
import { socialWeb } from '../app/socialWeb';
import { hashInts, ownedAt, sampleStudents, studentFigure, studentKey, type GameState, type StudentRef } from '../sim';
import { firstNameOf, studentCard } from '../sim/systems/students';
import { INTEREST, TRAIT, traitOf } from '../sim/systems/identity';
import { KIND, SLOTS } from '../sim/config/web';
import type { Art, PeopleSpec, WalkDirection } from './art';
import { doorAlpha, pointOn, tripOf, type Afoot, type Trip } from './afoot';
import type { Footprints } from './footprints';
import { facingOf, type Iso } from './iso';

/**
 * The living campus, L1 (DESIGN.md 64): students doing things on the lawns and quads, not just walking. Friends sit
 * in a circle, a couple shares a picnic, someone lies in the sun or naps, a study group reads, a guitar plays to a few
 * listeners, a frisbee flies, a ball is kicked about, someone takes a selfie, jogs a loop or walks a dog.
 *
 * Where: spots on quads and on the campus's own grass beside a path, kept two cells apart. Who: real students, a
 * friend group or a couple from the social web when it has answered, else students from the seed, each found once
 * (nobody is in two places). What: chosen by `chooseLawnKind` from who they are, the hour and the weather. How many:
 * the crowd step's lawn figures times `lawnShare` (the hour, the sky, the season, a break). Each spot's group lasts a
 * few minutes of the game and gives way to another, each spot on its own clock, so the lawns change a little at a
 * time. Everything is from the seed, the spot and the time: the same lawns every time the map is opened then.
 *
 * For show only: nothing here is saved and nothing changes a number. A tap on someone opens their card.
 */

const FADE_MS = 500;
/**
 * Nobody appears or disappears in view (DESIGN.md 69.2): a group's people walk to it from the nearest door or the edge
 * of the screen and walk off the same way, at this pace in cells a second, a little apart, fading only in a doorway.
 */
const LAWN_WALK = 0.8;
const WALK_STAGGER_MS = 380;
const DOOR_FADE = 0.35;
const RECOUNT_MS = 1100;
/** How long a group stays, in game ticks (minutes): each spot keeps its group this long, on its own clock. */
const STAY_TICKS = 9;
/** Spots on the grass are at least this many cells apart, so groups do not stand in each other. */
const SPACING = 2;
/**
 * On a quad a spot is every cell (L6): the quad is the campus's hub, the busiest place on it. A spot there is nudged off
 * the middle of its cell, so the groups do not stand in rows, and a group that takes room keeps the cells beside it.
 */
const QUAD_JITTER = 0.16;
/** Grass spots are nudged too, so a big lawn's groups do not stand in a grid. */
const GRASS_JITTER = 0.2;
/**
 * A lawn of this many cells or more is a big lawn (L6): spots over all of it, not only beside a path, filled after the
 * quads and before the small patches by the buildings.
 */
const BIG_LAWN = 40;
/** On a big lawn, of every spot a group takes, this share is people crossing it (a quad's share is STROLL_SHARE). */
const BIG_STROLL_SHARE = 0.1;
const WIDE: ReadonlySet<LawnKind> = new Set<LawnKind>(['frisbee', 'catch', 'kick', 'jog', 'goof', 'dog']);
/** People crossing a quad walk this fast, in cells a second, to the far side and back, three to six cells. */
const STROLL_SPEED = 0.5;
/** At each end of a stroll they stop a while before turning back, in seconds (DESIGN.md 69.1). */
const STROLL_PAUSE_S = 2.4;
/**
 * A party night (L6): a crowd on the grass within PARTY_REACH cells of a hall or a chapter house, with room round it.
 * At most PARTIES_MOST on the map in a night, PARTY_APART cells apart; one is drawn while it is near the screen.
 */
const PARTY_REACH = 3;
const PARTIES_MOST = 4;
const PARTY_APART = 10;
const PARTY_MARGIN = 260;
/** Music notes rise from a party's speaker, one this often, each for this long. */
const NOTE_EVERY_MS = 620;
const NOTE_MS = 1800;
const NOTE_RISE = 34;
/** Emotes over a party's crowd at once, and the wait before a slot shows its next. */
const PARTY_ICONS = 4;
const PARTY_ICON_EVERY_MS = [500, 1800] as const;
/** Of a party, the share dancing; the rest stand and talk. Two in five wear a party hat. */
const DANCING = 0.72;
/** Where a hat sits, as a share of the figure's height from the feet, and the speaker's size against a room's. */
const HAT_AT = 0.86;
const PARTY_SPEAKER = 2.4;
/** The warm pool of a party's lights after dark (L6): drawn in code, about four cells across, this strong at most. */
const PARTY_GLOW_KEY = 'lawns.partyGlow';
const PARTY_GLOW_ALPHA = 0.55;
/** What a party's crowd shows over their heads now and then; a cup only over someone whose own day says Party tonight. */
const PARTY_EMOTES = ['laugh', 'music', 'highfive', 'laugh', 'heart', 'music'] as const;
/** An emote over someone in a group every so often, and for this long. */
const ICON_EVERY_MS = [3800, 7600] as const;
const ICON_MS = 1700;
const ICON_LIFT = 38;
const ICON_SCALE = 0.5;

/** The emotes each kind shows now and then, the game's own (decision 9 of the app, "Ours"). */
const ICONS: Partial<Record<LawnKind, readonly string[]>> = {
  circle: ['laugh', 'speech', 'chat-music', 'chat-sports', 'chat-gaming'],
  picnic: ['laugh', 'speech', 'heart'],
  sun: ['sparkle'],
  nap: ['thought'],
  study: ['chat-studying', 'thought'],
  guitar: ['music', 'music', 'laugh'],
  frisbee: ['exclaim', 'laugh'],
  catch: ['laugh'],
  kick: ['exclaim', 'laugh'],
  couple: ['heart', 'heart', 'laugh'],
  phone: ['laugh'],
  reading: ['thought'],
  music: ['music'],
  selfie: ['sparkle', 'laugh'],
  hug: ['hug'],
  dance: ['music', 'laugh', 'music'],
  goof: ['laugh'],
  dog: ['heart'],
};

const INTEREST_NAMES = Object.keys(INTEREST) as Array<keyof typeof INTEREST>;

interface Member {
  sprite: Phaser.GameObjects.Image;
  student: StudentRef | null;
  look: number;
  /** Where they are, in cells; a mover's is worked out each frame. */
  x: number;
  y: number;
  direction: WalkDirection;
  pose: LawnPose;
  phase: number;
  shownKey: string;
  /** Something they hold: a phone, a book. */
  held: Phaser.GameObjects.Image | null;
  heldLift: number;
  /** At a party (L6): dancing or standing to talk, a party hat, and the cup their own day gives them, if any. */
  dancing: boolean;
  hat: Phaser.GameObjects.Image | null;
  cup: 'partycup' | 'sodacup' | null;
  /** Their own fade in, 0 to 1: someone arriving at a party already going. */
  fade: number;
  /** On foot to their place or away from it (69.2), and gone once away. Where they were last drawn. */
  trip: MemberTrip | null;
  gone: boolean;
  atX: number;
  atY: number;
}

/** A walk to a group's spot or away from it (69.2), and the way they faced in their place, for when they get there. */
interface MemberTrip extends Trip {
  restDir: WalkDirection | null;
}

interface Prop {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  /** A rug lies under the people on it; a disc or a ball moves between them. */
  flat: boolean;
  moves: 'disc' | 'ball' | 'roll' | 'dog' | null;
}

interface Group {
  key: string;
  kind: LawnKind;
  /** The spot: the middle of its cell. */
  x: number;
  y: number;
  where: string;
  members: Member[];
  props: Prop[];
  alpha: number;
  leaving: boolean;
  seen: boolean;
  icon: Phaser.GameObjects.Image | null;
  iconOn: number;
  iconAt: number;
  iconUntil: number;
  /** A crowd moment's bubbles over them (DESIGN.md 64.4), in turn: a proposal's ring then a kiss, an argument. */
  beats: Beat[];
  /** Formed before the social web answered, from the seed alone: it gives way to friends and couples once it has. */
  plain: boolean;
  /** A group that keeps still, drawn in full: nothing about it changes until it leaves, so its frames are skipped. */
  settled: boolean;
  /** Kept just off the screen, so it is there when the view moves, but not drawn (DESIGN.md 64.2, frames). */
  hidden: boolean;
  /** Crossing a quad (L6): from the spot to the far side and back. */
  route: { ax: number; ay: number; bx: number; by: number } | null;
  /** A party (L6): notes rising from the speaker, emotes over the crowd, and the night it is for. */
  notes: Array<{ image: Phaser.GameObjects.Image; born: number; side: number }>;
  noteAt: number;
  crowd: Array<{ image: Phaser.GameObjects.Image | null; on: number; until: number; next: number }>;
  night: number;
  /** A dance-off (64.4, L6): until when the two in the middle dance it out. */
  danceOffUntil: number;
  /** A party's glow after dark (L6). */
  glow: Phaser.GameObjects.Image | null;
  /** Its people come and go on foot (69.2); when the last of them arrived, in seconds, or -1 for found already there;
   * and how strongly its things show. */
  walked: boolean;
  since: number;
  propAlpha: number;
  /** A group that moves: how far round its spot it goes, made smaller to stay on open ground (69.5). */
  loopR: number;
}

/** A party night as the scene reads it (L6): the game date as a number, its weekday, and the shown hour, whole. */
export interface PartyNight {
  night: number;
  weekday: number;
  hour: number;
}

/** How far beyond the screen, in world pixels, a group is still drawn: a jog's loop and a thrown ball stay inside it. */
const OFF_PAD = 70;

/** One bubble of a crowd moment over a member of a group: which, on whom, from when until when, and big or not. */
interface Beat {
  key: string;
  on: number;
  from: number;
  until: number;
  big: boolean;
  image: Phaser.GameObjects.Image | null;
}

/** The kinds where nobody moves and nothing flies: once faded in they are left as drawn (DESIGN.md 64.2, frames). */
const STILL: ReadonlySet<LawnKind> = new Set<LawnKind>(['circle', 'picnic', 'sun', 'nap', 'study', 'guitar', 'couple', 'phone', 'reading', 'music', 'selfie', 'hug']);

interface Spot {
  x: number;
  y: number;
  quad: boolean;
  /** On a big lawn (L6): grass of BIG_LAWN cells or more, the campus's open green, filled in every part of it. */
  big: boolean;
  /** Each spot changes group on its own clock. */
  offset: number;
}

/** A steady number from two whole numbers. */
function mix(a: number, b: number): number {
  return hashInts(a, b, 4721) / 4294967296;
}

export class Lawns {
  private groups = new Map<string, Group>();
  private spots: Spot[] = [];
  /** Grass by a hall or a chapter house with room for a crowd (L6), tonight's parties among them, and the night. */
  private partySites: Array<{ x: number; y: number; greek: boolean }> = [];
  private tonight: { night: number; sites: Array<{ x: number; y: number; greek: boolean }> } | null = null;
  private night: PartyNight | null = null;
  /** How strong the street lamps are now, and where light is drawn: a party's glow follows them (L6). */
  private lamps = 0;
  private glowDepth = 0;
  private readonly people: PeopleSpec | null;
  private state: GameState | null = null;
  private everyone: StudentRef[] = [];
  private web: WebView | null = null;
  private share = 0;
  private step = 2;
  private period: DayPeriod = 'afternoon';
  private weather: Weather = 'clear';
  private exams = false;
  private reduced = false;
  private recountAt = 0;
  /** The update's clock. */
  private nowMs = 0;
  private drawn = 0;
  private afoot: Afoot | null = null;
  private goneCount = 0;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
    private staying: Set<string> = new Set(),
    private walking: (key: string) => boolean = () => false,
    /** Cells the small scenes are using now, which the lawns leave to them. */
    private taken: () => ReadonlySet<number> = () => new Set(),
  ) {
    this.people = art.people;
  }

  /** The buildings people sort against (DESIGN.md 69.5). */
  private feet: Footprints | null = null;

  /** The buildings people sort against, so nobody is drawn on a wall (DESIGN.md 69.5). */
  setFootprints(feet: Footprints): void {
    this.feet = feet;
  }

  /** The walkers' doors and paths, so a group's people walk on and off the screen (DESIGN.md 69.2). */
  setAfoot(afoot: Afoot): void {
    this.afoot = afoot;
  }

  /** How full the lawns are (lawnShare), the sky, the part of the day, exams, and Reduce effects. */
  setLife(share: number, period: DayPeriod, weather: Weather, exams: boolean, reduced: boolean): void {
    if (Math.abs(share - this.share) > 0.02 || period !== this.period || weather !== this.weather) this.recountAt = 0;
    this.share = share;
    this.period = period;
    this.weather = weather;
    this.exams = exams;
    this.reduced = reduced;
  }

  setStep(step: number): void {
    this.step = Math.max(0, Math.min(CROWD_STEPS.length - 1, step));
  }

  /** The street lamps' strength, 0 by day, and the depth light is drawn at: a party's glow follows them (L6). */
  setLamps(strength: number, depth: number): void {
    this.lamps = strength;
    this.glowDepth = depth;
  }

  /** A party night now (L6), or null: Thursday to Saturday evenings in term, in fine weather, on a game with parties. */
  setParty(night: PartyNight | null): void {
    if ((night?.night ?? -1) !== (this.night?.night ?? -1) || (night?.hour ?? -1) !== (this.night?.hour ?? -1)) this.recountAt = 0;
    this.night = night;
  }


  /** Read the map again: the spots on quads and on the campus's grass beside a path. */
  setMap(state: GameState): void {
    const { width, height, cells } = state.map;
    this.state = state;
    const sample = sampleStudents(state);
    if (sample.length !== this.everyone.length || sample[0]?.entryYear !== this.everyone[0]?.entryYear) {
      this.everyone = sample;
      for (const group of [...this.groups.values()]) this.walkOut(group);
    }
    const kind = (x: number, y: number): string => (x < 0 || y < 0 || x >= width || y >= height ? 'off' : cells[y * width + x]!.kind);
    const nearPath = (x: number, y: number): boolean => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (kind(x + dx, y + dy) === 'path') return true;
      return false;
    };
    // The lawns (L6): quads and the campus's own grass, joined where they touch, and how big each is.
    const lawn = (x: number, y: number): boolean => kind(x, y) === 'quad' || (kind(x, y) === 'empty' && ownedAt(state.map, x, y));
    const size = new Int32Array(width * height);
    for (let i = 0; i < size.length; i++) {
      const x0 = i % width;
      if (size[i] !== 0 || !lawn(x0, (i - x0) / width)) continue;
      const part: number[] = [i];
      size[i] = -1;
      for (let k = 0; k < part.length; k++) {
        const j = part[k]!;
        const x = j % width;
        const y = (j - x) / width;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          const n = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || size[n] !== 0 || !lawn(nx, ny)) continue;
          size[n] = -1;
          part.push(n);
        }
      }
      for (const j of part) size[j] = part.length;
    }
    const candidates: Array<Spot & { order: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!lawn(x, y)) continue;
        const quad = kind(x, y) === 'quad';
        const big = size[y * width + x]! >= BIG_LAWN;
        // A small patch of grass holds a group only beside a path; a quad or a big lawn, in every part of it.
        if (!quad && !big && !nearPath(x, y)) continue;
        // Open all round: a group needs room, so a cell hemmed in by buildings is left alone.
        let open = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (['empty', 'quad', 'path'].includes(kind(x + dx, y + dy))) open += 1;
        if (open < 3) continue;
        candidates.push({ x: x + 0.5, y: y + 0.5, quad, big, offset: hashInts(state.seed, x, y, 4723) % STAY_TICKS, order: mix(state.seed + y * width, x) });
      }
    }
    // Quads first, every cell of them (L6), then big lawns every other cell, then other grass two cells apart.
    candidates.sort((a, b) => Number(b.quad) - Number(a.quad) || a.order - b.order);
    const kept: Spot[] = [];
    const used = new Set<number>();
    for (const spot of candidates) {
      const cx = Math.floor(spot.x);
      const cy = Math.floor(spot.y);
      // A quad, every cell; a big lawn, every other cell, as a chessboard's squares of one colour; other grass, one
      // cell in four.
      let clash = used.has(cy * width + cx);
      if (!spot.quad && spot.big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (used.has((cy + dy) * width + cx + dx)) clash = true;
      if (!spot.quad && !spot.big) for (let dy = -SPACING + 1; dy < SPACING && !clash; dy++) for (let dx = -SPACING + 1; dx < SPACING && !clash; dx++) if (used.has((cy + dy) * width + cx + dx)) clash = true;
      if (clash) continue;
      used.add(cy * width + cx);
      const nudge = spot.quad ? QUAD_JITTER : GRASS_JITTER;
      kept.push({ x: spot.x + (mix(cx * 31, cy) - 0.5) * 2 * nudge, y: spot.y + (mix(cy * 37, cx) - 0.5) * 2 * nudge, quad: spot.quad, big: spot.big, offset: spot.offset });
    }
    this.spots = kept;
    // Where a party can be (L6): grass or a quad within a few cells of a hall or a chapter house, with open ground all round.
    const homes: Array<{ x: number; y: number; w: number; h: number; greek: boolean }> = [];
    for (const lot of state.map.buildings) if (lot && lot.zone === 'housing' && lot.stage > 0) homes.push({ x: lot.x, y: lot.y, w: 1, h: 1, greek: false });
    for (const placed of state.map.placed) if (placed && placed.type === 'chapterHouse') homes.push({ x: placed.x, y: placed.y, w: placed.w, h: placed.h, greek: true });
    const open = (x: number, y: number): boolean => kind(x, y) === 'quad' || (kind(x, y) === 'empty' && ownedAt(state.map, x, y));
    this.partySites = [];
    for (const spot of candidates) {
      const cx = Math.floor(spot.x);
      const cy = Math.floor(spot.y);
      // Grass all round the middle, and no building within two cells: the crowd and its lanterns reach that far (69.5).
      let room = true;
      for (let dy = -2; dy <= 2 && room; dy++) {
        for (let dx = -2; dx <= 2 && room; dx++) {
          const core = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
          if (core ? !open(cx + dx, cy + dy) : !open(cx + dx, cy + dy) && kind(cx + dx, cy + dy) !== 'path') room = false;
        }
      }
      if (!room) continue;
      const home = homes.find((one) => cx >= one.x - PARTY_REACH && cx < one.x + one.w + PARTY_REACH && cy >= one.y - PARTY_REACH && cy < one.y + one.h + PARTY_REACH);
      if (home) this.partySites.push({ x: cx + 0.5, y: cy + 0.5, greek: home.greek });
    }
    this.tonight = null;
    this.recountAt = 0;
    // Built over (69.5): a group with anyone where a building now stands walks off at once.
    for (const group of [...this.groups.values()]) {
      if (group.members.some((member) => { const k = kind(Math.floor(member.atX), Math.floor(member.atY)); return k !== 'quad' && k !== 'empty' && k !== 'path'; })) this.walkOut(group);
    }
  }

  // -------------------------------------------------------------- who --

  private busy(key: string): boolean {
    return this.staying.has(key) || this.walking(key);
  }

  /** Who is in a group at a spot for its time: a couple, a friend group, or one or two from the seed. */
  private company(spot: Spot, slot: number): { refs: StudentRef[]; couple: boolean; vibe: string | null } {
    const state = this.state!;
    const web = this.web;
    const h = hashInts(state.seed, Math.floor(spot.x) * 977 + Math.floor(spot.y), slot, 4729);
    const roll = (h >>> 0) / 4294967296;
    const free = (ref: StudentRef): boolean => !this.busy(studentKey(ref));
    if (web && roll < 0.28) {
      // A couple: a student from the seed and their partner, both free.
      for (let tries = 0; tries < 6; tries++) {
        const id = hashInts(h, tries, 1) % (web.classSlot * RINGS);
        if (web.ring[Math.floor(id / web.classSlot)]! < 0) continue;
        for (let k = 0; k < SLOTS; k++) {
          const s = id * SLOTS + k;
          const other = web.other[s]!;
          const tie = web.kind[s]!;
          if (other < 0 || tie < KIND.dating || tie > KIND.longterm) continue;
          const a = refIn(web, id);
          const b = refIn(web, other);
          if (free(a) && free(b)) return { refs: [a, b], couple: true, vibe: null };
        }
      }
    }
    if (web && roll < 0.78) {
      // A friend group, as many of them as are free.
      const groups = web.groupStart.length - 1;
      for (let tries = 0; groups > 0 && tries < 6; tries++) {
        const g = hashInts(h, tries, 2) % groups;
        const refs: StudentRef[] = [];
        for (let i = web.groupStart[g]!; i < web.groupStart[g + 1]! && refs.length < 5; i++) {
          const ref = refIn(web, web.groupMembers[i]!);
          if (free(ref)) refs.push(ref);
        }
        if (refs.length >= 2) return { refs, couple: false, vibe: INTEREST_NAMES[web.groupVibe[g]!] ?? null };
      }
    }
    // One or two students from the seed.
    const two = roll > 0.92;
    const refs: StudentRef[] = [];
    for (let n = 0; n < (two ? 2 : 1); n++) {
      const ref = findStudent(state.seed, this.everyone, Math.floor(spot.x) * 983 + Math.floor(spot.y) + slot * 7, n, (key) => this.busy(key) || refs.some((one) => studentKey(one) === key));
      if (ref && free(ref)) refs.push(ref);
    }
    return { refs, couple: false, vibe: null };
  }

  /** Who the group is (DESIGN.md 64.2): the first one's plan for the hour and mood, everyone's traits on average. */
  private natureOf(refs: readonly StudentRef[]): Pick<LawnGroup, 'plan' | 'mood' | 'traits'> {
    const state = this.state!;
    const web = this.web;
    const lead = refs[0];
    let plan: Where | null = null;
    let mood: LawnGroup['mood'] = null;
    const card = lead ? studentCard(state, lead) : null;
    if (lead && card) {
      const hour = shownHour();
      plan = itemAt(regularDay(web, state, lead, card), hour)?.where ?? null;
      const emotion = feelingOf(web, state, lead, card, hour).emotion;
      mood = emotion === 'happy' || emotion === 'excited' || emotion === 'flirty' ? 'up' : emotion === 'sad' || emotion === 'lonely' ? 'down' : emotion === 'tense' ? 'tense' : null;
    }
    const traits: NonNullable<LawnGroup['traits']> = {};
    if (web) {
      const ids = refs.map((ref) => idIn(web, ref)).filter((id) => id >= 0 && web.identity[id] !== 0);
      if (ids.length > 0) {
        const mean = (trait: number): number => ids.reduce((sum, id) => sum + traitOf(web.identity[id]!, trait), 0) / ids.length;
        traits.outgoing = mean(TRAIT.outgoing);
        traits.funny = mean(TRAIT.funny);
        traits.laidBack = mean(TRAIT.laidBack);
        traits.ambitious = mean(TRAIT.ambitious);
      }
    }
    return { plan, mood, traits };
  }

  /** Interests most of them share, from the web's identities. */
  private likesOf(refs: readonly StudentRef[]): Set<string> {
    const web = this.web;
    const out = new Set<string>();
    if (!web) return out;
    const counts = new Array<number>(INTEREST_NAMES.length).fill(0);
    for (const ref of refs) {
      const id = idIn(web, ref);
      if (id < 0) continue;
      const bits = web.identity[id]! >>> 18;
      for (let i = 0; i < INTEREST_NAMES.length; i++) if (bits & (1 << i)) counts[i]! += 1;
    }
    counts.forEach((count, i) => {
      if (count * 2 >= refs.length && count > 0) out.add(INTEREST_NAMES[i]!);
    });
    return out;
  }

  // ------------------------------------------------------------ making --

  private image(key: string): Phaser.GameObjects.Image | null {
    if (!this.art.has(key)) return null;
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    this.art.apply(sprite, key);
    fitOnMap(sprite, key);
    return sprite;
  }

  private prop(group: Group, key: string, x: number, y: number, flat = false, moves: Prop['moves'] = null): void {
    const sprite = this.image(key);
    if (!sprite) return;
    sprite.setOrigin(0.5, flat ? 0.5 : 1);
    group.props.push({ sprite, x, y, flat, moves });
  }

  /** True for ground anyone may stand on: a quad, a path, or the campus's own open grass (69.5). */
  private ground(x: number, y: number): boolean {
    const map = this.state?.map;
    if (!map) return true;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return false;
    const kind = map.cells[cy * map.width + cx]!.kind;
    return kind === 'quad' || kind === 'path' || (kind === 'empty' && ownedAt(map, cx, cy));
  }

  /** How far round its spot a group that moves can go and stay on open ground (69.5): its loop, made smaller to fit. */
  private fitLoop(group: Group): void {
    let r = this.loopOf(group.kind);
    const fits = (radius: number): boolean => {
      for (let k = 0; k < 16; k++) if (!this.ground(group.x + Math.cos((k / 16) * Math.PI * 2) * (radius + 0.12), group.y + Math.sin((k / 16) * Math.PI * 2) * (radius + 0.12))) return false;
      return true;
    };
    while (r > 0.25 && !fits(r)) r -= 0.05;
    group.loopR = r;
  }

  private member(group: Group, ref: StudentRef, x: number, y: number, pose: LawnPose, towardX: number, towardY: number, held: string | null = null, heldLift = 0.45): void {
    // Nobody stands inside a building or on a road (69.5): a place that would be pulled in towards the spot.
    for (let k = 1; k <= 10 && !this.ground(x, y); k++) {
      x += (group.x - x) * (k / 10);
      y += (group.y - y) * (k / 10);
    }
    const state = this.state!;
    const people = this.people!;
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    const from = this.iso.view(x, y);
    const to = this.iso.view(towardX, towardY);
    const direction = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < 1e-6 ? 'sw' : facingOf(to.x - from.x, to.y - from.y);
    const holding = held ? this.image(held) : null;
    holding?.setOrigin(0.5, 1);
    this.staying.add(studentKey(ref));
    group.members.push({
      sprite,
      student: ref,
      look: studentFigure(state, ref, people),
      x,
      y,
      direction,
      pose,
      phase: mix(Math.floor(x * 100), Math.floor(y * 100)) * Math.PI * 2,
      shownKey: '',
      held: holding,
      heldLift,
      dancing: false,
      hat: null,
      cup: null,
      fade: 1,
      trip: null,
      gone: false,
      atX: x,
      atY: y,
    });
  }

  /** Lay out a group of a kind at a spot: where each sits or stands, and their things. */
  private form(group: Group, refs: StudentRef[]): void {
    const { x, y, kind } = group;
    const n = refs.length;
    const turn = mix(Math.floor(x * 10), Math.floor(y * 10)) * Math.PI * 2;
    const ring = (r: number, i: number, of: number, start = turn): { x: number; y: number } => ({
      x: x + Math.cos(start + (i / of) * Math.PI * 2) * r,
      y: y + Math.sin(start + (i / of) * Math.PI * 2) * r,
    });
    const pose = LAWN_POSE[kind];
    switch (kind) {
      case 'circle':
      case 'picnic':
      case 'study':
        if (kind === 'picnic') {
          this.prop(group, this.art.has('scene.rug') ? 'scene.rug' : 'room.rug', x, y, true);
          // The basket and the bread on the far half of the rug, where the near sitters do not hide them.
          this.prop(group, this.art.has('scene.basket') ? 'scene.basket' : 'room.basket', x - 0.12, y - 0.1);
          this.prop(group, 'room.bread', x + 0.04, y - 0.16);
        }
        refs.forEach((ref, i) => {
          // Round a picnic the rug shows between them; a study group sits closer.
          const at = ring(kind === 'study' ? 0.28 : kind === 'picnic' ? 0.44 : 0.33, i, Math.max(n, 3));
          this.member(group, ref, at.x, at.y, pose, x, y, kind === 'study' ? (i % 2 === 0 ? 'room.book' : 'room.notes') : null, 0.12);
        });
        break;
      case 'guitar': {
        this.member(group, refs[0]!, x, y, 'sit', x + 1, y + 1, 'room.lute', 0.2);
        refs.slice(1).forEach((ref, i) => {
          const at = ring(0.4, i, Math.max(3, n - 1), turn);
          this.member(group, ref, at.x, at.y, 'sit', x, y);
        });
        break;
      }
      case 'sun':
      case 'nap':
      case 'music':
        this.prop(group, 'room.rug', x, y, true);
        refs.forEach((ref, i) => this.member(group, ref, x + i * 0.26 - (n - 1) * 0.13, y + i * 0.12, pose, x + 1, y + 1));
        if (kind === 'music') this.prop(group, 'room.speaker', x + 0.3, y - 0.12);
        break;
      case 'couple':
        refs.forEach((ref, i) => this.member(group, ref, x + (i === 0 ? -0.1 : 0.1), y + (i === 0 ? 0.08 : -0.08), 'sit', x + 1.2, y + 1.2));
        break;
      case 'frisbee':
      case 'catch':
      case 'kick': {
        const r = kind === 'frisbee' ? 0.75 : kind === 'catch' ? 0.55 : 0.5;
        refs.forEach((ref, i) => {
          const at = ring(r, i, n);
          this.member(group, ref, at.x, at.y, 'stand', x, y);
        });
        const thing = kind === 'frisbee' ? 'prop.frisbee' : kind === 'catch' ? 'room.ball' : 'room.soccerBall';
        this.prop(group, thing, x, y, false, kind === 'kick' ? 'roll' : kind === 'frisbee' ? 'disc' : 'ball');
        break;
      }
      case 'phone':
        this.member(group, refs[0]!, x, y, 'stand', x + 1, y + 1, 'prop.phone', 0.62);
        break;
      case 'reading':
        this.member(group, refs[0]!, x, y, 'sit', x + 1, y + 1, 'room.book', 0.12);
        break;
      case 'selfie':
        refs.forEach((ref, i) => this.member(group, ref, x + i * 0.16 - (n - 1) * 0.08, y - i * 0.05, 'stand', x + 1, y + 1, i === 0 ? 'prop.phone' : null, 1.02));
        break;
      case 'dance':
        // In a ring round a speaker, facing in.
        this.prop(group, 'room.speaker', x, y);
        refs.forEach((ref, i) => {
          const at = ring(0.36, i, Math.max(n, 3));
          this.member(group, ref, at.x, at.y, 'stand', x, y);
        });
        break;
      case 'hug':
        this.member(group, refs[0]!, x - 0.09, y, 'stand', x + 1, y);
        this.member(group, refs[1]!, x + 0.09, y, 'stand', x - 1, y);
        break;
      case 'stroll':
        // Side by side, across the way they walk (L6): drawn where they are each frame.
        refs.forEach((ref) => this.member(group, ref, x, y, 'move', x + 1, y));
        break;
      case 'party':
        break;
      case 'jog':
      case 'goof':
      case 'dog':
        refs.forEach((ref, i) => this.member(group, ref, x, y, 'move', x, y));
        if (kind === 'dog') this.prop(group, 'prop.dog', x, y, false, 'dog');
        break;
    }
  }

  /** Bring the groups on the lawns in line with how full they should be, inside the crowd step's lawn figures. */
  private recount(view: Phaser.Geom.Rectangle): void {
    const state = this.state;
    if (!state || !this.people) return;
    this.web = socialWeb.view && socialWeb.view.seed === state.seed ? socialWeb.view : null;
    const budget = Math.round(CROWD_STEPS[this.step]!.lawn * this.share);
    const tick = state.clock.tick;
    const taken = this.taken();
    const width = state.map.width;
    const keep = new Set<string>();
    // A party night's crowds first (L6): their own size, outside the lawns' figures.
    this.recountParties(view, keep);
    let count = 0;
    // Spots in view, each with its group for its own time: the quads first, the hub, then the big lawns, then the patches
    // of grass by the buildings; each in a steady order.
    const rankOf = (spot: Spot): number => (spot.quad ? 0 : spot.big ? 1 : 2);
    const margin = 120;
    const inView = this.spots.filter((spot) => {
      const at = this.iso.toWorld(spot.x, spot.y);
      return at.x >= view.x - margin && at.x <= view.right + margin && at.y >= view.y - margin && at.y <= view.bottom + margin;
    });
    const ranked = inView
      .map((spot) => {
        const slot = Math.floor((tick + spot.offset) / STAY_TICKS);
        return { spot, slot, key: `${Math.floor(spot.x)},${Math.floor(spot.y)}:${slot}`, order: mix(Math.floor(spot.x) * 991 + Math.floor(spot.y), slot) };
      })
      .sort((a, b) => rankOf(a.spot) - rankOf(b.spot) || a.order - b.order);
    // A group that takes room on a quad or a big lawn keeps the cells beside it: nobody sits in its game.
    const wide = new Set<number>();
    const near = new Set<number>();
    const cell = (spot: Spot): number => Math.floor(spot.y) * width + Math.floor(spot.x);
    const hold = (spot: Spot, isWide: boolean): void => {
      const c = cell(spot);
      near.add(c);
      if (isWide) wide.add(c);
    };
    const crowded = (spot: Spot, isWide: boolean): boolean => {
      const cx = Math.floor(spot.x);
      const cy = Math.floor(spot.y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const c = (cy + dy) * width + cx + dx;
          if (wide.has(c) || (isWide && near.has(c))) return true;
        }
      }
      return false;
    };
    // The groups already there stay while the figures allow.
    const fresh: typeof ranked = [];
    for (const one of ranked) {
      const have = this.groups.get(one.key);
      if (have && !have.leaving && !(have.plain && this.web) && count < budget) {
        keep.add(one.key);
        count += have.members.length;
        if (one.spot.quad || one.spot.big) hold(one.spot, WIDE.has(have.kind));
      } else fresh.push(one);
    }
    for (const { spot, slot, key } of fresh) {
      if (count >= budget) break;
      if (taken.has(cell(spot)) || near.has(cell(spot)) || crowded(spot, false)) continue;
      const have = this.groups.get(key);
      // One group to a spot and a time: one there already, leaving or formed from the seed alone, gives way at once.
      if (have) this.giveWay(have);
      const { refs, couple, vibe } = this.company(spot, slot);
      if (refs.length === 0) continue;
      const roll = mix(hashInts(state.seed, slot, 4733), Math.floor(spot.x) * 997 + Math.floor(spot.y));
      // On a quad some cross it, from one side to the other and back, between the groups (L6).
      const crossing = spot.quad ? STROLL_SHARE : spot.big ? BIG_STROLL_SHARE : 0;
      const route = mix(hashInts(state.seed, slot, 4739), cell(spot)) < crossing && !this.exams && this.period !== 'night' ? this.strollRoute(spot, slot) : null;
      const kind: LawnKind = route ? 'stroll' : chooseLawnKind({ size: refs.length, couple, vibe, likes: this.likesOf(refs), exams: this.exams, ...this.natureOf(refs) }, this.period, this.weather, roll);
      if ((spot.quad || spot.big) && WIDE.has(kind) && crowded(spot, true)) continue;
      const [, most] = LAWN_SIZE[kind];
      const members = refs.slice(0, most);
      if (count + members.length > budget && count > 0) continue;
      const group = this.newGroup(key, kind, spot.x, spot.y, spot.quad ? 'the quad' : 'the lawn');
      group.route = route;
      this.form(group, members);
      this.fitLoop(group);
      // In view, they walk there from the nearest door or the edge (69.2); with no way there, not here.
      if (!this.walkIn(group)) {
        this.release(group);
        continue;
      }
      this.groups.set(key, group);
      keep.add(key);
      count += members.length;
      if (spot.quad || spot.big) hold(spot, WIDE.has(kind));
    }
    for (const group of [...this.groups.values()]) if (!keep.has(group.key)) this.walkOut(group);
    this.drawn = count;
  }

  private newGroup(key: string, kind: LawnKind, x: number, y: number, where: string): Group {
    return { key, kind, x, y, where, members: [], props: [], alpha: 0, leaving: false, seen: true, icon: null, iconOn: -1, iconAt: 0, iconUntil: 0, plain: !this.web, settled: false, hidden: false, beats: [], route: null, notes: [], noteAt: 0, crowd: [], night: -1, danceOffUntil: 0, glow: null, walked: false, since: -1, propAlpha: 0, loopR: this.loopOf(kind) };
  }

  /** From a spot on a quad or a big lawn, three to six cells across it along the grid, over open ground only (L6), or null. */
  private strollRoute(spot: Spot, slot: number): Group['route'] {
    const map = this.state!.map;
    const { width, height, cells } = map;
    const walkable = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const here = cells[y * width + x]!.kind;
      return here === 'quad' || here === 'path' || (here === 'empty' && ownedAt(map, x, y));
    };
    const dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const;
    const cx = Math.floor(spot.x);
    const cy = Math.floor(spot.y);
    const first = hashInts(this.state!.seed, cx, cy, slot) % 4;
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = dirs[(first + k) % 4]!;
      let len = 0;
      while (len < 6 && walkable(cx + dx * (len + 1), cy + dy * (len + 1))) len += 1;
      if (len >= 3) return { ax: spot.x, ay: spot.y, bx: spot.x + dx * len, by: spot.y + dy * len };
    }
    return null;
  }

  // ------------------------------------------------------------ parties --

  /** Tonight's parties (L6): sites chosen for the night from the seed, apart from each other. The same all night. */
  private partiesTonight(): Array<{ x: number; y: number; greek: boolean }> {
    const night = this.night;
    const state = this.state;
    if (!night || !state || this.partySites.length === 0) return [];
    if (this.tonight && this.tonight.night === night.night) return this.tonight.sites;
    const most = Math.max(1, Math.min(PARTIES_MOST, Math.round(this.partySites.length / 40)));
    const order = this.partySites.map((site, i) => ({ site, order: mix(hashInts(state.seed, night.night, 4757), i) })).sort((a, b) => a.order - b.order);
    const sites: Array<{ x: number; y: number; greek: boolean }> = [];
    for (const { site } of order) {
      if (sites.length >= most) break;
      if (sites.some((one) => Math.hypot(one.x - site.x, one.y - site.y) < PARTY_APART)) continue;
      sites.push(site);
    }
    this.tonight = { night: night.night, sites };
    return sites;
  }

  /** How full a party is by the hour: filling from six, full from nine, thinning after one, over at two. */
  private partyRamp(hour: number): number {
    if (hour >= 21 || hour < 1) return 1;
    if (hour >= 18) return 0.45 + (0.55 * (hour - 18)) / 3;
    if (hour < 2) return 0.75;
    return 0;
  }

  /** Each party near the screen drawn with the crowd it has by this hour; one that has gone off it gives way. */
  private recountParties(view: Phaser.Geom.Rectangle, keep: Set<string>): void {
    const night = this.night;
    if (!night) return;
    const roll = mix(hashInts(this.state!.seed, night.night, 4759), 3);
    const want = Math.round(partySize(this.step, night.weekday, roll) * this.partyRamp(night.hour));
    if (want <= 0) return;
    for (const site of this.partiesTonight()) {
      const at = this.iso.toWorld(site.x, site.y);
      if (at.x < view.x - PARTY_MARGIN || at.x > view.right + PARTY_MARGIN || at.y < view.y - PARTY_MARGIN || at.y > view.bottom + PARTY_MARGIN) continue;
      const key = `party:${night.night}:${site.x},${site.y}`;
      let group = this.groups.get(key);
      if (group && group.leaving) {
        this.giveWay(group);
        group = undefined;
      }
      if (!group) {
        group = this.newGroup(key, 'party', site.x, site.y, site.greek ? 'Greek Row' : 'the lawn by the halls');
        group.night = night.night;
        this.formParty(group);
        this.groups.set(key, group);
      }
      // People arrive as the night fills, a friend group at a time, on foot from a door or the edge (69.2).
      if (group.members.length < want) {
        const before = group.members.length;
        this.joinParty(group, this.partyPeople(night.night, want - group.members.length, group));
        this.walkIn(group, before);
      }
      keep.add(key);
    }
  }

  /**
   * Who is at a party: friend groups who like parties or music first, each together, then anyone free from the seed.
   * Nobody already somewhere else on the map.
   */
  private partyPeople(night: number, want: number, group: Group): StudentRef[] {
    const state = this.state!;
    const web = this.web;
    const out: StudentRef[] = [];
    const taken = new Set(group.members.map((member) => (member.student ? studentKey(member.student) : '')));
    const free = (ref: StudentRef): boolean => !this.busy(studentKey(ref)) && !taken.has(studentKey(ref));
    const add = (ref: StudentRef): void => {
      out.push(ref);
      taken.add(studentKey(ref));
    };
    if (web) {
      const groups = web.groupStart.length - 1;
      for (let tries = 0; groups > 0 && tries < 80 && out.length < want; tries++) {
        const g = hashInts(state.seed, night, group.members.length + tries, 4761) % groups;
        const vibe = INTEREST_NAMES[web.groupVibe[g]!];
        if (tries < 60 && vibe !== 'partying' && vibe !== 'music') continue;
        for (let i = web.groupStart[g]!; i < web.groupStart[g + 1]! && out.length < want; i++) {
          const ref = refIn(web, web.groupMembers[i]!);
          if (free(ref)) add(ref);
        }
      }
    }
    for (let n = 0; out.length < want && n < want * 3; n++) {
      const ref = findStudent(state.seed, this.everyone, night * 7919 + group.members.length * 31 + n, n, (key) => this.busy(key) || taken.has(key));
      if (ref) add(ref);
    }
    return out;
  }

  /** A party's things: a big speaker in the middle, lights strung behind the crowd, lanterns at its edge. */
  private formParty(group: Group): void {
    const { x, y } = group;
    // Notes rise only from a speaker: an atlas without one has a party with none.
    if (!this.art.has('room.speaker')) group.noteAt = Number.POSITIVE_INFINITY;
    // A warm pool of light on the grass after dark, under the lights.
    group.glow = this.scene.add.image(0, 0, this.glowTexture()).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.prop(group, 'room.speaker', x, y);
    const speaker = group.props[group.props.length - 1];
    speaker?.sprite.setScale(speaker.sprite.scaleX * PARTY_SPEAKER);
    for (const [dx, dy] of [
      [-1.55, -0.55],
      [-0.55, -1.55],
    ] as const) {
      this.prop(group, this.art.has('decoration.stringLights') ? 'decoration.stringLights' : 'decoration.bunting', x + dx, y + dy);
    }
    for (const [dx, dy] of [
      [1.7, -0.6],
      [-0.6, 1.7],
      [1.25, 1.25],
    ] as const) {
      this.prop(group, 'decoration.lantern', x + dx, y + dy);
    }
  }

  /** The party's pool of light: a soft warm oval, made once, the shape of a circle of ground seen from the side. */
  private glowTexture(): string {
    const textures = this.scene.textures;
    if (!textures.exists(PARTY_GLOW_KEY)) {
      const canvas = textures.createCanvas(PARTY_GLOW_KEY, 256, 128);
      const context = canvas?.getContext();
      if (canvas && context) {
        context.setTransform(1, 0, 0, 0.5, 0, 0);
        const fill = context.createRadialGradient(128, 128, 0, 128, 128, 128);
        fill.addColorStop(0, 'rgba(255, 200, 120, 1)');
        fill.addColorStop(0.45, 'rgba(255, 160, 80, 0.45)');
        fill.addColorStop(1, 'rgba(255, 120, 50, 0)');
        context.fillStyle = fill;
        context.fillRect(0, 0, 256, 256);
        canvas.refresh();
      }
    }
    return PARTY_GLOW_KEY;
  }

  /** People join a party: round the speaker, nearest first, most of them dancing, some in party hats. */
  private joinParty(group: Group, refs: readonly StudentRef[]): void {
    const state = this.state!;
    const turn = mix(Math.floor(group.x * 10), Math.floor(group.y * 10)) * Math.PI * 2;
    const arriving = group.alpha > 0;
    for (const ref of refs) {
      const i = group.members.length;
      // A sunflower's spiral: evenly spread, the newest at the edge.
      const a = turn + i * 2.39996;
      const r = 0.4 + 0.2 * Math.sqrt(i);
      this.member(group, ref, group.x + Math.cos(a) * r, group.y + Math.sin(a) * r, 'stand', group.x, group.y);
      const member = group.members[i]!;
      member.dancing = mix(i * 31 + 7, group.night) < DANCING;
      member.fade = arriving ? 0 : 1;
      // About two in five in a party hat, spread through the crowd.
      if ((i + group.night) % 5 === 0 || (i + group.night) % 5 === 2) {
        const hat = this.image(`prop.partyhat.${Math.floor(mix(i * 5 + 1, group.night) * 3)}`);
        hat?.setOrigin(0.5, 1);
        member.hat = hat;
      }
      // A red cup only for someone of 21 or over whose own day says Party tonight; a soda for a younger one (63.9).
      const card = studentCard(state, ref);
      member.cup = card && card.party ? (card.over21 ? 'partycup' : 'sodacup') : null;
    }
  }

  /** Tonight's parties, where they are: for the walkers, who head there in groups (L6). */
  partySpots(): Array<{ x: number; y: number }> {
    return this.night ? this.partiesTonight().map((site) => ({ x: site.x, y: site.y })) : [];
  }

  /** A walk along points, from `startMs`: in to a place, or `out` and away. */
  private tripOf(pts: Array<{ x: number; y: number }>, startMs: number, out: boolean): MemberTrip {
    return { ...tripOf(pts, startMs, out), restDir: null };
  }

  /** How far round a mover's loop they start, and the loop's size, for a kind. */
  private loopOf(kind: LawnKind): number {
    return kind === 'jog' ? 0.85 : kind === 'goof' ? 0.42 : 0.6;
  }

  /** Where a member of a group stands when its time starts: a stroller at the start of the line, a mover on its loop. */
  private restOf(group: Group, member: Member, i: number): { x: number; y: number } {
    const n = group.members.length;
    const route = group.route;
    if (route) {
      const dx = route.bx - route.ax;
      const dy = route.by - route.ay;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      const side = (i - (n - 1) / 2) * 0.22;
      const back = i * 0.06;
      return { x: route.ax - (dy / len) * side - (dx / len) * back, y: route.ay + (dx / len) * side - (dy / len) * back };
    }
    if (member.pose === 'move') {
      const a = mix(Math.floor(group.x), Math.floor(group.y)) * 6 - i * 0.9;
      const loop = group.loopR;
      return { x: group.x + Math.cos(a) * loop, y: group.y + Math.sin(a) * loop };
    }
    return { x: member.x, y: member.y };
  }

  /**
   * Its people walk to the group (DESIGN.md 69.2), from member `from` on: from the nearest door or the edge of the
   * screen, one after another. Out of sight, or on ground only just come into sight, they are there already. False
   * when it is in sight and there is no way to it.
   */
  private walkIn(group: Group, from = 0): boolean {
    const afoot = this.afoot;
    if (!afoot || from >= group.members.length || !afoot.seen(group) || afoot.fresh(group.x, group.y)) return true;
    const way = afoot.approach(group.x, group.y);
    if (!way) {
      if (group.kind !== 'party') return false;
      // A party has a hall beside it: with no way found they come out of it as before.
      for (let i = from; i < group.members.length; i++) group.members[i]!.fade = 0;
      return true;
    }
    let last = this.nowMs;
    for (let i = from; i < group.members.length; i++) {
      const member = group.members[i]!;
      const rest = this.restOf(group, member, i);
      const trip = this.tripOf([...way.slice(0, -1), rest], this.nowMs + (i - from) * WALK_STAGGER_MS, false);
      trip.restDir = member.direction;
      member.trip = trip;
      member.fade = 0;
      member.atX = way[0]!.x;
      member.atY = way[0]!.y;
      last = Math.max(last, trip.startMs + (trip.total / LAWN_WALK) * 1000);
    }
    if (!group.walked || group.since >= 0) group.since = Math.max(group.since, last / 1000);
    group.walked = true;
    group.settled = false;
    return true;
  }

  /**
   * The group breaks up (DESIGN.md 69.2): in sight, each walks off to the nearest door or the edge of the screen and is
   * gone there; out of sight, it simply goes, as before.
   */
  private walkOut(group: Group): void {
    if (group.leaving && (group.walked || group.alpha <= 0)) return;
    group.leaving = true;
    const afoot = this.afoot;
    if (!afoot || group.hidden || !afoot.seen(group)) return;
    group.walked = true;
    group.settled = false;
    group.members.forEach((member, i) => {
      if (member.gone) return;
      const way = afoot.approach(member.atX, member.atY);
      if (!way) {
        member.trip = this.tripOf([{ x: member.atX, y: member.atY }, { x: member.atX, y: member.atY }], this.nowMs, true);
        return;
      }
      way.reverse();
      member.trip = this.tripOf(way, this.nowMs + i * (WALK_STAGGER_MS / 2), true);
    });
  }

  /** A group whose spot a new one wants at once: it walks off under another name, or out of sight is gone at once. */
  private giveWay(group: Group): void {
    if (this.groups.get(group.key) === group) this.groups.delete(group.key);
    if (group.hidden || !this.afoot || !this.afoot.seen(group)) {
      this.release(group);
      return;
    }
    group.key = `${group.key}~${this.goneCount++}`;
    this.groups.set(group.key, group);
    this.walkOut(group);
  }

  /** Draw a group or stop drawing it, as it comes on or goes off the screen. Back on, it is drawn afresh. */
  private shown(group: Group, on: boolean): void {
    group.hidden = !on;
    group.settled = false;
    for (const member of group.members) {
      member.sprite.setVisible(on);
      member.held?.setVisible(on);
      member.hat?.setVisible(on);
    }
    for (const prop of group.props) prop.sprite.setVisible(on);
    if (!on) {
      group.icon?.setVisible(false);
      for (const beat of group.beats) beat.image?.setVisible(false);
      for (const note of group.notes) note.image.setVisible(false);
      for (const slot of group.crowd) slot.image?.setVisible(false);
      group.glow?.setVisible(false);
    }
  }

  private release(group: Group): void {
    for (const member of group.members) {
      if (member.student) this.staying.delete(studentKey(member.student));
      member.sprite.destroy();
      member.held?.destroy();
      member.hat?.destroy();
    }
    for (const prop of group.props) prop.sprite.destroy();
    group.icon?.destroy();
    for (const beat of group.beats) beat.image?.destroy();
    for (const note of group.notes) note.image.destroy();
    for (const slot of group.crowd) slot.image?.destroy();
    group.glow?.destroy();
    if (this.groups.get(group.key) === group) this.groups.delete(group.key);
  }

  // ----------------------------------------------------------- drawing --

  update(timeMs: number, deltaMs: number): void {
    const people = this.people;
    if (!people) return;
    this.nowMs = timeMs;
    if (timeMs >= this.recountAt) {
      this.recountAt = timeMs + RECOUNT_MS;
      this.recount(this.scene.cameras.main.worldView);
    }
    const dt = Math.min(deltaMs, 100);
    const seconds = timeMs / 1000;
    const view = this.scene.cameras.main.worldView;
    for (const group of [...this.groups.values()]) {
      const spot = this.iso.toWorld(group.x, group.y);
      const off = spot.x < view.x - OFF_PAD || spot.x > view.right + OFF_PAD || spot.y < view.y - OFF_PAD || spot.y > view.bottom + OFF_PAD;
      if (group.walked) {
        // Its people come and go on foot (69.2): they are drawn in full, its things show once someone is there.
        group.alpha = 1;
        const there = group.members.some((member) => !member.trip && !member.gone);
        group.propAlpha = group.leaving || !there ? Math.max(0, group.propAlpha - dt / FADE_MS) : Math.min(1, group.propAlpha + dt / FADE_MS);
        if (group.leaving && (off || group.members.every((member) => member.gone))) {
          this.release(group);
          continue;
        }
      } else {
        group.alpha = group.leaving ? group.alpha - dt / FADE_MS : Math.min(1, group.alpha + dt / FADE_MS);
        group.propAlpha = Math.max(0, group.alpha);
        if (group.leaving && group.alpha <= 0) {
          this.release(group);
          continue;
        }
      }
      const alpha = Math.max(0, group.alpha);
      const things = group.propAlpha;
      if (off) {
        if (!group.hidden) this.shown(group, false);
        continue;
      }
      if (group.hidden) this.shown(group, true);
      const walking = group.members.some((member) => member.trip !== null);
      if (group.settled && !group.leaving && !walking) {
        this.icons(group, timeMs, things);
        continue;
      }
      // Drawn once more at full strength, then left as it is.
      if (!group.leaving && !walking && group.alpha >= 1 && group.propAlpha >= 1 && STILL.has(group.kind)) group.settled = true;
      const n = group.members.length;
      // A group's own clock: from when the last of them arrived on foot (69.2), or, found already there, from the seed.
      const started = group.since < 0 || seconds >= group.since;
      const clock = group.since >= 0 ? Math.max(0, seconds - group.since) : seconds;
      // Movers go round a loop about the spot: a jog, a chase, a dog walk.
      const loop = group.loopR;
      const pace = group.kind === 'jog' ? 0.55 : group.kind === 'goof' ? 0.9 : 0.25;
      const angleOf = (i: number): number => clock * pace + mix(Math.floor(group.x), Math.floor(group.y)) * 6 - i * 0.9;
      // A thrown thing: from one to the next, the next pass after a short wait.
      const passS = group.kind === 'frisbee' ? 1.6 : group.kind === 'catch' ? 1.2 : 1.4;
      const t = seconds / passS + mix(Math.floor(group.x * 7), Math.floor(group.y * 7)) * 10;
      const pass = Math.floor(t);
      const part = t - pass;
      const from = n > 1 ? pass % n : 0;
      const to = n > 1 ? (pass + 1) % n : 0;
      const party = group.kind === 'party';
      const route = group.route;
      group.members.forEach((member, i) => {
        let x = member.x;
        let y = member.y;
        let moving = false;
        if (member.gone) {
          member.sprite.setAlpha(0);
          member.held?.setAlpha(0);
          member.hat?.setAlpha(0);
          return;
        }
        const trip = member.trip;
        if (trip) {
          // On foot to their place or away (69.2): along the way, facing it, fading only in a doorway.
          const d = ((timeMs - trip.startMs) / 1000) * LAWN_WALK;
          if (d >= trip.total) {
            member.trip = null;
            if (trip.out) {
              member.gone = true;
              member.sprite.setAlpha(0);
              member.held?.setAlpha(0);
              member.hat?.setAlpha(0);
              return;
            }
            member.fade = 1;
            if (trip.restDir) member.direction = trip.restDir;
          } else {
            const on = pointOn(trip, d);
            x = on.x;
            y = on.y;
            const v0 = this.iso.view(on.ax, on.ay);
            const v1 = this.iso.view(on.bx, on.by);
            if (Math.abs(v1.x - v0.x) + Math.abs(v1.y - v0.y) > 1e-6) member.direction = facingOf(v1.x - v0.x, v1.y - v0.y);
            moving = d > 0;
            member.fade = doorAlpha(trip, d, DOOR_FADE);
          }
        } else member.fade = Math.min(1, member.fade + dt / FADE_MS);
        if (member.trip) {
          // Walking: drawn below.
        } else if (route) {
          // Crossing the quad and back (L6), side by side, a little apart along the way too.
          const dx = route.bx - route.ax;
          const dy = route.by - route.ay;
          const len = Math.max(0.001, Math.hypot(dx, dy));
          // A straight line, then a stop at the end, then one turn and back (DESIGN.md 69.1): never back and forth
          // without a pause.
          const walkS = len / STROLL_SPEED;
          const lap = 2 * (walkS + STROLL_PAUSE_S);
          const tt = group.since >= 0 ? clock % lap : (seconds + mix(Math.floor(group.x * 7), Math.floor(group.y * 7)) * lap) % lap;
          const out = tt < walkS + STROLL_PAUSE_S;
          const u = out ? tt : tt - walkS - STROLL_PAUSE_S;
          const f = u < walkS ? (out ? u / walkS : 1 - u / walkS) : out ? 1 : 0;
          const side = (i - (n - 1) / 2) * 0.22;
          const back = i * 0.06;
          x = route.ax + dx * f - (dy / len) * side - (dx / len) * back;
          y = route.ay + dy * f + (dx / len) * side - (dy / len) * back;
          const sign = out ? 1 : -1;
          const v0 = this.iso.view(0, 0);
          const v1 = this.iso.view(dx * sign, dy * sign);
          member.direction = facingOf(v1.x - v0.x, v1.y - v0.y);
          moving = u < walkS && started;
        } else if (member.pose === 'move') {
          const a = angleOf(i);
          x = group.x + Math.cos(a) * loop;
          y = group.y + Math.sin(a) * loop;
          const ahead = angleOf(i) + 0.05;
          const nx = group.x + Math.cos(ahead) * loop;
          const ny = group.y + Math.sin(ahead) * loop;
          const v0 = this.iso.view(x, y);
          const v1 = this.iso.view(nx, ny);
          member.direction = facingOf(v1.x - v0.x, v1.y - v0.y);
          moving = started;
        } else if ((group.kind === 'frisbee' || group.kind === 'catch' || group.kind === 'kick') && (i === from || i === to) && part < 0.25) {
          moving = true;
        } else if (group.kind === 'dance' || (party && member.dancing)) {
          // Stepping on the spot to the beat, each a little off the others.
          moving = true;
        }
        // Dancers sway from side to side and bob (DESIGN.md 64.3), each a beat off the others; at a party, most of them.
        // In a dance-off the two in the middle go faster and bigger (L6).
        const off = i < 2 && timeMs < group.danceOffUntil;
        const swaying = (group.kind === 'dance' || (party && member.dancing) || off) && !this.reduced && !member.trip;
        const base = swaying ? swayAt(off ? timeMs * 1.7 : timeMs, i * 0.13 + member.phase) : null;
        const sway = base && off ? { rotation: base.rotation * 2.2, lift: base.lift * 3 } : base;
        if (off) moving = true;
        const bob = sway ? sway.lift : 0;
        member.sprite.setRotation(sway ? sway.rotation : 0);
        const flipFrom = people.flip?.[member.direction];
        const facing = flipFrom ?? member.direction;
        let key: string;
        let flip = flipFrom !== undefined;
        if (member.pose === 'sit' && !member.trip) {
          // Facing the viewer (south-west or south-east) or away (north-west or north-east), mirrored for the east.
          const away = member.direction === 'nw' || member.direction === 'ne';
          key = `person.${member.look}.pose.${away ? 'sit-nw' : 'sit-sw'}`;
          flip = member.direction === 'se' || member.direction === 'ne';
        } else if ((member.pose === 'lie' || member.pose === 'nap') && !member.trip) {
          key = `person.${member.look}.pose.${member.pose}`;
          flip = mix(Math.floor(member.x * 10), 3) < 0.5;
        } else {
          const quick = member.trip ? 1 : group.kind === 'jog' ? 1.6 : group.kind === 'goof' ? 1.8 : 1;
          const stride = moving ? Math.floor((timeMs * quick + member.phase * 300) / people.frameMs) % people.frames : 0;
          key = `person.${member.look}.${facing}.${stride}`;
        }
        if (!this.art.has(key)) {
          key = `person.${member.look}.${facing}.0`;
          flip = flipFrom !== undefined;
        }
        if (key !== member.shownKey) {
          this.art.apply(member.sprite, key);
          member.shownKey = key;
        }
        member.sprite.setFlipX(flip);
        const at = this.iso.toWorld(x, y);
        const own = (this.iso.sum(x, y) - 1) * 4 + 2.5;
        const depth = this.feet ? this.feet.depth(x, y, own) : own;
        member.sprite.setPosition(at.x, at.y - bob).setDepth(depth).setAlpha(alpha * member.fade);
        member.atX = x;
        member.atY = y;
        if (member.hat) {
          // On top of the head, leaning as they sway.
          const tall = member.sprite.displayHeight * HAT_AT;
          const lean = member.sprite.rotation;
          member.hat.setPosition(at.x + Math.sin(lean) * tall, at.y - bob - Math.cos(lean) * tall).setRotation(lean).setDepth(depth + 0.03).setAlpha(alpha * member.fade);
        }
        if (member.held) {
          // Held in front of them: at the lap for a book, up by the face for a phone, a guitar across them.
          const side = flip ? 1 : -1;
          member.held.setPosition(at.x + side * member.sprite.displayWidth * 0.18, at.y - member.sprite.displayHeight * member.heldLift + member.sprite.displayHeight * 0.1).setDepth(depth + 0.02).setAlpha(alpha * member.fade);
        }
      });
      for (const prop of group.props) {
        let px = prop.x;
        let py = prop.y;
        let lift = 0;
        if (prop.moves && n > 1 && (prop.moves === 'disc' || prop.moves === 'ball' || prop.moves === 'roll')) {
          const a = group.members[from]!;
          const b = group.members[to]!;
          const flight = Math.min(1, part / 0.8);
          px = a.x + (b.x - a.x) * flight;
          py = a.y + (b.y - a.y) * flight;
          lift = prop.moves === 'roll' ? 0 : Math.sin(flight * Math.PI) * (prop.moves === 'disc' ? 16 : 26) + 10;
        } else if (prop.moves === 'dog') {
          const a = angleOf(0) - 0.45;
          px = group.x + Math.cos(a) * loop;
          py = group.y + Math.sin(a) * loop;
          const v0 = this.iso.view(px, py);
          const ahead = this.iso.view(group.x + Math.cos(a + 0.05) * loop, group.y + Math.sin(a + 0.05) * loop);
          // The dog is drawn facing left (south-west); it turns as it goes.
          prop.sprite.setFlipX(facingOf(ahead.x - v0.x, ahead.y - v0.y) === 'se' || facingOf(ahead.x - v0.x, ahead.y - v0.y) === 'ne');
        }
        const at = this.iso.toWorld(px, py);
        const depth = prop.flat ? (this.iso.sum(group.x, group.y) - 1) * 4 + 2.3 : (this.iso.sum(px, py) - 1) * 4 + 2.45;
        prop.sprite.setPosition(at.x, at.y - lift).setDepth(depth).setAlpha(things);
        if (prop.moves === 'disc') prop.sprite.setRotation(Math.sin(seconds * 9) * 0.15);
      }
      if (party && group.glow) {
        const at = this.iso.toWorld(group.x, group.y);
        group.glow.setPosition(at.x, at.y).setDepth(this.glowDepth).setAlpha(things * this.lamps * PARTY_GLOW_ALPHA).setVisible(this.lamps > 0.05);
      }
      if (party) {
        this.notes(group, timeMs, things);
        this.partyIcons(group, timeMs, things);
      } else this.icons(group, timeMs, things);
    }
  }

  /** Music notes rising from a party's speaker (L6), one after another, drifting a little as they go. */
  private notes(group: Group, timeMs: number, alpha: number): void {
    const speaker = group.props[0];
    if (!speaker || this.reduced || !Number.isFinite(group.noteAt)) return;
    if (timeMs >= group.noteAt && this.art.has('emote.music')) {
      group.noteAt = timeMs + NOTE_EVERY_MS;
      const image = this.image('emote.music');
      if (image) {
        image.setOrigin(0.5, 1).setScale(ICON_SCALE * 0.8);
        group.notes.push({ image, born: timeMs, side: (group.notes.length % 2 === 0 ? 1 : -1) * (0.5 + mix(Math.floor(timeMs), 3) * 0.5) });
      }
    }
    const top = speaker.sprite.y - speaker.sprite.displayHeight;
    group.notes = group.notes.filter((note) => {
      const age = (timeMs - note.born) / NOTE_MS;
      if (age >= 1) {
        note.image.destroy();
        return false;
      }
      const fade = Math.min(1, age * 5, (1 - age) * 3);
      note.image
        .setVisible(true)
        .setPosition(speaker.sprite.x + note.side * 8 * age + Math.sin(age * 9) * 2, top - NOTE_RISE * age)
        .setDepth(speaker.sprite.depth + 0.5)
        .setAlpha(alpha * fade);
      return true;
    });
  }

  /**
   * Emotes over a party's crowd (L6), a few at a time: laughing, music, a high five, a heart. A cup only over someone
   * whose own day says Party tonight: red for a student of 21 or over, a soda for a younger one.
   */
  private partyIcons(group: Group, timeMs: number, alpha: number): void {
    if (group.beats.length > 0) {
      for (const slot of group.crowd) slot.image?.setVisible(false);
      this.drawBeats(group, timeMs, alpha);
      return;
    }
    if (this.reduced || group.members.length === 0) return;
    while (group.crowd.length < PARTY_ICONS) group.crowd.push({ image: null, on: 0, until: 0, next: timeMs + group.crowd.length * 700 });
    group.crowd.forEach((slot, n) => {
      if (timeMs >= slot.next) {
        const h = hashInts(Math.floor(group.x * 13) + n, Math.floor(group.y * 13), Math.floor(timeMs / 250));
        slot.on = h % group.members.length;
        const member = group.members[slot.on]!;
        const cup = member.cup && (h >>> 9) % 3 === 0 ? member.cup : null;
        slot.image?.destroy();
        slot.image = this.image(`emote.${cup ?? PARTY_EMOTES[(h >>> 12) % PARTY_EMOTES.length]!}`);
        slot.image?.setOrigin(0.5, 1).setScale(ICON_SCALE);
        slot.until = timeMs + ICON_MS;
        slot.next = slot.until + PARTY_ICON_EVERY_MS[0] + ((h >>> 16) % (PARTY_ICON_EVERY_MS[1] - PARTY_ICON_EVERY_MS[0]));
      }
      const image = slot.image;
      if (!image) return;
      if (timeMs > slot.until) {
        image.setVisible(false);
        return;
      }
      const member = group.members[slot.on % group.members.length]!;
      const fade = Math.min(1, (slot.until - timeMs) / 300, (timeMs - (slot.until - ICON_MS)) / 200);
      const lift = member.hat ? ICON_LIFT + 7 : ICON_LIFT;
      image.setVisible(true).setPosition(member.sprite.x, member.sprite.y - lift).setDepth(member.sprite.depth + 0.1).setAlpha(alpha * member.fade * Math.max(0, fade));
    });
  }

  /** Now and then an emote over one of them: a laugh in a circle, music over a guitar, a heart between a couple. */
  private icons(group: Group, timeMs: number, alpha: number): void {
    if (group.beats.length > 0) {
      this.drawBeats(group, timeMs, alpha);
      return;
    }
    const keys = ICONS[group.kind];
    if (!keys || this.reduced || group.members.length === 0) return;
    if (timeMs >= group.iconAt) {
      const h = hashInts(Math.floor(group.x * 13), Math.floor(group.y * 13), Math.floor(timeMs / 1000));
      group.iconOn = h % group.members.length;
      const key = `emote.${keys[(h >>> 8) % keys.length]!}`;
      group.icon?.destroy();
      group.icon = this.image(key);
      group.icon?.setOrigin(0.5, 1).setScale(ICON_SCALE);
      group.iconUntil = timeMs + ICON_MS;
      group.iconAt = timeMs + ICON_EVERY_MS[0] + ((h >>> 16) % (ICON_EVERY_MS[1] - ICON_EVERY_MS[0]));
    }
    const icon = group.icon;
    if (!icon) return;
    if (timeMs > group.iconUntil) {
      icon.setVisible(false);
      return;
    }
    const member = group.members[group.iconOn]!;
    const fade = Math.min(1, (group.iconUntil - timeMs) / 300, (timeMs - (group.iconUntil - ICON_MS)) / 200);
    icon.setVisible(true).setPosition(member.sprite.x, member.sprite.y - ICON_LIFT).setDepth(member.sprite.depth + 0.1).setAlpha(alpha * Math.max(0, fade));
  }

  // ------------------------------------------------------- student cards --

  private words(group: Group, member: Member): string {
    const state = this.state;
    const others = state ? group.members.filter((one) => one !== member && one.student).map((one) => firstNameOf(state, one.student!)) : [];
    return lawnWords(group.kind, group.where, others);
  }

  private stander(group: Group, member: Member, far: number): Stander {
    return { student: member.student, look: member.look, words: this.words(group, member), x: member.sprite.x, y: member.sprite.y, far, depth: member.sprite.depth };
  }

  /** Someone on the lawns at a point of the world, or null. */
  memberAt(worldX: number, worldY: number, reach: number): Stander | null {
    let found: Stander | null = null;
    for (const group of this.groups.values()) {
      if (group.leaving || group.alpha < 0.5) continue;
      for (const member of group.members) {
        const box = member.sprite.getBounds();
        if (worldX < box.x - reach || worldX > box.right + reach || worldY < box.y - reach || worldY > box.bottom + reach) continue;
        const far = Math.hypot(worldX - box.centerX, worldY - box.centerY);
        if (!found || far < found.far) found = this.stander(group, member, far);
      }
    }
    return found;
  }

  /** The figure of a student on the lawns, for the close-up's fade (L6), or null. */
  spriteOf(key: string): Phaser.GameObjects.Image | null {
    for (const group of this.groups.values()) {
      if (group.leaving || group.hidden) continue;
      for (const member of group.members) if (member.student && studentKey(member.student) === key) return member.sprite;
    }
    return null;
  }

  /** Where a student is and what they are doing, when they are on the lawns. */
  find(key: string): Stander | null {
    for (const group of this.groups.values()) {
      if (group.leaving) continue;
      for (const member of group.members) if (member.student && studentKey(member.student) === key) return this.stander(group, member, 0);
    }
    return null;
  }

  /**
   * A couple sitting on the grass in view becomes a crowd moment (DESIGN.md 64.4): a proposal (a ring, then a kiss on
   * the cheek) or an argument. Where it is, or null.
   */
  stageCouple(view: Phaser.Geom.Rectangle, kind: 'proposal' | 'coupleFight'): { x: number; y: number } | null {
    const at = this.groupIn(view, 'couple');
    if (!at) return null;
    const group = [...this.groups.values()].find((one) => one.kind === 'couple' && !one.leaving && one.x === at.x && one.y === at.y);
    if (!group || group.members.length < 2) return null;
    const now = this.nowMs;
    group.icon?.setVisible(false);
    group.beats =
      kind === 'proposal'
        ? [
            { key: 'emote.big-ring', on: 0, from: now + 300, until: now + 2900, big: true, image: null },
            { key: 'emote.big-kiss', on: 1, from: now + 3400, until: now + 6000, big: true, image: null },
          ]
        : [
            { key: 'emote.big-argue', on: 0, from: now, until: now + 2600, big: true, image: null },
            { key: 'emote.anger', on: 1, from: now + 700, until: now + 2400, big: false, image: null },
            { key: 'emote.sadcloud', on: 1, from: now + 3600, until: now + 5300, big: false, image: null },
          ];
    return at;
  }

  /** A crowd moment's bubbles, each in its turn, popped in when big; done, the group's own emotes come back. */
  private drawBeats(group: Group, timeMs: number, alpha: number): void {
    for (const beat of group.beats) {
      const live = timeMs >= beat.from && timeMs < beat.until;
      if (live && !beat.image) {
        beat.image = this.image(beat.key);
        beat.image?.setOrigin(0.5, 1);
      }
      if (!beat.image) continue;
      const member = group.members[beat.on % group.members.length]!;
      const age = timeMs - beat.from;
      const scale = beat.big ? 0.47 * (age < 160 ? 0.6 + (0.5 * age) / 160 : age < 260 ? 1.1 - (0.1 * (age - 160)) / 100 : 1) : ICON_SCALE;
      const fade = Math.min(1, age / 150, (beat.until - timeMs) / 200);
      beat.image
        .setVisible(live)
        .setScale(scale)
        .setPosition(member.sprite.x, member.sprite.y - (beat.big ? ICON_LIFT + 2 : ICON_LIFT))
        .setDepth(member.sprite.depth + 0.2)
        .setAlpha(alpha * Math.max(0, fade));
    }
    if (group.beats.every((beat) => timeMs >= beat.until)) {
      for (const beat of group.beats) beat.image?.destroy();
      group.beats = [];
    }
  }

  /**
   * A dance-off at a dance or a party (64.4, L6): the two nearest the middle dance it out, faster and bigger, with an
   * emote over each in turn and a big bubble for the winner at the end. The crowd round them is the walkers'.
   */
  stageDanceOff(at: { x: number; y: number }, ms: number): void {
    const group = [...this.groups.values()].find((one) => !one.leaving && (one.kind === 'dance' || one.kind === 'party') && one.x === at.x && one.y === at.y);
    if (!group || group.members.length < 2) return;
    const now = this.nowMs;
    group.danceOffUntil = now + ms;
    group.icon?.setVisible(false);
    for (const slot of group.crowd) slot.image?.setVisible(false);
    const turn = Math.max(1200, Math.floor((ms - 1600) / 3));
    group.beats = [
      { key: 'emote.exclaim', on: 0, from: now + 200, until: now + 200 + turn, big: false, image: null },
      { key: 'emote.music', on: 1, from: now + 200 + turn, until: now + 200 + 2 * turn, big: false, image: null },
      { key: 'emote.laugh', on: 0, from: now + 200 + 2 * turn, until: now + 200 + 3 * turn, big: false, image: null },
      { key: this.art.has('emote.big-win') ? 'emote.big-win' : 'emote.highfive', on: 1, from: now + 300 + 3 * turn, until: now + 2300 + 3 * turn, big: this.art.has('emote.big-win'), image: null },
    ];
  }

  /** A group of a kind whose spot is in view, for a crowd moment (DESIGN.md 64.4): a dance on a lawn. */
  groupIn(view: Phaser.Geom.Rectangle, kind: LawnKind): { x: number; y: number } | null {
    for (const group of this.groups.values()) {
      // A party is a dance too (L6): a dance-off happens there.
      const same = group.kind === kind || (kind === 'dance' && group.kind === 'party');
      if (group.leaving || !same || group.alpha < 1 || group.hidden) continue;
      const at = this.iso.toWorld(group.x, group.y);
      if (view.contains(at.x, at.y)) return { x: group.x, y: group.y };
    }
    return null;
  }

  /** The first in a group of a kind, for a dev picture. */
  firstOf(kind: LawnKind): Stander | null {
    for (const group of this.groups.values()) if (!group.leaving && group.kind === kind && group.members[0] && group.alpha >= 0.5) return this.stander(group, group.members[0], 0);
    return null;
  }

  /** People on the lawns drawn inside a view now (L6's measure of the quad): sitting, playing, crossing, dancing. */
  doingIn(view: Phaser.Geom.Rectangle): number {
    let n = 0;
    for (const group of this.groups.values()) {
      if (group.leaving || group.hidden) continue;
      for (const member of group.members) if (member.sprite.visible && member.sprite.alpha > 0.5 && view.contains(member.sprite.x, member.sprite.y)) n += 1;
    }
    return n;
  }

  /** People on the lawns now, and the groups by kind: for the dev readout. */
  get count(): number {
    return this.drawn;
  }

  get kinds(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const group of this.groups.values()) if (!group.leaving) out[group.kind] = (out[group.kind] ?? 0) + group.members.length;
    return out;
  }

  clear(): void {
    for (const group of [...this.groups.values()]) this.release(group);
    this.groups.clear();
  }
}
