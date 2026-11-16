import Phaser from 'phaser';
import { findStudent, type Stander } from '../app/activityPeople';
import { clock } from '../app/clock';
import { effectsSetting } from '../app/life';
import { CHANT_MS, CHASE_CELLS, dustupBeat, FLEE, FLEE_BEFORE_MS, LEFT_ALONE_MS, rallySize, RALLY_WATCH_MS, shoutTurn, showsFor, showWords, signKey, SHOWS_AT_ONCE, type ShowKind, type ShowRole } from '../app/mayhemShow';
import type { ProtestTopic } from '../sim/config/chaos';
import { coverFor, everydayLook, sampleStudents, studentFigure, studentKey, TICK_MS, type GameState, type Incident, type StudentRef } from '../sim';
import { doorAlpha, pointOn, tripOf, type Trip } from './afoot';
import type { Art, PeopleSpec } from './art';
import type { Footprints } from './footprints';
import { facingOf, type Iso } from './iso';
import type { Walkers } from './Walkers';

/**
 * The chaos sandbox, stop C2 (DESIGN.md 76): the crowd shows it. Each chaos incident the simulation starts (68.1) is
 * staged where it happens while the player is looking: a dust-up outside a dorm (an argument, then the cloud with its
 * stars, a ring of watchers running over), a shouting match, a prankster or a painter at a dorm's wall who bolts as Campus
 * Safety runs up and is chased off, a rally with signs on the lawn by a lecture hall. After a dust-up a medic from a
 * Medical building in reach patches a bruise. A few at once at most, the nearest the middle of the view.
 *
 * For show only: nothing here is saved and nothing changes a number. When an incident starts, who answers it and when it
 * ends are the simulation's; the map draws them. Nobody appears or disappears in view (69.2): everyone in a scene comes
 * out of a door or walks in from the screen's edge, and leaves the same way. Each is an enrolled student, found from the
 * seed as the small scenes find theirs, so a tap opens the ordinary card.
 */

/** Cells walked a second (the small scenes' pace), the gap between two setting out, and how far a doorway fades them. */
const WALK = 0.85;
const STAGGER_MS = 360;
const DOOR_FADE = 0.35;
/** How often the staged incidents are brought in line with what is on the map and in view. */
const RECOUNT_MS = 500;
/** Icons over a head, as the walkers draw theirs. */
const ICON_MS = 1700;
const ICON_LIFT = 40;
const ICON_SCALE = 0.5;
const BIG_LIFT = 42;
const BIG_SCALE = 0.47;
/** The cloud of a dust-up, as the crowd's own (Moments). */
const CLOUD_SCALE = 0.75;
const CLOUD_LIFT = 18;
/** A sign is held up with the bottom of its stick this high over the feet, so the board is over the head. */
const SIGN_HOLD = 26;
const SIGN_SCALE = 0.5;
/** Two in a dust-up or a shouting match stand this far either side of the middle, and step this much further apart. */
const FACE_OFF = 0.24;
/** And this far out from the path's middle, away from the wall, so the cloud is clear of the building. */
const FRONT_OUT = 0.3;
const STEP_APART = 0.2;
/** A medic comes from no further than this, in cells of their way, hurrying (about twelve seconds at most); further, the bruise waits for the clinic. */
const MEDIC_MOST = 18;
const MEDIC_PACE = 1.5;
const PATCH_MS = 3600;
/** How long after the incident is over the two part, once Campus Safety is there. */
const PART_MS = 900;

type Phase = 'coming' | 'on' | 'over';

interface Person {
  sprite: Phaser.GameObjects.Image;
  role: ShowRole | 'medic';
  student: StudentRef | null;
  look: number;
  /** Where they stand in the scene, and the way they face there, on the map. */
  place: { x: number; y: number };
  face: { x: number; y: number };
  /** On foot: to their place, or away (gone at the end of an `out` trip). Cells a second. */
  trip: Trip | null;
  pace: number;
  gone: boolean;
  /** Where they were last drawn. */
  at: { x: number; y: number };
  hidden: boolean;
  marches: boolean;
  phase: number;
  shownKey: string;
  sign: Phaser.GameObjects.Image | null;
}

interface Show {
  id: number;
  kind: ShowKind;
  topic: ProtestTopic | null;
  /** The door they came out of, the path in front, and the middle of the scene. */
  door: { x: number; y: number };
  front: { x: number; y: number };
  mid: { x: number; y: number };
  people: Person[];
  medic: Person | null;
  phase: Phase;
  /** Scene time when everyone was in their place, and when the incident was over. */
  readyAt: number;
  overAt: number;
  /** Real time Campus Safety arrives, or null when nobody is coming. */
  arrives: number | null;
  /** The way the prankster bolts, once they have. */
  flee: Array<{ x: number; y: number }> | null;
  cloud: Phaser.GameObjects.Image | null;
  /** What has been shown, so each beat shows once. */
  beat: number;
  nextAt: number;
  watchAt: number;
  parted: boolean;
  /** The medic's way in, walked back the other way, and until when they patch the bruise (0 before they arrive). */
  medicWay: Array<{ x: number; y: number }> | null;
  patchUntil: number;
}

interface Icon {
  image: Phaser.GameObjects.Image | null;
  key: string;
  over: Phaser.GameObjects.Image;
  big: boolean;
  startAt: number;
  endAt: number;
}

/** A steady number from two whole numbers, so who is where does not flicker. */
function mix(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How many of the seed's students are tried for someone in a scene, for one whose figure nobody else there has. */
const CAST_TRIES = 12;

const KIND_SALT: Record<ShowKind, number> = { dustUp: 1, shouting: 2, prank: 3, graffiti: 4, protest: 5 };

export class Mayhem {
  private state: GameState | null = null;
  private people: PeopleSpec | null = null;
  private everyone: StudentRef[] = [];
  private shows = new Map<number, Show>();
  /** Incidents with no door to stage at: not tried again. */
  private doorless = new Set<number>();
  /** The way a prankster bolted, kept a few seconds after their scene has gone, for Campus Safety's chase. */
  private fled = new Map<number, { way: Array<{ x: number; y: number }>; until: number }>();
  private icons: Icon[] = [];
  private feet: Footprints | null = null;
  private step = 2;
  private recountAt = 0;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
    private walkers: Walkers,
    private staying: Set<string>,
    private walking: (key: string) => boolean,
  ) {}

  setFootprints(feet: Footprints): void {
    this.feet = feet;
  }

  setStep(step: number): void {
    this.step = step;
  }

  setMap(state: GameState): void {
    this.state = state;
    this.people = this.art.people ?? null;
    const sample = sampleStudents(state);
    if (sample.length !== this.everyone.length || sample[0]?.entryYear !== this.everyone[0]?.entryYear) this.everyone = sample;
  }

  /** The staged incidents, for the dev page and pictures. */
  get staged(): Array<{ id: number; kind: ShowKind; phase: Phase; people: number }> {
    return [...this.shows.values()].map((show) => ({ id: show.id, kind: show.kind, phase: show.phase, people: show.people.filter((one) => !one.gone).length }));
  }

  /**
   * Campus Safety, arrived at a prank or graffiti, chases the one who bolted (DESIGN.md 76.3): the way they ran, as far
   * as the chase goes. null when nobody bolted where the player could see.
   */
  chaseFor(id: number): Array<{ x: number; y: number }> | null {
    const kept = this.fled.get(id);
    const flee = this.shows.get(id)?.flee ?? (kept && kept.until > this.scene.time.now ? kept.way : null);
    if (!flee || flee.length < 2) return null;
    const out = [flee[0]!];
    let length = 0;
    for (let k = 1; k < flee.length && length < CHASE_CELLS; k++) {
      const a = out[out.length - 1]!;
      const b = flee[k]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (length + d > CHASE_CELLS) {
        const f = (CHASE_CELLS - length) / d;
        out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        break;
      }
      out.push({ ...b });
      length += d;
    }
    return out;
  }

  /** An icon over someone drawn elsewhere (Campus Safety at the end of a chase), from `inMs` from now. */
  iconOver(sprite: Phaser.GameObjects.Image, emote: string, inMs = 0): void {
    this.icon(sprite, emote, inMs);
  }

  update(state: GameState, timeMs: number, deltaMs: number): void {
    this.state = state;
    this.people = this.art.people ?? null;
    const people = this.people;
    if (timeMs >= this.recountAt) {
      this.recountAt = timeMs + RECOUNT_MS;
      this.recount(state, timeMs);
    }
    if (people) {
      for (const show of [...this.shows.values()]) this.play(show, people, timeMs, deltaMs);
    }
    this.drawIcons(timeMs);
  }

  // ----------------------------------------------------------- staging --

  private boxOf(state: GameState, incident: Incident): { x: number; y: number; w: number; h: number } {
    const cell = state.map.cells[incident.y * state.map.width + incident.x];
    const building = cell?.buildingId !== null && cell?.buildingId !== undefined ? state.map.buildings[cell.buildingId] : null;
    if (building) return { x: building.x, y: building.y, w: building.w, h: building.h };
    const placed = cell?.placedId !== null && cell?.placedId !== undefined ? state.map.placed[cell.placedId] : null;
    if (placed) return { x: placed.x, y: placed.y, w: placed.w, h: placed.h };
    return { x: incident.x, y: incident.y, w: 1, h: 1 };
  }

  /** Bring what is staged in line with the incidents on the map and in view. */
  private recount(state: GameState, timeMs: number): void {
    const active = new Map<number, Incident>();
    for (const incident of state.incidents.active) if (incident.chaos) active.set(incident.id, incident);
    // Over in the simulation: the scene plays out its end. Out of sight: it goes at once.
    for (const show of [...this.shows.values()]) {
      if (!this.walkers.seen(show.front) && !this.walkers.seen(show.mid)) {
        this.drop(show);
        continue;
      }
      if (show.phase !== 'over' && !active.has(show.id)) this.finish(show, timeMs);
    }
    // A scene whose people have gone (nobody came, they parted) holds no place, and is not staged again while it lingers.
    const live = [...this.shows.values()].filter((show) => !show.parted).length;
    if (!this.people || live >= SHOWS_AT_ONCE) return;
    const camera = this.scene.cameras.main;
    const view = camera.worldView;
    const cx = view.centerX;
    const cy = view.centerY;
    const far = (incident: Incident): number | null => {
      if (this.shows.has(incident.id) || this.doorless.has(incident.id)) return null;
      const box = this.boxOf(state, incident);
      const at = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      if (!this.walkers.seen(at)) return null;
      const world = this.iso.toWorld(at.x, at.y);
      return Math.hypot(world.x - cx, world.y - cy);
    };
    for (const incident of showsFor([...active.values()], far, SHOWS_AT_ONCE - live)) this.stage(state, incident, timeMs);
  }

  private stage(state: GameState, incident: Incident, timeMs: number): void {
    const kind = incident.chaos as ShowKind;
    const box = this.boxOf(state, incident);
    const front = this.walkers.frontOf(box);
    if (!front) {
      this.doorless.add(incident.id);
      return;
    }
    const { door } = front;
    const out = { x: front.front.x - door.x, y: front.front.y - door.y };
    const len = Math.max(1e-6, Math.hypot(out.x, out.y));
    const ux = out.x / len;
    const uy = out.y / len;
    const show: Show = {
      id: incident.id,
      kind,
      topic: incident.topic ?? null,
      door,
      front: front.front,
      mid: { ...front.front },
      people: [],
      medic: null,
      phase: 'coming',
      readyAt: 0,
      overAt: 0,
      arrives: incident.responder === null ? null : state.clock.nextTickAt + (incident.endTick - state.clock.tick - 1) * TICK_MS,
      flee: null,
      cloud: null,
      beat: -1,
      nextAt: 0,
      watchAt: 0,
      parted: false,
      medicWay: null,
      patchUntil: 0,
    };
    const places: Array<{ place: { x: number; y: number }; face: { x: number; y: number }; role: ShowRole; marches?: boolean }> = [];
    // Out of the door to the path in front, or on to open ground near it the player can see (76.1).
    let wayOut: Array<{ x: number; y: number }> = [{ ...door }];
    if (kind !== 'protest') {
      // Clear of any other scene staged now.
      const taken = (x: number, y: number): boolean => [...this.shows.values()].some((other) => Math.abs(Math.floor(other.mid.x) - x) <= 1 && Math.abs(Math.floor(other.mid.y) - y) <= 1);
      const stand = this.walkers.standBy(door, front.front, taken);
      wayOut = stand.way;
      const moved = wayOut.length > 2;
      // Which way is across: across the path from the door, or across the last step of the way.
      const a0 = wayOut[wayOut.length - 2]!;
      const a1 = wayOut[wayOut.length - 1]!;
      const along = moved ? Math.max(1e-6, Math.hypot(a1.x - a0.x, a1.y - a0.y)) : 1;
      const vx = moved ? (a1.x - a0.x) / along : ux;
      const vy = moved ? (a1.y - a0.y) / along : uy;
      if (kind === 'dustUp' || kind === 'shouting') {
        // Face to face, across the way they came.
        const mid = moved ? { ...stand.at } : { x: front.front.x + ux * FRONT_OUT, y: front.front.y + uy * FRONT_OUT };
        show.mid = mid;
        const a = { x: mid.x - vy * FACE_OFF, y: mid.y + vx * FACE_OFF };
        const b = { x: mid.x + vy * FACE_OFF, y: mid.y - vx * FACE_OFF };
        places.push({ place: a, face: { x: b.x - a.x, y: b.y - a.y }, role: kind });
        places.push({ place: b, face: { x: a.x - b.x, y: a.y - b.y }, role: kind });
      } else {
        // At the wall by the door, facing it; or, where buildings in front would hide that, where it can be seen.
        const at = moved ? { ...stand.at } : { x: door.x + ux * 0.32 - uy * 0.22, y: door.y + uy * 0.32 + ux * 0.22 };
        show.mid = at;
        places.push({ place: at, face: moved ? { x: vx, y: vy } : { x: -ux, y: -uy }, role: kind });
      }
      wayOut = wayOut.slice(0, -1);
    } else {
      // A rally on the lawn by the lecture hall, facing it.
      const spots = this.walkers.groundBy(front.front, rallySize(this.step));
      if (spots.length === 0) {
        this.doorless.add(incident.id);
        return;
      }
      const hall = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      show.mid = { x: spots.reduce((sum, one) => sum + one.x, 0) / spots.length, y: spots.reduce((sum, one) => sum + one.y, 0) / spots.length };
      spots.forEach((spot, i) => places.push({ place: spot, face: { x: hall.x - spot.x, y: hall.y - spot.y }, role: 'protest', marches: i % 3 === 1 }));
    }
    // Out of a door, or there already where the ground has only just come into sight (69.2).
    const already = !this.walkers.seen(show.mid) || this.walkers.fresh(show.mid.x, show.mid.y);
    const rallyWay = kind === 'protest' && !already ? this.walkers.approach(places[0]!.place.x, places[0]!.place.y) : null;
    if (kind === 'protest' && !already && !rallyWay) return;
    places.forEach((one, i) => {
      const person = this.person(state, show, one.role, one.place, one.face, i, one.marches ?? false);
      if (!already) {
        const from = kind === 'protest' ? rallyWay!.slice(0, -1) : wayOut;
        person.trip = tripOf([...from, { ...one.place }], timeMs + i * STAGGER_MS, false);
        person.at = { ...from[0]! };
      }
      show.people.push(person);
    });
    if (already) {
      show.phase = 'on';
      show.readyAt = timeMs;
    }
    this.shows.set(show.id, show);
  }

  private person(state: GameState, show: Show, role: ShowRole | 'medic', place: { x: number; y: number }, face: { x: number; y: number }, n: number, marches: boolean): Person {
    const people = this.people!;
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    let student: StudentRef | null = null;
    let look = role === 'medic' ? (people.roles?.medic ?? 0) : everydayLook(people, mix(show.id, n), mix(n, show.id));
    if (role !== 'medic') {
      // Each one a different figure from the others in the scene: the pack has a dozen everyday figures, and two
      // students drawn the same in one dust-up read as clones (DESIGN.md 76.1). The seed's next students are tried.
      const taken = new Set(show.people.map((one) => one.look));
      const busy = (key: string): boolean => this.staying.has(key) || this.walking(key);
      const place = show.id * 31 + KIND_SALT[show.kind];
      for (let k = 0; k < CAST_TRIES; k++) {
        const found = findStudent(state.seed, this.everyone, place, n + k * 1009, busy);
        if (!found) break;
        const figure = studentFigure(state, found, people);
        if (!student || !taken.has(figure)) {
          student = found;
          look = figure;
        }
        if (!taken.has(figure)) break;
      }
      if (student) this.staying.add(studentKey(student));
    }
    let sign: Phaser.GameObjects.Image | null = null;
    if (role === 'protest' && show.topic && this.art.has(signKey(show.topic))) {
      sign = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
      this.art.apply(sign, signKey(show.topic));
      sign.setScale(SIGN_SCALE);
    }
    return { sprite, role, student, look, place: { ...place }, face, trip: null, pace: WALK, gone: false, at: { ...place }, hidden: false, marches, phase: mix(show.id * 7 + n, 911), shownKey: '', sign };
  }

  // ------------------------------------------------------------ playing --

  private play(show: Show, people: PeopleSpec, timeMs: number, deltaMs: number): void {
    void deltaMs;
    const reduced = effectsSetting() === 'reduced';
    if (show.phase === 'coming' && show.people.every((one) => !one.trip)) {
      show.phase = 'on';
      show.readyAt = timeMs;
    }
    if (show.phase === 'on') this.act(show, timeMs);
    if (show.phase === 'over') this.ending(show, timeMs);
    for (const person of show.people) this.draw(person, people, timeMs, reduced);
    if (show.medic) this.draw(show.medic, people, timeMs, reduced);
    this.drawCloud(show, timeMs, reduced);
    const everyoneGone = show.people.every((one) => one.gone) && (!show.medic || show.medic.gone);
    if (show.phase === 'over' && everyoneGone) this.drop(show);
  }

  /** What each kind does while it is on. */
  private act(show: Show, timeMs: number): void {
    const ms = timeMs - show.readyAt;
    const [a, b] = show.people;
    const left = show.arrives === null ? LEFT_ALONE_MS[show.kind as keyof typeof LEFT_ALONE_MS] : undefined;
    if (show.kind === 'dustUp' && a && b) {
      const beat = dustupBeat(ms);
      const n = beat.round * 3 + (beat.phase === 'argue' ? 0 : beat.phase === 'cloud' ? 1 : 2);
      a.hidden = b.hidden = beat.phase === 'cloud';
      const apart = beat.phase === 'apart' || beat.phase === 'glare';
      this.stand(a, apart ? STEP_APART : 0, b);
      this.stand(b, apart ? STEP_APART : 0, a);
      if (beat.phase !== 'glare' && n !== show.beat) {
        show.beat = n;
        if (beat.phase === 'argue') {
          this.icon(a.sprite, 'big-argue', 0, true);
          this.icon(b.sprite, 'anger', 400);
        } else if (beat.phase === 'cloud') {
          show.cloud = show.cloud ?? this.cloudImage();
          // The crowd near runs over to see (DESIGN.md 76.5).
          this.walkers.watch(show.mid, 'dustup', 6500, show.people.map((one) => one.look));
        } else {
          this.icon(a.sprite, 'sweat', 100);
          this.icon(b.sprite, 'anger', 300);
        }
      }
      if (beat.phase === 'glare' && timeMs >= show.nextAt) {
        show.nextAt = timeMs + 5200;
        this.icon((Math.floor(ms / 5200) % 2 === 0 ? a : b).sprite, 'anger');
      }
    } else if (show.kind === 'shouting' && a && b) {
      const turn = Math.floor(ms / 1700);
      if (turn !== show.beat) {
        show.beat = turn;
        const who = shoutTurn(ms) === 0 ? a : b;
        this.icon(who.sprite, turn % 3 === 0 ? 'big-argue' : turn % 3 === 1 ? 'anger' : 'speech', 0, turn % 3 === 0);
      }
      if (timeMs >= show.watchAt) {
        show.watchAt = timeMs + 20_000;
        this.walkers.watch(show.mid, 'shouting', 6000, show.people.map((one) => one.look));
      }
    } else if ((show.kind === 'prank' || show.kind === 'graffiti') && a) {
      if (!show.flee && timeMs >= show.nextAt) {
        show.nextAt = timeMs + 2800;
        this.icon(a.sprite, show.kind === 'graffiti' ? 'chat-art' : Math.floor(ms / 2800) % 2 === 0 ? 'laugh' : 'sparkle');
      }
      // Campus Safety is nearly there: they bolt (76.3).
      if (show.arrives !== null && !show.flee && clock.now() >= show.arrives - FLEE_BEFORE_MS) this.bolt(show, a, timeMs);
    } else if (show.kind === 'protest') {
      if (timeMs >= show.nextAt && show.people.length > 0) {
        show.nextAt = timeMs + CHANT_MS;
        const k = Math.floor(ms / CHANT_MS);
        const who = show.people[(k * 7) % show.people.length]!;
        this.icon(who.sprite, k % 3 === 2 ? 'speech' : 'exclaim');
      }
      if (timeMs >= show.watchAt) {
        show.watchAt = timeMs + RALLY_WATCH_MS;
        this.walkers.watch(show.mid, 'rally', 7000, show.people.map((one) => one.look));
      }
    }
    // Nobody coming: after a while they part on their own (or saunter off from their prank).
    if (left !== undefined && ms >= left && !show.parted) this.part(show, timeMs);
  }

  /** Stand at their place, `apart` further from the other, facing them. */
  private stand(one: Person, apart: number, other: Person): void {
    const dx = one.place.x - other.place.x;
    const dy = one.place.y - other.place.y;
    const d = Math.max(1e-6, Math.hypot(dx, dy));
    one.at = { x: one.place.x + (dx / d) * apart, y: one.place.y + (dy / d) * apart };
  }

  /** The prankster bolts: off at a run to the nearest door or the screen's edge, never back into the dorm they pranked. */
  private bolt(show: Show, who: Person, timeMs: number): void {
    const way = this.walkers.approach(who.at.x, who.at.y, show.front)?.reverse() ?? null;
    if (!way) return;
    show.flee = way;
    this.icon(who.sprite, 'exclaim');
    who.trip = tripOf(way, timeMs + 250, true);
    who.pace = FLEE;
    this.walkers.watch(show.mid, 'prank', 5000, show.people.map((one) => one.look));
  }

  /** The incident is over in the simulation: the scene plays out its end. */
  private finish(show: Show, timeMs: number): void {
    show.phase = 'over';
    show.overAt = timeMs;
    for (const person of show.people) person.hidden = false;
    const [a, b] = show.people;
    if (show.kind === 'dustUp' && a && b && show.arrives !== null && !show.parted) {
      // Campus Safety is there: both look sheepish; a medic comes for a bruise if Medical reaches (76.3).
      this.icon(a.sprite, 'sweat');
      this.icon(b.sprite, 'sweat', 300);
      this.callMedic(show, b, timeMs);
    }
    if ((show.kind === 'prank' || show.kind === 'graffiti') && a && !show.flee && !a.trip) this.bolt(show, a, timeMs);
  }

  private callMedic(show: Show, patient: Person, timeMs: number): void {
    const state = this.state;
    if (!state || !this.people) return;
    const cover = coverFor(state.map, 'medical', Math.floor(show.front.x), Math.floor(show.front.y));
    const home = cover?.placed;
    if (!home) return;
    const fromX = home.x + home.w / 2;
    const fromY = home.y + home.h + 0.2;
    const at = patient.at;
    const way = this.walkers.wayBetween(fromX, fromY, { x: Math.floor(at.x), y: Math.floor(at.y), w: 1, h: 1 });
    if (!way) return;
    const trip = tripOf([...way, { x: at.x + 0.3, y: at.y + 0.18 }], timeMs + 600, false);
    if (trip.total > MEDIC_MOST) return;
    const medic = this.person(state, show, 'medic', { x: at.x + 0.3, y: at.y + 0.18 }, { x: -0.3, y: -0.18 }, 99, false);
    medic.trip = trip;
    medic.pace = MEDIC_PACE;
    medic.at = { ...way[0]! };
    show.medic = medic;
    show.medicWay = trip.pts.map((one) => ({ ...one }));
    patient.role = 'patched';
  }

  /** Over: the bruise patched, everyone off on foot (69.2). */
  private ending(show: Show, timeMs: number): void {
    const medic = show.medic;
    if (medic && !medic.gone && !show.parted) {
      const patient = show.people.find((one) => one.role === 'patched');
      if (!medic.trip && show.patchUntil === 0) {
        // Arrived: the plaster on, facing the one with the bruise; then both go.
        show.patchUntil = timeMs + PATCH_MS;
        if (patient) {
          medic.face = { x: patient.at.x - medic.at.x, y: patient.at.y - medic.at.y };
          patient.face = { x: -medic.face.x, y: -medic.face.y };
          this.icon(patient.sprite, 'bandage', 200);
        }
      }
      if (show.patchUntil > 0 && timeMs >= show.patchUntil) {
        // Back the way they came, and in at their own door.
        medic.trip = tripOf([...(show.medicWay ?? [medic.at])].reverse(), timeMs, true);
        medic.pace = WALK;
        this.part(show, timeMs);
        return;
      }
      // Those not waiting for the medic go now.
      for (const person of show.people) if (person !== patient && !person.trip && !person.gone && timeMs >= show.overAt + PART_MS) this.leave(person, timeMs);
      return;
    }
    if (!show.parted && timeMs >= show.overAt + PART_MS) this.part(show, timeMs);
  }

  /** Everyone still standing walks off to the nearest door or the screen's edge, one after another. */
  private part(show: Show, timeMs: number): void {
    show.parted = true;
    show.people.forEach((person, i) => {
      if (!person.trip && !person.gone) this.leave(person, timeMs + i * (STAGGER_MS / 2));
    });
  }

  private leave(person: Person, atMs: number): void {
    person.hidden = false;
    const way = this.walkers.approach(person.at.x, person.at.y)?.reverse() ?? [person.at, person.at];
    person.trip = tripOf(way, atMs, true);
    person.pace = WALK;
  }

  // ------------------------------------------------------------ drawing --

  private draw(person: Person, people: PeopleSpec, timeMs: number, reduced: boolean): void {
    if (person.gone) return;
    let shown = 1;
    let moving = false;
    let face = person.face;
    const trip = person.trip;
    if (trip) {
      const d = ((timeMs - trip.startMs) / 1000) * person.pace;
      if (d >= trip.total) {
        person.trip = null;
        person.at = { ...trip.pts[trip.pts.length - 1]! };
        if (trip.out) {
          person.gone = true;
          this.release(person);
          person.sprite.setAlpha(0);
          person.sign?.setAlpha(0);
          return;
        }
      } else {
        const on = pointOn(trip, d);
        person.at = { x: on.x, y: on.y };
        if (d > 0) {
          moving = true;
          face = { x: on.bx - on.ax, y: on.by - on.ay };
        }
        shown = doorAlpha(trip, d, DOOR_FADE);
      }
    }
    const way = this.iso.dir(face.x, face.y);
    const direction = facingOf(way.x, way.y);
    const flip = people.flip?.[direction];
    // Running is the walk at a quicker step; a rally marks time on the spot.
    const rate = person.pace > WALK ? person.pace / WALK : 1;
    const busy = moving || (person.marches && !reduced);
    const frame = busy ? Math.floor((timeMs * rate + person.phase * 900) / people.frameMs) % people.frames : 0;
    const key = `person.${person.look}.${flip ?? direction}.${frame}`;
    if (key !== person.shownKey) {
      this.art.apply(person.sprite, key);
      person.shownKey = key;
    }
    person.sprite.setFlipX(flip !== undefined);
    const at = this.iso.toWorld(person.at.x, person.at.y);
    const own = (this.iso.sum(person.at.x, person.at.y) - 1) * 4 + 2.5;
    const depth = this.feet ? this.feet.depth(person.at.x, person.at.y, own) : own;
    person.sprite.setPosition(at.x, at.y).setDepth(depth).setAlpha(person.hidden ? 0 : shown).setVisible(true);
    if (person.sign) {
      const bob = reduced ? 0 : Math.sin(timeMs / 380 + person.phase * 6.28) * 1.6;
      person.sign
        .setPosition(at.x + (direction === 'se' || direction === 'ne' ? 3 : -3), at.y - SIGN_HOLD + bob)
        .setDepth(depth + 0.01)
        .setAlpha(person.hidden ? 0 : shown);
    }
  }

  private cloudImage(): Phaser.GameObjects.Image | null {
    if (!this.art.has('emote.dustup')) return null;
    const image = this.scene.add.image(0, 0, '__DEFAULT');
    this.art.apply(image, 'emote.dustup');
    return image.setOrigin(0.5, 0.5).setScale(CLOUD_SCALE).setVisible(false);
  }

  /** The cloud churns over the two of them while they are in it, as the crowd's own does (Moments). */
  private drawCloud(show: Show, timeMs: number, reduced: boolean): void {
    const cloud = show.cloud;
    if (!cloud) return;
    const inIt = show.phase === 'on' && show.people.some((one) => one.hidden);
    if (!inIt) {
      cloud.setVisible(false);
      return;
    }
    const t = timeMs / 1000;
    const at = this.iso.toWorld(show.mid.x, show.mid.y);
    const wobble = reduced ? 0 : 1;
    const own = (this.iso.sum(show.mid.x, show.mid.y) - 1) * 4 + 2.8;
    cloud
      .setVisible(true)
      .setPosition(at.x + Math.sin(t * 23) * 1.5 * wobble, at.y - CLOUD_LIFT + Math.cos(t * 19) * 1.2 * wobble)
      .setScale(CLOUD_SCALE * (1 + Math.sin(t * 17) * 0.05 * wobble))
      .setRotation(Math.sin(t * 11) * 0.06 * wobble)
      // Sorted against the buildings beside it as the two in it are, so a corner does not cut it.
      .setDepth(this.feet ? this.feet.depth(show.mid.x, show.mid.y, own) : own)
      .setAlpha(1);
  }

  private icon(over: Phaser.GameObjects.Image, emote: string, inMs = 0, big = false): void {
    const key = `emote.${emote}`;
    if (!this.art.has(key) || effectsSetting() === 'reduced') return;
    const now = this.scene.time.now;
    this.icons.push({ image: null, key, over, big, startAt: now + inMs, endAt: now + inMs + (big ? 2600 : ICON_MS) });
  }

  private drawIcons(timeMs: number): void {
    if (this.icons.length === 0) return;
    const keep: Icon[] = [];
    for (const one of this.icons) {
      if (timeMs >= one.endAt || !one.over.active) {
        one.image?.destroy();
        continue;
      }
      keep.push(one);
      if (timeMs < one.startAt) continue;
      if (!one.image) {
        one.image = this.scene.add.image(0, 0, '__DEFAULT');
        this.art.apply(one.image, one.key);
        one.image.setOrigin(0.5, 0.5);
      }
      const age = timeMs - one.startAt;
      const left = one.endAt - timeMs;
      const pop = age < 160 ? 0.6 + (0.5 * age) / 160 : age < 260 ? 1.1 - (0.1 * (age - 160)) / 100 : 1;
      one.image
        .setScale((one.big ? BIG_SCALE : ICON_SCALE) * pop)
        .setPosition(one.over.x, one.over.y - (one.big ? BIG_LIFT : ICON_LIFT) - Math.min(6, age / 120))
        .setDepth(one.over.depth + 0.05)
        .setAlpha(Math.min(1, left / 250) * (one.over.alpha > 0 ? 1 : 0));
    }
    this.icons = keep;
  }

  // ------------------------------------------------------------- cards --

  /** Someone in a staged incident at a point of the world, or null: a tap on them opens their card. */
  actorAt(worldX: number, worldY: number, reach: number): Stander | null {
    let found: Stander | null = null;
    for (const show of this.shows.values()) {
      for (const person of show.people) {
        if (person.gone || person.hidden || !person.student || person.sprite.alpha < 0.5) continue;
        const box = person.sprite.getBounds();
        if (worldX < box.x - reach || worldX > box.right + reach || worldY < box.y - reach || worldY > box.bottom + reach) continue;
        const far = Math.hypot(worldX - box.centerX, worldY - box.centerY);
        if (found && far >= found.far) continue;
        const role = person.role === 'medic' ? 'patched' : person.role;
        found = { student: person.student, look: person.look, words: showWords(role, show.topic), x: person.sprite.x, y: person.sprite.y, far, depth: person.sprite.depth };
      }
    }
    return found;
  }

  /** Someone in a staged incident by their key, for their card (what they are doing, and where to ring them), or null. */
  find(key: string): Stander | null {
    for (const show of this.shows.values()) {
      for (const person of show.people) {
        if (person.gone || !person.student || studentKey(person.student) !== key) continue;
        const role = person.role === 'medic' ? 'patched' : person.role;
        return { student: person.student, look: person.look, words: showWords(role, show.topic), x: person.sprite.x, y: person.sprite.y, far: 0, depth: person.sprite.depth };
      }
    }
    return null;
  }

  // ------------------------------------------------------------ clearing --

  private release(person: Person): void {
    if (person.student) this.staying.delete(studentKey(person.student));
    person.student = null;
  }

  private drop(show: Show): void {
    for (const person of [...show.people, ...(show.medic ? [show.medic] : [])]) {
      this.release(person);
      person.sprite.destroy();
      person.sign?.destroy();
    }
    show.cloud?.destroy();
    this.shows.delete(show.id);
    const now = this.scene.time.now;
    for (const [id, kept] of this.fled) if (kept.until <= now) this.fled.delete(id);
    if (show.flee) this.fled.set(show.id, { way: show.flee, until: now + 5000 });
  }

  clear(): void {
    for (const show of [...this.shows.values()]) this.drop(show);
    for (const one of this.icons) one.image?.destroy();
    this.icons = [];
    this.doorless.clear();
    this.fled.clear();
  }
}
