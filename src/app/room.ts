import {
  dayRead,
  enrollment,
  hashInts,
  offCampusNow,
  openCapacity,
  placeIndex,
  sampleStudents,
  studentCard,
  studentHome,
  studentKey,
  type GameState,
  type StudentCard,
  type StudentRef,
} from '../sim';

/**
 * A peek inside a student's room (DESIGN.md section 46). For show only, like
 * the walkers: a room is worked out when it is opened, from the student's
 * seeded identity, the live campus numbers and the hour on the player's clock.
 * Nothing here is saved, and nothing in src/sim reads it.
 *
 * The room is a small grid of its own, two cells by two, seen from the front
 * with its two back walls standing. Every piece is a sprite from the art
 * manifest, put down by its anchor as the map puts down a decoration.
 */

/** What a student is doing in their room. */
export type RoomActivity = 'study' | 'finals' | 'asleep' | 'ready' | 'music' | 'call' | 'game' | 'relax' | 'workout';

/** How a figure moves while the room is open. Small: a breath, a nod, a turn of the page. */
export type RoomMotion = 'breathe' | 'nod' | 'talk' | 'still';

export interface RoomPiece {
  /** Sprite name in the art manifest. */
  key: string;
  /** Where it stands, in the room's cells: 0 is the back corner, 2 the front edge. */
  x: number;
  y: number;
  flip?: boolean;
  /** Turns its page now and then: the open book on the desk while someone studies. */
  pages?: boolean;
  /** Notes drift up from it: a speaker or an instrument being played. */
  notes?: boolean;
  /** Hung on the wall this many atlas pixels above the floor: the drapes over the window. */
  lift?: number;
}

/**
 * The two back walls, as the steps along each where a panel of the stable's back corner is put down. The pack drew
 * that corner a little off its cell, so its left face is 0.64 of a cell long and its right face 0.89: three of one
 * and two of the other close a room two cells by two to within a few hundredths.
 */
export const ROOM_WALLS = { left: [0, 164 / 256, 328 / 256], right: [0, 228 / 256] } as const;

export interface RoomFigure {
  /** Their figure among the pack's people, as the card's portrait has it. */
  look: number;
  x: number;
  y: number;
  /** The way they face, as the walkers' sprites are named. */
  facing: 'sw' | 'se' | 'nw' | 'ne';
  motion: RoomMotion;
  roommate: boolean;
}

export interface Room {
  /** One of the room plans, chosen from the seed, so rooms do not all look alike. */
  layout: number;
  activity: RoomActivity;
  /** One line under the room, in the card's voice. */
  line: string;
  /** The lights: on, the desk lamp only at night, or out for the night. */
  lights: 'on' | 'lamp' | 'off';
  pieces: RoomPiece[];
  figures: RoomFigure[];
  /** The roommate, when the hall's rooms are shared. */
  roommate: { ref: StudentRef; name: string } | null;
}

/** The room plans: where the desk, the shelf, the soft corner and the free floor are, in the room's own cells. */
interface Plan {
  desk: [number, number];
  /** Where someone stands to work at the desk, and the way they face it. */
  seat: [number, number, RoomFigure['facing']];
  shelf: [number, number];
  /** The rug, or the sofa in the plan that has one. */
  soft: [number, number];
  sofa: boolean;
  lamp: [number, number];
  /** The window side: the drapes hang on the back wall here. */
  drapes: [number, number];
  /** Free floor in front: where someone stands to get ready, take a call or play. */
  floor: [number, number];
  /** A second place to stand, facing the first, for a game with the roommate. */
  across: [number, number, RoomFigure['facing']];
  /** Where a few things of theirs go on the floor, and on the desk. */
  spots: Array<[number, number]>;
  onDesk: Array<[number, number]>;
}

export const ROOM_PLANS: readonly Plan[] = [
  // The desk against the left wall, the shelf against the right, a rug in the middle.
  {
    desk: [0.42, 1.05], seat: [0.66, 1.16, 'nw'], shelf: [1.3, 0.28], soft: [1.2, 1.2], sofa: false, lamp: [0.3, 0.3], drapes: [0.9, 0.1],
    floor: [1.25, 1.35], across: [1.75, 1.0, 'sw'], spots: [[1.75, 1.75], [1.8, 0.55], [0.6, 1.75]], onDesk: [[0.35, 0.95], [0.52, 1.2]],
  },
  // The desk against the right wall, the shelf on the left, the sofa along the left wall.
  {
    desk: [1.1, 0.4], seat: [1.2, 0.66, 'ne'], shelf: [0.28, 0.45], soft: [0.45, 1.45], sofa: true, lamp: [1.75, 0.3], drapes: [0.1, 1.0],
    floor: [1.35, 1.3], across: [0.95, 1.7, 'ne'], spots: [[1.8, 1.6], [0.7, 0.75], [1.65, 0.75]], onDesk: [[1.0, 0.33], [1.22, 0.5]],
  },
  // The desk in the back corner, a rug in front, the shelf on the left wall further down.
  {
    desk: [0.55, 0.5], seat: [0.8, 0.76, 'nw'], shelf: [0.28, 1.4], soft: [1.35, 1.3], sofa: false, lamp: [1.7, 0.3], drapes: [1.3, 0.1],
    floor: [1.2, 1.45], across: [1.7, 1.0, 'sw'], spots: [[1.8, 1.75], [0.65, 1.8], [1.75, 0.7]], onDesk: [[0.45, 0.45], [0.68, 0.6]],
  },
];

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

/**
 * True when a student's rooms are shared: the hall has grown to its second
 * stage, and the campus's dorms are more than half full.
 */
export function roomShared(state: GameState, home: number): boolean {
  const hall = state.map.buildings[state.map.cells[home]?.buildingId ?? -1];
  if (!hall || hall.stage < 2) return false;
  const beds = openCapacity(state, 'housing');
  const residents = Math.max(0, enrollment(state) - offCampusNow(state));
  return beds > 0 && residents / beds > 0.5;
}

/** Someone else who lives in the same hall, chosen from the seed: the roommate. null when nobody is found. */
function roommateOf(state: GameState, ref: StudentRef, home: number): StudentRef | null {
  const housing = placeIndex(state, 'housing');
  const own = studentKey(ref);
  const halls = sampleStudents(state, 120).filter((one) => studentKey(one) !== own && studentHome(state, one, housing) === home);
  if (halls.length === 0) return null;
  return halls[Math.floor(roll(state, ref, 1) * halls.length)]!;
}

/**
 * True when a card's student can be looked in on: the map has them indoors at home, in their dorm or in their house
 * in town.
 */
export function canLookInside(state: GameState, ref: StudentRef, lastDoing: string | null, outside: boolean): boolean {
  if (outside) return false;
  const card = studentCard(state, ref);
  if (!card) return false;
  if (lastDoing === 'toDorm' || lastDoing === 'movingIn') return card.residence === 'dorm' && card.home !== null;
  return lastDoing === 'walkingHome' && card.residence === 'offCampus';
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

function musical(card: StudentCard): boolean {
  return card.club === 'A Cappella Group' || card.club === 'Campus Radio' || /music/i.test(card.major);
}

function gamer(card: StudentCard): boolean {
  return card.club === 'Chess Club' || card.club === 'Board Game Club' || card.archetype === 'clown';
}

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
function lineOf(activity: RoomActivity, card: StudentCard, roommate: string | null, night: boolean): string {
  switch (activity) {
    case 'asleep':
      return 'Asleep. The lights are out.';
    case 'ready':
      return 'Getting ready for the day';
    case 'finals':
      return 'Studying for finals at the desk';
    case 'study':
      return night ? 'Studying late by the desk lamp' : card.stress >= 60 ? 'Catching up on reading at the desk' : 'Studying at the desk';
    case 'music':
      return 'Playing music';
    case 'call':
      return card.relationship.id.startsWith('distance') ? 'On a call with someone far away' : 'On a call home';
    case 'game':
      return roommate ? `A game with ${roommate}, their roommate` : 'Playing a game';
    case 'workout':
      return 'Stretching after practice';
    case 'relax':
      return night ? 'Winding down for the night' : 'Taking it easy';
  }
}

/**
 * The room of a student at an hour of the player's day: in their dorm, or in their house in town. A room in town has
 * no roommate. null for anyone with no home to look into.
 */
export function roomFor(state: GameState, ref: StudentRef, hour: number, figures: { crowd: number; look: (ref: StudentRef) => number }): Room | null {
  const card = studentCard(state, ref);
  if (!card) return null;
  const inDorm = card.residence === 'dorm' && card.home !== null;
  if (!inDorm && card.residence !== 'offCampus') return null;
  const home = inDorm ? card.home! : -1;
  const layout = hashInts(state.seed, home, ref.entryYear, ref.index, 9177) % ROOM_PLANS.length;
  const plan = ROOM_PLANS[layout]!;
  const shared = inDorm && roomShared(state, home);
  const mate = shared ? roommateOf(state, ref, home) : null;
  const mateCard = mate ? studentCard(state, mate) : null;
  const activity = roomActivity(state, card, hour, mateCard !== null);
  const night = between(hour, 20, 6);
  const lights: Room['lights'] = activity === 'asleep' ? 'off' : night ? 'lamp' : 'on';

  const pieces: RoomPiece[] = [];
  pieces.push({ key: plan.sofa ? 'decoration.sofa' : 'room.rug', x: plan.soft[0], y: plan.soft[1] });
  pieces.push({ key: 'room.desk', x: plan.desk[0], y: plan.desk[1] });
  pieces.push({ key: 'room.shelf', x: plan.shelf[0], y: plan.shelf[1] });
  pieces.push({ key: 'decoration.globeLamp', x: plan.lamp[0], y: plan.lamp[1] });
  pieces.push({ key: 'room.drapes', x: plan.drapes[0], y: plan.drapes[1], lift: 44 });
  // The club's banner on the wall, in the school's colour.
  if (card.club) pieces.push({ key: `decoration.banner.${state.football.colour}`, x: plan.drapes[0] > plan.drapes[1] ? 0.15 : 0.95, y: plan.drapes[0] > plan.drapes[1] ? 0.95 : 0.15 });
  // A chair at the desk, unless someone stands there.
  const atDesk = activity === 'study' || activity === 'finals';
  if (!atDesk) pieces.push({ key: 'room.chair', x: plan.seat[0], y: plan.seat[1] });
  // Their things: one on the desk, the rest on the floor.
  const things = belongings(card);
  const book = atDesk ? 'room.book' : null;
  const onDesk = book ?? things.find((key) => ['room.book', 'room.papers', 'room.cup', 'room.apple', 'room.scroll', 'room.chess', 'room.cards', 'room.dice', 'room.controller', 'room.bread'].includes(key)) ?? null;
  if (onDesk) pieces.push({ key: onDesk, x: plan.onDesk[0]![0], y: plan.onDesk[0]![1], pages: atDesk });
  // Playing music: what they play it on stands beside them, and notes drift up from it.
  const playing = activity === 'music' ? (things.includes('room.lute') ? 'room.lute' : 'room.speaker') : null;
  const floor = things.filter((key) => key !== onDesk && key !== playing);
  floor.slice(0, plan.spots.length).forEach((key, n) => {
    const [x, y] = plan.spots[n]!;
    pieces.push({ key, x, y });
  });
  if (playing) pieces.push({ key: playing, x: plan.floor[0] + 0.32, y: plan.floor[1] - 0.05, notes: true });
  // A game is on the desk, or on the rug.
  if (activity === 'game') pieces.push({ key: card.club === 'Chess Club' ? 'room.chess' : mateCard && gamer(mateCard) ? 'room.dice' : 'room.cards', x: (plan.floor[0] + plan.across[0]) / 2, y: (plan.floor[1] + plan.across[1]) / 2 });
  if (activity === 'workout' && !things.includes('room.kettlebell')) pieces.push({ key: 'room.kettlebell', x: plan.floor[0] + 0.3, y: plan.floor[1] + 0.2 });

  const people: RoomFigure[] = [];
  const look = figures.look(ref);
  if (activity !== 'asleep') {
    if (atDesk) people.push({ look, x: plan.seat[0], y: plan.seat[1], facing: plan.seat[2], motion: 'still', roommate: false });
    else if (activity === 'ready') people.push({ look, x: plan.shelf[0] + 0.45, y: plan.shelf[1] + 0.45, facing: plan.shelf[0] > plan.shelf[1] ? 'ne' : 'nw', motion: 'breathe', roommate: false });
    else people.push({ look, x: plan.floor[0], y: plan.floor[1], facing: activity === 'game' ? 'se' : 'sw', motion: activity === 'music' ? 'nod' : activity === 'call' ? 'talk' : 'breathe', roommate: false });
  }
  // The roommate is in when it is not the middle of the day, and asleep when the student is.
  const mateIn = mate !== null && mateCard !== null && (activity === 'game' || !between(hour, 10, 16));
  if (mate && mateCard && mateIn && activity !== 'asleep') {
    const mateLook = figures.look(mate);
    if (activity === 'game') people.push({ look: mateLook, x: plan.across[0], y: plan.across[1], facing: plan.across[2], motion: 'breathe', roommate: true });
    else people.push({ look: mateLook, x: plan.spots[1]![0] - 0.15, y: plan.spots[1]![1] + 0.1, facing: 'sw', motion: 'breathe', roommate: true });
  }
  return {
    layout,
    activity,
    line: lineOf(activity, card, mateCard ? mateCard.name.split(' ')[0]! : null, night),
    lights,
    pieces,
    figures: people,
    roommate: mate && mateCard ? { ref: mate, name: mateCard.name } : null,
  };
}
