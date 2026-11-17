import Phaser from 'phaser';
import { fitOnMap } from './propSize';
import { chemistryOf, companionsOf, greetingFor, reactionFor, stopsToTalk, tieOf, topicFor, type Reaction, type TieSeen } from '../app/crowdTies';
import { effectsSetting, moodRingsSetting, type Weather } from '../app/life';
import { feelingOf, type Emotion } from '../app/emotion';
import { standingOf, TRANSCRIPT_BELOW } from '../sim/systems/registration';
import { LANE_LINE, LANE_LOOK, PARKS, rideMomentOf, WALK_LINE, WHEEL_NAMES, WHEEL_SPEED, wheelOf, type RideMoment, type Wheel } from '../app/wheels';
import { actorWords, WATCH_REACH, WATCH_REACTIONS, WATCHERS_AT_STEP, watchWords, type MomentKind } from '../app/crowdMoments';
import { NO_CHAOS, WATCH_RUN, type ChaosCrowd } from '../app/mayhemShow';
import { searchOnFoot, searchRide, searchSpace } from './afoot';
import type { Footprints } from './footprints';
import { ANGER_MARK_MS, BIG_KEY, bigMomentOf, cheeringAt, heldFacing, heldOf, HELD_KEY, laughingAt, motionAt, motionOf, MOTION_PACE, pacingAt, RING, type BigMoment, type Held, type Motion, type Pose, type Today, type Trip } from '../app/feelingShow';
import { socialWeb } from '../app/socialWeb';
import { firstNamesOf, idIn, refIn, type WebView } from '../app/socialView';
import { itemAt, regularDay } from '../app/regularDay';
import { shownHour } from '../app/daylight';
import { KIND, SLOTS } from '../sim/config/web';
import { firstNameOf, placeUsedFor } from '../sim/systems/students';
import { dateAt } from '../sim/calendar';
import { INTEREST } from '../sim/systems/identity';
import { BULLYING_PASSING } from '../sim/config/bullying';
import { CROWD_STEPS, othersWanted, TOUR_SIZE, walkersWanted } from '../app/crowd';
import { headingsAt, ORDINARY_DAY, passingAt, pathsAt, type DayFacts } from '../app/campusDay';
import type { DayPeriod } from '../app/daylight';
import { avenueCrossing, avenueCrossingBack, KERB_MIDDLE, KERB_NEAR, onRoadway, planTraffic, type TrafficPlan } from '../app/traffic';
import {
  enrollment,
  hashInts,
  isBikeKind,
  isPathKind,
  peopleCounts,
  personKey,
  PLACED,
  placeIndex,
  sampleStudents,
  studentHome,
  studentKey,
  studentCard,
  studentFigure,
  everydayLook,
  TOWN_X,
  townLiving,
  type GameState,
  type PersonRef,
  type StudentRef,
  type Zone,
} from '../sim';
import type { Art, PeopleSpec, WalkDirection } from './art';
import type { Iso } from './iso';

/**
 * People walking. Purely for show: nothing here is saved, nothing here
 * touches the simulation, and catch-up never runs it. The crowd is a sample
 * sized from enrollment, from how much of the campus is on screen, from the
 * part of the player's day and from the crowd setting.
 *
 * A walker steps out of a building, follows the paths to another building, a
 * quad or somewhere to eat or play, and steps inside or lingers. Every sprite
 * comes from the art manifest. With no people in the manifest there are none.
 *
 * Each student walker is one of the enrolled students (see the student card,
 * DESIGN.md section 13.8). Who they are is worked out from the game's seed,
 * never stored: the same student always has the same look, and only ever
 * goes home to their own dorm.
 *
 * Two more kinds walk the town's streets. Commuters are students who live in
 * a neighbourhood joined to campus by a path: they walk in from their houses
 * in the morning and home in the evening. Townspeople are neighbours, and are
 * never students: they walk the streets whether or not the campus is joined.
 *
 * And a few people on campus are not students (DESIGN.md section 32.2):
 * professors and staff by day, as many as the payroll has for each student,
 * and at weekends tour groups behind a guide with a pennant, and a booster.
 * Each has a look of their own and a card. Together they are never more than
 * about a quarter of the people on screen.
 */

/** What a walker is doing, for the student card. */
export type Doing = 'toClass' | 'nextClass' | 'toDorm' | 'toQuad' | 'onQuad' | 'movingIn' | 'walkingIn' | 'walkingHome' | `toPlace:${string}` | `atPlace:${string}` | `chatting:${string}` | `date:${string}` | `party:${string}`;

/**
 * The crowd from real ties (DESIGN.md 63.8). A student setting out may bring their partner or some of their friend
 * group, side by side; two who know each other stop when they meet on a path, greet and talk, with what they talk
 * about in a bubble; passing a crush, an ex or a rival shows on their face; two strangers who would click, a sparkle.
 */
/** How often someone setting out brings their partner, and a few of their friend group. */
const WITH_PARTNER = 0.5;
const WITH_GROUP = 0.3;
const PARTY_MAX = 4;
/** Where each in a party walks, in cells: across the path, and behind the first. */
const PARTY_PLACES: ReadonlyArray<readonly [number, number]> = [
  [-0.12, 0],
  [0.12, 0],
  [-0.12, 0.3],
  [0.12, 0.3],
  [-0.12, 0.6],
  [0.12, 0.6],
];
/**
 * Scenes (DESIGN.md 63.11): fun beyond school. A couple out in the evening is more often out together, to eat or to a
 * lawn: a date, which lasts twice as long, with hearts. On a party night (Thursday to Saturday, from the evening) a
 * friend group who like parties goes out bigger, up to six, to a lawn, stays three times as long, and talks about the
 * party and the music. A friend who passes a group lingering on a lawn joins it on the spot, and meets whoever there
 * they did not know.
 */
const DATE_WITH_PARTNER = 0.8;
const DATE_LINGER = 2;
const PARTY_NIGHT_GROUP = 0.6;
const PARTY_NIGHT_MAX = 6;
const PARTY_NIGHT_LINGER = 3;
const PARTY_NIGHT_CHAT = ['chat-partying', 'music', 'laugh'] as const;
const DATE_CHAT = ['heart', 'chat-love'] as const;
/**
 * Of 46,000 students, two who pass on a path almost never know each other. So a share of those setting out are someone
 * a walker on screen knows, coming the other way along the same path: friends meet, an acquaintance waves, a crush or
 * an ex or a rival shows on a face.
 */
const MEET_UP = 0.25;
/** How many steps of the walker's path ahead of them the other one comes from. */
const MEET_AHEAD = 4;
/** How often the crowd looks for people meeting, and how close two must pass, in cells. */
const SOCIAL_EVERY_MS = 300;
const MEET_WITHIN = 0.55;
/** How long two stop to talk, and how long before anyone greets or reacts again. */
const TALK_MS = 3600;
const SOCIAL_REST_MS = 30_000;
/** How long an icon shows, and how often a party lingering together has something to say. */
const ICON_MS = 1700;
const PARTY_CHAT_MS = 3800;
/** The most icons over heads at once, by crowd step; none with Reduce effects. */
const ICONS_AT_STEP = [3, 5, 8, 12];
/** Over the head, in world pixels above the feet, and the icon's size against the card's. */
const ICON_LIFT = 40;
const ICON_SCALE = 0.5;
/** A greeting, a talk's topic and a passing face in a line of a regular's memory (DESIGN.md 63.9). */
const GREETING_WORDS: Record<string, string> = { wave: 'Waved at', highfive: 'High-fived', fistbump: 'Bumped fists with', hug: 'Hugged' };
const TOPIC_WORDS: Record<string, string> = {
  'chat-sports': 'sports',
  'chat-gaming': 'games',
  'chat-music': 'music',
  'chat-fitness': 'the gym',
  'chat-partying': 'a party',
  'chat-studying': 'class',
  'chat-art': 'art',
  'chat-fashion': 'clothes',
};
const PASSING_WORDS: Record<Reaction, (name: string) => string> = {
  heart: (name) => `Passed their crush, ${name}`,
  sweat: (name) => `Ran into their ex, ${name}`,
  anger: (name) => `Passed ${name}, their rival`,
  sparkle: (name) => `Caught the eye of ${name}`,
};

/** What a regular remembers passing someone (63.9): in the words for someone who picks on them, or whom they pick on (63.11). */
function passingWords(tie: TieSeen | null, reaction: Reaction, name: string): string {
  if (tie?.kind === KIND.bullied) return BULLYING_PASSING.bullied.replace('{name}', name);
  if (tie?.kind === KIND.bully) return BULLYING_PASSING.bully.replace('{name}', name);
  return PASSING_WORDS[reaction](name);
}

/** Does this student like parties, as the web has their interests? */
function likesParties(view: WebView, ref: StudentRef): boolean {
  const id = idIn(view, ref);
  return id >= 0 && ((view.identity[id]! >>> (18 + INTEREST.partying)) & 1) === 1;
}

/** Cells walked per second, before each walker's own pace. */
const PACE = 0.85;
/** The feelings that show (DESIGN.md 64.3). A big bubble lasts longer than an everyday emote and is about 30 high. */
const BIG_MS = 2600;
const BIG_SCALE = 0.47;
const BIG_LIFT = 42;
const BIG_DELAY_MS = 900;
/** Big bubbles on screen at once, by crowd step: none when the frames are short. */
const BIGS_AT_ONCE = [0, 1, 2, 2];
/** A mood ring about 18 pixels across. */
const RING_SCALE = 0.86;
/** Riders (DESIGN.md 64.6): how high each stands on what they ride; a trick and a wipeout; where they park. */
const RIDE_LIFT: Record<Wheel, number> = { bike: 9, skateboard: 3, longboard: 3, kick: 4, escooter: 5, skates: 1 };
const TRICK_MS = 450;
const WIPEOUT_MS = 1700;
const RACK_REACH = 4;
const RACK_HOLDS = 4;
const LEANING_MOST = 10;
const PARKED_MS: readonly [number, number] = [45_000, 90_000];
/** A step one way on the map, for each way a walker faces. */
const STEP_OF: Record<WalkDirection, readonly [number, number]> = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
/** Where the canopy's lower edge is on the umbrella picture, from its top. */
const UMBRELLA_RIM = 0.55;
/** The most walkers carrying something at once, by crowd step (DESIGN.md 64.3): each is one more thing to draw. */
const HELD_AT_STEP = [0, 24, 40, 64];
/** The most mood rings at once, by crowd step: on a crowded path the first to come keep theirs. */
const RINGS_AT_STEP = [0, 36, 60, 96];
const UMBRELLA_TINTS = [0xffffff, 0x9cc8ff, 0xb4f0a0, 0xe2b4ff, 0xffffff];
/** How often a couple out together shows a heart, and how many of those are a kiss on the cheek. */
const HEART_EVERY_MS = 6000;
const KISS_SHARE = 0.18;
const FELT_KEPT = 4000;
const TICKS_A_DAY = 24 * 60;
const STILL_POSE: Pose = { lift: 0, shake: 0, squash: 1 };
/** How far a pacing student walks up and back, in cells: a few steps, along the way they came (DESIGN.md 69.1). */
const PACING_REACH = 0.6;
/** How far a rider steps aside round someone in the way, in cells: with their own place on the path (at most 0.22 off
 * its middle) it keeps them inside the path's cell (DESIGN.md 69.1, 69.5). */
const RIDER_WEAVE = 0.24;
/**
 * The bike path (DESIGN.md 71). A rider takes it when the way along it is no more than this many times the walk (and two
 * cells), and rides at least this many of its cells; the search counts a cell of it as this share of a footpath's, so a
 * way along it wins over a slightly shorter one along the footpaths. Along it a rider goes this much faster, and keeps
 * nearer its middle than a walker does to a path's.
 */
const LANE_DETOUR = 1.3;
const LANE_LEAST = 3;
const LANE_COST = 2;
const PATH_COST = 3;
const LANE_PACE = 1.12;
const LANE_SIDE = 0.4;
/** A scuffle's dust cloud (DESIGN.md 64.4): a moment after the argument, for this long. A fall into a fountain lasts this long. */
export const DUST_FROM_MS = 900;
export const DUST_MS = 2800;
const FOUNTAIN_MS = 2600;
/** What a big moment adds to the student's day on their card. */
const BIG_WORDS: Record<BigMoment, string> = {
  heartbreak: 'Still upset about the break-up',
  kiss: 'Kissed their partner on the cheek',
  win: 'Celebrated the home win',
  argue: 'Had words with someone',
  bid: 'Got a bid from a chapter',
  fail: 'Got a bad grade back',
  ring: 'Proposed at commencement',
};
/** Of those leaving a place to eat, the share carrying a tray or a cup; of those going to a quad, the share with a dog (DESIGN.md 64). */
const CARRY_FROM_FOOD = 0.55;
const DOG_WALKERS = 0.04;
/** In the morning rush people hurry. */
const HURRY: Record<DayPeriod, number> = { morning: 1.2, afternoon: 1, evening: 0.95, night: 0.9 };
/** Routes on campus longer than this many cells are skipped, so nobody treks across the whole map. */
const MAX_ROUTE_CELLS = 36;
/** A walk in from town can be longer: a street, the avenue, and the path to class. */
const MAX_COMMUTE_CELLS = 90;
const FADE_MS = 260;
const SPAWN_EVERY_MS = 120;
/** [T] A class change on (DESIGN.md 75.2): this full or more, and most new walkers come out of lecture halls and dorms, a little quicker. */
const PASSING_FROM = 0.15;
const CHANGE_FROM_DOORS = 0.8;
const CHANGE_HURRY = 1.15;
/** [T] More in view than the hour wants by this much, and those with furthest to go head in (75.2); this many spots of their way left at least. */
const OVER_HOUR = 1.25;
const THIN_FROM_LEGS = 6;
/** [T] How many a second head in: the extra over this many seconds, at least one and at most six a second. */
const THIN_PER_SECOND = [1, 6] as const;
const THIN_OVER_SECONDS = 8;
const OFFSCREEN_LIMIT_MS = 3500;
/**
 * Nobody appears or disappears in view (DESIGN.md 69.2, the owner's "they gotta come out of a house/building"): how far
 * beyond the view's edge, in world pixels, a figure is out of sight, and how many cells a way on or off is looked for.
 */
const OUT_OF_SIGHT_PX = 44;
const AFOOT_CELLS = 4000;
/** Ground uncovered by a pan or the first look is fresh until the view has been still this long, in milliseconds. */
const FRESH_MS = 1200;
/** The families of hand-placed buildings with a door to come out of; flat ones (courts, lawns) have none. */
const DOOR_FAMILIES: ReadonlySet<string> = new Set(['library', 'dining', 'store', 'recreation', 'tutoring', 'medical', 'safety', 'landmark', 'reward', 'era', 'lab', 'chapter']);
/** Commuters out at once for this many who walk in, before the time of day, and the most there can be. */
const WALKERS_IN_PER_COMMUTER = 14;
const MAX_COMMUTERS = 26;
/** How many of them are out in each part of the day, and the share heading for campus. */
const COMMUTE: Record<DayPeriod, { busy: number; inbound: number }> = {
  morning: { busy: 1.7, inbound: 0.92 },
  afternoon: { busy: 0.5, inbound: 0.5 },
  evening: { busy: 1.4, inbound: 0.1 },
  night: { busy: 0.12, inbound: 0.1 },
};
/** Townspeople out on the streets in each part of the day. */
const NEIGHBOURS_OUT: Record<DayPeriod, number> = { morning: 7, afternoon: 6, evening: 7, night: 1 };
/** How far from the middle of a street the middle of its sidewalk runs (DESIGN.md 59.1). */
const SIDEWALK = 0.5 - KERB_MIDDLE;
/** On the rivalry game day, this share of the fans walking to the game are the rival's (DESIGN.md 77.1). */
const AWAY_SHARE = 0.3;
/** A rally finds its lawn within this many cells of the lecture hall's door (DESIGN.md 76.4). */
const RALLY_REACH = 7;
/** A scene at a door stands no more than this many steps from it, and a building in front counts as this many steps. */
const STAND_REACH = 3;
const STAND_HIDDEN = 2.5;
/** The cells in front of a cell on the screen, in the view's cells, and how much a building on each hides it. */
const IN_FRONT: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0.6],
  [0, 1, 0.6],
  [1, 1, 1],
  [2, 1, 0.5],
  [1, 2, 0.5],
  [2, 2, 0.6],
];
/** Which sidewalk of its street a house is on: -1 above the street on the map, 1 below. */
const sideOf = (house: Stop): number => (house.row !== undefined && house.cell.y < house.row ? -1 : 1);
/** A tour ambles. */
const TOUR_PACE = 0.6;
/** On a home game day this share of walkers setting out are going to the stadium, and this many times the usual crowd is out. */
const FAN_SHARE = 0.65;
const GAME_DAY_CROWD = 1.5;
/** How far behind the one in front each member of a tour walks, in milliseconds. */
const TOUR_GAP_MS = 750;
/** An orientation group in welcome week: a leader and this many in all (R2). */
const ORIENTATION_SIZE = 8;

type StopKind = 'building' | 'quad' | 'gate' | 'place' | 'house';
/** What a place is for, which decides when people go there. */
type Use = 'food' | 'play' | 'seat' | 'office' | 'other';

interface Spot {
  x: number;
  y: number;
  /** The crossing the walk up to this spot goes over: they wait before it while a car has that crossing. */
  cross?: number;
}

interface Stop {
  kind: StopKind;
  /** The name of a place, for the student card. */
  name?: string;
  use?: Use;
  /** A place that lies flat, such as a court: people walk onto it. */
  flat?: boolean;
  zone: Zone | null;
  /** The cell the stop is on. */
  cell: Spot;
  /** Index of the path or street cell beside it. */
  door: number;
  /** A house: the row of its street, and whether students who walk in live on it. */
  row?: number;
  commuters?: boolean;
  /** The middle of a place that covers more than one cell. */
  middle?: Spot;
  /** A hand-placed building: which one, and its family, so staff can be told whose they are. */
  placedId?: number;
  family?: string;
  /** A house: the neighbourhood it stands in. */
  hood?: number;
}

/** What a walker can be given beyond the usual: who they are, how they look, and where exactly they walk. */
interface Extra {
  person?: PersonRef;
  look?: number;
  route?: Spot[];
  pace?: number;
  /** A sprite drawn beside them, because no figure can hold anything: the guide's pennant. */
  prop?: string;
  /** The prop is held in front of them, a tray or a cup, not stood beside (DESIGN.md 64). */
  held?: boolean;
  /** Where a held thing is: at the waist, up by the face, over the head, on the back (DESIGN.md 64.3). */
  hold?: Hold;
  /** Walking with someone (DESIGN.md 63.8): which leg of the route, where on it, their party and their place in it. */
  leg?: number;
  at?: { x: number; y: number };
  party?: number;
  place?: readonly [number, number];
}

interface Walker {
  sprite: Phaser.GameObjects.Image;
  /** A student, a commuter (also a student), a neighbour from the town, or one of the people who work at or visit the campus. */
  kind: 'student' | 'commuter' | 'neighbour' | 'professor' | 'staff' | 'guide' | 'parent' | 'booster';
  /** The student this is, or null for everyone else. */
  student: StudentRef | null;
  /** Who this is, when they are not a student and have a card. */
  person: PersonRef | null;
  /** Something drawn beside them. */
  prop: Phaser.GameObjects.Image | null;
  /** True when the prop is carried in front of them: a tray or a cup from a place to eat. */
  held: boolean;
  /** The prop is a dog on a walk, which faces the way they go. */
  dog: boolean;
  /** Where a held prop is drawn (DESIGN.md 64.3). */
  hold: Hold;
  /** How they feel, as it shows (DESIGN.md 64.3): how they move and the ring at their feet, or null for anyone else. */
  feel: Feel | null;
  /** The ring at their feet, while it shows. */
  ring: Phaser.GameObjects.Image | null;
  /** Their own offset in time, so no two move together. */
  phase: number;
  /** Until when they laugh (bounce and shake) or cheer (jump), on the scene's clock. */
  laughUntil: number;
  cheerUntil: number;
  /** In a crowd moment (DESIGN.md 64.4): how long to stand once at their place by it, the way on after, what they face. */
  watchMs: number;
  /** On their way off the screen or in at a door (69.2): when they get there they are gone. */
  exiting: boolean;
  resume: Spot[] | null;
  faceAt: { x: number; y: number } | null;
  /** One of the moment's own people until then: not a watcher. */
  momentUntil: number;
  /** Times their walk: running over to see a dust-up or a chase (DESIGN.md 76.5), 1 otherwise. */
  rush: number;
  /** In a dust cloud, kneeling, or standing in a fountain, until then; `fallOnArrive` sends them in at the end of the way. */
  hiddenUntil: number;
  kneelUntil: number;
  fallUntil: number;
  fallOnArrive: boolean;
  cropped: boolean;
  /** On wheels (DESIGN.md 64.6): what they ride and its picture, their small moment on the trip and when, the sideways
   * step they take round someone in the way, and until when they are down after a wipeout. */
  wheel: Wheel | null;
  wheelSprite: Phaser.GameObjects.Image | null;
  ride: RideMoment | null;
  rideAt: number;
  rideDone: boolean;
  weave: number;
  /** On a way along the bike path (DESIGN.md 71): a little faster once they ride. */
  laned: boolean;
  /** The way the figure is drawn facing and since when: it turns at most once in `FACE_HOLD_MS` (DESIGN.md 69.1). */
  shownDir: WalkDirection;
  shownDirAt: number;
  /** Pacing while stopped (69.1): where they stopped, the way back along their route, and how far; and whether they are
   * stepping this moment, so the walk frames show. */
  paceAnchor: { x: number; y: number; ux: number; uy: number; reach: number } | null;
  pacingStep: boolean;
  /** When an angry student next shows the anger mark (69.1). */
  angerAt: number;
  downUntil: number;
  key: string | null;
  look: number;
  /** Where this trip began. */
  from: Stop;
  route: Spot[];
  leg: number;
  x: number;
  y: number;
  pace: number;
  direction: WalkDirection;
  stride: number;
  alpha: number;
  fading: 'in' | 'out' | null;
  lingerMs: number;
  /** Where the route ends. A quad means linger and walk on. */
  goal: Stop | null;
  offscreenMs: number;
  shownKey: string;
  /** True while the figure is drawn in the school's colour. */
  tinted: boolean;
  /** A rival fan, in the rival's colour, on the rivalry game day (DESIGN.md 77.1). */
  away: boolean;
  /** The party they walk with, or 0 for nobody, and their place in it: across the path and behind, in cells. */
  party: number;
  place: readonly [number, number];
  /** Stopped to talk with someone met on a path, for this long, and with whom. */
  talkMs: number;
  talkWith: StudentRef | null;
  /** When they may next greet, react or talk. */
  socialAt: number;
}

/** An icon over someone's head: a greeting, a chat bubble or a reaction (DESIGN.md 63.8). */
interface Icon {
  walker: Walker;
  key: string;
  /** A big moment's bubble (DESIGN.md 64.3): bigger, longer, and popped in. */
  big: boolean;
  startAt: number;
  endAt: number;
  image: Phaser.GameObjects.Image | null;
}

interface Banner {
  text: Phaser.GameObjects.Text;
  ageMs: number;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * What a walker carries (DESIGN.md 64): a tray or a cup on the way from somewhere to eat, now and then a dog on the way
 * to a quad. Only for show.
 */
function carried(from: Stop, to: Stop, period: DayPeriod): Extra {
  if (from.use === 'food' && Math.random() < CARRY_FROM_FOOD) return { prop: period === 'morning' || Math.random() < 0.4 ? 'room.cup' : 'prop.tray', held: true, hold: 'waist' };
  if (to.kind === 'quad' && period !== 'night' && Math.random() < DOG_WALKERS) return { prop: 'prop.dog' };
  return {};
}

/** The way to face from one point of the map to another, as the walk chooses it. */
function facing(dx: number, dy: number): WalkDirection {
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
}

/** Interests by name, in the order of the web's identity bits. */
const INTEREST_NAMES = Object.keys(INTEREST) as Array<keyof typeof INTEREST>;

/** Where a held thing is drawn on a walker (DESIGN.md 64.3). */
type Hold = 'waist' | 'face' | 'over' | 'back';

/** How a student feels, as the walk shows it. */
interface Feel {
  motion: Motion;
  ring: string | null;
}

/** What is kept of a student's feeling for the hour: it, its motion, and what a big moment needs to know. */
interface Known {
  emotion: Emotion;
  reasons: readonly string[];
  motion: Motion;
  chapter: string | null;
  classYear: number;
  gpa: number;
  quirk: string;
}

/** One end of a trip, as what a student carries reads it. */
function tripEnd(stop: Stop): Trip['from'] {
  if (stop.use === 'food') return 'food';
  if (stop.use === 'play') return 'play';
  if (stop.kind === 'quad') return 'quad';
  if (stop.kind === 'house' || stop.zone === 'housing') return 'home';
  if (stop.zone === 'academic') return 'class';
  return 'other';
}

function pick<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

/** Pick one of several lists by weight, leaving out the empty ones. */
function pickWeighted(choices: ReadonlyArray<readonly [readonly Stop[], number]>): readonly Stop[] {
  let total = 0;
  for (const [list, weight] of choices) if (list.length > 0) total += weight;
  if (total <= 0) return [];
  let at = Math.random() * total;
  for (const [list, weight] of choices) {
    if (list.length === 0) continue;
    at -= weight;
    if (at < 0) return list;
  }
  return [];
}

export class Walkers {
  private walkers: Walker[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private banners: Banner[] = [];
  private width = 0;
  private height = 0;
  /** Campus paths and crossings. */
  private isPath: boolean[] = [];
  /** Paths, crossings and the town's streets: what someone walking in from town can use. */
  private isWalk: boolean[] = [];
  private isCrossing: boolean[] = [];
  private isStreet: boolean[] = [];
  /** Ground anyone may stand on or cross on foot off a path (DESIGN.md 69.5): a path, a quad, open grass, an empty
   * lot. Never a building's footprint, a placed thing, a tree, a road or the town. */
  private isOpen: boolean[] = [];
  /** Where anyone may walk on or off the screen (69.2): open ground, streets and crossings. */
  private isAfoot: boolean[] = [];
  /** The bike path (DESIGN.md 71): its own cells and its crossings. Riders take them; walkers only cross at crossings. */
  private isLane: boolean[] = [];
  /** A footpath with a bike lane painted on it (DESIGN.md 74). */
  private isPainted: boolean[] = [];
  /** A bike path, its crossings, or a painted walk: where riders ride a lane. */
  private isRideLane: boolean[] = [];
  /** How the painted lane looks, which says where riders and walkers keep on it: `LANE_LOOK`, or a dev option's. */
  look: 'a' | 'b' = LANE_LOOK;
  /** Where a rider may ride: the footpaths and the bike path; and on a trip from the town, its streets as well. */
  private isRide: boolean[] = [];
  private isRideTown: boolean[] = [];
  private laneCells = 0;
  /** Every door anyone could come out of, by its path or street cell, to the point at the building's edge (69.2). */
  private doorAt = new Map<number, Spot>();
  /** The view at the last top-up: ground outside it has just come into sight, and may be found already busy (69.2). */
  private knownView: { x: number; y: number; right: number; bottom: number } | null = null;
  private space = searchSpace(0);
  /** The view at the last top-up and when it last moved, for what counts as fresh. */
  private viewAt = { x: NaN, y: NaN, width: NaN };
  private movedAt = -Infinity;
  /** Where the junctions and the marked crossings are (src/app/traffic.ts). */
  private plan: TrafficPlan | null = null;
  private pathCells = 0;
  private stops: Stop[] = [];
  private gates: Stop[] = [];
  /** Every house in the town, and those whose students walk in. */
  private houses: Stop[] = [];
  private commuterHouses: Stop[] = [];
  /** Students who walk in from town, as the simulation counts them. */
  private walkingIn = 0;
  private students = 0;
  private spawnClock = 0;
  private socialClock = 0;
  private partySeq = 0;
  /** A party that is a scene (DESIGN.md 63.11): a date, or a party night. */
  private partyScene = new Map<number, 'date' | 'party'>();
  /** Where a party goes next, chosen by the first of them to leave, so the rest go too. */
  private partyNext = new Map<number, { from: Stop; goal: Stop; route: Spot[] }>();
  /** When each party lingering together next has something to say. */
  private partyChatAt = new Map<number, number>();
  private icons: Icon[] = [];
  /** The social crowd (DESIGN.md 63.8), on unless the dev page turns it off to measure what it costs. */
  private social = true;
  /** Told what happened to a student on the map, in a line for their memory if they are a regular (63.9). */
  onMemory: ((ref: StudentRef, text: string) => void) | null = null;
  private iconPool: Phaser.GameObjects.Image[] = [];
  private townClock = 0;
  /** Arrivals still to step onto the map: each is a route and a delay. */
  private queue: Array<{ from: Stop; to: Stop; inMs: number; student: StudentRef | null; kind?: Walker['kind']; extra?: Extra }> = [];
  /** Faculty and staff on the payroll: how many professors and staff there are to be seen. */
  private faculty = 0;
  private staffOnBooks = 0;
  private readonly people: PeopleSpec | null;
  private state: GameState | null = null;
  /** The students walkers are drawn from. */
  private everyone: StudentRef[] = [];
  /** Those of them who live in town. */
  private offCampus: StudentRef[] = [];
  /** Who lives in each dorm, by the dorm's cell. */
  private residents = new Map<number, StudentRef[]>();
  /** Each resident's dorm cell, by student key. */
  private homes = new Map<string, number>();
  private stopAt = new Map<number, Stop>();
  /** Students out walking now, so nobody is in two places. */
  private out = new Set<string>();
  /** Students standing somewhere for a while, in a game, a line or a small scene. They are not sent walking as well. */
  private elsewhere: ReadonlySet<string> = new Set();
  /** Crossing cells with somebody on them this frame. Cars wait for them. */
  private crossingNow = new Set<number>();
  private marked: string | null = null;
  private ring: Phaser.GameObjects.Ellipse | null = null;
  /** The part of the player's own day. It sets how many are out and where they go. */
  private period: DayPeriod = 'afternoon';
  private weekend = false;
  /** The hour shown and the kind of day (DESIGN.md 75): the class changes, the meal rushes, where people head. */
  private hour = 15;
  private day: DayFacts = ORDINARY_DAY;
  /** The school's colour while a home game is on, laid over the fans walking to it. null on any other day. */
  private fanTint: number | null = null;
  /** The rival's colour, softened, on the rivalry game day at home: some of the fans are theirs (DESIGN.md 77.1). */
  private awayTint: number | null = null;
  /** The feelings that show (DESIGN.md 64.3): each student's for the hour, the rings put away, today's news, the sky. */
  private felt = new Map<string, Known | null>();
  private feltStamp = '';
  private ringPool: Phaser.GameObjects.Image[] = [];
  private ringsShown = 0;
  private markedOnTop = false;
  /** Welcome week or parents' weekend (R2), when it is one. */
  private week: 'welcome' | 'parents' | null = null;
  /** Tonight's parties (L6), from the lawns. */
  private partySpots: ReadonlyArray<{ x: number; y: number }> = [];
  private markedParty = 0;
  /** Bike racks on the map (DESIGN.md 64.6), and the bikes parked at them or leaning on walls. */
  private racks: Array<{ id: number; x: number; y: number }> = [];
  private parked: Array<{ image: Phaser.GameObjects.Image; rack: number; until: number; from: number }> = [];
  private bigShown = new Set<string>();
  private today: Today = { homeWin: false, bids: false, exams: false };
  private weather: Weather = 'clear';
  private partyCouple = new Set<number>();
  private heartAt = new Map<number, number>();
  /** Read once a frame from the setting. */
  private rings = true;
  /** The share of the usual crowd that is out. */
  private presence = 1;
  /** The share of the walking crowd sitting on the lawns instead (DESIGN.md 64): more doing than walking in fine weather. */
  private resting = 0;
  /** The stadium's gate, when a path reaches the plot. People go there on a home game day only. */
  private stadiumStop: Stop | null = null;
  /** The crowd step in force: the player's setting, or lower while frames are short. */
  private step = 2;
  /** How the Chaos meter shows in the crowd (DESIGN.md 76.5): strangers who bump and glare. */
  private chaos: ChaosCrowd = NO_CHAOS;
  /** How much a pennant sways, from 0 for still. */
  private wind = 0;
  /** Everyone on screen at the last frame, for the sound of the crowd. */
  private seenAll = 0;
  private crowdSeen = { students: 0, wanted: 0 };
  /** Walkers owed a turn indoors when there are too many for the hour (75.2): a fraction carried between top-ups. */
  private thinBudget = 0;
  /** Asked before stepping onto a crossing: is a car on it, or driving onto it? */
  private carOn: (cell: number) => boolean = () => false;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {
    this.people = art.people;
  }

  /** Told by the map when the hour moves into another part of the day. */
  setPeriod(period: DayPeriod): void {
    this.period = period;
  }

  /** Told by the map: the hour shown, the player's own or the "View at" slider's, and the kind of day (DESIGN.md 75). */
  setHour(hour: number, day: DayFacts): void {
    this.hour = hour;
    this.day = day;
  }

  /** How full of a class change the paths are now, from 0 to 1 (75.2). */
  private passing(): number {
    return passingAt(this.hour, this.day);
  }

  /** Told by the map: a Saturday or Sunday in the game's calendar is quieter. */
  /**
   * A home game day: fans walk to the stadium in the school's colour, and
   * more people are out. null when no game is on.
   */
  /** The rivalry at home (DESIGN.md 77.1): a share of the fans walking to the game are the rival's, in its colour. */
  setAwayFans(tint: number | null): void {
    this.awayTint = tint;
  }

  setGameDay(tint: number | null): void {
    this.fanTint = tint;
  }

  /** The share of the usual crowd that is out: a quarter on a break, fewer in the summer term. */
  /** The share of the crowd that is on the lawns instead of walking, from the lawns' rule (DESIGN.md 64). */
  setResting(share: number): void {
    this.resting = Math.max(0, Math.min(0.6, share));
  }

  setPresence(share: number): void {
    this.presence = Math.max(0, Math.min(1, share));
  }

  /** True while the stadium's gate is on screen. The sound of a game is loudest there. */
  get stadiumSeen(): boolean {
    const stop = this.stadiumStop;
    return !!stop && this.inView(this.scene.cameras.main.worldView, stop.cell.x + 0.5, stop.cell.y + 0.5, 200);
  }

  setWeekend(weekend: boolean): void {
    this.weekend = weekend;
  }

  /** The crowd step to show: 0 is sparse, 1 Low, 2 Normal, 3 High. */
  /** How the Chaos meter shows in the crowd (DESIGN.md 76.5). */
  setChaos(chaos: ChaosCrowd): void {
    this.chaos = chaos;
  }

  setStep(step: number): void {
    this.step = Math.max(0, Math.min(CROWD_STEPS.length - 1, step));
  }

  /** Walkers wait at the kerb while this says a car is on the crossing ahead. */
  watchCars(busy: (cell: number) => boolean): void {
    this.carOn = busy;
  }

  /** How much things sway in the wind. 0 with Reduce effects on. */
  setWind(wind: number): void {
    this.wind = wind;
  }

  /** Everyone on screen now: students, staff, visitors and neighbours. */
  get onScreen(): number {
    return this.seenAll;
  }

  /** Students in view and how many the hour wants there, at the last top-up. For the dev console and probes. */
  get crowdNow(): { students: number; wanted: number } {
    return this.crowdSeen;
  }

  /** Is this spot on the road itself, at a crossing or a junction? */
  private onRoad(x: number, y: number): boolean {
    const cell = Math.floor(y) * this.width + Math.floor(x);
    if (this.isCrossing[cell]) return true;
    return !!this.plan && onRoadway(this.plan, x, y) >= 0;
  }

  /** True while somebody is walking over that crossing, or stepping onto it. */
  onCrossing(cell: number): boolean {
    return this.crossingNow.has(cell);
  }

  // ------------------------------------------------------------- the map --

  /** Read the paths, buildings, quads and the town again. Called whenever the map changes. */
  setMap(state: GameState): void {
    this.racks = [];
    for (const placed of state.map.placed) if (placed && placed.type === 'rack') this.racks.push({ id: placed.id, x: placed.x + 0.5, y: placed.y + 0.5 });
    const { width, height, cells, buildings } = state.map;
    this.width = width;
    this.height = height;
    // The crowd drawn follows the real enrollment, up to the limits that already hold it: the Crowd density setting, the caps of each step and the frame budget (DESIGN.md 35.9).
    this.students = enrollment(state);
    const onBooks = peopleCounts(state);
    this.faculty = onBooks.faculty;
    this.staffOnBooks = onBooks.staff;
    this.isPath = cells.map((cell) => isPathKind(cell.kind));
    this.isStreet = cells.map((cell) => cell.kind === 'street');
    this.isCrossing = cells.map((cell) => cell.kind === 'crossing');
    this.plan = planTraffic(this.width, this.height, cells.map((cell) => cell.kind), TOWN_X);
    this.isWalk = cells.map((cell, i) => this.isPath[i]! || cell.kind === 'street');
    // A court, a field or a pool is flat ground people walk on to; nothing else hand-placed is.
    const flatGround = (cell: (typeof cells)[number]): boolean => {
      const placed = cell.kind === 'placed' && cell.placedId !== null ? state.map.placed[cell.placedId] : null;
      return !!placed && PLACED[placed.type].flat && PLACED[placed.type].family === 'recreation';
    };
    this.isOpen = cells.map((cell, i) => this.isPath[i]! || cell.kind === 'quad' || cell.kind === 'empty' || (cell.kind === 'lot' && cell.buildingId === null) || flatGround(cell));
    this.isAfoot = cells.map((cell, i) => this.isOpen[i]! || cell.kind === 'street' || cell.kind === 'crossing');
    this.isLane = cells.map((cell) => isBikeKind(cell.kind));
    this.isPainted = cells.map((cell) => cell.kind === 'path' && cell.lane !== undefined);
    this.isRideLane = cells.map((_, i) => this.isLane[i]! || this.isPainted[i]!);
    this.isRide = cells.map((cell, i) => this.isPath[i]! || cell.kind === 'bike');
    this.isRideTown = cells.map((cell, i) => this.isWalk[i]! || cell.kind === 'bike');
    this.laneCells = this.isRideLane.reduce((n, yes) => n + (yes ? 1 : 0), 0);
    if (this.space.seen.length !== width * height) this.space = searchSpace(width * height);
    this.pathCells = this.isPath.reduce((n, yes) => n + (yes ? 1 : 0), 0);

    const doorOf = (x: number, y: number): number => {
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (this.isPath[ny * width + nx]) return ny * width + nx;
      }
      return -1;
    };

    this.state = state;
    this.everyone = sampleStudents(state);
    this.offCampus = [];
    this.residents.clear();
    this.homes.clear();
    const housing = placeIndex(state, 'housing');
    for (const ref of this.everyone) {
      const home = studentHome(state, ref, housing);
      if (home === null) {
        this.offCampus.push(ref);
        continue;
      }
      this.homes.set(studentKey(ref), home);
      const list = this.residents.get(home);
      if (list) list.push(ref);
      else this.residents.set(home, [ref]);
    }

    this.stops = [];
    this.stadiumStop = null;
    this.gates = [];
    this.stopAt.clear();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const cell = cells[i]!;
        if (cell.kind === 'lot' && cell.buildingId !== null) {
          const building = buildings[cell.buildingId];
          if (!building || building.stage < 1) continue;
          const door = doorOf(x, y);
          if (door >= 0) {
            const stop: Stop = { kind: 'building', zone: building.zone, cell: { x, y }, door };
            this.stops.push(stop);
            this.stopAt.set(i, stop);
          }
        } else if (cell.kind === 'quad') {
          const door = doorOf(x, y);
          if (door >= 0) this.stops.push({ kind: 'quad', zone: null, cell: { x, y }, door });
        } else if (isPathKind(cell.kind)) {
          // A path that stops dead is a way onto campus.
          let links = 0;
          for (const [dx, dy] of NEIGHBOURS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && this.isPath[ny * width + nx]) links += 1;
          }
          if (links === 1) this.gates.push({ kind: 'gate', zone: null, cell: { x, y }, door: i });
        }
      }
    }

    // Places to eat, shop, sit and play, when a path reaches them.
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const spec = PLACED[placed.type];
      // Places to go: not ponds, car parks, bins, the yard, or the offices people are sent from. The
      // Administration building is where staff work: they go there, and students do not.
      if (['water', 'parking', 'bin', 'yard', 'medical', 'safety'].includes(spec.family)) continue;
      // The stadium is somewhere to go on a home game day only. Its gate is the path cell beside the plot.
      if (spec.family === 'athletics') {
        for (let cy = placed.y; cy < placed.y + placed.h && !this.stadiumStop; cy++) {
          for (let cx = placed.x; cx < placed.x + placed.w && !this.stadiumStop; cx++) {
            const door = doorOf(cx, cy);
            if (door >= 0) this.stadiumStop = { kind: 'place', name: 'the stadium', use: 'play', zone: null, cell: { x: cx, y: cy }, door, placedId: placed.id, family: spec.family };
          }
        }
        continue;
      }
      if (spec.family === 'landmark' && placed.type !== 'admin') continue;
      const use: Use =
        spec.family === 'landmark' ? 'office' : spec.family === 'recreation' ? 'play' : spec.family === 'seat' ? 'seat' : spec.family === 'dining' || spec.family === 'store' ? 'food' : 'other';
      let found = false;
      for (let cy = placed.y; cy < placed.y + placed.h && !found; cy++) {
        for (let cx = placed.x; cx < placed.x + placed.w && !found; cx++) {
          const door = doorOf(cx, cy);
          if (door < 0) continue;
          this.stops.push({
            kind: 'place',
            name: spec.name,
            use,
            flat: spec.flat,
            zone: null,
            cell: { x: cx, y: cy },
            door,
            middle: { x: placed.x + placed.w / 2, y: placed.y + placed.h / 2 },
            placedId: placed.id,
            family: spec.family,
          });
          found = true;
        }
      }
    }

    // The town: every house, and the ones students walk in from.
    this.houses = [];
    this.commuterHouses = [];
    this.walkingIn = 0;
    const living = townLiving(state);
    for (const hood of state.map.town.neighbourhoods) {
      const here = living[hood.id];
      const walks = !!here && here.mode === 'walk' && here.living > 0;
      if (walks) this.walkingIn += here.living;
      hood.plots.forEach((plot, n) => {
        const door = hood.row * width + plot.x;
        if (!this.isStreet[door]) return;
        const stop: Stop = { kind: 'house', zone: null, cell: { x: plot.x, y: plot.y }, door, row: hood.row, hood: hood.id, commuters: walks && n < (here?.houses ?? 0) };
        this.houses.push(stop);
        if (stop.commuters) this.commuterHouses.push(stop);
      });
    }

    // Every door (69.2): the buildings on lots, the houses, and every hand-placed building that is not flat.
    this.doorAt.clear();
    const edge = (cx: number, cy: number, door: number): Spot => {
      const dx = (door % width) + 0.5;
      const dy = Math.floor(door / width) + 0.5;
      return { x: dx + (cx + 0.5 - dx) * 0.46, y: dy + (cy + 0.5 - dy) * 0.46 };
    };
    for (const stop of [...this.stops, ...this.houses]) {
      if (stop.kind === 'building' && !this.doorAt.has(stop.door)) this.doorAt.set(stop.door, edge(stop.cell.x, stop.cell.y, stop.door));
      if (stop.kind === 'house' && !this.doorAt.has(stop.door)) this.doorAt.set(stop.door, this.threshold(stop));
    }
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const spec = PLACED[placed.type];
      if (spec.flat || !DOOR_FAMILIES.has(spec.family)) continue;
      for (let cy = placed.y; cy < placed.y + placed.h; cy++) {
        for (let cx = placed.x; cx < placed.x + placed.w; cx++) {
          const door = doorOf(cx, cy);
          if (door >= 0 && !this.doorAt.has(door)) this.doorAt.set(door, edge(cx, cy, door));
        }
      }
    }

    // Anyone whose way ahead was dug up, or who stands where something was just built, walks off (69.2, 69.5).
    for (const walker of this.walkers) {
      if (walker.fading === 'out') continue;
      const here = Math.floor(walker.y) * width + Math.floor(walker.x);
      let cut = !this.isAfoot[here];
      for (let k = walker.leg; k < walker.route.length - 1 && !cut; k++) {
        const spot = walker.route[k]!;
        if (!this.isWalk[Math.floor(spot.y) * width + Math.floor(spot.x)]) cut = true;
      }
      if (cut) this.leave(walker, true);
    }
  }

  /** New students moving in: a group walks in from the edge of campus to the dorms. */
  arrive(count: number, banner = true): Array<{ x: number; y: number }> {
    if (!this.people || count <= 0) return [];
    const homes = this.stops.filter((stop) => stop.zone === 'housing');
    if (homes.length === 0) return [];

    const view = this.scene.cameras.main.worldView;
    const centre = { x: view.centerX, y: view.centerY };
    const distance = (stop: Stop): number => {
      const at = this.iso.toWorld(stop.cell.x + 0.5, stop.cell.y + 0.5);
      return Math.hypot(at.x - centre.x, at.y - centre.y);
    };
    // Come in by the way onto campus nearest to where the player is looking.
    const ways = this.gates.length > 0 ? this.gates : this.stops;
    const gate = [...ways].sort((a, b) => distance(a) - distance(b))[0];
    if (!gate) return [];

    const near = [...homes].sort((a, b) => distance(a) - distance(b)).slice(0, 6);
    const size = Phaser.Math.Clamp(Math.round(count / 6), 3, 18);
    const year = this.everyone[0]?.entryYear ?? 0;
    const taken = new Set<string>();
    for (let n = 0; n < size; n++) {
      const to = pick(near);
      if (!to) continue;
      let student: StudentRef | null = null;
      if (this.everyone.length > 0) {
        // The newest students who live in that dorm.
        const free = (this.residents.get(to.cell.y * this.width + to.cell.x) ?? []).filter(
          (ref) => this.free(ref) && !taken.has(studentKey(ref)),
        );
        const newest = free.filter((ref) => ref.entryYear === year);
        student = pick(newest.length > 0 ? newest : free) ?? null;
        if (!student) continue;
        taken.add(studentKey(student));
      }
      this.queue.push({ from: gate, to, inMs: n * 230, student });
      // Move-in day: every third newcomer has a parent beside them with the boxes. Nobody can carry anything,
      // so the boxes are drawn at the parent's side.
      const parent = this.people.roles?.parent;
      if (parent !== undefined && n % 3 === 0) {
        const who = Math.floor(Math.random() * 100_000);
        this.queue.push({ from: gate, to, inMs: n * 230 + 320, student: null, kind: 'parent', extra: { person: { role: 'parent', n: who }, look: parent + (who % 2), prop: 'people.boxes' } });
      }
    }

    // Welcome week's steady arrivals (R2) come without the banner: it is for a class arriving all at once.
    if (!banner) return near.map((stop) => ({ x: stop.cell.x, y: stop.cell.y }));
    const at = this.iso.toWorld(gate.cell.x + 0.5, gate.cell.y + 0.5);
    const text = this.scene.add
      .text(at.x, at.y - 40, `+${count} moving in`, {
        fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#16201b',
        strokeThickness: 7,
      })
      .setOrigin(0.5, 1)
      .setDepth(1_000_002);
    this.banners.push({ text, ageMs: 0 });
    // The dorms they are walking to, where the boxes are stacked.
    return near.map((stop) => ({ x: stop.cell.x, y: stop.cell.y }));
  }

  /**
   * Parents' weekend (R2, DESIGN.md 66): students show their families round, a parent a step behind them, from where
   * they live to somewhere to eat, a lawn or a sight of the campus, near where the player is looking.
   */
  visit(count: number, memory = "Showed their family round on parents' weekend"): void {
    const parent = this.people?.roles?.parent;
    if (parent === undefined || count <= 0) return;
    const view = this.scene.cameras.main.worldView;
    const near = (stop: Stop): boolean => {
      const at = this.iso.toWorld(stop.cell.x + 0.5, stop.cell.y + 0.5);
      return at.x > view.x - 200 && at.x < view.right + 200 && at.y > view.y - 200 && at.y < view.bottom + 200;
    };
    const homes = this.stops.filter((stop) => stop.zone === 'housing' && near(stop));
    const sights = this.stops.filter((stop) => near(stop) && (stop.kind === 'quad' || (stop.kind === 'place' && (stop.use === 'food' || stop.use === 'seat'))));
    if (homes.length === 0 || sights.length === 0) return;
    for (let n = 0; n < count; n++) {
      const from = pick(homes)!;
      const to = pick(sights)!;
      const student = pick((this.residents.get(from.cell.y * this.width + from.cell.x) ?? []).filter((ref) => this.free(ref)));
      if (!student) continue;
      this.queue.push({ from, to, inMs: n * 900, student });
      const who = Math.floor(Math.random() * 100_000);
      this.queue.push({ from, to, inMs: n * 900 + 420, student: null, kind: 'parent', extra: { person: { role: 'parent', n: who }, look: parent + (who % 2) } });
      if (this.onMemory) this.onMemory(student, memory);
    }
  }

  /** The week's own events (R2): welcome week's orientation groups, or none. */
  setWeek(week: 'welcome' | 'parents' | null): void {
    this.week = week;
  }

  // -------------------------------------------------------------- routes --

  /** Cells from one door to another over a set of walkable cells, or null when they do not join. */
  private pathBetween(from: number, to: number, walkable: readonly boolean[]): number[] | null {
    if (from === to) return [from];
    const { width, height } = this;
    const parent = new Int32Array(width * height).fill(-1);
    const queue = [from];
    parent[from] = from;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      if (i === to) break;
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!walkable[ni] || parent[ni] !== -1) continue;
        parent[ni] = i;
        queue.push(ni);
      }
    }
    if (parent[to] === -1) return null;
    const cells = [to];
    while (cells[cells.length - 1] !== from) cells.push(parent[cells[cells.length - 1]!]!);
    return cells.reverse();
  }

  /** The point where a stop meets its door: the edge of a lot, a spot on the lawn, a front garden, or the gate itself. */
  private threshold(stop: Stop): Spot {
    const door = { x: (stop.door % this.width) + 0.5, y: Math.floor(stop.door / this.width) + 0.5 };
    if (stop.kind === 'gate') return door;
    const centre = { x: stop.cell.x + 0.5, y: stop.cell.y + 0.5 };
    if (stop.kind === 'house') return { x: centre.x, y: centre.y + (door.y - centre.y) * 0.3 };
    // Buildings are entered at their edge, from just outside it (69.5: nobody stands inside a building's footprint). On
    // a quad, people stop on the near part of the lawn; on a court or a field, on its near part; at a bench, before it.
    const onto = stop.kind === 'quad' || (stop.kind === 'place' && stop.flat === true);
    const reach = onto ? 0.62 + Math.random() * 0.16 : stop.kind === 'place' && stop.use === 'seat' ? 0.42 : 0.46;
    return { x: door.x + (centre.x - door.x) * reach, y: door.y + (centre.y - door.y) * reach };
  }

  /** Where someone walks on a cell: to one side of a path, and along the sidewalk of a street. */
  private footing(cell: number, side: Spot, sidewalk: number): Spot {
    const x = cell % this.width;
    const y = (cell - x) / this.width;
    if (!this.isStreet[cell]) return { x: x + 0.5 + side.x, y: y + 0.5 + side.y };
    // The avenue runs up and down beside the campus: its campus side. A side street runs away from it.
    if (x <= TOWN_X) return { x: x + KERB_NEAR, y: y + 0.5 + side.y * 0.4 };
    return { x: x + 0.5 + side.x * 0.4, y: y + 0.5 + sidewalk * SIDEWALK };
  }

  private routeBetween(from: Stop, to: Stop): Spot[] | null {
    const town = from.kind === 'house' || to.kind === 'house';
    const cells = this.pathBetween(from.door, to.door, town ? this.isWalk : this.isPath);
    if (!cells || cells.length > (town ? MAX_COMMUTE_CELLS : MAX_ROUTE_CELLS)) return null;
    return this.spotsAlong(cells, from, to);
  }

  /**
   * Where someone goes over a walk with a lane painted on it (DESIGN.md 74): a rider on the lane's line, a walker on the
   * walk beside it. At look a the lane runs down the west half of a walk going north-south and the north half of one going
   * east-west, so the two lines meet in the cell's north-west quarter and walkers keep to its south-east: going along the
   * walk they keep their side, and going across it they cross the lane once, anywhere.
   */
  private paintedFooting(cell: number, riding: boolean, side: Spot): Spot {
    const x = cell % this.width;
    const y = (cell - x) / this.width;
    if (riding) return { x: x + LANE_LINE[this.look] + side.x * 0.12, y: y + LANE_LINE[this.look] + side.y * 0.12 };
    if (this.look === 'a') return { x: x + WALK_LINE.a + side.x * 0.35, y: y + WALK_LINE.a + side.y * 0.35 };
    // At look b, each to their own side of the middle lane.
    const sx = side.x >= 0 ? 1 : -1;
    const sy = side.y >= 0 ? 1 : -1;
    return { x: x + 0.5 + sx * 0.33 + side.x * 0.1, y: y + 0.5 + sy * 0.33 + side.y * 0.1 };
  }

  /**
   * The spots a trip passes over its cells: from the edge of where it starts to the edge of where it ends, each to one
   * side of its path, on a street on the sidewalk, over the avenue at its marked crossings. On the bike path (DESIGN.md
   * 71) a rider keeps nearer its middle.
   */
  private spotsAlong(cells: readonly number[], from: Stop, to: Stop, riding = false): Spot[] {
    // Each walker keeps a little to one side, so a crowd is not a single file.
    const side = { x: (Math.random() - 0.5) * 0.44, y: (Math.random() - 0.5) * 0.44 };
    const narrow = { x: side.x * LANE_SIDE, y: side.y * LANE_SIDE };
    // On a street they keep to the sidewalk of the house they are leaving or going to on that street, so nobody
    // crosses a street in the middle of a block.
    const rows = new Map<number, number>();
    for (const house of [from, to]) if (house.kind === 'house' && house.row !== undefined) rows.set(house.row, sideOf(house));
    const any = Math.random() < 0.5 ? -1 : 1;
    const route: Spot[] = [this.threshold(from)];
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      const x = i % this.width;
      const y = (i - x) / this.width;
      // Where a side street meets the avenue they cross at the marked crossing beside the junction, not through it.
      if (this.plan && this.isStreet[i] && x === TOWN_X && (cells[k - 1] === i + 1 || cells[k + 1] === i + 1)) {
        const sidewalk = rows.get(y) ?? any;
        route.push(...(cells[k - 1] === i + 1 ? avenueCrossing(this.plan, y, sidewalk, SIDEWALK) : avenueCrossingBack(this.plan, y, sidewalk, SIDEWALK)));
        continue;
      }
      if (this.isPainted[i]) {
        route.push(this.paintedFooting(i, riding, side));
        continue;
      }
      route.push(this.footing(i, this.isLane[i] ? narrow : side, rows.get(y) ?? any));
    }
    // People walk right onto a court or a field, to its middle. Anywhere else they stop at the edge.
    if (to.kind === 'place' && to.use === 'play' && to.flat && to.middle) {
      route.push({ x: to.middle.x + (Math.random() - 0.5) * 0.6, y: to.middle.y + (Math.random() - 0.5) * 0.6 });
    } else route.push(this.threshold(to));
    return route;
  }

  /** A student to step out of a stop: someone who lives there, when it is a dorm. */
  /** True for a student who is not on the map already: not out walking, and not standing in an activity or a scene. */
  private free(ref: StudentRef): boolean {
    const key = studentKey(ref);
    return !this.out.has(key) && !this.elsewhere.has(key);
  }

  /** Told by the map: who is standing in an activity or a small scene. */
  setElsewhere(staying: ReadonlySet<string>): void {
    this.elsewhere = staying;
  }

  /** True while that student is out walking. */
  isOut(key: string): boolean {
    return this.out.has(key);
  }

  private studentFor(from: Stop): StudentRef | null {
    if (from.zone === 'housing') {
      const here = this.residents.get(from.cell.y * this.width + from.cell.x) ?? [];
      return pick(here.filter((ref) => this.free(ref))) ?? null;
    }
    for (let tries = 0; tries < 8; tries++) {
      const ref = pick(this.everyone);
      if (ref && this.free(ref)) return ref;
    }
    return null;
  }

  /**
   * Somewhere to go next, by the hour (DESIGN.md 75): class in a class change, food at the meal rushes, the courts in
   * the afternoon, home at night. A student only ever goes home to their own dorm.
   */
  private destinationFrom(origin: Stop, student: StudentRef | null): Stop | undefined {
    // The student whose card is open, or who is followed, goes where their day says (DESIGN.md 63.9).
    if (student && studentKey(student) === this.marked) {
      const planned = this.plannedFrom(origin, student);
      if (planned) return planned;
    }
    // A home game: most of the campus is on its way to the stadium.
    if (this.fanTint !== null && this.stadiumStop && origin !== this.stadiumStop && Math.random() < FAN_SHARE) return this.stadiumStop;
    const others = this.stops.filter((stop) => stop !== origin);
    const classes = others.filter((stop) => stop.zone === 'academic');
    const quads = others.filter((stop) => stop.kind === 'quad');
    const places = others.filter((stop) => stop.kind === 'place');
    const play = places.filter((stop) => stop.use === 'play');
    const food = places.filter((stop) => stop.use === 'food');
    // Benches and tables are empty at night. A library or a store counts as somewhere to be; a chapter house is Greek Row.
    const sit = places.filter((stop) => (stop.use === 'seat' && this.period !== 'night') || (stop.use === 'other' && stop.family !== 'chapter'));
    const chapters = places.filter((stop) => stop.family === 'chapter');
    let homes: Stop[];
    if (student) {
      const home = this.stopAt.get(this.homes.get(studentKey(student)) ?? -1);
      homes = home && home !== origin ? [home] : [];
    } else {
      homes = others.filter((stop) => stop.zone === 'housing');
    }
    const from = origin.zone === 'housing' ? 'home' : origin.zone === 'academic' ? 'class' : 'out';
    // Where the hour sends people (DESIGN.md 75.2): to class in a class change, to food at the meal rushes, to the
    // courts and lawns in the afternoon, the gym, clubs and Greek Row in the evening, home at night.
    const heading = headingsAt(this.hour, this.day, from);
    let choice: readonly Stop[] = pickWeighted([
      [classes, heading.class],
      [food, heading.food],
      [play, heading.play],
      [sit, heading.seat],
      [quads, heading.quad],
      [homes, heading.home],
      [chapters, heading.greek],
    ]);
    if (choice.length === 0) choice = classes.length > 0 ? classes : quads.length > 0 ? quads : homes;
    return pick(choice);
  }

  // ------------------------------------------------------------- walkers --

  private inView(view: Phaser.Geom.Rectangle, x: number, y: number, margin: number): boolean {
    const at = this.iso.toWorld(x, y);
    return (
      at.x >= view.x - margin && at.x <= view.right + margin && at.y >= view.y - margin && at.y <= view.bottom + margin
    );
  }

  private start(from: Stop, to: Stop, partWay: boolean, student: StudentRef | null, kind: Walker['kind'] = 'student', extra: Extra = {}): boolean {
    const people = this.people;
    if (!people || this.walkers.length >= CROWD_STEPS[this.step]!.alive) return false;
    // Nobody is in two places: a student by who they are, anyone else by their own card.
    const key = student ? studentKey(student) : extra.person ? `p:${personKey(extra.person)}` : null;
    if (key !== null && (this.out.has(key) || this.elsewhere.has(key))) return false;
    let route = extra.route ?? this.routeBetween(from, to);
    if (!route || route.length < 2) return false;
    // A rider takes the bike path when it is on their way (DESIGN.md 71). Decided before they set out, so one already
    // part of the way along when the view fills is on it too.
    let laned = false;
    if (student && (kind === 'student' || kind === 'commuter') && !extra.route && !extra.at && !extra.prop && !extra.party) {
      const lane = this.laneRoute(student, kind === 'commuter', from, to, route);
      if (lane) {
        route = lane;
        laned = true;
      }
    }
    // Someone already part of the way along, so a view fills with people mid-stride.
    let leg = extra.leg ?? (partWay ? 1 + Math.floor(Math.random() * Math.max(1, route.length - 2)) : 1);
    // Nobody appears in view (DESIGN.md 69.2): on the screen, they come out of a door, or walk in from its edge along
    // a way from the nearest door or the edge to where they would have been. Ground just come into sight, at the first
    // look or after a pan, may already have people on it.
    const first = extra.at ?? route[leg - 1]!;
    let already = false;
    if (this.seen(first)) {
      already = this.fresh(first.x, first.y);
      // Out of a door: the route starts at the stop's own door, or (a route given) at a door's edge (69.2).
      const outOfDoor = leg === 1 && !extra.at && (extra.route ? this.atDoorEdge(route[0]!) : this.hasDoor(from));
      // Friends setting out with someone come out with them, from where they came out (63.8).
      const withLeader = extra.at !== undefined && leg === 1 && Math.hypot(extra.at.x - route[0]!.x, extra.at.y - route[0]!.y) < 0.05;
      if (!already && !outOfDoor && !withLeader) {
        if (extra.at) return false;
        const way = this.approach(first.x, first.y);
        if (!way) return false;
        route = [...way, ...route.slice(leg)];
        leg = 1;
      }
    }
    if (key !== null) this.out.add(key);

    const sprite = this.pool.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
    sprite.setVisible(true).setAlpha(0);
    let prop: Phaser.GameObjects.Image | null = null;
    if (extra.prop && this.art.has(extra.prop)) {
      prop = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(prop, extra.prop);
      fitOnMap(prop, extra.prop);
      // It stands on its own base, so it can sway about it.
      prop.setOrigin(0.5, 1).setAlpha(0);
    }
    const begin = extra.at ?? route[leg - 1]!;
    this.walkers.push({
      sprite,
      kind,
      student,
      person: extra.person ?? null,
      prop,
      held: extra.held ?? false,
      dog: extra.prop === 'prop.dog',
      hold: extra.hold ?? 'waist',
      feel: null,
      ring: null,
      phase: Math.random(),
      laughUntil: 0,
      cheerUntil: 0,
      watchMs: 0,
      resume: null,
      faceAt: null,
      momentUntil: 0,
      rush: 1,
      hiddenUntil: 0,
      kneelUntil: 0,
      fallUntil: 0,
      fallOnArrive: false,
      cropped: false,
      wheel: null,
      wheelSprite: null,
      ride: null,
      rideAt: 0,
      rideDone: false,
      weave: 0,
      laned,
      downUntil: 0,
      key,
      // A student's look is part of who they are. Anyone with a job wears it.
      look: extra.look ?? (student && this.state ? studentFigure(this.state, student, people) : everydayLook(people, Math.random(), Math.random())),
      from,
      route,
      leg,
      x: begin.x,
      y: begin.y,
      pace: extra.pace ?? PACE * (kind === 'neighbour' ? 0.9 : HURRY[this.period] * (this.passing() > PASSING_FROM ? CHANGE_HURRY : 1)) * (0.8 + Math.random() * 0.45),
      direction: 'se',
      shownDir: 'se',
      shownDirAt: -Infinity,
      paceAnchor: null,
      pacingStep: false,
      angerAt: this.scene.time.now + Math.random() * ANGER_MARK_MS.spread,
      stride: Math.random() * 1000,
      alpha: already ? 1 : 0,
      fading: already ? null : 'in',
      exiting: false,
      lingerMs: 0,
      goal: to,
      offscreenMs: 0,
      shownKey: '',
      tinted: false,
      away: false,
      party: extra.party ?? 0,
      place: extra.place ?? [0, 0],
      talkMs: 0,
      talkWith: null,
      socialAt: this.scene.time.now + SOCIAL_REST_MS * Math.random(),
    });
    sprite.clearTint();
    if (student) this.dress(this.walkers[this.walkers.length - 1]!, from, to);
    return true;
  }

  // ------------------------------------------------- feelings that show --

  /**
   * How a student walking out feels, as it shows (DESIGN.md 64.3): their motion and pace, the ring at their feet, what
   * they carry, and a big moment of their own if they have one today. Their feeling is stop 3's, kept for the hour.
   */
  private dress(walker: Walker, from: Stop, to: Stop): void {
    const state = this.state;
    const student = walker.student;
    if (!state || !student) return;
    const known = this.feelingOf(student);
    if (!known) return;
    walker.feel = { motion: known.motion, ring: RING[known.emotion] };
    walker.pace *= MOTION_PACE[known.motion];
    const reduced = effectsSetting() === 'reduced';
    // On wheels (DESIGN.md 64.6): by who they are, how far, the sky and the hour; not in a party, nor with a tray.
    if (!walker.prop && !walker.party && this.step > 0) {
      const wheel = wheelOf({
        weather: this.weather,
        period: this.period,
        quirk: known.quirk,
        likes: this.likesOf(student),
        commuter: walker.kind === 'commuter',
        // One on a way along the bike path rides it from end to end: the whole trip, as `laneRoute` read it.
        distance: walker.laned ? walker.route.length - 2 : walker.route.length - walker.leg,
        roll: this.rollFor(student, 6431),
        pick: this.rollFor(student, 6433),
      });
      if (wheel) this.mount(walker, wheel, reduced);
      if (walker.wheel && walker.laned) walker.pace *= LANE_PACE;
    }
    // Something in hand, when they carry nothing yet and the frames allow it.
    if (!walker.prop && !walker.wheel && this.step > 0 && !reduced && this.carrying() < HELD_AT_STEP[this.step]!) {
      const held = heldOf({ weather: this.weather, period: this.period, from: tripEnd(from), to: tripEnd(to), likes: this.likesOf(student), roll: this.rollFor(student, 6403) });
      if (held) this.hand(walker, held);
    }
    // A big moment of their own, once a day, a moment after they come into view.
    if (!reduced) {
      const moment = bigMomentOf({ emotion: known.emotion, reasons: known.reasons, chapter: known.chapter, classYear: known.classYear, gpa: known.gpa, roll: this.rollFor(student, 6409) }, this.today);
      if (moment) this.showBig(walker, moment, BIG_DELAY_MS);
    }
  }

  /** A student's feeling for the hour, worked out once and kept (stop 3's feeling, 63.7). */
  private feelingOf(student: StudentRef): Known | null {
    const state = this.state;
    if (!state) return null;
    const hour = shownHour();
    const web = socialWeb.view && socialWeb.view.seed === state.seed ? socialWeb.view : null;
    const stamp = `${hour}|${web?.week ?? -1}|${this.dayOf()}`;
    if (stamp !== this.feltStamp || this.felt.size > FELT_KEPT) {
      this.felt.clear();
      this.feltStamp = stamp;
    }
    const key = studentKey(student);
    const kept = this.felt.get(key);
    if (kept !== undefined) return kept;
    const card = studentCard(state, student);
    const feeling = card ? feelingOf(web, state, student, card, hour) : null;
    // In exams, a student failing is one whose transcript is below 2.0, as their card shows it (R4c, DESIGN.md 82.2).
    const gpa = card && this.today.exams && card.gpa < TRANSCRIPT_BELOW ? (standingOf(state, student).gpa ?? card.gpa) : (card?.gpa ?? 3);
    const known: Known | null = card && feeling ? { emotion: feeling.emotion, reasons: feeling.reasons, motion: motionOf(feeling.emotion, feeling.reasons), chapter: card.chapter, classYear: card.classYear, gpa, quirk: card.quirk } : null;
    this.felt.set(key, known);
    return known;
  }

  /** Their interests, from the web's identities. */
  private likesOf(student: StudentRef): Set<string> {
    const out = new Set<string>();
    const web = socialWeb.view;
    if (!web || !this.state || web.seed !== this.state.seed) return out;
    const id = idIn(web, student);
    if (id < 0) return out;
    INTEREST_NAMES.forEach((name, i) => {
      if (((web.identity[id]! >>> (18 + i)) & 1) === 1) out.add(name);
    });
    return out;
  }

  /** The game's day, for what is kept for a day. */
  private dayOf(): number {
    return this.state ? Math.floor(this.state.clock.tick / TICKS_A_DAY) : 0;
  }

  /** Put something in their hand, where that thing is held. */
  private hand(walker: Walker, held: Held): void {
    const key = HELD_KEY[held];
    if (!this.art.has(key)) return;
    const prop = this.scene.add.image(0, 0, '__DEFAULT');
    this.art.apply(prop, key);
    fitOnMap(prop, key);
    // An umbrella hangs from the lower edge of its canopy, so the canopy can sit over the head.
    prop.setOrigin(0.5, held === 'umbrella' ? UMBRELLA_RIM : 1).setAlpha(0);
    // Umbrellas come in a few colours: the drawing tinted, one for each student.
    if (held === 'umbrella' && walker.student) {
      const tint = UMBRELLA_TINTS[Math.floor(this.rollFor(walker.student, 6421) * UMBRELLA_TINTS.length)];
      if (tint !== undefined && tint !== 0xffffff) prop.setTint(tint);
    }
    walker.prop = prop;
    walker.held = true;
    walker.hold = held === 'umbrella' ? 'over' : held === 'bag' ? 'back' : held === 'phone' ? 'face' : 'waist';
  }

  /** A big moment's bubble over someone (DESIGN.md 64.3): a few at once at most, once a day each. */
  private showBig(walker: Walker, moment: BigMoment, inMs = 0): void {
    if (!walker.key || effectsSetting() === 'reduced') return;
    const once = `${walker.key}|${moment}|${this.dayOf()}`;
    if (this.bigShown.has(once)) return;
    const now = this.scene.time.now;
    const live = this.icons.filter((one) => one.big && one.endAt > now).length;
    if (live >= BIGS_AT_ONCE[this.step]! && walker.key !== this.marked) return;
    if (this.bigShown.size > FELT_KEPT) this.bigShown.clear();
    this.bigShown.add(once);
    this.icons.push({ walker, key: BIG_KEY[moment], big: true, startAt: now + inMs, endAt: now + inMs + BIG_MS, image: null });
    if (moment === 'win' || moment === 'bid') walker.cheerUntil = now + inMs + BIG_MS;
    if (this.onMemory && walker.student) this.onMemory(walker.student, BIG_WORDS[moment]);
  }

  /** What is going on today that a student may have a big moment about: a home win, bids going out, exams. */
  setToday(today: Today): void {
    this.today = today;
  }

  /** The sky: when rain starts those out walking open an umbrella, as those setting out do; when it stops they put it away. */
  setWeather(weather: Weather): void {
    if (weather === this.weather) return;
    const wasRain = this.weather === 'rain';
    this.weather = weather;
    if (!this.state) return;
    for (const walker of this.walkers) {
      if (!walker.student || walker.fading === 'out') continue;
      if (weather === 'rain' && !walker.prop && this.step > 0 && effectsSetting() !== 'reduced') {
        if (this.rollFor(walker.student, 6403) < 0.6 && this.carrying() < HELD_AT_STEP[this.step]!) this.hand(walker, 'umbrella');
      } else if (wasRain && walker.prop && walker.hold === 'over') {
        walker.prop.destroy();
        walker.prop = null;
        walker.held = false;
        walker.hold = 'waist';
      }
    }
  }

  /** How many walkers carry something now: each is one more thing to draw. */
  private carrying(): number {
    let n = 0;
    for (const walker of this.walkers) if (walker.prop && walker.held) n += 1;
    return n;
  }

  /** A student's own steady number for the day, 0 to 1. */
  private rollFor(student: StudentRef, salt: number): number {
    return (hashInts(this.state?.seed ?? 0, this.dayOf(), student.entryYear * 100003 + student.index, salt) >>> 0) / 4294967296;
  }

  private retire(index: number): void {
    const walker = this.walkers[index]!;
    if (walker.key !== null) this.out.delete(walker.key);
    if (walker.key !== null && walker.key === this.marked) this.ring?.setVisible(false);
    walker.sprite.setVisible(false);
    walker.sprite.setScale(1).setRotation(0);
    if (walker.cropped) walker.sprite.setCrop();
    walker.prop?.destroy();
    walker.wheelSprite?.destroy();
    if (walker.ring) {
      walker.ring.setVisible(false);
      this.ringPool.push(walker.ring);
      walker.ring = null;
      this.ringsShown -= 1;
    }
    this.pool.push(walker.sprite);
    this.walkers.splice(index, 1);
    for (const icon of this.icons) if (icon.walker === walker) icon.endAt = 0;
  }

  private draw(walker: Walker, people: PeopleSpec): void {
    // They walk the map. On a turned view they face the way they go on the screen (DESIGN.md section 43). The figure
    // turns at most about once a second, so a short wiggle in a route never shows as spinning (69.1).
    const held = heldFacing(walker.shownDir, walker.shownDirAt, walker.direction, this.scene.time.now);
    walker.shownDir = held.dir;
    walker.shownDirAt = held.at;
    const direction = this.iso.face(walker.shownDir);
    const flipFrom = people.flip?.[direction];
    const facing = flipFrom ?? direction;
    // A rider stands still on what they ride; skaters stride (DESIGN.md 64.6). A pacing student steps as they go.
    const rolling = walker.wheel !== null && walker.wheel !== 'skates';
    const stopped = (walker.lingerMs > 0 && !walker.pacingStep) || walker.talkMs > 0;
    const frame = stopped || rolling ? 0 : Math.floor(walker.stride / people.frameMs) % people.frames;
    let key = `person.${walker.look}.${facing}.${frame}`;
    const down = this.scene.time.now < walker.downUntil;
    if (down && this.art.has(`person.${walker.look}.pose.lie`)) key = `person.${walker.look}.pose.lie`;
    // On one knee to propose (DESIGN.md 64.4): the sitting pose, facing the way they face.
    const kneeling = this.scene.time.now < walker.kneelUntil;
    if (kneeling) {
      const pose = `person.${walker.look}.pose.${direction === 'nw' || direction === 'ne' ? 'sit-nw' : 'sit-sw'}`;
      if (this.art.has(pose)) key = pose;
    }
    if (key !== walker.shownKey) {
      this.art.apply(walker.sprite, key);
      walker.shownKey = key;
    }
    const spot = this.placeOf(walker);
    // A rider steps sideways round someone in the way (DESIGN.md 64.6).
    if (walker.wheel && walker.weave !== 0) {
      const [dx, dy] = STEP_OF[walker.direction];
      spot.x += -dy * walker.weave;
      spot.y += dx * walker.weave;
    }
    const at = this.iso.toWorld(spot.x, spot.y);
    // How they feel, in how they move (DESIGN.md 64.3): over the pack's own walk, and none with Reduce effects.
    const pose = this.poseOf(walker);
    if (kneeling) walker.sprite.setFlipX(direction === 'se' || direction === 'ne');
    else walker.sprite.setFlipX(flipFrom !== undefined);
    if (walker.sprite.scaleY !== pose.squash) walker.sprite.setScale(1, pose.squash);
    // In a fountain (DESIGN.md 64.4): up to the waist in the water, as a swimmer is drawn.
    const inWater = this.scene.time.now < walker.fallUntil;
    if (inWater !== walker.cropped) {
      walker.cropped = inWater;
      if (inWater) walker.sprite.setCrop(0, 0, walker.sprite.frame.width, walker.sprite.frame.height * 0.62);
      else walker.sprite.setCrop();
    }
    const ride = walker.wheel ? this.rideLift(walker) : 0;
    walker.sprite.setPosition(at.x + pose.shake, at.y - pose.lift - ride + (inWater ? walker.sprite.displayHeight * 0.3 : 0));
    // Just above the ground of the cell underfoot, and below anything on the next cell forward: where the figure is
    // drawn, a step aside in a party or round someone included, so it sorts against buildings where it stands (69.5).
    const own = (this.iso.sum(spot.x, spot.y) - 1) * 4 + 2.5;
    walker.sprite.setDepth(this.feet ? this.feet.depth(spot.x, spot.y, own) : own);
    // Followed close up they keep their place in the drawing order: what stands in front of them fades instead (L6).
    if (walker.wheelSprite) this.drawWheel(walker, direction, at, down);
    // Inside a scuffle's dust cloud (DESIGN.md 64.4) they are not seen.
    const hidden = this.scene.time.now < walker.hiddenUntil;
    walker.sprite.setAlpha(hidden ? 0 : walker.alpha);
    // A fan on the way to the game wears the school's colour: the figure itself is tinted, since none has a scarf.
    const fan = this.fanTint !== null && walker.kind === 'student' && walker.goal === this.stadiumStop;
    // On the rivalry game day a share of them are the rival's fans, in its colour (DESIGN.md 77.1).
    const away = fan && this.awayTint !== null && (walker.student ? this.rollFor(walker.student, 7707) < AWAY_SHARE : false);
    if (fan !== walker.tinted || away !== walker.away) {
      walker.tinted = fan;
      walker.away = away;
      if (fan) walker.sprite.setTint(away ? this.awayTint! : this.fanTint!);
      else walker.sprite.clearTint();
    }
    if (walker.prop && walker.held) {
      // Carried (DESIGN.md 64, 64.3): at the waist on the side they face, a phone up by the face, an umbrella over the
      // head, a bag on the back.
      const side = flipFrom !== undefined ? 1 : -1;
      const x = walker.sprite.x;
      const y = walker.sprite.y;
      const h = walker.sprite.displayHeight;
      const w = walker.sprite.displayWidth;
      // An umbrella is held behind them, its canopy just over the head: the shaft is hidden by the body.
      if (walker.hold === 'over') walker.prop.setPosition(x + side * 3, y - h + 5).setDepth(walker.sprite.depth - 0.05);
      else if (walker.hold === 'back') walker.prop.setPosition(x - side * w * 0.3, y - h * 0.18).setDepth(walker.sprite.depth - 0.05);
      else if (walker.hold === 'face') walker.prop.setPosition(x + side * w * 0.22, y - h * 0.45).setDepth(walker.sprite.depth + 0.05);
      else walker.prop.setPosition(x + side * w * 0.2, y - h * 0.22).setDepth(walker.sprite.depth + 0.05);
      walker.prop.setAlpha(hidden ? 0 : walker.alpha);
    } else if (walker.prop) {
      // Beside them: no figure in the pack can hold anything. A pennant moves in the wind. A dog faces the way they go.
      if (walker.dog) walker.prop.setFlipX(direction === 'se' || direction === 'ne');
      const off = this.iso.offset(0.2, 0.04);
      const beside = { x: at.x + off.x, y: at.y + off.y };
      const sway = walker.kind === 'guide' ? Math.sin(this.scene.time.now / 420 + walker.stride / 400) * 0.1 * this.wind : 0;
      walker.prop.setPosition(beside.x, beside.y).setRotation(sway).setDepth(walker.sprite.depth + 0.05).setAlpha(walker.alpha);
    }
    // The ring at their feet in their feeling's colour (DESIGN.md 64.3), unless hidden or the frames are short.
    const ringKey = walker.feel?.ring ?? null;
    const showRing = ringKey !== null && this.rings && this.step > 0 && walker.key !== this.marked && !inWater && (walker.ring !== null || this.ringsShown < RINGS_AT_STEP[this.step]!);
    if (showRing && !walker.ring) {
      this.ringsShown += 1;
      walker.ring = this.ringPool.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(walker.ring, ringKey);
      // Centred on their feet: the atlas stands an emote on a point above it, for a head.
      walker.ring.setOrigin(0.5, 0.5).setScale(RING_SCALE).setVisible(true);
    } else if (!showRing && walker.ring) {
      walker.ring.setVisible(false);
      this.ringPool.push(walker.ring);
      walker.ring = null;
      this.ringsShown -= 1;
    }
    // Over the ground of every cell it can reach (a ring is wider than a walker's feet, and the next tile is drawn
    // later), centred where they stand.
    if (walker.ring) {
      const depth = Math.ceil(this.iso.sum(walker.x, walker.y)) * 4 + 0.5;
      walker.ring.setPosition(at.x, at.y + 0.5);
      if (walker.ring.depth !== depth) walker.ring.setDepth(depth);
      const ringAlpha = hidden ? 0 : walker.alpha * 0.95;
      if (walker.ring.alpha !== ringAlpha) walker.ring.setAlpha(ringAlpha);
    }
    if (walker.key !== null && walker.key === this.marked) {
      // A ring on the ground under the student whose card is open.
      const ring = this.ring ?? this.scene.add.ellipse(0, 0, 10, 10).setStrokeStyle(3, 0xffd24a, 1);
      this.ring = ring;
      ring.setSize(this.iso.halfWidth * 0.62, this.iso.halfHeight * 0.62);
      ring.setPosition(at.x, at.y).setDepth(walker.sprite.depth - 0.2).setVisible(true).setAlpha(walker.alpha);
    }
  }

  // ----------------------------------------------------------- wheels --

  /** Put them on wheels (DESIGN.md 64.6): faster, the picture under them, and their small moment for the trip. */
  private mount(walker: Walker, wheel: Wheel, reduced: boolean): void {
    if (!this.art.has(`wheel.${wheel}.sw`)) return;
    walker.wheel = wheel;
    walker.pace *= WHEEL_SPEED[wheel];
    const sprite = this.scene.add.image(0, 0, '__DEFAULT').setAlpha(0);
    this.art.apply(sprite, `wheel.${wheel}.sw`);
    sprite.setOrigin(0.5, 1);
    walker.wheelSprite = sprite;
    walker.ride = reduced || !walker.student ? null : rideMomentOf(wheel, this.rollFor(walker.student, 6437));
    walker.rideAt = this.scene.time.now + 1200 + this.rollFor(walker.student!, 6439) * 7000;
  }

  /**
   * The way along the bike path for a student who will ride this trip (DESIGN.md 71): over the footpaths, the streets
   * on a trip from the town, and the bike path, riding at least three cells of it and no more than 1.3 times the walk.
   * Null for one who walks, or when it is not on their way. Their wheel is the one `dress` gives them: the same rule
   * and rolls, over the whole trip.
   */
  private laneRoute(student: StudentRef, commuter: boolean, from: Stop, to: Stop, walk: Spot[]): Spot[] | null {
    if (this.laneCells < LANE_LEAST || this.step === 0) return null;
    const known = this.feelingOf(student);
    if (!known) return null;
    const facts = { weather: this.weather, period: this.period, quirk: known.quirk, likes: this.likesOf(student), commuter, roll: this.rollFor(student, 6431), pick: this.rollFor(student, 6433) };
    // A longer trip only makes riding likelier, so one who would ride the walk rides the way along the bike path too.
    const wheel = wheelOf({ ...facts, distance: walk.length - 2 });
    if (!wheel || !this.art.has(`wheel.${wheel}.sw`)) return null;
    const town = from.kind === 'house' || to.kind === 'house';
    const walked = this.pathBetween(from.door, to.door, town ? this.isWalk : this.isPath)?.length ?? walk.length - 2;
    const most = Math.min(Math.ceil(walked * LANE_DETOUR) + 2, town ? MAX_COMMUTE_CELLS : MAX_ROUTE_CELLS);
    const ride = this.rideBetween(from.door, to.door, most, town ? this.isRideTown : this.isRide);
    if (!ride || ride.lane < LANE_LEAST) return null;
    return this.spotsAlong(ride.cells, from, to, true);
  }

  /** The cells a rider takes from one door to another (DESIGN.md 71), no more than `most`: `searchRide` on this map. */
  private rideBetween(from: number, to: number, most: number, ride: readonly boolean[]): { cells: number[]; lane: number } | null {
    return searchRide(this.width, this.height, ride, this.isRideLane, from, to, most, LANE_COST, PATH_COST);
  }

  /** True while a rider is on the bike path or one of its crossings (DESIGN.md 71). */
  private onLane(walker: Walker): boolean {
    const x = Math.floor(walker.x);
    const y = Math.floor(walker.y);
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.isRideLane[y * this.width + x] === true;
  }

  /** How high the rider stands: on a saddle, a deck or a board, and up off a kerb for a trick. */
  private rideLift(walker: Walker): number {
    if (this.scene.time.now < walker.downUntil) return 0;
    const base = RIDE_LIFT[walker.wheel!];
    if (walker.ride !== 'trick' || !walker.rideDone) return base;
    const t = (this.scene.time.now - walker.rideAt) / TRICK_MS;
    return t >= 0 && t < 1 ? base + Math.sin(t * Math.PI) * 7 : base;
  }

  /** The picture under them, the way they face: in front of them going towards the viewer, behind going away. */
  private drawWheel(walker: Walker, direction: WalkDirection, at: { x: number; y: number }, down: boolean): void {
    const sprite = walker.wheelSprite!;
    const away = direction === 'nw' || direction === 'ne';
    const key = `wheel.${walker.wheel}.${away ? 'nw' : 'sw'}`;
    if (sprite.getData('key') !== key) {
      this.art.apply(sprite, key);
      sprite.setOrigin(0.5, 1).setData('key', key);
    }
    const flat = walker.wheel === 'skateboard' || walker.wheel === 'longboard';
    const trick = walker.ride === 'trick' && walker.rideDone ? (this.scene.time.now - walker.rideAt) / TRICK_MS : -1;
    const lift = trick >= 0 && trick < 1 ? Math.sin(trick * Math.PI) * 7 : 0;
    sprite
      .setFlipX(direction === 'se' || direction === 'ne')
      // Down after a wipeout, it lies beside them, tipped over.
      .setPosition(at.x + (down ? 8 : 0), at.y - lift)
      .setRotation(down ? 0.9 : trick >= 0 && trick < 1 ? Math.sin(trick * Math.PI * 2) * 0.35 : 0)
      .setDepth(walker.sprite.depth + (flat || (away && walker.wheel !== 'skates') ? -0.03 : 0.03))
      .setAlpha(walker.sprite.alpha);
  }

  /**
   * A rider's moment on the trip (DESIGN.md 64.6), and their sideways step round anyone in the way: a bell or a near
   * miss as they pass someone, a trick off a kerb, or now and then a wipeout, after which they get up and ride on.
   */
  private rideTick(walker: Walker, dt: number): void {
    const now = this.scene.time.now;
    // Someone just ahead and in line: step round them on the side they are not.
    let target = 0;
    let passing: Walker | null = null;
    // On the bike path nobody is in the way to step round (DESIGN.md 71).
    const lane = this.onLane(walker);
    if (walker.lingerMs <= 0 && walker.talkMs <= 0 && !lane) {
      const [dx, dy] = STEP_OF[walker.direction];
      for (const other of this.walkers) {
        if (other === walker || other.fading === 'out') continue;
        const ox = other.x - walker.x;
        const oy = other.y - walker.y;
        const ahead = ox * dx + oy * dy;
        if (ahead <= 0 || ahead > 0.8) continue;
        const side = -ox * dy + oy * dx;
        if (Math.abs(side) > 0.32) continue;
        target = side > 0 ? -RIDER_WEAVE : RIDER_WEAVE;
        passing = other;
        break;
      }
    }
    // Smooth (DESIGN.md 69.1): once stepping round to one side they keep to it until clear, and ease over and back, so
    // a rider never wobbles from side to side. Within the path: the step and their own place on it stay inside its cell.
    if (target !== 0 && Math.abs(walker.weave) > 0.02 && Math.sign(target) !== Math.sign(walker.weave)) target = -target;
    walker.weave += (target - walker.weave) * Math.min(1, dt / (lane ? 120 : 380));
    if (Math.abs(walker.weave) < 0.005 && target === 0) walker.weave = 0;
    if (!walker.ride || walker.rideDone || now < walker.rideAt || walker.fading !== null) return;
    // A bell or a near miss only where riders share a footpath with walkers (DESIGN.md 71).
    if ((walker.ride === 'bell' || walker.ride === 'nearMiss') && (!passing || lane)) return;
    walker.rideDone = true;
    const name = walker.wheel ? WHEEL_NAMES[walker.wheel].replace(/^on (a |an )?/, '') : '';
    if (walker.ride === 'bell') {
      this.showIcon(walker, 'bell');
      if (passing) this.showIcon(passing, 'exclaim', 250);
    } else if (walker.ride === 'nearMiss' && passing) {
      this.showIcon(passing, 'exclaim');
      this.showIcon(walker, 'sweat', 200);
      if (this.onMemory && walker.student) this.onMemory(walker.student, `Nearly ran into someone on their ${name}`);
      if (this.onMemory && passing.student) this.onMemory(passing.student, 'Nearly got run over by a bike');
    } else if (walker.ride === 'trick') {
      this.showIcon(walker, 'sparkle', 150);
      if (this.onMemory && walker.student) this.onMemory(walker.student, `Landed a trick on their ${name}`);
    } else if (walker.ride === 'wipeout') {
      // Down for a moment with a sweat drop; those near laugh or gasp; then up and on.
      walker.downUntil = now + WIPEOUT_MS;
      walker.talkMs = Math.max(walker.talkMs, WIPEOUT_MS);
      this.showIcon(walker, 'sweat', 300);
      let told = 0;
      for (const other of this.walkers) {
        if (told >= 2 || other === walker || !other.student || Math.hypot(other.x - walker.x, other.y - walker.y) > 2) continue;
        this.showIcon(other, told === 0 ? 'exclaim' : 'laugh', 200 + told * 300);
        told += 1;
      }
      if (this.onMemory && walker.student) this.onMemory(walker.student, `Wiped out on their ${name} and got right back up`);
    }
  }

  /**
   * Where a rider leaves what they ride (DESIGN.md 64.6): a bike or an e-scooter at a rack within reach of where they
   * stop, else against the wall there, for a while; a board, a scooter or skates go in with them.
   */
  private park(walker: Walker): void {
    const wheel = walker.wheel;
    if (!wheel || !PARKS[wheel] || !this.art.has(`wheel.${wheel}.sw`)) return;
    const now = this.scene.time.now;
    const rack = this.racks.find((one) => Math.hypot(one.x - walker.x, one.y - walker.y) <= RACK_REACH && this.parked.filter((p) => p.rack === one.id).length < RACK_HOLDS);
    let x = walker.x;
    let y = walker.y;
    let tilt = 0;
    let rackId = -1;
    if (rack) {
      const slot = this.parked.filter((p) => p.rack === rack.id).length;
      x = rack.x - 0.3 + slot * 0.16;
      y = rack.y - 0.15 + slot * 0.08;
      rackId = rack.id;
    } else {
      if (this.parked.filter((p) => p.rack < 0).length >= LEANING_MOST) return;
      // Against the wall by the door, tipped a little.
      x += 0.25;
      y -= 0.1;
      tilt = -0.22;
    }
    const image = this.scene.add.image(0, 0, '__DEFAULT');
    this.art.apply(image, `wheel.${wheel}.sw`);
    const at = this.iso.toWorld(x, y);
    image.setOrigin(0.5, 1).setPosition(at.x, at.y).setRotation(tilt).setDepth((this.iso.sum(x, y) - 1) * 4 + 2.45 + (rackId >= 0 ? 0.6 : 0)).setAlpha(0);
    this.parked.push({ image, rack: rackId, until: now + PARKED_MS[0] + Math.random() * (PARKED_MS[1] - PARKED_MS[0]), from: now });
  }

  /** The bikes parked and leaning fade in, stay a while, and go. */
  private drawParked(): void {
    const now = this.scene.time.now;
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const one = this.parked[i]!;
      const left = one.until - now;
      if (left <= 0) {
        one.image.destroy();
        this.parked.splice(i, 1);
        continue;
      }
      one.image.setAlpha(Math.min(1, (now - one.from) / 400, left / 600));
    }
  }

  /** What they ride, as a card says it, or null on foot. */
  ridingWords(key: string): string | null {
    const walker = this.walkerOf(key);
    return walker?.wheel ? WHEEL_NAMES[walker.wheel] : null;
  }

  // ---------------------------------------------------- crowd moments --

  /** Two students walking close in view, those who do not get on first (DESIGN.md 64.4), or null. */
  private pairIn(view: Phaser.Geom.Rectangle): [Walker, Walker] | null {
    const now = this.scene.time.now;
    const free = this.walkers.filter((w) => w.kind === 'student' && w.student && w.fading === null && !w.party && w.momentUntil < now && w.watchMs === 0 && this.inView(view, w.x, w.y, -40) && this.openAt(w.x, w.y));
    const web = socialWeb.view;
    let best: [Walker, Walker] | null = null;
    let bestScore = -1;
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i]!;
        const b = free[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 1.4) continue;
        const tie = web ? tieOf(web, a.student!, b.student!) : null;
        // Those who do not get on first, then where the most are about to see it.
        const score = (tie && (tie.kind === KIND.rival || tie.kind === KIND.enemy) ? 100 : 0) + this.crowdNear((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (score > bestScore) {
          best = [a, b];
          bestScore = score;
        }
      }
    }
    return best;
  }

  /** True on open ground: a path, a lawn or grass all round, where no building hides a moment (DESIGN.md 64.4). */
  private openAt(x: number, y: number): boolean {
    const map = this.state?.map;
    if (!map) return false;
    let open = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor(x) + dx;
        const cy = Math.floor(y) + dy;
        if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) continue;
        const kind = map.cells[cy * map.width + cx]!.kind;
        if (kind === 'path' || kind === 'quad' || kind === 'empty') open += 1;
      }
    }
    return open >= 8;
  }

  /** A couple out together in view, or null. */
  private coupleIn(view: Phaser.Geom.Rectangle): [Walker, Walker] | null {
    const now = this.scene.time.now;
    const byParty = new Map<number, Walker[]>();
    for (const w of this.walkers) {
      if (!w.party || !this.partyCouple.has(w.party) || w.fading !== null || w.momentUntil >= now || !this.inView(view, w.x, w.y, -40) || !this.openAt(w.x, w.y)) continue;
      const list = byParty.get(w.party);
      if (list) list.push(w);
      else byParty.set(w.party, [w]);
    }
    let best: [Walker, Walker] | null = null;
    let most = -1;
    for (const pair of byParty.values()) {
      if (pair.length < 2) continue;
      const near = this.crowdNear(pair[0]!.x, pair[0]!.y);
      if (near > most) {
        most = near;
        best = [pair[0]!, pair[1]!];
      }
    }
    return best;
  }

  /** How many students are walking within a moment's reach of a point. */
  private crowdNear(x: number, y: number): number {
    let n = 0;
    for (const w of this.walkers) if (w.kind === 'student' && w.fading === null && Math.hypot(w.x - x, w.y - y) <= WATCH_REACH) n += 1;
    return n;
  }

  /** A fountain in view with a student walking within a few cells of it, or null. */
  private fountainIn(view: Phaser.Geom.Rectangle, fountains: ReadonlyArray<{ x: number; y: number }>): { at: { x: number; y: number }; walker: Walker } | null {
    const now = this.scene.time.now;
    for (const at of fountains) {
      const world = this.iso.toWorld(at.x, at.y);
      if (!view.contains(world.x, world.y)) continue;
      // Up to the water's edge in a straight line over open ground, never through a building (69.5).
      const edge = (w: Walker): boolean => {
        const d = Math.hypot(at.x - w.x, at.y - w.y);
        return d > 0.6 && this.clearLine(w.x, w.y, w.x + ((at.x - w.x) * (d - 0.6)) / d, w.y + ((at.y - w.y) * (d - 0.6)) / d);
      };
      const near = this.walkers.find((w) => w.kind === 'student' && w.student && w.fading === null && !w.party && w.lingerMs <= 0 && w.talkMs <= 0 && w.momentUntil < now && w.watchMs === 0 && Math.hypot(w.x - at.x, w.y - at.y) < 3 && edge(w));
      if (near) return { at, walker: near };
    }
    return null;
  }

  /** What the walkers could make a moment of now, in view. */
  momentFacts(view: Phaser.Geom.Rectangle, fountains: ReadonlyArray<{ x: number; y: number }>): { pairs: boolean; couples: boolean; fountain: boolean } {
    return { pairs: this.pairIn(view) !== null, couples: this.coupleIn(view) !== null, fountain: this.fountainIn(view, fountains) !== null };
  }

  /**
   * Stage a moment made of walkers (DESIGN.md 64.4): a scuffle (two who meet, a big argument, then a dust cloud), a
   * couple arguing, a proposal at commencement (one kneels, a ring, then a kiss on the cheek), or a fall into a
   * fountain. Returns where it is, for the crowd to gather round, or null when there is nobody to make it of.
   */
  stage(kind: MomentKind, view: Phaser.Geom.Rectangle, fountains: ReadonlyArray<{ x: number; y: number }>, ms: number): { x: number; y: number } | null {
    const now = this.scene.time.now;
    const hold = (a: Walker, b: Walker): void => {
      for (const [one, other] of [[a, b], [b, a]] as const) {
        one.momentUntil = now + ms;
        if (one.lingerMs > 0) one.lingerMs = Math.max(one.lingerMs, ms);
        else one.talkMs = ms;
        one.talkWith = other.student;
        one.direction = facing(other.x - one.x, other.y - one.y);
      }
    };
    const mid = (a: Walker, b: Walker): { x: number; y: number } => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (kind === 'dustup') {
      const pair = this.pairIn(view);
      if (!pair) return null;
      const [a, b] = pair;
      hold(a, b);
      this.showBig(a, 'argue');
      this.showIcon(b, 'anger', 400);
      // Into the cloud and out again, and each off their own way with a sweat drop and a scowl.
      a.hiddenUntil = b.hiddenUntil = now + DUST_FROM_MS + DUST_MS;
      a.laughUntil = b.laughUntil = 0;
      this.showIcon(a, 'sweat', DUST_FROM_MS + DUST_MS + 200);
      this.showIcon(b, 'anger', DUST_FROM_MS + DUST_MS + 400);
      if (this.onMemory) {
        this.onMemory(a.student!, actorWords('dustup', this.first(b)));
        this.onMemory(b.student!, actorWords('dustup', this.first(a)));
      }
      return mid(a, b);
    }
    if (kind === 'shouting') {
      // Two who meet have it out, face to face, in turn (DESIGN.md 76.5): no cloud, and each off their own way after.
      const pair = this.pairIn(view);
      if (!pair) return null;
      const [a, b] = pair;
      hold(a, b);
      this.showBig(a, 'argue');
      this.showIcon(b, 'anger', 500);
      this.showIcon(a, 'anger', 2400);
      this.showIcon(b, 'speech', 3600);
      if (this.onMemory) {
        this.onMemory(a.student!, actorWords('shouting', this.first(b)));
        this.onMemory(b.student!, actorWords('shouting', this.first(a)));
      }
      return mid(a, b);
    }
    if (kind === 'coupleFight' || kind === 'proposal') {
      const pair = this.coupleIn(view);
      if (!pair) return null;
      const [a, b] = pair;
      hold(a, b);
      if (kind === 'coupleFight') {
        this.showBig(a, 'argue');
        this.showIcon(b, 'anger', 700);
        this.showIcon(b, 'sadcloud', 3600);
      } else {
        a.kneelUntil = now + ms * 0.75;
        this.showBig(a, 'ring', 300);
        this.showBig(b, 'kiss', 3400);
        b.cheerUntil = now + 3400 + 2000;
      }
      if (this.onMemory) {
        this.onMemory(a.student!, actorWords(kind, this.first(b), true));
        this.onMemory(b.student!, actorWords(kind, this.first(a), false));
      }
      return mid(a, b);
    }
    if (kind === 'fountain') {
      const found = this.fountainIn(view, fountains);
      if (!found) return null;
      const { at, walker } = found;
      walker.momentUntil = now + ms;
      walker.resume = walker.route.slice(walker.leg).map((one) => ({ ...one }));
      // Already where they were going: out of the water and back there the way they came (69.5).
      if (walker.resume.length === 0) walker.resume = [{ x: walker.x, y: walker.y }];
      walker.route = [{ x: walker.x, y: walker.y }, { x: at.x, y: at.y }];
      walker.leg = 1;
      walker.watchMs = FOUNTAIN_MS;
      walker.fallOnArrive = true;
      walker.faceAt = null;
      if (this.onMemory) this.onMemory(walker.student!, actorWords('fountain', null));
      return at;
    }
    return null;
  }

  /**
   * The crowd takes it in (DESIGN.md 64.4): students near enough walk over and stand in a ring round it, facing it, a
   * few at most by crowd step; others near stop where they are and turn; each reacts in turn, some cheer. Returns how
   * many watch.
   */
  watch(at: { x: number; y: number }, kind: MomentKind, ms: number, drawn: readonly number[] = []): number {
    const now = this.scene.time.now;
    const view = this.scene.cameras.main.worldView;
    const near = this.walkers
      .filter((w) => w.kind === 'student' && w.student && w.fading === null && w.momentUntil < now && w.watchMs === 0 && Math.hypot(w.x - at.x, w.y - at.y) <= WATCH_REACH && this.inView(view, w.x, w.y, 0))
      .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
    const most = WATCHERS_AT_STEP[this.step] ?? 0;
    const ring = Math.max(3, Math.min(most, near.length));
    const reaction = WATCH_REACTIONS[kind];
    // Those who walk over are each a different figure (DESIGN.md 76.1): one drawn like another already going stops
    // and turns where they are instead, so a ring of watchers is never a row of clones.
    // `drawn`: the figures of those in the moment itself (a staged dust-up's two); and those already watching it.
    const going = new Set<number>(drawn);
    for (const w of this.walkers) if (w.momentUntil >= now && Math.hypot(w.x - at.x, w.y - at.y) <= WATCH_REACH) going.add(w.look);
    let over = 0;
    near.forEach((w, i) => {
      w.faceAt = { x: at.x, y: at.y };
      w.momentUntil = now + ms;
      // Over to a place in the ring round it, in a straight line over open ground there and back (69.1, 69.5): where
      // the line would cross a building or the place is on one, they watch from where they are.
      const angle = (i / ring) * Math.PI * 2 + 0.4;
      const r = 1.05 + (i % 2) * 0.3;
      const spot = { x: at.x + Math.cos(angle) * r, y: at.y + Math.sin(angle) * r };
      // Already watching something else: after this they still go back to the way they were going (69.5).
      const back = w.resume?.[0] ?? w.route[w.leg] ?? null;
      const clear = this.clearLine(w.x, w.y, spot.x, spot.y) && (!back || this.clearLine(spot.x, spot.y, back.x, back.y));
      if (over < most && !w.party && clear && !going.has(w.look)) {
        going.add(w.look);
        over += 1;
        // After, on along the way they were going; or, already where they were going, back there the way they came.
        const resume = w.route.slice(w.leg).map((one) => ({ ...one }));
        w.resume = w.resume ?? (resume.length > 0 ? resume : [{ x: w.x, y: w.y }]);
        w.route = [{ x: w.x, y: w.y }, spot];
        w.leg = 1;
        w.lingerMs = 0;
        w.talkMs = 0;
        w.watchMs = Math.max(1500, ms - 900);
        // To a dust-up or a chase they run (DESIGN.md 76.5).
        if (kind === 'dustup' || kind === 'prank') w.rush = WATCH_RUN;
      } else {
        // Near enough: they stop where they are and turn to look.
        if (w.lingerMs > 0) w.lingerMs = Math.max(w.lingerMs, ms * 0.7);
        else w.talkMs = ms * 0.7;
        w.direction = facing(at.x - w.x, at.y - w.y);
      }
      this.showIcon(w, reaction.emotes[i % reaction.emotes.length]!, 900 + i * 420);
      if (reaction.cheer && i % 2 === 0) w.cheerUntil = now + 1200 + i * 200 + 2400;
      if (this.onMemory) this.onMemory(w.student!, watchWords(kind));
    });
    return near.length;
  }

  /**
   * Pacing (DESIGN.md 69.1): a student tense about exams, stopped somewhere, walks a few steps back along the way they
   * came, turns once, walks back to where they stopped, turns once, and again, with the walk frames. Nothing else
   * moves anyone while they stand, and with Reduce effects they stand still.
   */
  private pace(walker: Walker, dt: number): void {
    const can = walker.feel?.motion === 'pace' && walker.talkMs <= 0 && !walker.party && !walker.wheel && !walker.resume && walker.watchMs === 0 && walker.fading === null && effectsSetting() !== 'reduced';
    if (!can) {
      walker.pacingStep = false;
      return;
    }
    if (!walker.paceAnchor) {
      const back = walker.route[walker.route.length - 2];
      if (!back) return;
      const dx = back.x - walker.x;
      const dy = back.y - walker.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.2) return;
      walker.paceAnchor = { x: walker.x, y: walker.y, ux: dx / length, uy: dy / length, reach: Math.min(PACING_REACH, length) };
    }
    const anchor = walker.paceAnchor;
    const step = pacingAt(this.scene.time.now, walker.phase);
    walker.x = anchor.x + anchor.ux * anchor.reach * step.along;
    walker.y = anchor.y + anchor.uy * anchor.reach * step.along;
    walker.direction = step.back ? facing(-anchor.ux, -anchor.uy) : facing(anchor.ux, anchor.uy);
    walker.pacingStep = step.walking;
    if (step.walking) walker.stride += dt;
  }

  /** The buildings people sort against (DESIGN.md 69.5). */
  private feet: Footprints | null = null;

  /** The buildings people sort against, so nobody is drawn on a wall (DESIGN.md 69.5). */
  setFootprints(feet: Footprints): void {
    this.feet = feet;
  }

  /** True for a stop with a door to go in at or come out of: a building, a house, a place that is not flat (69.2). */
  private hasDoor(stop: Stop): boolean {
    if (stop.kind === 'building' || stop.kind === 'house') return true;
    return stop.kind === 'place' && !stop.flat && stop.family !== undefined && DOOR_FAMILIES.has(stop.family);
  }

  /** True when a point is at the edge of a door: where someone comes out of a building (69.2). */
  private atDoorEdge(at: { x: number; y: number }): boolean {
    const cx = Math.floor(at.x);
    const cy = Math.floor(at.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const edge = this.doorAt.get((cy + dy) * this.width + cx + dx);
        if (edge && Math.hypot(edge.x - at.x, edge.y - at.y) < 0.3) return true;
      }
    }
    return false;
  }

  /** True when a point of the map is on the screen, or near enough to it that a figure there would show. */
  seen(at: { x: number; y: number }): boolean {
    return this.inView(this.scene.cameras.main.worldView, at.x, at.y, OUT_OF_SIGHT_PX);
  }

  /**
   * True when a point has only just come into sight: at the first look, or uncovered by a pan or a zoom since the last
   * top-up. People may be found already there; anywhere else in view they must walk in (DESIGN.md 69.2).
   */
  fresh(x: number, y: number): boolean {
    const known = this.knownView;
    if (!known) return true;
    const at = this.iso.toWorld(x, y);
    const m = OUT_OF_SIGHT_PX;
    return at.x < known.x - m || at.x > known.right + m || at.y < known.y - m || at.y > known.bottom + m;
  }

  /** Remember the view as it is now: from here on, only ground uncovered after this is fresh. */
  knowView(): void {
    const view = this.scene.cameras.main.worldView;
    this.knownView = { x: view.x, y: view.y, right: view.right, bottom: view.bottom };
  }

  /**
   * A way on to the screen to (x, y) (DESIGN.md 69.2): from the nearest door anyone could come out of, or from just past
   * the edge of the view, whichever is nearer on foot, over paths, open ground, streets and crossings, never through a
   * building. The points run from where they appear to (x, y), a cell at a time. Null when there is none in reach.
   * Read backwards, it is a way off the screen from (x, y).
   */
  approach(x: number, y: number, notFrom?: { x: number; y: number }): Spot[] | null {
    const width = this.width;
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    if (sx < 0 || sy < 0 || sx >= width || sy >= this.height) return null;
    const view = this.scene.cameras.main.worldView;
    const start = sy * width + sx;
    // `notFrom`: not by the door on that cell (a prankster never bolts back into the dorm they pranked, DESIGN.md 76.3).
    const shut = notFrom ? Math.floor(notFrom.y) * width + Math.floor(notFrom.x) : -1;
    const end = (c: number): boolean => c !== start && ((this.doorAt.has(c) && c !== shut) || !this.inView(view, (c % width) + 0.5, Math.floor(c / width) + 0.5, OUT_OF_SIGHT_PX));
    const cells = searchOnFoot(width, this.height, this.isAfoot, start, end, AFOOT_CELLS, this.space);
    if (!cells || cells.length < 2) return null;
    const last = cells[cells.length - 1]!;
    const out: Spot[] = [];
    if (this.doorAt.has(last)) out.push({ ...this.doorAt.get(last)! });
    for (let k = cells.length - 1; k >= 1; k--) out.push({ x: (cells[k]! % width) + 0.5, y: Math.floor(cells[k]! / width) + 0.5 });
    out.push({ x, y });
    return out;
  }


  /**
   * The chaos sandbox, C2 (DESIGN.md 76): the door of a building on a box of cells and the path in front of it, where
   * someone at that building comes out (69.2) and where a scene there stands. A door on a side facing the player first,
   * then the one with the most open ground round it; null when the building has no door on a path.
   */
  frontOf(box: { x: number; y: number; w: number; h: number }): { door: Spot; front: Spot } | null {
    const width = this.width;
    let best: { door: Spot; front: Spot } | null = null;
    let most = -1;
    for (const [cell, door] of this.doorAt) {
      const x = cell % width;
      const y = (cell - x) / width;
      // The building a door belongs to is the cell it leans towards from its path.
      const bx = x + Math.sign(Math.round((door.x - (x + 0.5)) * 100));
      const by = y + Math.sign(Math.round((door.y - (y + 0.5)) * 100));
      if (bx < box.x || by < box.y || bx >= box.x + box.w || by >= box.y + box.h) continue;
      let open = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const c = (y + dy) * width + x + dx;
          if (x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < this.height && this.isOpen[c] && !this.isStreet[c]) open += 1;
        }
      }
      // A door on a side facing the player, in the view as it is turned, so the scene is not behind the building.
      const facing = this.iso.dir(x - bx, y - by);
      const score = open + (facing.x + facing.y > 0 ? 10 : 0);
      if (score > most) {
        most = score;
        best = { door: { ...door }, front: { x: x + 0.5, y: y + 0.5 } };
      }
    }
    return best;
  }

  /**
   * The stadium's way in, where the fans walk in on a game day (DESIGN.md 77.2): the edge of the stadium and the path
   * in front of it, for the goalposts carried out. null with no stadium on the map.
   */
  stadiumFront(): { door: Spot; front: Spot } | null {
    const stop = this.stadiumStop;
    if (!stop) return null;
    const front = { x: (stop.door % this.width) + 0.5, y: Math.floor(stop.door / this.width) + 0.5 };
    const door = { x: front.x + (stop.cell.x + 0.5 - front.x) * 0.46, y: front.y + (stop.cell.y + 0.5 - front.y) * 0.46 };
    return { door, front };
  }

  /**
   * How much the buildings in front of a cell hide it, in the view as it is turned (DESIGN.md 76.1): 0 when the player
   * sees it plainly, more the more buildings stand between. The cells one and two steps down the screen from it count.
   */
  hiddenAt(cx: number, cy: number): number {
    const map = this.state?.map;
    if (!map) return 0;
    let hid = 0;
    for (const [dx, dy, weight] of IN_FRONT) {
      const at = this.iso.step(cx, cy, dx, dy);
      if (at.x < 0 || at.y < 0 || at.x >= this.width || at.y >= this.height) continue;
      const cell = map.cells[at.y * this.width + at.x]!;
      const placed = cell.kind === 'placed' && cell.placedId !== null ? map.placed[cell.placedId] : null;
      if ((cell.kind === 'lot' && cell.buildingId !== null) || (placed && !PLACED[placed.type].flat)) hid += weight;
    }
    return hid;
  }

  /**
   * Where a scene at a building's door stands (DESIGN.md 76.1): the path in front, or, when buildings in front hide
   * it, the open ground nearest it within a few steps that the player can see, and the way there from the door. Never
   * where `taken` says another scene already stands.
   */
  standBy(door: Spot, front: Spot, taken: (x: number, y: number) => boolean = () => false): { at: Spot; way: Spot[] } {
    const width = this.width;
    const fx = Math.floor(front.x);
    const fy = Math.floor(front.y);
    const open = (c: number): boolean => this.isOpen[c]! && !this.isStreet[c];
    let best = { cell: fy * width + fx, score: this.hiddenAt(fx, fy) * STAND_HIDDEN + (taken(fx, fy) ? 100 : 0) };
    if (best.score === 0) return { at: { ...front }, way: [{ ...door }, { ...front }] };
    // A short search on foot from the front cell, over open ground.
    const from = new Map<number, number>([[best.cell, -1]]);
    let ring = [best.cell];
    for (let steps = 1; steps <= STAND_REACH && ring.length > 0; steps++) {
      const next: number[] = [];
      for (const c of ring) {
        const x = c % width;
        const y = (c - x) / width;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= this.height) continue;
          const n = ny * width + nx;
          if (from.has(n) || !open(n)) continue;
          from.set(n, c);
          next.push(n);
          if (taken(nx, ny)) continue;
          const score = steps + this.hiddenAt(nx, ny) * STAND_HIDDEN;
          if (score < best.score) best = { cell: n, score };
        }
      }
      ring = next;
    }
    const cells: number[] = [];
    for (let c = best.cell; c !== -1; c = from.get(c)!) cells.push(c);
    cells.reverse();
    const way: Spot[] = [{ ...door }, ...cells.map((c) => ({ x: (c % width) + 0.5, y: Math.floor(c / width) + 0.5 }))];
    return { at: { ...way[way.length - 1]! }, way };
  }

  /**
   * Open ground for a rally by a building (DESIGN.md 76.4): up to `n` spots, two to a cell, gathered round the best cell
   * near its door: a quad's lawn first, then wide open paths and grass, never a street or a court. A clump, not a line
   * along a path. Empty when there is none.
   */
  groundBy(front: Spot, n: number): Spot[] {
    const width = this.width;
    const fx = Math.floor(front.x);
    const fy = Math.floor(front.y);
    const map = this.state?.map;
    if (!map) return [];
    const ground = (x: number, y: number): 'quad' | 'open' | null => {
      if (x < 0 || y < 0 || x >= width || y >= this.height) return null;
      const kind = map.cells[y * width + x]!.kind;
      if (kind === 'quad') return 'quad';
      return kind === 'empty' || this.isPath[y * width + x] ? 'open' : null;
    };
    const cells: Array<{ x: number; y: number; score: number }> = [];
    for (let y = fy - RALLY_REACH; y <= fy + RALLY_REACH; y++) {
      for (let x = fx - RALLY_REACH; x <= fx + RALLY_REACH; x++) {
        const kind = ground(x, y);
        const far = Math.abs(x - fx) + Math.abs(y - fy);
        if (!kind || far > RALLY_REACH) continue;
        let open = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && ground(x + dx, y + dy)) open += 1;
        // A lawn with open ground all round, near the door; a narrow path between buildings last.
        cells.push({ x, y, score: far * 0.5 + (kind === 'quad' ? 0 : 3) + (8 - open) * 0.8 + this.hiddenAt(x, y) * 1.5 });
      }
    }
    if (cells.length === 0) return [];
    cells.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
    const best = cells[0]!;
    // The clump: the cells nearest the best one.
    const near = cells.slice().sort((a, b) => Math.hypot(a.x - best.x, a.y - best.y) - Math.hypot(b.x - best.x, b.y - best.y) || a.score - b.score);
    const out: Spot[] = [];
    for (const cell of near) {
      if (out.length >= n || Math.hypot(cell.x - best.x, cell.y - best.y) > 2.3) break;
      out.push({ x: cell.x + 0.3, y: cell.y + 0.35 });
      if (out.length < n) out.push({ x: cell.x + 0.7, y: cell.y + 0.68 });
    }
    return out;
  }

  /**
   * A way on foot from a point to beside a box of cells (DESIGN.md 69.5): over paths, open ground, streets and
   * crossings, never through a building, ending on the open cell nearest the box, a step towards it. For the grounds
   * workers and Campus Safety, who walked straight lines before. Null when there is none in reach.
   */
  wayBetween(ax: number, ay: number, box: { x: number; y: number; w: number; h: number }): Spot[] | null {
    const width = this.width;
    const sx = Math.floor(ax);
    const sy = Math.floor(ay);
    if (sx < 0 || sy < 0 || sx >= width || sy >= this.height) return null;
    const near = (c: number): boolean => {
      if (!this.isAfoot[c]) return false;
      const x = c % width;
      const y = (c - x) / width;
      const dx = Math.max(box.x - x, 0, x - (box.x + box.w - 1));
      const dy = Math.max(box.y - y, 0, y - (box.y + box.h - 1));
      return dx + dy <= 1;
    };
    const start = sy * width + sx;
    const cells = searchOnFoot(width, this.height, this.isAfoot, start, near, AFOOT_CELLS * 2, this.space);
    if (!cells) return null;
    const out: Spot[] = [{ x: ax, y: ay }];
    for (const c of cells) if (c !== start || this.isAfoot[c]) out.push({ x: (c % width) + 0.5, y: Math.floor(c / width) + 0.5 });
    const last = out[out.length - 1]!;
    const mx = box.x + box.w / 2;
    const my = box.y + box.h / 2;
    const reach = Math.hypot(mx - last.x, my - last.y);
    // A step towards it, staying on the open cell.
    if (reach > 0.01) out[out.length - 1] = { x: last.x + ((mx - last.x) / reach) * 0.3, y: last.y + ((my - last.y) / reach) * 0.3 };
    return out.length >= 2 ? out : null;
  }


  /**
   * Off they go (DESIGN.md 69.2): out of sight already, they are simply gone; in view, they walk to the nearest door and
   * in, or off the edge of the screen, and are gone when they get there. `again` sends them off anew, as when the map
   * changes under them.
   */
  private leave(walker: Walker, again = false): void {
    if (walker.exiting && !again) return;
    if (!this.seen(walker)) {
      walker.fading = 'out';
      return;
    }
    const way = this.approach(walker.x, walker.y);
    if (!way) {
      walker.fading = 'out';
      return;
    }
    way.reverse();
    walker.route = way;
    walker.leg = 1;
    walker.exiting = true;
    walker.lingerMs = 0;
    walker.resume = null;
    walker.rush = 1;
    walker.paceAnchor = null;
    walker.pacingStep = false;
  }

  /** True when every point of the straight line from a to b, a tenth of a cell apart, is open ground (69.5). */
  private clearLine(ax: number, ay: number, bx: number, by: number): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 10));
    for (let k = 0; k <= steps; k++) {
      const x = Math.floor(ax + ((bx - ax) * k) / steps);
      const y = Math.floor(ay + ((by - ay) * k) / steps);
      if (x < 0 || y < 0 || x >= this.width || y >= this.height || !this.isOpen[y * this.width + x]) return false;
    }
    return true;
  }

  /** The body this moment: laughing, cheering, a fan on game day, or as they feel; still with Reduce effects. */
  private poseOf(walker: Walker): Pose {
    if (!walker.feel && walker.laughUntil === 0 && walker.cheerUntil === 0) return STILL_POSE;
    if (effectsSetting() === 'reduced' || walker.fading === 'out') return STILL_POSE;
    const now = this.scene.time.now;
    if (now < walker.laughUntil && now >= walker.laughUntil - ICON_MS) return laughingAt(now, walker.phase);
    if (now < walker.cheerUntil) return cheeringAt(now, walker.phase);
    const moving = walker.lingerMs <= 0 && walker.talkMs <= 0;
    const fan = this.fanTint !== null && walker.goal === this.stadiumStop;
    const motion: Motion = fan ? 'hop' : (walker.feel?.motion ?? 'none');
    return motionAt(motion, now, moving, walker.phase);
  }

  // ------------------------------------------------------- student cards --

  /**
   * The walker at a point of the world, or null. `reach` widens each sprite,
   * because a walker is a small thing to hit with a thumb.
   */
  walkerAt(worldX: number, worldY: number, reach: number): { student: StudentRef | null; person: PersonRef | null; neighbour: boolean; far: number } | null {
    let found: Walker | null = null;
    let nearest = Infinity;
    for (const walker of this.walkers) {
      if (walker.fading === 'out') continue;
      const box = walker.sprite.getBounds();
      if (worldX < box.x - reach || worldX > box.right + reach || worldY < box.y - reach || worldY > box.bottom + reach) continue;
      const far = Math.hypot(worldX - box.centerX, worldY - box.centerY);
      if (far < nearest) {
        nearest = far;
        found = walker;
      }
    }
    return found ? { student: found.student, person: found.person, neighbour: found.kind === 'neighbour', far: nearest } : null;
  }

  private walkerOf(key: string): Walker | undefined {
    return this.walkers.find((walker) => walker.key === key && walker.fading !== 'out');
  }

  /** What that student is doing right now, or null when they are not out walking. */
  doing(key: string): Doing | null {
    const walker = this.walkerOf(key);
    if (walker && walker.talkMs > 0 && walker.talkWith && this.state) return `chatting:${firstNameOf(this.state, walker.talkWith)}`;
    if (!walker || !walker.goal) return null;
    // A scene (63.11): on a date with someone, out at a party.
    const scene = walker.party ? this.partyScene.get(walker.party) : undefined;
    if (scene && this.state) {
      const other = this.walkers.find((one) => one !== walker && one.party === walker.party && one.student);
      if (scene === 'date' && other?.student) return `date:${firstNameOf(this.state, other.student)}`;
      if (scene === 'party') return `party:${walker.goal.kind === 'quad' ? 'the lawn' : (walker.goal.name ?? 'campus')}`;
    }
    if (walker.goal.kind === 'house') return 'walkingHome';
    if (walker.from.kind === 'house') return 'walkingIn';
    if (walker.goal.kind === 'place') return walker.lingerMs > 0 ? `atPlace:${walker.goal.name ?? ''}` : `toPlace:${walker.goal.name ?? ''}`;
    if (walker.lingerMs > 0) return 'onQuad';
    if (walker.goal.kind === 'quad') return 'toQuad';
    if (walker.goal.zone === 'academic') return walker.from.zone === 'academic' ? 'nextClass' : 'toClass';
    return walker.from.kind === 'gate' ? 'movingIn' : 'toDorm';
  }

  /** Where that student is in the world, for the camera to follow. */
  spot(key: string): { x: number; y: number } | null {
    const walker = this.walkerOf(key);
    return walker ? this.iso.toWorld(walker.x, walker.y) : null;
  }

  /** The students out walking, nearest to a point of the world first. For the dev screenshot helper. */
  studentsNear(worldX: number, worldY: number): StudentRef[] {
    const far = (walker: Walker): number => {
      const at = this.iso.toWorld(walker.x, walker.y);
      return Math.hypot(at.x - worldX, at.y - worldY);
    };
    return this.walkers
      .filter((walker) => walker.student !== null && walker.fading !== 'out')
      .sort((a, b) => far(a) - far(b))
      .map((walker) => walker.student!);
  }

  /** The people who are not students and are out walking, nearest to a point of the world first. For the dev screenshot helper. */
  peopleNear(worldX: number, worldY: number): PersonRef[] {
    const far = (walker: Walker): number => {
      const at = this.iso.toWorld(walker.x, walker.y);
      return Math.hypot(at.x - worldX, at.y - worldY);
    };
    return this.walkers
      .filter((walker) => walker.person !== null && walker.fading !== 'out')
      .sort((a, b) => far(a) - far(b))
      .map((walker) => walker.person!);
  }

  /**
   * In the close-up (DESIGN.md 64.5) the student followed, and the friends or the date walking with them, are kept in
   * sight. Since L6 they stay where they stand in the drawing order, and whatever is drawn in front of them fades to
   * see-through (`markedSprites`, read by the scene): drawn over a wall, they looked as if they stood on its roof.
   */
  setMarkedOnTop(on: boolean): void {
    this.markedOnTop = on;
    this.markedParty = on && this.marked ? (this.walkerOf(this.marked)?.party ?? 0) : 0;
  }

  /** The student followed close up and those walking with them, as drawn now: none outside the close-up. */
  markedSprites(): Phaser.GameObjects.Image[] {
    if (!this.markedOnTop || this.marked === null) return [];
    const out: Phaser.GameObjects.Image[] = [];
    for (const walker of this.walkers) {
      if (walker.key === null || walker.fading === 'out' || !walker.sprite.visible) continue;
      if (walker.key === this.marked || (walker.party !== 0 && walker.party === this.markedParty)) out.push(walker.sprite);
    }
    return out;
  }

  /** Tonight's parties on the map (L6): where a friend group out for the night heads. */
  setPartySpots(spots: ReadonlyArray<{ x: number; y: number }>): void {
    this.partySpots = spots;
  }

  /** The key of the student whose card is open, or null. */
  get markedKey(): string | null {
    return this.marked;
  }

  /** Ring the walker whose card is open: a student by their key, anyone else by `p:` and their own. */

  setMarked(key: string | null): void {
    const changed = key !== this.marked;
    this.marked = key;
    if (key === null || !this.walkerOf(key)) this.ring?.setVisible(false);
    // Their card opened while they walk somewhere their day does not say: they turn back and go where it does
    // (DESIGN.md 63.9), back the way they came and on from there.
    const walker = key && changed ? this.walkerOf(key) : undefined;
    if (!walker || !walker.student || walker.fading !== null || walker.lingerMs > 0 || walker.talkMs > 0 || walker.party) return;
    const planned = this.plannedFrom(walker.from, walker.student);
    if (!planned || planned === walker.goal) return;
    const onward = this.routeBetween(walker.from, planned);
    if (!onward) return;
    const back = walker.route.slice(0, walker.leg).reverse();
    walker.route = [{ x: walker.x, y: walker.y }, ...back, ...onward.slice(1)];
    walker.leg = 1;
    walker.goal = planned;
  }

  // ---------------------------------------------------------------- town --

  /**
   * Keep the walk in from town going, and the neighbours on their streets.
   * These are a small, steady number who walk their whole way whether or not
   * they are on screen: a stream is only a stream if it does not stop when
   * the player looks away.
   */
  private topUpTown(): void {
    const scale = CROWD_STEPS[this.step]!.traffic;
    // Commuters: students who live on a street a path joins to campus.
    const classes = this.stops.filter((stop) => stop.zone === 'academic');
    if (this.commuterHouses.length > 0 && classes.length > 0 && this.walkingIn > 0) {
      const flow = COMMUTE[this.period];
      const wanted = Math.min(MAX_COMMUTERS, Math.round((this.walkingIn / WALKERS_IN_PER_COMMUTER) * flow.busy * scale * (this.weekend ? 0.4 : 1)));
      let out = 0;
      for (const walker of this.walkers) if (walker.kind === 'commuter') out += 1;
      if (out < Math.max(wanted, this.period === 'night' ? 0 : 1)) {
        const house = pick(this.commuterHouses)!;
        const hall = pick(classes)!;
        const student = this.offCampus.length > 0 ? pick(this.offCampus.filter((ref) => this.free(ref))) ?? null : null;
        const inbound = Math.random() < flow.inbound;
        // A stream that has only just begun is seeded along its length, so the street is not empty.
        if (student || this.offCampus.length === 0) this.start(inbound ? house : hall, inbound ? hall : house, out < wanted * 0.5, student, 'commuter');
      }
    }
    // Neighbours: never students, and there whether or not a path joins the town.
    if (this.houses.length > 1) {
      const wanted = Math.round(NEIGHBOURS_OUT[this.period] * scale);
      let out = 0;
      for (const walker of this.walkers) if (walker.kind === 'neighbour') out += 1;
      if (out < wanted) {
        const from = pick(this.houses)!;
        // Mostly to a house on the same street or the next: a short walk, not a march across town.
        const near = this.houses.filter((house) => house !== from && Math.abs((house.row ?? 0) - (from.row ?? 0)) <= 6 && (house.row !== from.row || sideOf(house) === sideOf(from)));
        const to = pick(near.length > 0 ? near : this.houses.filter((house) => house.row !== from.row || sideOf(house) === sideOf(from)));
        // A neighbour wears one of the two looks kept for the town, and has a card: who they are follows their house.
        const townie = this.people?.roles?.townie;
        const n = from.cell.y * this.width + from.cell.x;
        const extra: Extra = townie === undefined || from.hood === undefined ? {} : { person: { role: 'townie', n, at: from.hood }, look: townie + (n % 2) };
        if (to && to !== from) this.start(from, to, out < wanted * 0.6, null, 'neighbour', extra);
      }
    }
  }

  /** Somewhere for a professor or a member of staff to be going. */
  private workDestination(kind: 'professor' | 'staff', origin: Stop): Stop | undefined {
    const others = this.stops.filter((stop) => stop !== origin);
    const classes = others.filter((stop) => stop.zone === 'academic');
    const dorms = others.filter((stop) => stop.zone === 'housing');
    const quads = others.filter((stop) => stop.kind === 'quad');
    const places = others.filter((stop) => stop.kind === 'place');
    const food = places.filter((stop) => stop.family === 'dining');
    const office = places.filter((stop) => stop.use === 'office');
    const books = places.filter((stop) => stop.family === 'library' || stop.family === 'tutoring');
    const lunch = this.period === 'afternoon' ? 22 : 10;
    const choice =
      kind === 'professor'
        ? pickWeighted([[classes, 55], [books, 15], [food, lunch], [office, 8], [quads, 5]])
        : pickWeighted([[office, 30], [classes, 25], [food, lunch], [dorms, 15], [quads, 10]]);
    return pick(choice.length > 0 ? choice : classes.length > 0 ? classes : others);
  }

  /** A guide with a pennant and two parents behind, on a walk round the campus and back to where they came in. */
  private startTour(here: readonly Stop[], orientation = false): boolean {
    const roles = this.people?.roles;
    if (!roles || roles.guide === undefined || roles.parent === undefined) return false;
    // They set out where the player is looking: from a way onto campus when one is in view, or from any door.
    const gatesHere = this.gates.filter((gate) => here.some((stop) => stop.door === gate.door));
    const begin = pick(gatesHere.length > 0 ? gatesHere : here.filter((stop) => stop.kind !== 'quad'));
    if (!begin) return false;
    const others = this.stops.filter((stop) => stop !== begin);
    const classes = others.filter((stop) => stop.zone === 'academic');
    const dorms = others.filter((stop) => stop.zone === 'housing');
    const sights = others.filter((stop) => stop.kind === 'quad' || (stop.kind === 'place' && stop.use !== 'seat'));
    // A lecture hall, something worth seeing, a dorm, and back.
    const calls = [pick(classes), pick(sights), pick(dorms)].filter((stop): stop is Stop => !!stop);
    const route: Spot[] = [];
    let at = begin;
    for (const next of [...calls, begin]) {
      if (next === at) continue;
      const leg = this.routeBetween(at, next);
      if (!leg) continue;
      route.push(...(route.length === 0 ? leg : leg.slice(1)));
      at = next;
    }
    if (route.length < 4) return false;
    const tour = Math.floor(Math.random() * 100_000);
    const led = this.start(begin, begin, false, null, 'guide', {
      person: { role: 'guide', n: tour % Math.max(1, this.staffOnBooks) },
      look: roles.guide,
      route,
      pace: PACE * TOUR_PACE,
      prop: 'people.pennant',
    });
    if (!led) return false;
    // Orientation (R2): new students behind a leader with the pennant, in welcome week, in place of visitors.
    if (orientation) {
      const year = this.everyone[0]?.entryYear ?? 0;
      const fresh = this.everyone.filter((ref) => ref.entryYear === year && this.free(ref));
      for (let k = 1; k < ORIENTATION_SIZE && fresh.length > 0; k++) {
        const student = fresh.splice(Math.floor(Math.random() * fresh.length), 1)[0]!;
        this.queue.push({ from: begin, to: begin, inMs: k * TOUR_GAP_MS, student, extra: { route: route.map((spot) => ({ ...spot })), pace: PACE * TOUR_PACE } });
        if (this.onMemory) this.onMemory(student, 'Went round campus with an orientation group');
      }
      return true;
    }
    for (let k = 1; k < TOUR_SIZE; k++) {
      const n = tour * 2 + k;
      this.queue.push({
        from: begin,
        to: begin,
        inMs: k * TOUR_GAP_MS,
        student: null,
        kind: 'parent',
        extra: { person: { role: 'parent', n }, look: roles.parent + (n % 2), route: route.map((spot) => ({ ...spot })), pace: PACE * TOUR_PACE },
      });
    }
    return true;
  }

  /**
   * Keep the people who are not students among the crowd: professors and
   * staff by day, visitors at weekends. How many is a plain rule (see
   * `othersWanted`): what the payroll has for each student, and never more
   * than about a quarter of the people on screen.
   */
  private topUpOthers(here: readonly Stop[], studentsSeen: number, neighboursSeen: number): void {
    const roles = this.people?.roles;
    if (!roles || roles.professor === undefined || this.students <= 0) return;
    const want = othersWanted({ studentsInView: studentsSeen, students: this.students, faculty: this.faculty, staff: this.staffOnBooks, period: this.period, weekend: this.weekend });
    let professors = 0;
    let staff = 0;
    let tours = 0;
    let boosters = 0;
    let people = 0;
    for (const walker of this.walkers) {
      if (walker.fading === 'out') continue;
      if (walker.kind === 'professor') professors += 1;
      else if (walker.kind === 'staff') staff += 1;
      else if (walker.kind === 'guide') tours += 1;
      else if (walker.kind === 'booster') boosters += 1;
      else if (walker.kind !== 'parent') continue;
      people += 1;
    }
    for (const waiting of this.queue) if (waiting.kind === 'parent') people += 1;
    // A neighbour who has wandered into view counts against the share too.
    const room = Math.floor(studentsSeen / 3) - people - neighboursSeen;
    if (room <= 0) return;

    // One newcomer at a time. A kind that cannot be started just now does not hold up the next.
    if (professors < want.professors) {
      const origin = pick(here.filter((stop) => stop.zone === 'academic' || stop.family === 'library')) ?? pick(here.filter((stop) => stop.kind === 'building'));
      const to = origin ? this.workDestination('professor', origin) : undefined;
      const n = Math.floor(Math.random() * Math.max(1, this.faculty));
      if (origin && to && this.start(origin, to, professors < want.professors * 0.6, null, 'professor', { person: { role: 'professor', n }, look: roles.professor })) return;
    }
    if (staff < want.staff) {
      const origin = pick(here.filter((stop) => stop.kind === 'building' || (stop.kind === 'place' && (stop.use === 'office' || stop.use === 'food'))));
      const to = origin ? this.workDestination('staff', origin) : undefined;
      // Whose they are follows where they step out from: a kitchen, the store, or an office.
      let person: PersonRef = { role: 'advisor', n: Math.floor(Math.random() * Math.max(1, this.staffOnBooks)) };
      let look = roles.advisor;
      if (origin?.family === 'dining' && origin.placedId !== undefined && roles.chef !== undefined) {
        person = { role: 'chef', n: 0, at: origin.placedId };
        look = roles.chef;
      } else if (origin?.family === 'store' && origin.placedId !== undefined && roles.clerk !== undefined) {
        person = { role: 'clerk', n: 0, at: origin.placedId };
        look = roles.clerk;
      }
      if (origin && to && look !== undefined && this.start(origin, to, staff < want.staff * 0.6, null, 'staff', { person, look })) return;
    }
    // Welcome week (R2): orientation groups any day of it, as many as a weekend's tours.
    if (this.week === 'welcome' && tours < Math.max(2, want.tours) && room >= 2 && this.startTour(here, true)) return;
    if (tours < want.tours && room >= TOUR_SIZE && this.startTour(here)) return;
    if (boosters < want.boosters && roles.booster !== undefined) {
      const from = pick(here.filter((stop) => stop.kind !== 'quad'));
      const office = this.stops.filter((stop) => stop.use === 'office');
      const to = pick(office.length > 0 ? office : this.stops.filter((stop) => stop.kind === 'quad'));
      if (from && to && from !== to) this.start(from, to, false, null, 'booster', { person: { role: 'booster', n: Math.floor(Math.random() * 60) }, look: roles.booster, pace: PACE * 0.8 });
    }
  }

  update(deltaMs: number): void {
    const people = this.people;
    if (!people) return;
    this.rings = moodRingsSetting();
    const dt = Math.min(deltaMs, 100);
    const camera = this.scene.cameras.main;
    const view = camera.worldView;

    // People due to arrive.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const arrival = this.queue[i]!;
      arrival.inMs -= dt;
      if (arrival.inMs > 0) continue;
      this.start(arrival.from, arrival.to, false, arrival.student, arrival.kind ?? 'student', arrival.extra ?? {});
      this.queue.splice(i, 1);
    }

    // Walk.
    let seen = 0;
    let neighboursSeen = 0;
    this.seenAll = 0;
    this.crossingNow.clear();
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const walker = this.walkers[i]!;

      if (walker.fading === 'in') {
        walker.alpha = Math.min(1, walker.alpha + dt / FADE_MS);
        if (walker.alpha >= 1) walker.fading = null;
      } else if (walker.fading === 'out') {
        walker.alpha -= dt / FADE_MS;
        if (walker.alpha <= 0) {
          this.retire(i);
          continue;
        }
      }

      if (walker.talkMs > 0) {
        // Stopped on the path to talk with someone they met (DESIGN.md 63.8).
        walker.talkMs -= dt;
        if (walker.talkMs <= 0) walker.talkWith = null;
      } else if (walker.lingerMs > 0) {
        walker.lingerMs -= dt;
        this.pace(walker, dt);
        if (walker.lingerMs <= 0) {
          walker.paceAnchor = null;
          walker.pacingStep = false;
        }
        if (walker.lingerMs <= 0 && walker.resume) {
          // Done watching (DESIGN.md 64.4): on along the way they were going.
          walker.route = [{ x: walker.x, y: walker.y }, ...walker.resume];
          walker.leg = 1;
          walker.resume = null;
          walker.faceAt = null;
          walker.rush = 1;
        } else if (walker.lingerMs <= 0 && walker.goal) {
          // Rested on the lawn. Off to the next place: a party goes on together, where the first of them chose.
          const known = walker.party ? this.partyNext.get(walker.party) : undefined;
          const shared = known && known.from === walker.goal ? known : undefined;
          // The student whose card is open, at the place their day says, goes in and stays there (DESIGN.md 63.9).
          if (!shared && walker.student && walker.key === this.marked && this.staysAt(walker.goal, walker.student)) {
            walker.fading = 'out';
            continue;
          }
          const next = shared ? shared.goal : this.destinationFrom(walker.goal, walker.student);
          const route = next ? (shared ? shared.route.map((one) => ({ ...one })) : this.routeBetween(walker.goal, next)) : null;
          if (walker.party && next && route && !shared) this.partyNext.set(walker.party, { from: walker.goal, goal: next, route: route.map((one) => ({ ...one })) });
          if (next && route) {
            route[0] = { x: walker.x, y: walker.y };
            walker.route = route;
            walker.leg = 1;
            walker.from = walker.goal;
            walker.goal = next;
          } else {
            this.leave(walker);
          }
        }
      } else if (walker.fading !== 'out' || walker.leg < walker.route.length) {
        let step = (walker.pace * walker.rush * dt) / 1000;
        // At a crossing a car has, or is due, they wait at the kerb. Once on it they keep going.
        const ahead = walker.route[walker.leg];
        if (ahead) {
          const there = Math.floor(ahead.y) * this.width + Math.floor(ahead.x);
          const here = Math.floor(walker.y) * this.width + Math.floor(walker.x);
          const crossing = ahead.cross !== undefined ? ahead.cross : there !== here && this.isCrossing[there] ? there : -1;
          if (crossing >= 0 && !this.onRoad(walker.x, walker.y)) {
            if (this.carOn(crossing)) step = 0;
            // Stepping onto it: a car coming up to the line sees them this frame.
            else this.crossingNow.add(crossing);
          }
        }
        const waiting = step === 0;
        while (step > 0 && walker.leg < walker.route.length) {
          const target = walker.route[walker.leg]!;
          const dx = target.x - walker.x;
          const dy = target.y - walker.y;
          const left = Math.hypot(dx, dy);
          if (Math.abs(dx) >= Math.abs(dy)) walker.direction = dx >= 0 ? 'se' : 'nw';
          else walker.direction = dy >= 0 ? 'sw' : 'ne';
          if (left <= step) {
            walker.x = target.x;
            walker.y = target.y;
            walker.leg += 1;
            step -= left;
          } else {
            walker.x += (dx / left) * step;
            walker.y += (dy / left) * step;
            step = 0;
          }
        }
        if (!waiting) walker.stride += dt * ((walker.pace * walker.rush) / PACE);
        // Angry (69.1): a brisk stomp, and now and then the anger mark over their head, never a turn about.
        if (!waiting && walker.feel?.motion === 'stomp' && this.scene.time.now >= walker.angerAt) {
          walker.angerAt = this.scene.time.now + ANGER_MARK_MS.least + Math.random() * ANGER_MARK_MS.spread;
          if (this.inView(view, walker.x, walker.y, 0)) this.showIcon(walker, 'anger');
        }
        if (walker.leg >= walker.route.length && walker.fading !== 'out' && walker.watchMs > 0) {
          // At their place by a moment (DESIGN.md 64.4): they stand and watch it, facing it; or they are in the fountain.
          walker.lingerMs = walker.watchMs;
          walker.watchMs = 0;
          walker.rush = 1;
          if (walker.faceAt) walker.direction = facing(walker.faceAt.x - walker.x, walker.faceAt.y - walker.y);
          if (walker.fallOnArrive) {
            walker.fallOnArrive = false;
            walker.fallUntil = this.scene.time.now + walker.lingerMs;
            this.showIcon(walker, 'splash');
            this.showIcon(walker, 'sweat', 1400);
          }
        } else if (walker.leg >= walker.route.length && walker.fading !== 'out' && walker.exiting) {
          // At the door or past the edge (69.2): in, or out of sight.
          walker.fading = 'out';
        } else if (walker.leg >= walker.route.length && walker.fading !== 'out') {
          // On a lawn, at a bench or by a dining hall they stay a while. Onto a court they join the game.
          // A rider parks (a bike or an e-scooter at a rack, or against a wall) and goes on in (DESIGN.md 64.6).
          // Only at a door: anywhere else they ride on to one, or off the screen (69.2).
          if (walker.wheel && walker.goal && this.hasDoor(walker.goal)) this.park(walker);
          const stays = !walker.wheel && (walker.goal?.kind === 'quad' || (walker.goal?.kind === 'place' && walker.goal.use !== 'play'));
          // A party stays as long as each other: the same while for all of them, from who they are together.
          if (stays && walker.kind === 'student') {
            const scene = walker.party ? this.partyScene.get(walker.party) : undefined;
            const longer = scene === 'date' ? DATE_LINGER : scene === 'party' ? PARTY_NIGHT_LINGER : 1;
            walker.lingerMs = (walker.party ? 2500 + ((walker.party * 2654435761) >>> 0) % 5000 : 2500 + Math.random() * 5000) * longer;
          }
          // In at a door; anywhere else (a court, a gate, a lawn) they walk on to the nearest door or off the screen.
          else if (walker.goal && this.hasDoor(walker.goal)) walker.fading = 'out';
          else this.leave(walker);
        }
      }

      const cell = Math.floor(walker.y) * this.width + Math.floor(walker.x);
      if (this.isCrossing[cell]) this.crossingNow.add(cell);
      // On the road at a town crossing or a junction: cars wait for them.
      else if (this.plan && this.isStreet[cell]) {
        const on = onRoadway(this.plan, walker.x, walker.y);
        if (on >= 0) this.crossingNow.add(on);
      }

      if (this.inView(view, walker.x, walker.y, 40)) {
        this.seenAll += 1;
        if (walker.kind === 'student') seen += 1;
        else if (walker.kind === 'neighbour') neighboursSeen += 1;
        walker.offscreenMs = 0;
      } else if (walker.kind !== 'commuter' && walker.kind !== 'neighbour') {
        // Students, and the staff and visitors among them, fill the view the player is looking at. The few
        // who walk the town keep going unseen.
        walker.offscreenMs += dt;
        if (walker.offscreenMs > OFFSCREEN_LIMIT_MS && this.queue.length === 0) {
          this.retire(i);
          continue;
        }
      }
      if (walker.wheel) this.rideTick(walker, dt);
      this.draw(walker, people);
    }
    this.drawParked();

    // Top the view up. More students, a wider view and a higher crowd setting all mean more people.
    this.spawnClock += dt;
    if (this.spawnClock >= SPAWN_EVERY_MS) {
      this.spawnClock = 0;
      const wanted = this.wantedInView(view);
      this.crowdSeen = { students: seen, wanted };
      if (seen < wanted) {
        const here = this.stops.filter((stop) => this.inView(view, stop.cell.x + 0.5, stop.cell.y + 0.5, 0));
        // A big gap is closed several walkers at a time, so a busy campus does not take a minute to fill.
        const batch = Math.max(1, Math.min(6, Math.ceil((wanted - seen) / 10)));
        // In a class change people pour out of the lecture halls and the dorms (DESIGN.md 75.2), out of their doors.
        const changing = this.passing() > PASSING_FROM;
        const doors = changing ? here.filter((stop) => stop.kind === 'building' && (stop.zone === 'academic' || stop.zone === 'housing')) : [];
        for (let n = 0; n < batch; n++) {
          const from = doors.length > 0 && Math.random() < CHANGE_FROM_DOORS ? pick(doors) : pick(here);
          // Once there are students, every walker is one of them. Before that, staff.
          const student = from ? this.studentFor(from) : null;
          const to = from && (student || this.everyone.length === 0) ? this.destinationFrom(from, student) : undefined;
          // An emptier view is filled with people already on their way.
          // Now and then, someone a walker on screen knows, coming the other way (DESIGN.md 63.8).
          if (this.social && student && Math.random() < MEET_UP && this.meetUp(view)) continue;
          if (from && to && this.start(from, to, !changing && seen < wanted * 0.6, student, 'student', carried(from, to, this.period)) && student && this.social) this.bringCompanions(this.walkers[this.walkers.length - 1]!);
        }
      }
      // Too many for the hour now: a class has started, or the View at slider moved on to a quieter hour. Those with
      // the furthest still to go head in at the nearest door, or walk off the screen, so the paths empty through doors
      // (DESIGN.md 75.2) and nobody vanishes.
      // A few a second, so the paths empty over ten seconds or so, as a class starts.
      else if (seen > wanted * OVER_HOUR + 4) {
        this.thinBudget += (SPAWN_EVERY_MS / 1000) * Math.max(THIN_PER_SECOND[0], Math.min(THIN_PER_SECOND[1], (seen - wanted) / THIN_OVER_SECONDS));
        const count = Math.floor(this.thinBudget);
        this.thinBudget -= count;
        if (count > 0) this.thinOut(view, count);
      } else this.thinBudget = 0;
      // And among them, the people who work here or are visiting.
      this.topUpOthers(this.stops.filter((stop) => this.inView(view, stop.cell.x + 0.5, stop.cell.y + 0.5, 0)), seen, neighboursSeen);
      // Ground just come into sight stays fresh while the view moves and fills (69.2); once it has been still a moment,
      // or is full, everyone new walks in.
      const now = this.scene.time.now;
      const was = this.viewAt;
      if (Math.abs(view.x - was.x) > 2 || Math.abs(view.y - was.y) > 2 || Math.abs(view.width - was.width) > 2 || !(was.width > 0)) {
        this.movedAt = now;
        this.viewAt = { x: view.x, y: view.y, width: view.width };
      }
      if (now - this.movedAt > FRESH_MS || seen >= wanted * 0.85) this.knowView();
    }
    this.socialClock += dt;
    if (this.socialClock >= SOCIAL_EVERY_MS) {
      this.socialClock = 0;
      if (this.social) this.socialTick(view);
    }
    this.drawIcons(dt);
    this.townClock += dt;
    if (this.townClock >= 450) {
      this.townClock = 0;
      this.topUpTown();
    }

    // "+24 moving in" floats up and fades.
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const banner = this.banners[i]!;
      banner.ageMs += dt;
      const life = banner.ageMs / 3200;
      // About 15 px tall on screen at any zoom. The canvas is drawn at the screen's own pixel density.
      banner.text.setScale(0.5 / this.scene.scale.zoom / camera.zoom);
      banner.text.y -= (dt / 1000) * 14;
      banner.text.setAlpha(life < 0.7 ? 1 : Math.max(0, 1 - (life - 0.7) / 0.3));
      if (life >= 1) {
        banner.text.destroy();
        this.banners.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------ the social crowd --

  /**
   * Sends `count` students on their way in (75.2): those in view with the furthest to go, not followed, not mid-talk
   * and not riding. Friends walking together go in together, at the nearest door to each.
   */
  private thinOut(view: Phaser.Geom.Rectangle, count: number): void {
    const far: Walker[] = [];
    for (const walker of this.walkers) {
      if (walker.kind !== 'student' || walker.exiting || walker.fading !== null || walker.wheel) continue;
      if (walker.lingerMs > 0 || walker.watchMs > 0 || walker.talkMs > 0) continue;
      if (walker.student && studentKey(walker.student) === this.marked) continue;
      if (walker.party !== 0 && walker.party === this.markedParty) continue;
      if (walker.route.length - walker.leg < THIN_FROM_LEGS || !this.inView(view, walker.x, walker.y, 0)) continue;
      far.push(walker);
    }
    far.sort((a, b) => b.route.length - b.leg - (a.route.length - a.leg));
    for (const walker of far.slice(0, count)) {
      if (walker.party === 0) this.leave(walker);
      else for (const one of this.walkers) if (one.party === walker.party && !one.exiting && one.fading !== 'out') this.leave(one);
    }
  }

  /** Where a student's day sends them next, from their schedule at the player's hour; undefined to choose as usual. */
  private plannedFrom(origin: Stop, student: StudentRef): Stop | undefined {
    if (!this.state) return undefined;
    const card = studentCard(this.state, student);
    if (!card) return undefined;
    const item = itemAt(regularDay(socialWeb.view, this.state, student, card), shownHour());
    if (!item) return undefined;
    const others = this.stops.filter((stop) => stop !== origin);
    const places = others.filter((stop) => stop.kind === 'place');
    const home = this.stopAt.get(this.homes.get(studentKey(student)) ?? -1);
    const list: Stop[] =
      item.where === 'class'
        ? others.filter((stop) => stop.zone === 'academic')
        : item.where === 'food'
          ? places.filter((stop) => stop.use === 'food')
          : item.where === 'play'
            ? places.filter((stop) => stop.use === 'play')
            : item.where === 'seat'
              ? places.filter((stop) => stop.use === 'seat' || stop.use === 'other')
              : item.where === 'quad'
                ? others.filter((stop) => stop.kind === 'quad')
                : home && home !== origin
                  ? [home]
                  : [];
    // A meal, or a game or a workout, at the place they use for it (DESIGN.md 83.5): most often the nearest, another when
    // theirs is full.
    if (item.where === 'food' || (item.where === 'play' && item.pastime)) {
      const used = placeUsedFor(this.state, student, item.where === 'food' ? 'food' : item.pastime!);
      const stop = used ? list.find((one) => one.placedId === used.id) : undefined;
      if (stop) return stop;
    }
    // A class in its own hall (R4b, DESIGN.md 81.6): the lecture hall nearest the one the schedule names.
    if (item.where === 'class' && item.at && list.length > 0) {
      const at = item.at;
      let best = list[0]!;
      let near = Infinity;
      for (const stop of list) {
        const d = Math.abs(stop.cell.x - at.x) + Math.abs(stop.cell.y - at.y);
        if (d < near) {
          near = d;
          best = stop;
        }
      }
      return best;
    }
    return pick(list);
  }

  /** True when a student's day has them where they are now: a place of the kind their schedule says. */
  private staysAt(stop: Stop, student: StudentRef): boolean {
    if (!this.state) return false;
    const card = studentCard(this.state, student);
    const item = card ? itemAt(regularDay(socialWeb.view, this.state, student, card), shownHour()) : null;
    if (!item) return false;
    if (item.where === 'food') return stop.kind === 'place' && stop.use === 'food';
    if (item.where === 'play') return stop.kind === 'place' && stop.use === 'play';
    if (item.where === 'seat') return stop.kind === 'place' && (stop.use === 'seat' || stop.use === 'other');
    return false;
  }

  /** A line for a student's memory, if anyone is listening. */
  private remember(walker: Walker, text: string): void {
    if (walker.student && this.onMemory) this.onMemory(walker.student, text);
  }

  private first(walker: Walker): string {
    return walker.student && this.state ? firstNameOf(this.state, walker.student) : 'someone';
  }

  /** Where a walker is drawn: their own spot, or their place beside the first of their party, across the way they go. */
  private placeOf(walker: Walker): { x: number; y: number } {
    // A copy, never the walker itself: the drawing steps a rider aside from it, and that step must not move them
    // (DESIGN.md 69.1: it was added to where they were every frame, so riders drifted off the path and zigzagged back).
    if (!walker.party) return { x: walker.x, y: walker.y };
    const [across, behind] = walker.place;
    // Walking along x (south-east or north-west) the party spreads along y, and the other way about.
    const alongX = walker.direction === 'se' || walker.direction === 'nw';
    const back = walker.direction === 'se' || walker.direction === 'sw' ? -behind : behind;
    return alongX ? { x: walker.x + back, y: walker.y + across } : { x: walker.x + across, y: walker.y + back };
  }

  /**
   * A student setting out may bring their partner, or two or three of their friend group: they walk the same way side
   * by side (DESIGN.md 63.8). Only those free to come: not out walking already, not standing in a game or a line.
   */
  private bringCompanions(leader: Walker): void {
    const view = socialWeb.view;
    if (!view || !leader.student || !this.state || leader.kind !== 'student' || !leader.goal) return;
    // A rider goes alone: friends walking with them would walk their way along the bike path (DESIGN.md 73).
    if (leader.wheel || leader.laned) return;
    const all = companionsOf(view, this.state, leader.student);
    if (all.length === 0) return;
    const first = tieOf(view, leader.student, all[0]!);
    const couple = first !== null && first.kind >= KIND.dating && first.kind <= KIND.longterm;
    const roll = Math.random();
    const evening = this.period === 'evening' || this.period === 'night';
    // On a party night someone who likes parties, out with their friend group, makes for a lawn (63.11).
    const partyMood = !couple && evening && roll < PARTY_NIGHT_GROUP && this.partyNight() && likesParties(view, leader.student);
    // A party tonight (L6): they head for the stop nearest it, so the crowd there is seen arriving a group at a time.
    const partyAt = this.partySpots.length > 0 ? this.partySpots[Math.floor(Math.random() * this.partySpots.length)]! : null;
    const partyStop = partyAt ? this.nearestStop(partyAt.x, partyAt.y, leader.from) : null;
    if (partyMood && (partyStop ? leader.goal !== partyStop : leader.goal.kind !== 'quad')) {
      const lawns = this.stops.filter((stop) => stop.kind === 'quad' && stop !== leader.from);
      const lawn = partyStop ?? lawns[Math.floor(Math.random() * lawns.length)];
      const route = lawn ? this.routeBetween(leader.from, lawn) : null;
      if (lawn && route) {
        route[0] = { x: leader.x, y: leader.y };
        leader.route = route;
        leader.leg = 1;
        leader.goal = lawn;
      }
    }
    // A couple out together in the evening make it a date: somewhere to eat, a bench or a lawn (63.11).
    const suitsDate = (stop: Stop): boolean => stop.kind === 'quad' || (stop.kind === 'place' && (stop.use === 'food' || stop.use === 'seat'));
    const dateMood = couple && evening && roll < DATE_WITH_PARTNER;
    if (dateMood && !suitsDate(leader.goal)) {
      const spots = this.stops.filter((stop) => stop !== leader.from && stop.kind === 'place' && stop.use === 'food');
      const spot = spots[Math.floor(Math.random() * spots.length)];
      const route = spot ? this.routeBetween(leader.from, spot) : null;
      if (spot && route) {
        route[0] = { x: leader.x, y: leader.y };
        leader.route = route;
        leader.leg = 1;
        leader.goal = spot;
      }
    }
    const goal = leader.goal;
    const date = dateMood && suitsDate(goal);
    const partyNight = partyMood && (goal.kind === 'quad' || goal === partyStop);
    const want = couple
      ? date || roll < WITH_PARTNER
        ? 1
        : 0
      : partyNight
        ? 2 + Math.floor(Math.random() * 4)
        : roll < WITH_GROUP
          ? 1 + Math.floor(Math.random() * 3)
          : 0;
    const take = all.filter((ref) => this.free(ref)).slice(0, Math.min(want, (partyNight ? PARTY_NIGHT_MAX : PARTY_MAX) - 1));
    if (take.length === 0) return;
    const party = ++this.partySeq;
    leader.party = party;
    leader.place = PARTY_PLACES[0]!;
    const scene = date ? 'date' : partyNight && take.length >= 2 ? 'party' : null;
    if (scene) this.partyScene.set(party, scene);
    if (couple) this.partyCouple.add(party);
    const all3 = [leader.student, ...take];
    for (const ref of all3) {
      const rest = firstNamesOf(this.state!, all3.filter((one) => one !== ref));
      const names = rest.length <= 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}`;
      if (this.onMemory) this.onMemory(ref, scene === 'date' ? `On a date with ${names}` : scene === 'party' ? `Out at a party on the lawn with ${names}` : `Walked out with ${names}`);
    }
    take.forEach((ref, i) => {
      this.start(leader.from, leader.goal!, false, ref, 'student', {
        route: leader.route.map((one) => ({ ...one })),
        leg: leader.leg,
        at: { x: leader.x, y: leader.y },
        pace: leader.pace,
        party,
        place: PARTY_PLACES[i + 1]!,
      });
    });
  }

  /**
   * Send someone a walker on screen knows the other way along their path, so the two meet: a friend or a partner most
   * often, now and then an acquaintance, a crush, an ex or a rival. False when nobody suits.
   */
  private meetUp(view: Phaser.Geom.Rectangle): boolean {
    const web = socialWeb.view;
    if (!web || !this.state) return false;
    // Not a rider: whoever comes to meet them walks their way back, and a rider's way may be along the bike path.
    const walking = this.walkers.filter((one) => one.kind === 'student' && one.student && one.fading === null && one.lingerMs <= 0 && one.talkMs <= 0 && !one.party && !one.wheel && !one.laned && one.goal && one.leg < one.route.length - 2 && this.inView(view, one.x, one.y, 0));
    // The student the player follows is who people come to meet, half the time: their day is the one being watched.
    const watched = walking.find((one) => one.key === this.marked && one.socialAt <= this.scene.time.now);
    const walker = watched && Math.random() < 0.5 ? watched : walking[Math.floor(Math.random() * walking.length)];
    if (!walker || !walker.goal) return false;
    const id = idIn(web, walker.student!);
    if (id < 0) return false;
    const close: StudentRef[] = [];
    const other: StudentRef[] = [];
    for (let k = 0; k < SLOTS; k++) {
      const s = id * SLOTS + k;
      const b = web.other[s]!;
      if (b < 0) continue;
      const ref = refIn(web, b);
      if (!this.free(ref)) continue;
      const kind = web.kind[s]!;
      (kind === KIND.met || kind === KIND.ex || kind === KIND.rival || kind === KIND.enemy || kind === KIND.crush ? other : close).push(ref);
    }
    const pool = close.length > 0 && (other.length === 0 || Math.random() < 0.65) ? close : other;
    const ref = pool[Math.floor(Math.random() * pool.length)];
    if (!ref) return false;
    // They come round the corner a few steps ahead on the walker's own path, going the other way.
    const ahead = Math.min(walker.route.length - 1, walker.leg + MEET_AHEAD);
    const route = walker.route.slice(0, ahead + 1).reverse().map((one) => ({ ...one }));
    if (!this.start(walker.goal, walker.from, false, ref, 'student', { route, leg: 1 })) return false;
    // Both are ready to meet: they were sent to.
    this.walkers[this.walkers.length - 1]!.socialAt = 0;
    walker.socialAt = 0;
    return true;
  }

  /** Show an icon over a walker's head from `inMs` from now, if there is room for it. */
  private showIcon(walker: Walker, emote: string, inMs = 0): void {
    const key = `emote.${emote}`;
    if (!this.art.has(key)) return;
    const now = this.scene.time.now;
    const room = effectsSetting() === 'reduced' ? 0 : (ICONS_AT_STEP[this.step] ?? 5);
    const live = this.icons.filter((one) => one.endAt > now).length;
    // The student whose card is open always shows theirs: it is who the player is watching.
    if (live >= room && walker.key !== this.marked) return;
    this.icons.push({ walker, key, big: false, startAt: now + inMs, endAt: now + inMs + ICON_MS, image: null });
    // Laughing, bouncing and shaking, while the laugh shows.
    if (emote === 'laugh') walker.laughUntil = now + inMs + ICON_MS;
  }

  /** Turn the social crowd on or off: off, the crowd walks as it did before stop 4. For the dev page. */
  setSocial(on: boolean): void {
    this.social = on;
  }

  /** True while an icon shows over this student: the map then leaves their mood's emote off (DESIGN.md 63.7). */
  hasIcon(key: string): boolean {
    const now = this.scene.time.now;
    return this.icons.some((one) => one.walker.key === key && one.startAt <= now && one.endAt > now);
  }

  private drawIcons(dt: number): void {
    const now = this.scene.time.now;
    for (let i = this.icons.length - 1; i >= 0; i--) {
      const icon = this.icons[i]!;
      if (icon.endAt <= now || !this.walkers.includes(icon.walker)) {
        if (icon.image) {
          icon.image.setVisible(false);
          this.iconPool.push(icon.image);
        }
        this.icons.splice(i, 1);
        continue;
      }
      if (icon.startAt > now) continue;
      if (!icon.image) {
        icon.image = this.iconPool.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
        this.art.apply(icon.image, icon.key);
        icon.image.setScale(ICON_SCALE);
      }
      const walker = icon.walker;
      const age = now - icon.startAt;
      const left = icon.endAt - now;
      const fade = Math.min(1, age / 150, left / 200);
      const rise = Math.min(1, age / 200) * 4;
      // A big moment pops in a little larger than it settles (DESIGN.md 64.3).
      if (icon.big) icon.image.setScale(BIG_SCALE * (age < 160 ? 0.6 + (0.5 * age) / 160 : age < 260 ? 1.1 - (0.1 * (age - 160)) / 100 : 1));
      icon.image
        .setPosition(walker.sprite.x, walker.sprite.y - (icon.big ? BIG_LIFT : ICON_LIFT) - rise)
        .setDepth(walker.sprite.depth + 0.2)
        .setAlpha(fade * walker.alpha)
        .setVisible(true);
    }
    void dt;
  }

  /**
   * Who meets whom (DESIGN.md 63.8), a few times a second: students in view who pass within half a cell of each other.
   * Two who know each other well enough stop, face each other, greet and talk about something they share; an
   * acquaintance waves in passing; a crush, an ex or a rival shows on their face; two strangers who would click, a
   * sparkle. Each then rests a while. A party lingering together talks among itself.
   */
  private socialTick(view: Phaser.Geom.Rectangle): void {
    const web = socialWeb.view;
    if (!web || !this.state) return;
    const now = this.scene.time.now;
    const byCell = new Map<number, Walker[]>();
    const ready: Walker[] = [];
    const lingering = new Map<number, Walker[]>();
    for (const walker of this.walkers) {
      if (walker.kind !== 'student' || !walker.student || walker.fading !== null) continue;
      if (!this.inView(view, walker.x, walker.y, 0)) continue;
      const cell = Math.floor(walker.y) * this.width + Math.floor(walker.x);
      const list = byCell.get(cell);
      if (list) list.push(walker);
      else byCell.set(cell, [walker]);
      if (walker.socialAt <= now && walker.talkMs <= 0) ready.push(walker);
      if (walker.party && walker.lingerMs > 0) {
        const party = lingering.get(walker.party);
        if (party) party.push(walker);
        else lingering.set(walker.party, [walker]);
      }
    }
    for (const a of ready) {
      if (a.socialAt > now || a.talkMs > 0) continue;
      const cx = Math.floor(a.x);
      const cy = Math.floor(a.y);
      let met: Walker | null = null;
      for (let dy = -1; dy <= 1 && !met; dy++) {
        for (let dx = -1; dx <= 1 && !met; dx++) {
          for (const b of byCell.get((cy + dy) * this.width + cx + dx) ?? []) {
            if (b === a || (a.party && b.party === a.party) || b.socialAt > now || b.talkMs > 0) continue;
            if (Math.hypot(b.x - a.x, b.y - a.y) <= MEET_WITHIN) {
              met = b;
              break;
            }
          }
        }
      }
      if (met) this.meet(web, a, met, now);
    }
    for (const [party, members] of lingering) {
      if (members.length < 2) continue;
      const due = this.partyChatAt.get(party) ?? now;
      if (due > now) continue;
      this.partyChatAt.set(party, now + PARTY_CHAT_MS * (0.7 + Math.random() * 0.6));
      const speaker = members[Math.floor(Math.random() * members.length)]!;
      const listener = members.find((one) => one !== speaker)!;
      const scene = this.partyScene.get(party);
      const say = scene === 'date' ? DATE_CHAT[Math.floor(Math.random() * DATE_CHAT.length)]! : scene === 'party' ? PARTY_NIGHT_CHAT[Math.floor(Math.random() * PARTY_NIGHT_CHAT.length)]! : topicFor(web, speaker.student!, listener.student!, Math.random());
      this.showIcon(speaker, say);
    }
    // A couple out together: little hearts between them now and then, and once a kiss on the cheek (DESIGN.md 64.3).
    const couples = new Map<number, Walker[]>();
    for (const walker of this.walkers) {
      if (!walker.party || !this.partyCouple.has(walker.party) || walker.fading !== null || !this.inView(view, walker.x, walker.y, 0)) continue;
      const list = couples.get(walker.party);
      if (list) list.push(walker);
      else couples.set(walker.party, [walker]);
    }
    for (const [party, pair] of couples) {
      if (pair.length < 2) continue;
      const due = this.heartAt.get(party);
      if (due === undefined) {
        this.heartAt.set(party, now + HEART_EVERY_MS * Math.random());
        continue;
      }
      if (due > now) continue;
      this.heartAt.set(party, now + HEART_EVERY_MS * (0.7 + Math.random() * 0.6));
      const one = pair[Math.floor(Math.random() * pair.length)]!;
      if (Math.random() < KISS_SHARE && effectsSetting() !== 'reduced') this.showBig(one, 'kiss');
      else this.showIcon(one, 'heart');
    }
    if (this.heartAt.size > 200) this.heartAt.clear();
    if (this.partyCouple.size > 200) this.partyCouple.clear();
    // Parties that have gone: forget where they were going.
    if (this.partyNext.size > 200) this.partyNext.clear();
    if (this.partyChatAt.size > 200) this.partyChatAt.clear();
    if (this.partyScene.size > 200) this.partyScene.clear();
  }

  private meet(web: WebView, a: Walker, b: Walker, now: number): void {
    const ta = tieOf(web, a.student!, b.student!);
    const tb = tieOf(web, b.student!, a.student!);
    a.socialAt = now + SOCIAL_REST_MS;
    b.socialAt = now + SOCIAL_REST_MS;
    // A small moment (63.11): a friend passing a group lingering together joins it there, and meets the rest.
    if (!a.party && a.lingerMs <= 0 && b.party && b.lingerMs > 0 && b.goal && stopsToTalk(ta) && stopsToTalk(tb)) {
      this.join(web, a, b);
      return;
    }
    // Friends, a partner, a roommate: they stop, face each other, greet, and talk about something they share.
    if (stopsToTalk(ta) && stopsToTalk(tb) && !a.party && !b.party) {
      const greeting = greetingFor(ta!, Math.random()) ?? 'wave';
      for (const [one, other] of [[a, b], [b, a]] as const) {
        // One on their way stops; one already standing somewhere stays a little longer.
        if (one.lingerMs > 0) one.lingerMs = Math.max(one.lingerMs, TALK_MS);
        else one.talkMs = TALK_MS;
        one.talkWith = other.student;
        const dx = other.x - one.x;
        const dy = other.y - one.y;
        one.direction = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
        this.showIcon(one, greeting);
      }
      const topic = topicFor(web, a.student!, b.student!, Math.random());
      this.showIcon(a, topic, 1100);
      this.showIcon(b, topic === 'speech' ? 'laugh' : topic, 2400);
      const about = TOPIC_WORDS[topic];
      for (const [one, other] of [[a, b], [b, a]] as const) this.remember(one, `${GREETING_WORDS[greeting]} ${this.first(other)}${about ? ` and talked about ${about}` : ' and stopped to talk'}`);
      return;
    }
    // An acquaintance waves in passing.
    if (ta && greetingFor(ta, 0) === 'wave') {
      this.showIcon(a, 'wave');
      this.remember(a, `Waved at ${this.first(b)}`);
      if (tb && greetingFor(tb, 0) === 'wave') {
        this.showIcon(b, 'wave', 250);
        this.remember(b, `Waved at ${this.first(a)}`);
      }
      return;
    }
    // The rivalry game day (DESIGN.md 77.1): a fan of ours and one of theirs, both on the way, trade taunts, a laugh
    // and a scowl, and go on. No more than words.
    if (a.tinted && b.tinted && a.away !== b.away) {
      const ours = a.away ? b : a;
      const theirs = a.away ? a : b;
      this.showIcon(ours, 'laugh');
      this.showIcon(theirs, 'anger', 300);
      this.showIcon(ours, 'speech', 1300);
      this.remember(ours, 'Traded taunts with a rival fan on the way to the game');
      return;
    }
    // On a rowdy campus, strangers passing bump and glare (DESIGN.md 76.5): short tempers, no more than that.
    if (ta === null && tb === null && this.chaos.bump > 0 && Math.random() < this.chaos.bump) {
      this.showIcon(a, 'anger');
      this.showIcon(b, Math.random() < 0.5 ? 'anger' : 'sweat', 250);
      this.remember(a, `Bumped into ${this.first(b)} and glared`);
      this.remember(b, `Bumped into ${this.first(a)}`);
      return;
    }
    // A crush, an ex, a rival, or a stranger they would click with: it shows on their face.
    const chem = ta === null && tb === null ? chemistryOf(web, a.student!, b.student!) : 0;
    const ra = reactionFor(ta, chem);
    const rb = reactionFor(tb, chem);
    if (ra === 'sparkle') {
      this.showIcon(a, 'sparkle');
      this.remember(a, `Caught the eye of ${this.first(b)}`);
      return;
    }
    // Two who are angry with each other have it out, in a big bubble (DESIGN.md 64.3).
    if (ra === 'anger' && rb === 'anger') {
      this.showBig(a, 'argue');
      this.showIcon(b, 'anger', 300);
      this.remember(a, passingWords(ta, ra, this.first(b)));
      this.remember(b, passingWords(tb, rb, this.first(a)));
      return;
    }
    if (ra) {
      this.showIcon(a, ra);
      this.remember(a, passingWords(ta, ra, this.first(b)));
    }
    if (rb) {
      this.showIcon(b, rb, 200);
      this.remember(b, passingWords(tb, rb, this.first(a)));
    }
  }

  /** A walker joins a party lingering together on the spot (63.11): beside them, for as long as they stay, and on with them. */
  private join(web: WebView, a: Walker, b: Walker): void {
    const party = b.party!;
    const members = this.walkers.filter((one) => one.party === party);
    a.party = party;
    a.place = PARTY_PLACES[members.length % PARTY_PLACES.length]!;
    a.goal = b.goal;
    a.route = [{ x: a.x, y: a.y }];
    a.leg = 1;
    a.lingerMs = b.lingerMs;
    this.showIcon(a, greetingFor(tieOf(web, a.student!, b.student!)!, Math.random()) ?? 'wave');
    const where = b.goal?.kind === 'quad' ? 'on the lawn' : b.goal?.name ? `at the ${b.goal.name}` : 'there';
    this.remember(a, `Joined ${this.first(b)} and friends ${where}`);
    // Anyone there they did not know, they meet through the friend who was there.
    for (const one of members) {
      if (one === b || !one.student || tieOf(web, a.student!, one.student) !== null) continue;
      this.remember(a, `Met ${this.first(one)} through ${this.first(b)}`);
      this.remember(one, `Met ${this.first(a)} through ${this.first(b)}`);
    }
  }

  /** The stop nearest a spot of the map, other than one: where someone heading for a party walks to (L6). */
  private nearestStop(x: number, y: number, not: Stop | null): Stop | null {
    let best: Stop | null = null;
    let far = Infinity;
    for (const stop of this.stops) {
      if (stop === not) continue;
      const d = Math.hypot(stop.cell.x + 0.5 - x, stop.cell.y + 0.5 - y);
      if (d < far) {
        far = d;
        best = stop;
      }
    }
    return best;
  }

  /** A party night: Thursday to Saturday on the game's calendar (as a regular's day has it, 63.9). */
  private partyNight(): boolean {
    if (!this.state) return false;
    const weekday = dateAt(this.state.clock).weekday;
    return weekday === 4 || weekday === 5 || weekday === 6;
  }

  private wantedInView(view: Phaser.Geom.Rectangle): number {
    if (this.stops.length === 0 || this.pathCells === 0) return 0;
    let visible = 0;
    for (let i = 0; i < this.isPath.length; i++) {
      if (!this.isPath[i]) continue;
      const x = i % this.width;
      if (this.inView(view, x + 0.5, (i - x) / this.width + 0.5, 0)) visible += 1;
    }
    const wanted = walkersWanted({ students: this.students, pathCells: this.pathCells, visiblePathCells: visible, level: pathsAt(this.hour, this.day), step: this.step });
    // Fewer on a break, half as many again on a home game day, and never an empty campus.
    return Math.max(Math.min(wanted, 3), Math.round(wanted * this.presence * (1 - this.resting) * (this.fanTint !== null ? GAME_DAY_CROWD : 1)));
  }

  /** How many walkers are alive. For tests and the dev console. */
  get count(): number {
    return this.walkers.length;
  }

  /** How many of each kind are out. For the dev readout. */
  get counts(): { students: number; commuters: number; neighbours: number; professors: number; staff: number; visitors: number } {
    const counts = { students: 0, commuters: 0, neighbours: 0, professors: 0, staff: 0, visitors: 0 };
    for (const walker of this.walkers) {
      const kind = walker.kind;
      counts[kind === 'student' ? 'students' : kind === 'commuter' ? 'commuters' : kind === 'neighbour' ? 'neighbours' : kind === 'professor' ? 'professors' : kind === 'staff' ? 'staff' : 'visitors'] += 1;
    }
    return counts;
  }

  clear(): void {
    for (const icon of this.icons) icon.image?.destroy();
    for (const image of this.iconPool) image.destroy();
    this.icons = [];
    this.iconPool = [];
    this.partyNext.clear();
    this.partyChatAt.clear();
    for (const walker of this.walkers) walker.prop?.destroy();
    for (const walker of this.walkers) walker.ring?.destroy();
    for (const walker of this.walkers) walker.sprite.destroy();
    for (const sprite of this.pool) sprite.destroy();
    for (const ring of this.ringPool) ring.destroy();
    for (const walker of this.walkers) walker.wheelSprite?.destroy();
    for (const one of this.parked) one.image.destroy();
    this.parked = [];
    this.ringPool = [];
    this.ringsShown = 0;
    this.felt.clear();
    this.heartAt.clear();
    this.partyCouple.clear();
    for (const banner of this.banners) banner.text.destroy();
    this.ring?.destroy();
    this.ring = null;
    this.out.clear();
    this.crossingNow.clear();
    this.walkers = [];
    this.pool = [];
    this.banners = [];
    this.queue = [];
    this.stops = [];
    this.gates = [];
    this.houses = [];
    this.commuterHouses = [];
  }
}
