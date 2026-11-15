import Phaser from 'phaser';
import { fitOnMap } from './propSize';
import { findStudent, type Stander } from '../app/activityPeople';
import { CROWD_STEPS } from '../app/crowd';
import { shownHour, type DayPeriod } from '../app/daylight';
import { feelingOf } from '../app/emotion';
import { itemAt, regularDay, type Where } from '../app/regularDay';
import { chooseLawnKind, LAWN_POSE, LAWN_SIZE, lawnWords, type LawnGroup, type LawnKind, type LawnPose } from '../app/lawnLife';
import type { Weather } from '../app/life';
import { idIn, refIn, type WebView } from '../app/socialView';
import { socialWeb } from '../app/socialWeb';
import { hashInts, ownedAt, sampleStudents, studentFigure, studentKey, type GameState, type StudentRef } from '../sim';
import { firstNameOf, studentCard } from '../sim/systems/students';
import { INTEREST, TRAIT, traitOf } from '../sim/systems/identity';
import { KIND, SLOTS } from '../sim/config/web';
import type { Art, PeopleSpec, WalkDirection } from './art';
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
const RECOUNT_MS = 1100;
/** How long a group stays, in game ticks (minutes): each spot keeps its group this long, on its own clock. */
const STAY_TICKS = 9;
/** Spots are at least this many cells apart, so groups do not stand in each other. */
const SPACING = 2;
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
  /** Formed before the social web answered, from the seed alone: it gives way to friends and couples once it has. */
  plain: boolean;
  /** A group that keeps still, drawn in full: nothing about it changes until it leaves, so its frames are skipped. */
  settled: boolean;
  /** Kept just off the screen, so it is there when the view moves, but not drawn (DESIGN.md 64.2, frames). */
  hidden: boolean;
}

/** How far beyond the screen, in world pixels, a group is still drawn: a jog's loop and a thrown ball stay inside it. */
const OFF_PAD = 70;

/** The kinds where nobody moves and nothing flies: once faded in they are left as drawn (DESIGN.md 64.2, frames). */
const STILL: ReadonlySet<LawnKind> = new Set<LawnKind>(['circle', 'picnic', 'sun', 'nap', 'study', 'guitar', 'couple', 'phone', 'reading', 'music', 'selfie', 'hug']);

interface Spot {
  x: number;
  y: number;
  quad: boolean;
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
  private drawn = 0;

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


  /** Read the map again: the spots on quads and on the campus's grass beside a path. */
  setMap(state: GameState): void {
    const { width, height, cells } = state.map;
    this.state = state;
    const sample = sampleStudents(state);
    if (sample.length !== this.everyone.length || sample[0]?.entryYear !== this.everyone[0]?.entryYear) {
      this.everyone = sample;
      for (const group of this.groups.values()) group.leaving = true;
    }
    const kind = (x: number, y: number): string => (x < 0 || y < 0 || x >= width || y >= height ? 'off' : cells[y * width + x]!.kind);
    const nearPath = (x: number, y: number): boolean => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (kind(x + dx, y + dy) === 'path') return true;
      return false;
    };
    const candidates: Array<Spot & { order: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const here = kind(x, y);
        const quad = here === 'quad';
        if (!quad && (here !== 'empty' || !ownedAt(state.map, x, y) || !nearPath(x, y))) continue;
        // Open all round: a group needs room, so a cell hemmed in by buildings is left alone.
        let open = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (['empty', 'quad', 'path'].includes(kind(x + dx, y + dy))) open += 1;
        if (open < 3) continue;
        candidates.push({ x: x + 0.5, y: y + 0.5, quad, offset: hashInts(state.seed, x, y, 4723) % STAY_TICKS, order: mix(state.seed + y * width, x) });
      }
    }
    // Quads first, then grass, each in a steady order; two cells apart.
    candidates.sort((a, b) => Number(b.quad) - Number(a.quad) || a.order - b.order);
    const kept: Spot[] = [];
    const used = new Set<number>();
    for (const spot of candidates) {
      const cx = Math.floor(spot.x);
      const cy = Math.floor(spot.y);
      let clash = false;
      for (let dy = -SPACING + 1; dy < SPACING && !clash; dy++) for (let dx = -SPACING + 1; dx < SPACING && !clash; dx++) if (used.has((cy + dy) * width + cx + dx)) clash = true;
      if (clash) continue;
      used.add(cy * width + cx);
      kept.push({ x: spot.x, y: spot.y, quad: spot.quad, offset: spot.offset });
    }
    this.spots = kept;
    this.recountAt = 0;
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
        const id = hashInts(h, tries, 1) % (web.classSlot * 4);
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

  private member(group: Group, ref: StudentRef, x: number, y: number, pose: LawnPose, towardX: number, towardY: number, held: string | null = null, heldLift = 0.45): void {
    const state = this.state!;
    const people = this.people!;
    const crowd = Math.max(1, Math.min(people.looks, people.crowd ?? people.looks));
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
      look: studentFigure(state, ref, crowd, people.roles?.athlete),
      x,
      y,
      direction,
      pose,
      phase: mix(Math.floor(x * 100), Math.floor(y * 100)) * Math.PI * 2,
      shownKey: '',
      held: holding,
      heldLift,
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
    let count = 0;
    // Spots in view, each with its group for its own time, the steadiest order first.
    const margin = 120;
    const inView = this.spots.filter((spot) => {
      const at = this.iso.toWorld(spot.x, spot.y);
      return at.x >= view.x - margin && at.x <= view.right + margin && at.y >= view.y - margin && at.y <= view.bottom + margin;
    });
    const ranked = inView
      .map((spot) => {
        const slot = Math.floor((tick + spot.offset) / STAY_TICKS);
        return { spot, slot, order: mix(Math.floor(spot.x) * 991 + Math.floor(spot.y), slot) };
      })
      .sort((a, b) => a.order - b.order);
    for (const { spot, slot } of ranked) {
      if (count >= budget) break;
      if (taken.has(Math.floor(spot.y) * width + Math.floor(spot.x))) continue;
      const key = `${Math.floor(spot.x)},${Math.floor(spot.y)}:${slot}`;
      const have = this.groups.get(key);
      if (have && !have.leaving && !(have.plain && this.web)) {
        keep.add(key);
        count += have.members.length;
        continue;
      }
      // One group to a spot and a time: one there already, leaving or formed from the seed alone, gives way at once.
      if (have) this.release(have);
      const { refs, couple, vibe } = this.company(spot, slot);
      if (refs.length === 0) continue;
      const roll = mix(hashInts(state.seed, slot, 4733), Math.floor(spot.x) * 997 + Math.floor(spot.y));
      const kind = chooseLawnKind({ size: refs.length, couple, vibe, likes: this.likesOf(refs), exams: this.exams, ...this.natureOf(refs) }, this.period, this.weather, roll);
      const [, most] = LAWN_SIZE[kind];
      const members = refs.slice(0, most);
      if (count + members.length > budget && count > 0) continue;
      const group: Group = { key, kind, x: spot.x, y: spot.y, where: spot.quad ? 'the quad' : 'the lawn', members: [], props: [], alpha: 0, leaving: false, seen: true, icon: null, iconOn: -1, iconAt: 0, iconUntil: 0, plain: !this.web, settled: false, hidden: false };
      this.form(group, members);
      this.groups.set(key, group);
      keep.add(key);
      count += members.length;
    }
    for (const group of this.groups.values()) if (!keep.has(group.key)) group.leaving = true;
    this.drawn = count;
  }

  /** Draw a group or stop drawing it, as it comes on or goes off the screen. Back on, it is drawn afresh. */
  private shown(group: Group, on: boolean): void {
    group.hidden = !on;
    group.settled = false;
    for (const member of group.members) {
      member.sprite.setVisible(on);
      member.held?.setVisible(on);
    }
    for (const prop of group.props) prop.sprite.setVisible(on);
    if (!on) group.icon?.setVisible(false);
  }

  private release(group: Group): void {
    for (const member of group.members) {
      if (member.student) this.staying.delete(studentKey(member.student));
      member.sprite.destroy();
      member.held?.destroy();
    }
    for (const prop of group.props) prop.sprite.destroy();
    group.icon?.destroy();
    if (this.groups.get(group.key) === group) this.groups.delete(group.key);
  }

  // ----------------------------------------------------------- drawing --

  update(timeMs: number, deltaMs: number): void {
    const people = this.people;
    if (!people) return;
    if (timeMs >= this.recountAt) {
      this.recountAt = timeMs + RECOUNT_MS;
      this.recount(this.scene.cameras.main.worldView);
    }
    const dt = Math.min(deltaMs, 100);
    const seconds = timeMs / 1000;
    const view = this.scene.cameras.main.worldView;
    for (const group of [...this.groups.values()]) {
      group.alpha = group.leaving ? group.alpha - dt / FADE_MS : Math.min(1, group.alpha + dt / FADE_MS);
      if (group.leaving && group.alpha <= 0) {
        this.release(group);
        continue;
      }
      const alpha = Math.max(0, group.alpha);
      const spot = this.iso.toWorld(group.x, group.y);
      if (spot.x < view.x - OFF_PAD || spot.x > view.right + OFF_PAD || spot.y < view.y - OFF_PAD || spot.y > view.bottom + OFF_PAD) {
        if (!group.hidden) this.shown(group, false);
        continue;
      }
      if (group.hidden) this.shown(group, true);
      if (group.settled && !group.leaving) {
        this.icons(group, timeMs, alpha);
        continue;
      }
      // Drawn once more at full strength, then left as it is.
      if (!group.leaving && group.alpha >= 1 && STILL.has(group.kind)) group.settled = true;
      const n = group.members.length;
      // Movers go round a loop about the spot: a jog, a chase, a dog walk.
      const loop = group.kind === 'jog' ? 0.85 : group.kind === 'goof' ? 0.42 : 0.6;
      const pace = group.kind === 'jog' ? 0.55 : group.kind === 'goof' ? 0.9 : 0.25;
      const angleOf = (i: number): number => seconds * pace + mix(Math.floor(group.x), Math.floor(group.y)) * 6 - i * 0.9;
      // A thrown thing: from one to the next, the next pass after a short wait.
      const passS = group.kind === 'frisbee' ? 1.6 : group.kind === 'catch' ? 1.2 : 1.4;
      const t = seconds / passS + mix(Math.floor(group.x * 7), Math.floor(group.y * 7)) * 10;
      const pass = Math.floor(t);
      const part = t - pass;
      const from = n > 1 ? pass % n : 0;
      const to = n > 1 ? (pass + 1) % n : 0;
      group.members.forEach((member, i) => {
        let x = member.x;
        let y = member.y;
        let moving = false;
        if (member.pose === 'move') {
          const a = angleOf(i);
          x = group.x + Math.cos(a) * loop;
          y = group.y + Math.sin(a) * loop;
          const ahead = angleOf(i) + 0.05;
          const nx = group.x + Math.cos(ahead) * loop;
          const ny = group.y + Math.sin(ahead) * loop;
          const v0 = this.iso.view(x, y);
          const v1 = this.iso.view(nx, ny);
          member.direction = facingOf(v1.x - v0.x, v1.y - v0.y);
          moving = true;
        } else if ((group.kind === 'frisbee' || group.kind === 'catch' || group.kind === 'kick') && (i === from || i === to) && part < 0.25) {
          moving = true;
        } else if (group.kind === 'dance') {
          // Stepping on the spot to the beat, each a little off the others.
          moving = true;
        }
        const bob = group.kind === 'dance' && !this.reduced ? Math.abs(Math.sin(seconds * 5.2 + i * 1.3)) * 2.5 : 0;
        const flipFrom = people.flip?.[member.direction];
        const facing = flipFrom ?? member.direction;
        let key: string;
        let flip = flipFrom !== undefined;
        if (member.pose === 'sit') {
          // Facing the viewer (south-west or south-east) or away (north-west or north-east), mirrored for the east.
          const away = member.direction === 'nw' || member.direction === 'ne';
          key = `person.${member.look}.pose.${away ? 'sit-nw' : 'sit-sw'}`;
          flip = member.direction === 'se' || member.direction === 'ne';
        } else if (member.pose === 'lie' || member.pose === 'nap') {
          key = `person.${member.look}.pose.${member.pose}`;
          flip = mix(Math.floor(member.x * 10), 3) < 0.5;
        } else {
          const stride = moving ? Math.floor((timeMs * (group.kind === 'jog' ? 1.6 : group.kind === 'goof' ? 1.8 : 1) + member.phase * 300) / people.frameMs) % people.frames : 0;
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
        const depth = (this.iso.sum(x, y) - 1) * 4 + 2.5;
        member.sprite.setPosition(at.x, at.y - bob).setDepth(depth).setAlpha(alpha);
        if (member.held) {
          // Held in front of them: at the lap for a book, up by the face for a phone, a guitar across them.
          const side = flip ? 1 : -1;
          member.held.setPosition(at.x + side * member.sprite.displayWidth * 0.18, at.y - member.sprite.displayHeight * member.heldLift + member.sprite.displayHeight * 0.1).setDepth(depth + 0.02).setAlpha(alpha);
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
        prop.sprite.setPosition(at.x, at.y - lift).setDepth(depth).setAlpha(alpha);
        if (prop.moves === 'disc') prop.sprite.setRotation(Math.sin(seconds * 9) * 0.15);
      }
      this.icons(group, timeMs, alpha);
    }
  }

  /** Now and then an emote over one of them: a laugh in a circle, music over a guitar, a heart between a couple. */
  private icons(group: Group, timeMs: number, alpha: number): void {
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

  /** Where a student is and what they are doing, when they are on the lawns. */
  find(key: string): Stander | null {
    for (const group of this.groups.values()) {
      if (group.leaving) continue;
      for (const member of group.members) if (member.student && studentKey(member.student) === key) return this.stander(group, member, 0);
    }
    return null;
  }

  /** The first in a group of a kind, for a dev picture. */
  firstOf(kind: LawnKind): Stander | null {
    for (const group of this.groups.values()) if (!group.leaving && group.kind === kind && group.members[0] && group.alpha >= 0.5) return this.stander(group, group.members[0], 0);
    return null;
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
