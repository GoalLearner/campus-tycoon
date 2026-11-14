import { roommateInWeb } from './socialWeb';
import { roomsShared } from '../sim/systems/web';
import { genderOf } from '../sim/systems/identity';
import {
  dayRead,
  dormName,
  hashInts,
  placeIndex,
  sampleStudents,
  studentCard,
  studentHome,
  studentKey,
  type GameState,
  type StudentCard,
  type StudentRef,
} from '../sim';
import { periodAt } from './daylight';

/**
 * A peek inside a student's room (DESIGN.md sections 46 and 60). For show
 * only, like the walkers: a room is worked out when it is opened, from the
 * student's seeded identity, the live campus numbers and the hour on the
 * player's clock. Nothing here is saved, and nothing in src/sim reads it.
 *
 * The room is a small grid of its own, three cells along its right-hand wall
 * and two along its left, seen from the front with those two back walls
 * standing. Every piece is a sprite from the art manifest, put down by its
 * anchor as the map puts down a decoration.
 *
 * The people in it are not posed: each has a round of places to go and things
 * to do there, worked out from the card and the hour, and walks between them.
 * Asleep, they are in their bed. Which round, and where in it, is the same for
 * the same student in the same hour.
 */

/** What a student is doing in their room. */
export type RoomActivity = 'study' | 'finals' | 'asleep' | 'ready' | 'music' | 'call' | 'game' | 'relax' | 'workout';

/** How a figure moves where it stands. Small: a breath, a nod, a word, a squat. */
export type RoomMotion = 'breathe' | 'nod' | 'talk' | 'still' | 'reps';

/** The way a figure faces, as the walkers' sprites are named. */
export type Facing = 'sw' | 'se' | 'nw' | 'ne';

/** How a figure is drawn where it stops: standing, on a chair at the desk, on the sofa, or on the rug. */
export type Pose = 'stand' | 'sit' | 'sofa' | 'floor';

/** The room's size in its own cells: along x, the right-hand wall, and along y, the left-hand one. */
export const ROOM_SIZE = { x: 3, y: 2 } as const;

/**
 * The two back walls, as the steps along each where a panel of the stable's back corner is put down. The pack drew
 * that corner a little off its cell, so its left face is 0.64 of a cell long and its right face 0.89: three of each
 * close a room three cells by two, with a little floor showing past the end of the long wall.
 */
export const ROOM_WALLS = { left: [0, 164 / 256, 328 / 256], right: [0, 228 / 256, 456 / 256] } as const;

/** A bed, as the room sees it: its length along one way, its width along the other. */
export const BED = { length: 1.05, width: 0.5 } as const;

export interface RoomPiece {
  /** Sprite name in the art manifest. */
  key: string;
  /** Where it stands, in the room's cells: 0 is the back corner. */
  x: number;
  y: number;
  flip?: boolean;
  /** Turns its page now and then while someone sits at the desk: the open book. */
  pages?: boolean;
  /** Notes drift up from it: a speaker or an instrument being played. */
  notes?: boolean;
  /** Raised this many atlas pixels: the drapes on the wall, or something on the desk. */
  lift?: number;
  /** Lies flat on the floor, under anyone who walks over it: the rug. */
  flat?: boolean;
  /** Drawn just in front of whoever sits at `x`, `y`: the chair at the desk. */
  chair?: boolean;
}

export interface RoomBed {
  /** Its back corner, at the head, in the room's cells. */
  x: number;
  y: number;
  /** The way it lies from its head: along x (its head against the left wall) or along y (against the right). */
  along: 'x' | 'y';
  /** The blanket's sprite: the student's and the roommate's differ. */
  blanket: string;
  roommate: boolean;
}

/** A place in a figure's round, and what they do there. */
export interface Stop {
  x: number;
  y: number;
  facing: Facing;
  pose: Pose;
  motion: RoomMotion;
  /** How long they stay, in seconds. */
  seconds: number;
}

export interface RoomFigure {
  /** Their figure among the pack's people, as the card's portrait has it. */
  look: number;
  roommate: boolean;
  /** Asleep in this bed, an index into the room's beds; otherwise null. */
  bed: number | null;
  /** Round and round these places, walking between them by way of `via`. */
  stops: Stop[];
  via: [number, number];
  /** How far into the round they are when the room opens, in seconds, so two people do not move as one. */
  offset: number;
}

export interface Room {
  /** One of the room plans, chosen from the seed, so rooms do not all look alike. */
  layout: number;
  activity: RoomActivity;
  /** One line under the room, in the card's voice. */
  line: string;
  /** The lights: on, the desk lamp only at night, or out for the night with the moon in the window. */
  lights: 'on' | 'lamp' | 'off';
  pieces: RoomPiece[];
  beds: RoomBed[];
  figures: RoomFigure[];
  /** The roommate, when the hall's rooms are shared. */
  roommate: { ref: StudentRef; name: string } | null;
  /** The hall, the chapter house or the street: where the room is. */
  where: string;
}

/** A spot in the room, with the way someone there faces, and whether its piece is drawn mirrored. */
interface Spot {
  x: number;
  y: number;
  facing: Facing;
  flip: boolean;
}

const spot = (x: number, y: number, facing: Facing = 'sw', flip = false): Spot => ({ x, y, facing, flip });

/** A room plan: where everything stands, and the places people go. */
interface Plan {
  /** The student's bed, then the roommate's. In a room of one the sofa stands where the second would. */
  beds: [Omit<RoomBed, 'blanket' | 'roommate'>, Omit<RoomBed, 'blanket' | 'roommate'>];
  /** The desk, the chair at it (where someone sits, facing the desk), and the lamp beside it. */
  desk: Spot;
  seat: Spot;
  lamp: [number, number];
  /** The shelves, and where someone stands at them. */
  shelf: Spot;
  atShelf: Spot;
  /** The window side: the drapes on the wall, and where someone stands to look out. */
  drapes: [number, number];
  atWindow: Spot;
  /** A stool by the beds, as a night table, and the club's banner. */
  stool: [number, number];
  banner: [number, number];
  /** The rug, in the open, and two places on it facing each other. */
  rug: [number, number];
  onRug: [Spot, Spot];
  /** The sofa of a room of one, in the second bed's place, and where someone sits on it. */
  sofa: Spot;
  onSofa: Spot;
  /** Open floor: where someone plays, works out or takes a call, pacing between the two. */
  floor: Spot;
  pace: [Spot, Spot];
  /** The middle of the open floor: every walk goes by way of it. */
  via: [number, number];
  /** The roommate's own places, by their bed, and the middle they walk by. */
  mate: { side: Spot; floor: Spot; via: [number, number] };
  /** Where a few things of theirs go on the floor, and on the desk. */
  spots: Array<[number, number]>;
  onDesk: Array<[number, number]>;
}

export const ROOM_PLANS: readonly Plan[] = [
  // The two beds along the long wall's way, heads to the left wall, one at the back and one at the front, a stool
  // between them; the desk and the shelves along the right wall past the window.
  {
    beds: [
      { x: 0.05, y: 0.05, along: 'x' },
      { x: 0.05, y: 1.43, along: 'x' },
    ],
    desk: spot(2.0, 0.27, 'sw', true),
    seat: spot(2.0, 0.66, 'ne'),
    lamp: [2.42, 0.18],
    shelf: spot(2.8, 0.28),
    atShelf: spot(2.74, 0.74, 'ne'),
    drapes: [1.35, 0.08],
    atWindow: spot(1.38, 0.6, 'ne'),
    stool: [0.2, 0.98],
    banner: [0.12, 1.22],
    rug: [2.15, 1.38],
    onRug: [spot(1.84, 1.38, 'se'), spot(2.46, 1.38, 'nw')],
    sofa: spot(0.3, 1.66, 'se', true),
    onSofa: spot(0.36, 1.66, 'se'),
    floor: spot(1.72, 1.26, 'sw'),
    pace: [spot(1.42, 1.2, 'se'), spot(2.5, 1.02, 'nw')],
    via: [1.65, 1.02],
    mate: { side: spot(0.62, 1.12, 'sw'), floor: spot(1.3, 1.62, 'sw'), via: [0.95, 1.25] },
    spots: [[2.92, 1.38], [2.35, 1.9], [1.55, 1.9]],
    onDesk: [[1.9, 0.24], [2.12, 0.3]],
  },
  // The two beds side by side, heads to the right wall; the desk further along it, the shelves on the left wall.
  {
    beds: [
      { x: 0.05, y: 0.05, along: 'y' },
      { x: 0.8, y: 0.05, along: 'y' },
    ],
    desk: spot(2.12, 0.27, 'sw', true),
    seat: spot(2.12, 0.66, 'ne'),
    lamp: [2.58, 0.18],
    shelf: spot(0.28, 1.62, 'sw', true),
    atShelf: spot(0.72, 1.6, 'nw'),
    drapes: [1.6, 0.08],
    atWindow: spot(1.62, 0.58, 'ne'),
    stool: [0.67, 0.14],
    banner: [2.88, 0.12],
    rug: [2.15, 1.4],
    onRug: [spot(1.84, 1.4, 'se'), spot(2.46, 1.4, 'nw')],
    sofa: spot(1.05, 0.26),
    onSofa: spot(1.05, 0.34, 'sw'),
    floor: spot(1.6, 1.3, 'sw'),
    pace: [spot(1.38, 1.32, 'se'), spot(2.55, 1.0, 'nw')],
    via: [1.6, 1.1],
    mate: { side: spot(1.05, 1.32, 'sw'), floor: spot(1.3, 1.7, 'sw'), via: [1.25, 1.45] },
    spots: [[2.92, 1.45], [2.8, 1.88], [0.3, 1.25]],
    onDesk: [[2.02, 0.24], [2.24, 0.3]],
  },
  // A bed at each end of the right wall, heads to it; the shelves and the window between them, the desk on the left
  // wall at the front.
  {
    beds: [
      { x: 0.05, y: 0.05, along: 'y' },
      { x: 2.45, y: 0.05, along: 'y' },
    ],
    desk: spot(0.3, 1.58),
    seat: spot(0.66, 1.58, 'nw'),
    lamp: [0.2, 1.2],
    shelf: spot(1.05, 0.28),
    atShelf: spot(1.06, 0.72, 'ne'),
    drapes: [1.78, 0.08],
    atWindow: spot(1.8, 0.58, 'ne'),
    stool: [2.3, 0.16],
    banner: [0.7, 0.1],
    rug: [1.6, 1.36],
    onRug: [spot(1.29, 1.36, 'se'), spot(1.91, 1.36, 'nw')],
    sofa: spot(2.68, 0.26),
    onSofa: spot(2.68, 0.34, 'sw'),
    floor: spot(1.45, 1.15, 'sw'),
    pace: [spot(1.1, 1.3, 'se'), spot(2.15, 1.35, 'nw')],
    via: [1.45, 1.05],
    mate: { side: spot(2.62, 1.36, 'nw'), floor: spot(2.2, 1.65, 'sw'), via: [2.3, 1.45] },
    spots: [[2.85, 1.85], [1.05, 1.88], [0.7, 1.15]],
    onDesk: [[0.26, 1.5], [0.33, 1.68]],
  },
];

/** How high the desk's top stands, in atlas pixels: what is on it is raised this much. */
const DESK_TOP = 13;

/** The two hours a student is asleep between, by the 24-hour clock: a night owl later, a scholar a little earlier. */
function sleeps(card: StudentCard): [number, number] {
  if (card.archetype === 'allNighter') return [4, 9];
  if (card.quirk === 'Night owl') return [2, 10];
  if (card.archetype === 'scholar') return [23, 7];
  return [24, 8];
}

const between = (hour: number, from: number, to: number): boolean => {
  const h = ((hour % 24) + 24) % 24;
  const f = from % 24;
  const t = to % 24;
  return f <= t ? h >= f && h < t : h >= f || h < t;
};

/** A number in [0, 1) that is always the same for this student, this room and this salt. */
function roll(state: GameState, ref: StudentRef, salt: number, extra = 0): number {
  return hashInts(state.seed, ref.entryYear, ref.index, 9100 + salt, extra) / 4294967296;
}

/** True when the card has a home to look into: a dorm, a chapter house, or a house in town. */
function housed(card: StudentCard): boolean {
  return (card.residence === 'dorm' && card.home !== null) || card.residence === 'offCampus' || card.residence === 'chapter';
}

/**
 * True when a student's rooms are shared: the hall has grown to its second
 * stage, and the campus's dorms are more than half full.
 */
export function roomShared(state: GameState, home: number): boolean {
  // The social web pairs roommates by the same rule (DESIGN.md 63.5).
  return roomsShared(state, home);
}

/**
 * The roommate: the web's when it has answered (DESIGN.md 63.5), and otherwise someone else in the same hall chosen
 * from the seed. Always of their gender (decision 4): a nonbinary student rooms with another nonbinary student, or
 * alone. null when nobody is found.
 */
function roommateOf(state: GameState, ref: StudentRef, home: number): StudentRef | null {
  const fromWeb = roommateInWeb(ref);
  if (fromWeb !== undefined) return fromWeb;
  const housing = placeIndex(state, 'housing');
  const own = studentKey(ref);
  const theirs = genderOf(state.seed, ref);
  const halls = sampleStudents(state, 120).filter((one) => studentKey(one) !== own && genderOf(state.seed, one) === theirs && studentHome(state, one, housing) === home);
  if (halls.length === 0) return null;
  return halls[Math.floor(roll(state, ref, 1) * halls.length)]!;
}

/** Where the card says they live: "Fernwick Hall", "the Kappa house", or "home in town". */
export function homeName(state: GameState, card: StudentCard): string {
  if (card.residence === 'chapter') return `the ${card.chapter} house`;
  if (card.residence === 'dorm' && card.home !== null) return dormName(state, card.home);
  return 'home in town';
}

/** What they are doing, from the card and the hour. The same for the same student in the same hour. */
export function roomActivity(state: GameState, card: StudentCard, hour: number, shared: boolean): RoomActivity {
  const [sleep, wake] = sleeps(card);
  if (between(hour, sleep, wake)) return 'asleep';
  if (between(hour, wake, wake + 1.5)) return 'ready';
  // Finals week and high Stress fill the desks.
  if (dayRead(state.clock).kind === 'finals') return 'finals';
  const at = roll(state, card.ref, 2, Math.floor(hour));
  if (card.stress >= 60 && at < 0.7) return 'study';
  const weights: Array<[RoomActivity, number]> = [
    ['study', card.archetype === 'scholar' || card.archetype === 'stressed' ? 4 : card.archetype === 'slacker' ? 0.5 : 1.5],
    ['music', musical(card) ? 3 : 0.4],
    ['call', card.archetype === 'homesick' ? 3 : card.relationship.id.startsWith('distance') ? 2.5 : card.archetype === 'butterfly' || card.archetype === 'charmer' ? 1.5 : 0.7],
    ['game', shared ? (gamer(card) ? 3 : 1) : 0],
    ['workout', card.archetype === 'athlete' || card.archetype === 'superfan' ? 2 : 0.2],
    ['relax', card.archetype === 'slacker' || card.archetype === 'party' ? 3 : 1],
  ];
  let total = 0;
  for (const [, weight] of weights) total += weight;
  let left = at * total;
  for (const [activity, weight] of weights) {
    left -= weight;
    if (left < 0) return activity;
  }
  return 'relax';
}

/**
 * Whether a student the map has not seen is at home at an hour of the player's day, and if so what at: asleep, getting
 * ready in the morning, or in for the evening. null when they would be in class.
 */
export function homeActivity(state: GameState, card: StudentCard, hour: number): RoomActivity | null {
  if (!housed(card)) return null;
  // A game needs the roommate, which is not worth finding here: it is never asleep or getting ready either way.
  const activity = roomActivity(state, card, hour, false);
  if (activity === 'asleep' || activity === 'ready') return activity;
  const period = periodAt(((hour % 24) + 24) % 24);
  return period === 'evening' || period === 'night' ? activity : null;
}

/**
 * True when a card's student can be looked in on: the map has them indoors at home, in their dorm, their chapter
 * house or their house in town. Seen going in, or not seen at all at an hour they are at home: asleep, getting ready,
 * or in for the evening.
 */
export function canLookInside(state: GameState, ref: StudentRef, lastDoing: string | null, outside: boolean, hour: number): boolean {
  if (outside) return false;
  const card = studentCard(state, ref);
  if (!card || !housed(card)) return false;
  if (lastDoing === null) return homeActivity(state, card, hour) !== null;
  if (lastDoing === 'toDorm' || lastDoing === 'movingIn') return card.residence !== 'offCampus';
  return lastDoing === 'walkingHome' && card.residence === 'offCampus';
}

function musical(card: StudentCard): boolean {
  return card.club === 'A Cappella Group' || card.club === 'Campus Radio' || /music/i.test(card.major);
}

function gamer(card: StudentCard): boolean {
  return card.club === 'Chess Club' || card.club === 'Board Game Club' || card.archetype === 'clown';
}

/** Food and drink: on the desk or nowhere. */
const FOOD = ['room.cup', 'room.apple', 'room.bread'];

/** Things that belong on the desk rather than the floor. */
const DESK_THINGS = ['room.book', 'room.papers', 'room.cup', 'room.apple', 'room.scroll', 'room.chess', 'room.cards', 'room.dice', 'room.controller', 'room.bread'];

/**
 * The things of theirs in the room: what the card says they are, made visible. Never anything to be embarrassed by.
 * Each part of the card brings its own, and the first of each comes before the second of any, so a room with little
 * space still shows something of every part.
 */
function belongings(card: StudentCard): string[] {
  const nature: string[] = [];
  if (card.archetype === 'scholar' || card.archetype === 'stressed' || card.archetype === 'superSenior') nature.push('room.book', 'room.scroll');
  if (card.archetype === 'slacker') nature.push('room.papers', 'room.basket', 'room.box');
  if (card.archetype === 'athlete' || card.archetype === 'superfan') nature.push('room.ball', 'room.trophy');
  if (card.archetype === 'party') nature.push('room.speaker');
  if (card.archetype === 'clown') nature.push('room.cards');
  const club: string[] = [];
  if (card.club === 'Chess Club') club.push('room.chess');
  if (card.club === 'Board Game Club') club.push('room.dice');
  if (card.club === 'Intramural Soccer') club.push('room.soccerBall');
  if (card.club === 'Robotics Club' || card.club === 'Coding Club') club.push('room.controller');
  if (card.club === 'Garden Club') club.push('room.plant');
  if (card.club === 'Baking Club') club.push('room.bread');
  const quirk: string[] = [];
  if (card.quirk === 'Feeds the squirrels') quirk.push('room.plant');
  if (card.quirk === 'Always hungry') quirk.push('room.apple');
  if (card.quirk === 'Caffeine-powered') quirk.push('room.cup');
  const major: string[] = musical(card) ? ['room.lute', 'room.speaker'] : [];
  const groups = [nature, club, quirk, major];
  const out: string[] = [];
  for (let n = 0; n < 3; n++) for (const group of groups) if (group[n] && !out.includes(group[n]!)) out.push(group[n]!);
  // Every student has something on the desk.
  if (out.length === 0) out.push('room.papers');
  return out;
}

/** The line under the room, in the card's voice. */
function lineOf(activity: RoomActivity, card: StudentCard, mate: { name: string; asleep: boolean; in: boolean } | null, night: boolean): string {
  switch (activity) {
    case 'asleep':
      if (!mate) return 'Asleep for the night';
      return mate.asleep ? `Asleep. ${mate.name} is asleep too.` : `Asleep. ${mate.name} is still out.`;
    case 'ready':
      return 'Getting ready for the day';
    case 'finals':
      return 'Studying for finals at the desk';
    case 'study':
      if (night && mate?.asleep) return `Studying late by the lamp while ${mate.name} sleeps`;
      return night ? 'Studying late by the desk lamp' : card.stress >= 60 ? 'Catching up on reading at the desk' : 'Studying at the desk';
    case 'music':
      return 'Playing music';
    case 'call':
      return card.relationship.id.startsWith('distance') ? 'On a call with someone far away' : 'On a call home';
    case 'game':
      return mate ? `A game with ${mate.name}, their roommate` : 'Playing a game';
    case 'workout':
      return 'Working out in their room';
    case 'relax':
      return night ? 'Winding down for the night' : 'Taking it easy';
  }
}

const stop = (at: Spot, pose: Pose, motion: RoomMotion, seconds: number): Stop => ({ x: at.x, y: at.y, facing: at.facing, pose, motion, seconds });

/**
 * A student's round for what they are doing: the places they go and how long they stay. `r` gives the same numbers
 * for the same student in the same hour, so the round is theirs.
 */
function round(activity: RoomActivity, plan: Plan, r: (salt: number) => number, sofa: boolean): Stop[] {
  const breakAt = r(1) < 0.6 ? plan.atShelf : plan.atWindow;
  switch (activity) {
    case 'study':
    case 'finals':
      // At the desk, turning pages, then up to fetch something from the shelves or look out, and back.
      return [stop(plan.seat, 'sit', 'still', (activity === 'finals' ? 30 : 22) + 12 * r(2)), stop(breakAt, 'stand', 'breathe', 4 + 2 * r(3))];
    case 'ready':
      // Between the shelves and the window, as if dressing and checking the day.
      return [stop(plan.atShelf, 'stand', 'breathe', 6 + 2 * r(2)), stop(plan.atWindow, 'stand', 'breathe', 5 + 2 * r(3)), stop(plan.floor, 'stand', 'breathe', 3)];
    case 'call':
      // Pacing.
      return [stop(plan.pace[0], 'stand', 'talk', 4 + 2 * r(2)), stop(plan.pace[1], 'stand', 'talk', 4 + 2 * r(3))];
    case 'music':
      return [stop(plan.floor, 'stand', 'nod', 18 + 8 * r(2)), stop(plan.atWindow, 'stand', 'breathe', 4 + 2 * r(3))];
    case 'workout':
      return [stop(plan.floor, 'stand', 'reps', 9 + 3 * r(2)), stop(plan.pace[1], 'stand', 'reps', 7 + 3 * r(3)), stop(plan.pace[0], 'stand', 'breathe', 3)];
    case 'game':
      return [stop(plan.onRug[0], 'floor', 'nod', 60)];
    case 'relax':
      return sofa
        ? [stop(plan.onSofa, 'sofa', 'breathe', 16 + 8 * r(2)), stop(plan.atWindow, 'stand', 'breathe', 5), stop(plan.atShelf, 'stand', 'breathe', 4)]
        : [stop(plan.onRug[0], 'floor', 'breathe', 12 + 6 * r(2)), stop(plan.atWindow, 'stand', 'breathe', 5), stop(plan.atShelf, 'stand', 'breathe', 4)];
    case 'asleep':
      return [];
  }
}

/**
 * The roommate's round for what they are doing, kept to their own side of the room so the two do not walk into each
 * other: the desk only when the student is not at it.
 */
function mateRound(activity: RoomActivity, plan: Plan, r: (salt: number) => number, deskFree: boolean): Stop[] {
  const side = plan.mate.side;
  const floor = plan.mate.floor;
  switch (activity) {
    case 'study':
    case 'finals':
      return deskFree ? [stop(plan.seat, 'sit', 'still', 24 + 10 * r(4)), stop(side, 'stand', 'breathe', 4)] : [stop(side, 'stand', 'still', 14 + 6 * r(4)), stop(floor, 'stand', 'breathe', 4)];
    case 'call':
      return [stop(side, 'stand', 'talk', 4 + 2 * r(4)), stop(floor, 'stand', 'talk', 4 + 2 * r(5))];
    case 'workout':
      return [stop(floor, 'stand', 'reps', 9 + 3 * r(4)), stop(side, 'stand', 'breathe', 4)];
    case 'ready':
      return [stop(side, 'stand', 'breathe', 6), stop(floor, 'stand', 'breathe', 5 + 2 * r(4))];
    default:
      return [stop(side, 'stand', 'breathe', 10 + 6 * r(4)), stop(floor, 'stand', 'breathe', 5 + 2 * r(5))];
  }
}

/**
 * The room of a student at an hour of the player's day: in their dorm, their chapter house or their house in town. A
 * room away from the dorms has no roommate. null for anyone with no home to look into.
 */
export function roomFor(state: GameState, ref: StudentRef, hour: number, figures: { crowd: number; look: (ref: StudentRef) => number }): Room | null {
  const card = studentCard(state, ref);
  if (!card || !housed(card)) return null;
  const inDorm = card.residence === 'dorm' && card.home !== null;
  const home = inDorm ? card.home! : -1;
  const layout = hashInts(state.seed, home, ref.entryYear, ref.index, 9177) % ROOM_PLANS.length;
  const plan = ROOM_PLANS[layout]!;
  const shared = inDorm && roomShared(state, home);
  const mate = shared ? roommateOf(state, ref, home) : null;
  const mateCard = mate ? studentCard(state, mate) : null;
  const activity = roomActivity(state, card, hour, mateCard !== null);
  const night = between(hour, 20, 6);
  const lights: Room['lights'] = activity === 'asleep' ? 'off' : night ? 'lamp' : 'on';
  const r = (salt: number): number => roll(state, ref, 30 + salt, Math.floor(hour));
  // The roommate's own evening: asleep when their hours say so, in when it is not the middle of the day, and always
  // in for a game with the student.
  const mateDoing = mateCard ? roomActivity(state, mateCard, hour, true) : null;
  const mateAsleep = mateDoing === 'asleep';
  const mateIn = mateCard !== null && (activity === 'game' || mateAsleep || (!between(hour, 10, 16) && activity !== 'asleep'));

  const pieces: RoomPiece[] = [];
  pieces.push({ key: 'room.rug', x: plan.rug[0], y: plan.rug[1], flat: true });
  pieces.push({ key: 'room.desk', x: plan.desk.x, y: plan.desk.y, flip: plan.desk.flip });
  pieces.push({ key: 'room.chairFront', x: plan.seat.x, y: plan.seat.y, flip: plan.seat.facing === 'nw', chair: true });
  pieces.push({ key: 'decoration.globeLamp', x: plan.lamp[0], y: plan.lamp[1] });
  pieces.push({ key: 'room.shelf', x: plan.shelf.x, y: plan.shelf.y, flip: plan.shelf.flip });
  pieces.push({ key: 'room.drapes', x: plan.drapes[0], y: plan.drapes[1], lift: 44 });
  pieces.push({ key: 'room.stool', x: plan.stool[0], y: plan.stool[1] });
  // The club's banner on the wall, in the school's colour.
  if (card.club) pieces.push({ key: `decoration.banner.${state.football.colour}`, x: plan.banner[0], y: plan.banner[1] });
  // A room of one has a sofa where a roommate's bed would be.
  const sofa = mateCard === null;
  if (sofa) pieces.push({ key: 'decoration.sofa', x: plan.sofa.x, y: plan.sofa.y, flip: plan.sofa.flip });

  // Their things: what goes on a desk goes on the desk, food and a cup first, and the rest on the floor. Food and a cup
  // never go on the floor: a crowded desk leaves them out.
  const things = belongings(card);
  const atDesk = activity === 'study' || activity === 'finals';
  const onDesk = [atDesk ? 'room.book' : null, ...things.filter((key) => FOOD.includes(key)), ...things.filter((key) => DESK_THINGS.includes(key))].filter((key): key is string => key !== null);
  const deskShown = [...new Set(onDesk)].slice(0, plan.onDesk.length);
  deskShown.forEach((key, n) => pieces.push({ key, x: plan.onDesk[n]![0], y: plan.onDesk[n]![1], lift: DESK_TOP, pages: key === 'room.book' && atDesk }));
  // Playing music: what they play it on stands beside them, and notes drift up from it.
  const playing = activity === 'music' ? (things.includes('room.lute') ? 'room.lute' : 'room.speaker') : null;
  const floor = things.filter((key) => !deskShown.includes(key) && key !== playing && !FOOD.includes(key));
  floor.slice(0, plan.spots.length).forEach((key, n) => {
    const [x, y] = plan.spots[n]!;
    pieces.push({ key, x, y });
  });
  if (playing) pieces.push({ key: playing, x: plan.floor.x + 0.32, y: plan.floor.y - 0.08, notes: true });
  // A game is on the rug between them.
  if (activity === 'game') pieces.push({ key: card.club === 'Chess Club' ? 'room.chess' : mateCard && gamer(mateCard) ? 'room.dice' : 'room.cards', x: plan.rug[0], y: plan.rug[1] });
  if (activity === 'workout' && !things.includes('room.kettlebell')) pieces.push({ key: 'room.kettlebell', x: plan.floor.x + 0.3, y: plan.floor.y + 0.22 });

  const beds: RoomBed[] = [{ ...plan.beds[0], blanket: 'room.blanket', roommate: false }];
  if (mateCard) beds.push({ ...plan.beds[1], blanket: 'room.blanket.2', roommate: true });

  const people: RoomFigure[] = [];
  const look = figures.look(ref);
  if (activity === 'asleep') people.push({ look, roommate: false, bed: 0, stops: [], via: plan.via, offset: 0 });
  else people.push({ look, roommate: false, bed: null, stops: round(activity, plan, r, sofa), via: plan.via, offset: r(9) * 20 });
  if (mate && mateCard && mateIn) {
    const mateLook = figures.look(mate);
    const mr = (salt: number): number => roll(state, mate, 30 + salt, Math.floor(hour));
    if (mateAsleep) people.push({ look: mateLook, roommate: true, bed: 1, stops: [], via: plan.mate.via, offset: 0 });
    else if (activity === 'game') people.push({ look: mateLook, roommate: true, bed: null, stops: [stop(plan.onRug[1], 'floor', 'nod', 60)], via: plan.via, offset: 0 });
    else people.push({ look: mateLook, roommate: true, bed: null, stops: mateRound(mateDoing ?? 'relax', plan, mr, !atDesk), via: plan.mate.via, offset: mr(9) * 20 + 7 });
  }
  const mateName = mateCard ? mateCard.name.split(' ')[0]! : null;
  return {
    layout,
    activity,
    line: lineOf(activity, card, mateName ? { name: mateName, asleep: mateAsleep && mateIn, in: mateIn } : null, night),
    lights,
    pieces,
    beds,
    figures: people,
    roommate: mate && mateCard ? { ref: mate, name: mateCard.name } : null,
    where: card.residence === 'offCampus' ? (card.street ? `on ${card.street}` : 'in town') : homeName(state, card),
  };
}

// ----------------------------------------------------------- moving about --

/** How fast people walk in their room, in cells a second: an unhurried stroll. */
export const WALK_SPEED = 0.3;
/** How long each frame of the pack's walk is shown, as on the map. */
export const WALK_FRAME_MS = 84;

/** Where a figure is at a moment, and how they are drawn. */
export interface FigureNow {
  x: number;
  y: number;
  facing: Facing;
  pose: Pose | 'walk' | 'sleep';
  motion: RoomMotion;
  /** The frame of the walk, 0 to 7; 0 when they are not walking. */
  frame: number;
}

/** The way someone faces walking from one spot to another, as the map's walkers face. */
export function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'se' : 'nw';
  return dy >= 0 ? 'sw' : 'ne';
}

/** The walk from one stop to the next: straight when they are close, otherwise by way of the middle of the floor. */
function path(from: Stop, to: Stop, via: [number, number]): Array<[number, number]> {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.6) return [[from.x, from.y], [to.x, to.y]];
  return [[from.x, from.y], via, [to.x, to.y]];
}

function pathLength(points: Array<[number, number]>): number {
  let total = 0;
  for (let n = 1; n < points.length; n++) total += Math.hypot(points[n]![0] - points[n - 1]![0], points[n]![1] - points[n - 1]![1]);
  return total;
}

/** How long one time round takes, in seconds: every stay and every walk. */
export function roundSeconds(figure: RoomFigure): number {
  const stops = figure.stops;
  if (stops.length === 0) return 0;
  let total = 0;
  stops.forEach((one, n) => {
    total += one.seconds;
    if (stops.length > 1) total += pathLength(path(one, stops[(n + 1) % stops.length]!, figure.via)) / WALK_SPEED;
  });
  return total;
}

/** Where a figure is `seconds` after the room opened, and what they are doing there. */
export function figureNow(figure: RoomFigure, seconds: number): FigureNow {
  const stops = figure.stops;
  if (figure.bed !== null || stops.length === 0) return { x: 0, y: 0, facing: 'sw', pose: 'sleep', motion: 'breathe', frame: 0 };
  const first = stops[0]!;
  if (stops.length === 1) return { x: first.x, y: first.y, facing: first.facing, pose: first.pose, motion: first.motion, frame: 0 };
  const total = roundSeconds(figure);
  let t = (((seconds + figure.offset) % total) + total) % total;
  for (let n = 0; n < stops.length; n++) {
    const here = stops[n]!;
    if (t < here.seconds) return { x: here.x, y: here.y, facing: here.facing, pose: here.pose, motion: here.motion, frame: 0 };
    t -= here.seconds;
    const points = path(here, stops[(n + 1) % stops.length]!, figure.via);
    const walk = pathLength(points) / WALK_SPEED;
    if (t < walk) {
      let along = t * WALK_SPEED;
      for (let k = 1; k < points.length; k++) {
        const [ax, ay] = points[k - 1]!;
        const [bx, by] = points[k]!;
        const leg = Math.hypot(bx - ax, by - ay);
        if (along <= leg || k === points.length - 1) {
          const share = leg > 0 ? Math.min(1, along / leg) : 1;
          return {
            x: ax + (bx - ax) * share,
            y: ay + (by - ay) * share,
            facing: facingFor(bx - ax, by - ay),
            pose: 'walk',
            motion: 'still',
            frame: Math.floor((t * 1000) / WALK_FRAME_MS) % 8,
          };
        }
        along -= leg;
      }
    }
    t -= walk;
  }
  return { x: first.x, y: first.y, facing: first.facing, pose: first.pose, motion: first.motion, frame: 0 };
}

/** The spot of a bed where the sleeper's head lies: on the pillow, at its head, in the middle of its width. */
export function pillowOf(bed: RoomBed): [number, number] {
  return bed.along === 'x' ? [bed.x + 0.15, bed.y + BED.width / 2] : [bed.x + BED.width / 2, bed.y + 0.15];
}

/** The ground a bed covers, in the room's cells: [x from, y from, x to, y to]. */
export function bedArea(bed: RoomBed): [number, number, number, number] {
  return bed.along === 'x' ? [bed.x, bed.y, bed.x + BED.length, bed.y + BED.width] : [bed.x, bed.y, bed.x + BED.width, bed.y + BED.length];
}
