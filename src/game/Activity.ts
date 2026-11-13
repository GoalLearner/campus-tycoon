import Phaser from 'phaser';
import { activityWords, findStudent, type ActivityRole, type Stander } from '../app/activityPeople';
import { CROWD_STEPS, mealNow, playingNow, queueNow } from '../app/crowd';
import type { DayPeriod } from '../app/daylight';
import { enrollment, foodTrade, isBrokenThing, isPathKind, PLACED, playUse, sampleStudents, SEAT_REACH, studentFigure, studentKey, type GameState, type Placed, type PlayUse, type StudentRef } from '../sim';
import type { Art, PeopleSpec, WalkDirection } from './art';
import { facingOf, type Box, type Iso } from './iso';

/**
 * People using the campus, for show: a game on the courts, runners circling
 * the track, swimmers in the pool, a match on the recreation field, a line
 * beside a building with more players than room, people at benches and
 * picnic tables, a line at each place to eat when its kind of food is busy,
 * and people among the stalls of the food court.
 *
 * How many are there comes from the simulation's own numbers: each
 * building's demand at the busiest hour and what it holds (see
 * `src/sim/systems/play.ts`), scaled by the part of the player's day.
 * Afternoons and evenings are busiest. Where each figure stands and how it
 * moves is only for show. Nothing here is saved, nothing here changes a
 * number, and nothing here runs while the game is closed.
 *
 * Each figure is one enrolled student (DESIGN.md 13.12), found from the seed
 * by `findStudent`, so a tap on them opens the ordinary student card.
 */

/** Of the students playing at a building, the most that are drawn on it. A court fits two games. */
const SHOWN: Record<string, number> = { courts: 8, field: 10, track: 8, pool: 7, gym: 2 };
/**
 * Where the playing surface lies inside each building's footprint, in cells
 * from its north corner. Measured from the art: the court, the pitch, the
 * water and the running track do not fill their footprints, and the track
 * shares its with a stand. Measure again if the art changes.
 */
const SURFACE: Record<string, { x0: number; x1: number; y0: number; y1: number }> = {
  courts: { x0: 0.84, x1: 1.8, y0: 0.22, y1: 1.8 },
  field: { x0: 0.8, x1: 1.85, y0: 0.15, y1: 1.8 },
  pool: { x0: 0.5, x1: 1.89, y0: 0.12, y1: 0.88 },
  track: { x0: 0.9, x1: 1.7, y0: 0.25, y1: 1.72 },
};
/** How far apart people stand in a line, in cells. */
const LINE_GAP = 0.3;
/** The longest line drawn beside a building, however many are waiting. */
const LINE_SHOWN = 6;
/** The share of benches and of picnic-table places taken in each part of the day. */
const SEATED: Record<DayPeriod, number> = { morning: 0.3, afternoon: 0.6, evening: 0.5, night: 0 };
const TABLE_SEATS = 3;
/** A table or a bench beside food that is busy is this full of people eating, at that food's busiest. */
const EATING_SHARE = 0.9;
/** Where people stand among the food court's stalls, in cells from its north corner, and the most that do. */
const STALL_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [1.0, 1.5],
  [1.55, 1.1],
  [0.6, 1.75],
  [1.2, 0.75],
  [1.75, 1.6],
];
/** How often who is where is worked out again. The figures themselves move every frame. */
const RECOUNT_MS = 900;
const FADE_MS = 350;

type Role = ActivityRole;
/** The order of the roles, for the seeded pick of who stands where. */
const ROLES: readonly Role[] = ['court', 'field', 'runner', 'swimmer', 'door', 'line', 'seat', 'stall'];
const SPORTY: readonly Role[] = ['court', 'field', 'runner'];
/**
 * Roles whose spot is on the building's own drawing: on its court, pitch, track or water, among its stalls, at its
 * seat. When the view is turned they go where the turned view draws that drawing (DESIGN.md section 43).
 */
const ON_DRAWING: readonly Role[] = ['court', 'field', 'runner', 'swimmer', 'stall', 'seat'];

interface Figure {
  sprite: Phaser.GameObjects.Image;
  role: Role;
  /** Who this is. null until they are found, and on a campus with no students. */
  student: StudentRef | null;
  look: number;
  /** Its place in the building's own crowd, which fixes where it stands. */
  slot: number;
  x: number;
  y: number;
  direction: WalkDirection;
  stride: number;
  moving: boolean;
  alpha: number;
  leaving: boolean;
  shownKey: string;
}

interface Site {
  placed: Placed;
  /** The building's numbers at the busiest hour. null for a bench, a table or a place to eat. */
  use: PlayUse | null;
  /** A place to eat: the students it has to itself. 0 for anything else. */
  eaters: number;
  /** A bench or a table: the kinds of food within a few cells, whose customers eat at it. */
  foodNear: string[];
  /** A picnic table by a lecture hall, a library or a study center: a study group sits at it. */
  study: boolean;
  /** Where its line stands: beside a path that touches it, or to its west. On a court or a field, on its own lawn. */
  line: { x: number; y: number; dx: number; dy: number; onDrawing?: boolean };
  /** True when the line stands on a side nearer the viewer: in front of the building, whatever its width. */
  lineInFront: boolean;
  figures: Figure[];
  /** Things floating in a pool, and the ball on a field. */
  props: Phaser.GameObjects.Image[];
}

/** A steady number from two whole numbers, so who is at which bench does not flicker. */
function mix(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Activity {
  private sites: Site[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private readonly people: PeopleSpec | null;
  private period: DayPeriod = 'afternoon';
  private step = 2;
  private students = 0;
  private studyShare = 0;
  private recountAt = 0;
  /** Figures drawn at the last count, for the dev readout. */
  private drawn = 0;
  private state: GameState | null = null;
  /** The students figures are found among: the same sample walkers are drawn from. */
  private everyone: StudentRef[] = [];

  /**
   * `staying` is every student standing somewhere on the map for a while, here
   * or in a small scene, and `walking` says who is out walking. Between them
   * nobody is in two places.
   */
  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
    private staying: Set<string> = new Set(),
    private walking: (key: string) => boolean = () => false,
  ) {
    this.people = art.people;
  }

  setPeriod(period: DayPeriod): void {
    if (period !== this.period) this.recountAt = 0;
    this.period = period;
  }

  /** The share of study tables with a group at them now, from the rule for small scenes. */
  setStudy(share: number): void {
    if (Math.abs(share - this.studyShare) > 1e-9) this.recountAt = 0;
    this.studyShare = share;
  }

  /** The crowd step to show: fewer figures when frames are short. */
  setStep(step: number): void {
    this.step = Math.max(0, Math.min(CROWD_STEPS.length - 1, step));
  }

  /** Read the recreation buildings, benches and tables again, with their numbers. Called whenever the game changes. */
  setMap(state: GameState): void {
    const { width, height, cells } = state.map;
    this.state = state;
    // A class came or went: everyone standing somewhere is found again, since one of them may have graduated.
    const sample = sampleStudents(state);
    if (sample.length !== this.everyone.length || sample[0]?.entryYear !== this.everyone[0]?.entryYear) {
      this.everyone = sample;
      for (const site of this.sites) for (const figure of site.figures) this.release(figure);
    }
    // Queues and players have their own caps, so they follow the real enrollment at any campus scale.
    this.students = enrollment(state);
    const kept = new Map<number, Site>();
    for (const site of this.sites) kept.set(site.placed.id, site);
    const next: Site[] = [];
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const family = PLACED[placed.type].family;
      if (family !== 'recreation' && family !== 'seat' && family !== 'dining') continue;
      if (family === 'seat' && isBrokenThing(state, placed.id)) continue;
      // Where its line stands. A court and a field leave a strip of their own lawn down one side: the line
      // stands there, beside the game. Anything else has its line along one side, on open ground: in front
      // of it where it can be seen, on the south or the east side, and on a side with a path before one without.
      let line: Site['line'] = { x: placed.x - 0.35, y: placed.y + placed.h - 0.25, dx: 0, dy: -LINE_GAP };
      let lineInFront = false;
      if (placed.type === 'courts' || placed.type === 'field') {
        line = { x: placed.x + 0.44, y: placed.y + 0.3, dx: 0, dy: LINE_GAP, onDrawing: true };
      } else {
        const kindAt = (x: number, y: number): string => (x < 0 || y < 0 || x >= width || y >= height ? 'off' : cells[y * width + x]!.kind);
        const sides = [
          { cells: Array.from({ length: placed.w }, (_, n) => [placed.x + n, placed.y + placed.h] as const), out: [0, 1], line: { x: placed.x + 0.25, y: placed.y + placed.h + 0.22, dx: LINE_GAP, dy: 0 } },
          { cells: Array.from({ length: placed.h }, (_, n) => [placed.x + placed.w, placed.y + n] as const), out: [1, 0], line: { x: placed.x + placed.w + 0.22, y: placed.y + 0.25, dx: 0, dy: LINE_GAP } },
          { cells: Array.from({ length: placed.h }, (_, n) => [placed.x - 1, placed.y + n] as const), out: [-1, 0], line: { x: placed.x - 0.22, y: placed.y + 0.25, dx: 0, dy: LINE_GAP } },
          { cells: Array.from({ length: placed.w }, (_, n) => [placed.x + n, placed.y - 1] as const), out: [0, -1], line: { x: placed.x + 0.25, y: placed.y - 0.22, dx: LINE_GAP, dy: 0 } },
        ].map((side) => {
          // A side is in front when it faces the viewer, as the view is turned.
          const facing = this.iso.dir(side.out[0]!, side.out[1]!);
          return { ...side, front: facing.x > 0 || facing.y > 0 };
        });
        const open = sides.filter((side) => side.cells.every(([x, y]) => ['empty', 'path', 'quad', 'crossing'].includes(kindAt(x, y))));
        const paved = (side: (typeof sides)[number]): boolean => side.cells.some(([x, y]) => ['path', 'crossing'].includes(kindAt(x, y)));
        // In front first, so the line can be seen. Then a paved side before a bare one.
        const chosen = open.find((side) => side.front && paved(side)) ?? open.find((side) => side.front) ?? open.find(paved) ?? open[0];
        if (chosen) {
          line = chosen.line;
          lineInFront = chosen.front;
        }
      }
      const before = kept.get(placed.id);
      kept.delete(placed.id);
      // People eat at the benches and tables within a few cells of food.
      const foodNear: string[] = [];
      if (family === 'seat') {
        for (const other of state.map.placed) {
          if (!other || PLACED[other.type].family !== 'dining') continue;
          const dx = Math.max(other.x - placed.x, 0, placed.x - (other.x + other.w - 1));
          const dy = Math.max(other.y - placed.y, 0, placed.y - (other.y + other.h - 1));
          if (Math.max(dx, dy) <= SEAT_REACH && !foodNear.includes(other.type)) foodNear.push(other.type);
        }
      }
      const eaters = family === 'dining' ? (foodTrade(state, placed)?.students ?? 0) : 0;
      // A study group meets at a picnic table within a few cells of a lecture hall, a library or a study center.
      let study = false;
      if (placed.type === 'table') {
        for (let y = Math.max(0, placed.y - SEAT_REACH); y <= Math.min(height - 1, placed.y + SEAT_REACH) && !study; y++) {
          for (let x = Math.max(0, placed.x - SEAT_REACH); x <= Math.min(width - 1, placed.x + SEAT_REACH) && !study; x++) {
            const cell = cells[y * width + x]!;
            if (cell.kind === 'lot' && cell.zone === 'academic') study = true;
            const other = cell.placedId === null ? null : state.map.placed[cell.placedId];
            if (other && (PLACED[other.type].family === 'library' || PLACED[other.type].family === 'tutoring')) study = true;
          }
        }
      }
      next.push({ placed, use: playUse(state, placed), eaters, foodNear, study, line, lineInFront, figures: before?.figures ?? [], props: before?.props ?? [] });
    }
    // Whatever was cleared takes its people with it.
    for (const gone of kept.values()) this.empty(gone);
    this.sites = next;
    this.recountAt = 0;
  }

  /** A figure stops being anybody: they have gone, or the classes changed. */
  private release(figure: Figure): void {
    if (figure.student) this.staying.delete(studentKey(figure.student));
    figure.student = null;
  }

  /** Find who a figure is: a student nobody else on the map is, from the seed, the building and the figure's own spot. */
  private cast(site: Site, figure: Figure): void {
    const state = this.state;
    const people = this.people;
    if (!state || !people) return;
    const student = findStudent(state.seed, this.everyone, site.placed.id * ROLES.length + ROLES.indexOf(figure.role), figure.slot, (key) => this.staying.has(key) || this.walking(key));
    figure.student = student;
    if (!student) return;
    this.staying.add(studentKey(student));
    // On a court, a pitch or the track everyone wears the kit. Anywhere else they are drawn as they walk about.
    if (SPORTY.includes(figure.role) && people.roles?.athlete !== undefined) return;
    figure.look = studentFigure(state, student, Math.min(people.looks, people.crowd ?? people.looks), people.roles?.athlete);
    figure.shownKey = '';
  }

  private empty(site: Site): void {
    for (const figure of site.figures) {
      this.release(figure);
      figure.sprite.setVisible(false);
      this.pool.push(figure.sprite);
    }
    for (const prop of site.props) prop.destroy();
    site.figures = [];
    site.props = [];
  }

  /** Who should be at a site right now, by role. */
  private wanted(site: Site): Array<[Role, number]> {
    const type = site.placed.type;
    // Where the line stands can be seen: on a side facing the viewer, or on a court's own strip of lawn.
    const seen = site.lineInFront || site.line.onDrawing === true;
    if (PLACED[type].family === 'seat') {
      // A bench or a picnic table: taken or not, the same until the part of the day changes.
      if (this.students <= 0) return [['seat', 0]];
      // Beside food that is busy now, most seats are taken by people eating.
      let share = SEATED[this.period];
      for (const kind of site.foodNear) share = Math.max(share, EATING_SHARE * mealNow(kind, this.period));
      // A study group fills a table by the lecture halls when the rule says they are out.
      if (site.study) share = Math.max(share, this.studyShare);
      if (type === 'bench') return [['seat', mix(site.placed.id, this.period.length) < share ? 1 : 0]];
      let sitting = 0;
      for (let n = 0; n < TABLE_SEATS; n++) if (mix(site.placed.id * 7 + n, this.period.length) < share) sitting += 1;
      return [['seat', sitting]];
    }
    if (PLACED[type].family === 'dining') {
      // A line at the door when its kind of food is busy. At the food court they stand among the stalls first.
      // A line that could only stand behind the building, out of sight, is not drawn (DESIGN.md 47).
      const queue = seen ? queueNow(site.eaters, type, this.period) : 0;
      if (type !== 'foodcourt') return [['line', queue]];
      const among = Math.min(STALL_SPOTS.length, queue);
      return [
        ['stall', among],
        ['line', queue - among],
      ];
    }
    const use = site.use;
    if (!use) return [];
    const now = playingNow(use.demand, use.capacity, this.period);
    const most = SHOWN[type] ?? 4;
    const playing = Math.min(most, Math.ceil((now.playing * most) / use.capacity));
    const role: Role = type === 'courts' ? 'court' : type === 'field' ? 'field' : type === 'track' ? 'runner' : type === 'pool' ? 'swimmer' : 'door';
    return [
      [role, playing],
      ['line', seen ? Math.min(LINE_SHOWN, now.waiting) : 0],
    ];
  }

  /** Bring the figures at every site in view in line with the numbers, inside the budget for this crowd step. */
  private recount(view: Phaser.Geom.Rectangle): void {
    const people = this.people;
    if (!people) return;
    let budget = CROWD_STEPS[this.step]!.extras;
    const athletes = people.roles?.athlete;
    const crowd = Math.min(people.looks, people.crowd ?? people.looks);
    this.drawn = 0;
    for (const site of this.sites) {
      const at = this.iso.toWorld(site.placed.x + site.placed.w / 2, site.placed.y + site.placed.h / 2);
      const seen = at.x >= view.x - 160 && at.x <= view.right + 160 && at.y >= view.y - 160 && at.y <= view.bottom + 160;
      const wanted = seen ? this.wanted(site) : [];
      for (const [role, count] of wanted) {
        const have = site.figures.filter((figure) => figure.role === role && !figure.leaving);
        const want = Math.max(0, Math.min(count, budget));
        budget -= want;
        this.drawn += want;
        for (let n = have.length; n < want; n++) {
          const sprite = this.pool.pop() ?? this.scene.add.image(0, 0, '__DEFAULT');
          sprite.setVisible(true).setAlpha(0).setCrop();
          const sporty = role === 'court' || role === 'field' || role === 'runner';
          const look = sporty && athletes !== undefined ? athletes + ((site.placed.id + n) % 4) : Math.floor(mix(site.placed.id * 13 + n, 5) * Math.min(16, crowd));
          site.figures.push({ sprite, role, student: null, look, slot: n, x: site.placed.x + 0.5, y: site.placed.y + 0.5, direction: 'sw', stride: mix(site.placed.id, n) * 1000, moving: false, alpha: 0, leaving: false, shownKey: '' });
        }
        // The last to come are the first to go.
        for (let n = have.length - 1; n >= want; n--) have[n]!.leaving = true;
      }
      if (!seen) for (const figure of site.figures) figure.leaving = true;
      for (const figure of site.figures) if (!figure.leaving && figure.student === null) this.cast(site, figure);
      this.setProps(site, seen);
    }
  }

  /** A ball on a field with a game on it, and a book on a table with a study group at it. The pool's own art has its toys. */
  private setProps(site: Site, seen: boolean): void {
    const type = site.placed.type;
    const playing = site.figures.some((figure) => !figure.leaving && figure.role === 'field');
    const studying = site.study && this.studyShare > 0 && site.figures.filter((figure) => !figure.leaving && figure.role === 'seat').length >= 2;
    const keys = !seen ? [] : playing && type === 'field' ? ['play.ball'] : studying ? ['scene.book'] : [];
    const have = keys.filter((key) => this.art.has(key));
    if (site.props.length === have.length) return;
    for (const prop of site.props) prop.destroy();
    site.props = have.map((key) => {
      const sprite = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(sprite, key);
      // It rests on its own base, where it is put.
      sprite.setOrigin(0.5, 1);
      return sprite;
    });
  }

  /** Where a figure is at this moment, and whether it is on the move. */
  private place(site: Site, figure: Figure, seconds: number): void {
    const { placed } = site;
    const phase = mix(placed.id, figure.slot + 11) * Math.PI * 2;
    const on = SURFACE[placed.type] ?? { x0: 0.1, x1: placed.w - 0.1, y0: 0.1, y1: placed.h - 0.1 };
    const wide = on.x1 - on.x0;
    const long = on.y1 - on.y0;
    let x = figure.x;
    let y = figure.y;
    figure.moving = true;
    if (figure.role === 'court') {
      // Either side of the net, up to four a side: a game, or two games of doubles. They move with the rally.
      const side = figure.slot % 2 === 0 ? -1 : 1;
      const spot = Math.floor(figure.slot / 2);
      const across = on.x0 + wide * (0.27 + 0.46 * (spot % 2));
      const back = long * (0.2 + 0.21 * Math.floor(spot / 2));
      x = placed.x + across + 0.1 * Math.sin(seconds * 1.7 + phase);
      y = placed.y + on.y0 + long / 2 + side * (back + 0.05 * Math.sin(seconds * 0.9 + phase));
    } else if (figure.role === 'field') {
      // Everyone drifts after the ball from their own part of the pitch.
      const ball = this.ballAt(site, seconds);
      const homeX = placed.x + on.x0 + wide * (0.28 + 0.44 * (Math.floor(figure.slot / 5) % 2));
      const homeY = placed.y + on.y0 + long * (0.12 + 0.19 * (figure.slot % 5));
      x = homeX * 0.78 + ball.x * 0.22 + 0.07 * Math.sin(seconds * 2.1 + phase);
      y = homeY * 0.78 + ball.y * 0.22 + 0.07 * Math.cos(seconds * 1.9 + phase);
    } else if (figure.role === 'runner') {
      // Round and round the track, each at their own pace and in their own lane.
      const radius = wide / 2 - 0.07 - 0.035 * (figure.slot % 3);
      const straight = Math.max(0, long - wide);
      const round = 2 * straight + 2 * Math.PI * radius;
      const pace = 0.55 + 0.2 * mix(placed.id, figure.slot);
      let along = (((seconds * pace + (phase / (Math.PI * 2)) * round) % round) + round) % round;
      const midX = placed.x + (on.x0 + on.x1) / 2;
      const top = placed.y + on.y0 + wide / 2;
      if (along < straight) {
        x = midX + radius;
        y = top + along;
      } else if ((along -= straight) < Math.PI * radius) {
        const turn = along / radius;
        x = midX + Math.cos(turn) * radius;
        y = top + straight + Math.sin(turn) * radius;
      } else if ((along -= Math.PI * radius) < straight) {
        x = midX - radius;
        y = top + straight - along;
      } else {
        const turn = (along - straight) / radius;
        x = midX - Math.cos(turn) * radius;
        y = top - Math.sin(turn) * radius;
      }
    } else if (figure.role === 'swimmer') {
      // Lengths, up one lane and back. The lane by the diving board is shorter.
      const lanes = 3;
      const lane = figure.slot % lanes;
      const from = placed.x + on.x0 + 0.14;
      const length = (lane === lanes - 1 ? wide * 0.6 : wide - 0.1) - 0.14;
      const lap = (seconds * (0.26 + 0.08 * mix(placed.id, figure.slot)) + phase) % 2;
      x = from + (lap < 1 ? lap : 2 - lap) * length;
      y = placed.y + on.y0 + long * (0.26 + 0.25 * lane);
    } else if (figure.role === 'line') {
      // Shuffling forward: the line holds its place while people rotate in at its head.
      x = site.line.x + site.line.dx * figure.slot;
      y = site.line.y + site.line.dy * figure.slot;
      figure.moving = false;
    } else if (figure.role === 'stall') {
      // Among the stalls and umbrellas of the food court.
      const at = STALL_SPOTS[figure.slot % STALL_SPOTS.length]!;
      x = placed.x + at[0];
      y = placed.y + at[1];
      figure.moving = false;
    } else if (figure.role === 'door') {
      x = site.line.x - site.line.dx * (figure.slot + 1) * 0.8;
      y = site.line.y - site.line.dy * (figure.slot + 1) * 0.8;
      figure.moving = false;
    } else {
      // At a bench or around a picnic table. Nobody in the pack can sit, so they stand at it.
      const around = [
        [0.24, 0.7],
        [0.76, 0.66],
        [0.5, 0.2],
      ][figure.slot % 3]!;
      x = placed.x + around[0]!;
      y = placed.y + around[1]!;
      figure.moving = false;
    }
    // A spot on the building's own drawing goes where the turned view draws that drawing (DESIGN.md section 43).
    if (ON_DRAWING.includes(figure.role) || (figure.role === 'line' && site.line.onDrawing)) {
      const at = this.iso.onDrawing(this.boxOf(site), x - placed.x, y - placed.y);
      x = at.x;
      y = at.y;
    }
    // Which way they face is which way they move on the screen. One standing still keeps facing the way they did.
    const to = this.iso.view(x, y);
    const from = this.iso.view(figure.x, figure.y);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (figure.moving && (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4)) figure.direction = facingOf(dx, dy);
    figure.x = x;
    figure.y = y;
  }

  private boxOf(site: Site): Box {
    return { x: site.placed.x, y: site.placed.y, w: site.placed.w, h: site.placed.h };
  }

  private ballAt(site: Site, seconds: number): { x: number; y: number } {
    const { placed } = site;
    const on = SURFACE[placed.type] ?? { x0: 0.1, x1: placed.w - 0.1, y0: 0.1, y1: placed.h - 0.1 };
    const t = seconds * 0.55 + mix(placed.id, 3) * 10;
    return {
      x: placed.x + (on.x0 + on.x1) / 2 + Math.sin(t) * ((on.x1 - on.x0) / 2 - 0.16),
      y: placed.y + (on.y0 + on.y1) / 2 + Math.sin(t * 0.63 + 1.3) * ((on.y1 - on.y0) / 2 - 0.2),
    };
  }

  update(time: number, deltaMs: number): void {
    const people = this.people;
    if (!people) return;
    const dt = Math.min(deltaMs, 100);
    if (time >= this.recountAt) {
      this.recountAt = time + RECOUNT_MS;
      this.recount(this.scene.cameras.main.worldView);
    }
    const seconds = time / 1000;
    for (const site of this.sites) {
      if (site.figures.length === 0 && site.props.length === 0) continue;
      // Buildings that stand up are drawn after the ground. People on them go in front of the whole footprint.
      const flat = PLACED[site.placed.type].flat;
      const front = this.iso.front(site.placed.x, site.placed.y, site.placed.w, site.placed.h) * 4 + 3;
      for (let i = site.figures.length - 1; i >= 0; i--) {
        const figure = site.figures[i]!;
        figure.alpha = figure.leaving ? figure.alpha - dt / FADE_MS : Math.min(1, figure.alpha + dt / FADE_MS);
        if (figure.leaving && figure.alpha <= 0) {
          this.release(figure);
          figure.sprite.setVisible(false);
          this.pool.push(figure.sprite);
          site.figures.splice(i, 1);
          continue;
        }
        this.place(site, figure, seconds);
        const runs = figure.role === 'runner' ? 1.7 : 1;
        if (figure.moving) figure.stride += dt * runs;
        const flipFrom = people.flip?.[figure.direction];
        const facing = flipFrom ?? figure.direction;
        const frame = figure.moving ? Math.floor(figure.stride / people.frameMs) % people.frames : 0;
        const key = `person.${figure.look}.${facing}.${frame}`;
        if (key !== figure.shownKey) {
          this.art.apply(figure.sprite, key);
          figure.shownKey = key;
          // A swimmer is a figure seen from the chest up: the water hides the rest.
          if (figure.role === 'swimmer') figure.sprite.setCrop(0, 0, figure.sprite.frame.width, figure.sprite.frame.height * 0.46);
          else figure.sprite.setCrop();
        }
        figure.sprite.setFlipX(flipFrom !== undefined);
        const at = this.iso.toWorld(figure.x, figure.y);
        // The cut edge of a swimmer sits on the water.
        const sink = figure.role === 'swimmer' ? figure.sprite.displayHeight * 0.5 : 0;
        figure.sprite.setPosition(at.x, at.y + sink);
        const own = (this.iso.sum(figure.x, figure.y) - 1) * 4 + 2.5;
        // A line on a side nearer the viewer stands in front of its building, however wide the building is.
        const beside = figure.role === 'line' || figure.role === 'door';
        figure.sprite.setDepth(flat || figure.role === 'seat' || (beside && !site.lineInFront) ? own : Math.max(own, front));
        figure.sprite.setAlpha(Math.max(0, figure.alpha));
      }
      for (const prop of site.props) {
        if (site.placed.type !== 'field') {
          // A study group's book lies open on the table.
          // The table's top is about 21 pixels of the map above where its picture stands.
          const book = this.iso.onDrawing(this.boxOf(site), 0.5, 0.56);
          const at = this.iso.toWorld(book.x, book.y);
          prop.setPosition(at.x, at.y - 21).setDepth(this.iso.depth(site.placed.x, site.placed.y, 2.7));
          continue;
        }
        const ball = this.ballAt(site, seconds);
        const spot = this.iso.onDrawing(this.boxOf(site), ball.x - site.placed.x, ball.y - site.placed.y);
        const at = this.iso.toWorld(spot.x, spot.y);
        prop.setPosition(at.x, at.y).setDepth((this.iso.sum(spot.x, spot.y) - 1) * 4 + 2.45);
      }
    }
  }

  // ------------------------------------------------------- student cards --

  /** What a figure is doing now, in the words its card shows. */
  private words(site: Site, figure: Figure): string {
    const spec = PLACED[site.placed.type];
    const eating = site.foodNear.some((kind) => mealNow(kind, this.period) >= 0.5);
    const studying = site.study && this.studyShare > 0 && site.figures.filter((one) => !one.leaving && one.role === 'seat').length >= 2;
    return activityWords(figure.role, { type: site.placed.type, name: spec.name, food: spec.family === 'dining', eating, studying }, this.period);
  }

  private stander(site: Site, figure: Figure, far: number): Stander {
    const at = this.iso.toWorld(figure.x, figure.y);
    return { student: figure.student, look: figure.look, words: this.words(site, figure), x: at.x, y: at.y, far, depth: figure.sprite.depth };
  }

  /** The figure at a point of the world, or null. `reach` widens each one, as it does a walker. */
  figureAt(worldX: number, worldY: number, reach: number): Stander | null {
    let found: Stander | null = null;
    for (const site of this.sites) {
      for (const figure of site.figures) {
        if (figure.leaving || figure.alpha < 0.5) continue;
        const box = figure.sprite.getBounds();
        // Only the top of a swimmer is above the water.
        const bottom = figure.role === 'swimmer' ? box.y + box.height * 0.5 : box.bottom;
        if (worldX < box.x - reach || worldX > box.right + reach || worldY < box.y - reach || worldY > bottom + reach) continue;
        const far = Math.hypot(worldX - box.centerX, worldY - (box.y + bottom) / 2);
        if (!found || far < found.far) found = this.stander(site, figure, far);
      }
    }
    return found;
  }

  /** Where a student is and what they are doing, when they are one of the figures here. */
  find(key: string): Stander | null {
    for (const site of this.sites) {
      for (const figure of site.figures) {
        if (!figure.leaving && figure.student && studentKey(figure.student) === key) return this.stander(site, figure, 0);
      }
    }
    return null;
  }

  /** The first figure in a role, for a dev screenshot. */
  firstIn(role: string): Stander | null {
    for (const site of this.sites) {
      for (const figure of site.figures) {
        if (!figure.leaving && figure.role === role && figure.student && figure.alpha >= 0.5) return this.stander(site, figure, 0);
      }
    }
    return null;
  }

  /** Figures the numbers ask for at the buildings in view. For the dev readout. */
  get count(): number {
    return this.drawn;
  }

  clear(): void {
    for (const site of this.sites) {
      for (const figure of site.figures) this.release(figure);
      for (const figure of site.figures) figure.sprite.destroy();
      for (const prop of site.props) prop.destroy();
    }
    for (const sprite of this.pool) sprite.destroy();
    this.sites = [];
    this.pool = [];
  }
}
