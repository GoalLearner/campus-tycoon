import Phaser from 'phaser';
import { CROWD_STEPS, playingNow } from '../app/crowd';
import type { DayPeriod } from '../app/daylight';
import { enrollment, isBrokenThing, isPathKind, PLACED, playUse, type GameState, type Placed, type PlayUse } from '../sim';
import type { Art, PeopleSpec, WalkDirection } from './art';
import type { Iso } from './iso';

/**
 * People using the campus, for show: a game on the courts, runners circling
 * the track, swimmers in the pool, a match on the recreation field, a line
 * beside a building with more players than room, and people at benches and
 * picnic tables.
 *
 * How many are there comes from the simulation's own numbers: each
 * building's demand at the busiest hour and what it holds (see
 * `src/sim/systems/play.ts`), scaled by the part of the player's day.
 * Afternoons and evenings are busiest. Where each figure stands and how it
 * moves is only for show. Nothing here is saved, nothing here changes a
 * number, and nothing here runs while the game is closed.
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
/** How often who is where is worked out again. The figures themselves move every frame. */
const RECOUNT_MS = 900;
const FADE_MS = 350;

type Role = 'court' | 'field' | 'runner' | 'swimmer' | 'door' | 'line' | 'seat';

interface Figure {
  sprite: Phaser.GameObjects.Image;
  role: Role;
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
  /** The building's numbers at the busiest hour. null for a bench or a table. */
  use: PlayUse | null;
  /** Where its line stands: beside a path that touches it, or to its west. */
  line: { x: number; y: number; dx: number; dy: number };
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
  private recountAt = 0;
  /** Figures drawn at the last count, for the dev readout. */
  private drawn = 0;

  constructor(
    private scene: Phaser.Scene,
    private art: Art,
    private iso: Iso,
  ) {
    this.people = art.people;
  }

  setPeriod(period: DayPeriod): void {
    if (period !== this.period) this.recountAt = 0;
    this.period = period;
  }

  /** The crowd step to show: fewer figures when frames are short. */
  setStep(step: number): void {
    this.step = Math.max(0, Math.min(CROWD_STEPS.length - 1, step));
  }

  /** Read the recreation buildings, benches and tables again, with their numbers. Called whenever the game changes. */
  setMap(state: GameState): void {
    const { width, height, cells } = state.map;
    this.students = enrollment(state);
    const kept = new Map<number, Site>();
    for (const site of this.sites) kept.set(site.placed.id, site);
    const next: Site[] = [];
    for (const placed of state.map.placed) {
      if (!placed) continue;
      const family = PLACED[placed.type].family;
      if (family !== 'recreation' && family !== 'seat') continue;
      if (family === 'seat' && isBrokenThing(state, placed.id)) continue;
      // The line forms on a path beside the building, where there is one.
      let line = { x: placed.x - 0.35, y: placed.y + placed.h - 0.25, dx: 0, dy: -LINE_GAP };
      // A court and a field leave a strip of their own lawn down one side: the line stands there, beside the game.
      const lawn = placed.type === 'courts' || placed.type === 'field';
      if (lawn) line = { x: placed.x + 0.44, y: placed.y + 0.3, dx: 0, dy: LINE_GAP };
      search: for (let y = placed.y - 1; !lawn && y <= placed.y + placed.h; y++) {
        for (let x = placed.x - 1; x <= placed.x + placed.w; x++) {
          const beside = (x < placed.x || x >= placed.x + placed.w) !== (y < placed.y || y >= placed.y + placed.h);
          if (!beside || x < 0 || y < 0 || x >= width || y >= height || !isPathKind(cells[y * width + x]!.kind)) continue;
          // Along the path's edge nearest the building.
          if (y < placed.y) line = { x: placed.x + 0.25, y: y + 0.78, dx: LINE_GAP, dy: 0 };
          else if (y >= placed.y + placed.h) line = { x: placed.x + 0.25, y: y + 0.22, dx: LINE_GAP, dy: 0 };
          else if (x < placed.x) line = { x: x + 0.78, y: placed.y + 0.25, dx: 0, dy: LINE_GAP };
          else line = { x: x + 0.22, y: placed.y + 0.25, dx: 0, dy: LINE_GAP };
          break search;
        }
      }
      const before = kept.get(placed.id);
      kept.delete(placed.id);
      next.push({ placed, use: playUse(state, placed), line, figures: before?.figures ?? [], props: before?.props ?? [] });
    }
    // Whatever was cleared takes its people with it.
    for (const gone of kept.values()) this.empty(gone);
    this.sites = next;
    this.recountAt = 0;
  }

  private empty(site: Site): void {
    for (const figure of site.figures) {
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
    if (PLACED[type].family === 'seat') {
      // A bench or a picnic table: taken or not, the same until the part of the day changes.
      if (this.students <= 0) return [['seat', 0]];
      const share = SEATED[this.period];
      if (type === 'bench') return [['seat', mix(site.placed.id, this.period.length) < share ? 1 : 0]];
      let sitting = 0;
      for (let n = 0; n < TABLE_SEATS; n++) if (mix(site.placed.id * 7 + n, this.period.length) < share) sitting += 1;
      return [['seat', sitting]];
    }
    const use = site.use;
    if (!use) return [];
    const now = playingNow(use.demand, use.capacity, this.period);
    const most = SHOWN[type] ?? 4;
    const playing = Math.min(most, Math.ceil((now.playing * most) / use.capacity));
    const role: Role = type === 'courts' ? 'court' : type === 'field' ? 'field' : type === 'track' ? 'runner' : type === 'pool' ? 'swimmer' : 'door';
    return [
      [role, playing],
      ['line', Math.min(LINE_SHOWN, now.waiting)],
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
          site.figures.push({ sprite, role, look, slot: n, x: site.placed.x + 0.5, y: site.placed.y + 0.5, direction: 'sw', stride: mix(site.placed.id, n) * 1000, moving: false, alpha: 0, leaving: false, shownKey: '' });
        }
        // The last to come are the first to go.
        for (let n = have.length - 1; n >= want; n--) have[n]!.leaving = true;
      }
      if (!seen) for (const figure of site.figures) figure.leaving = true;
      this.setProps(site, seen);
    }
  }

  /** A ball on a field with a game on it. The pool's own art has its toys. */
  private setProps(site: Site, seen: boolean): void {
    const type = site.placed.type;
    const playing = site.figures.some((figure) => !figure.leaving && figure.role === 'field');
    const keys = seen && playing && type === 'field' ? ['play.ball'] : [];
    const have = keys.filter((key) => this.art.has(key));
    if (site.props.length === have.length) return;
    for (const prop of site.props) prop.destroy();
    site.props = have.map((key) => {
      const sprite = this.scene.add.image(0, 0, '__DEFAULT');
      this.art.apply(sprite, key);
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
    const dx = x - figure.x;
    const dy = y - figure.y;
    if (figure.moving && (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4)) {
      if (Math.abs(dx) >= Math.abs(dy)) figure.direction = dx >= 0 ? 'se' : 'nw';
      else figure.direction = dy >= 0 ? 'sw' : 'ne';
    }
    figure.x = x;
    figure.y = y;
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
      const front = (site.placed.x + site.placed.w - 1 + site.placed.y + site.placed.h - 1) * 4 + 3;
      for (let i = site.figures.length - 1; i >= 0; i--) {
        const figure = site.figures[i]!;
        figure.alpha = figure.leaving ? figure.alpha - dt / FADE_MS : Math.min(1, figure.alpha + dt / FADE_MS);
        if (figure.leaving && figure.alpha <= 0) {
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
        const own = (figure.x + figure.y - 1) * 4 + 2.5;
        figure.sprite.setDepth(flat || figure.role === 'line' || figure.role === 'door' || figure.role === 'seat' ? own : Math.max(own, front));
        figure.sprite.setAlpha(Math.max(0, figure.alpha));
      }
      for (const prop of site.props) {
        const spot = this.ballAt(site, seconds);
        const at = this.iso.toWorld(spot.x, spot.y);
        prop.setPosition(at.x, at.y).setDepth((spot.x + spot.y - 1) * 4 + 2.45);
      }
    }
  }

  /** Figures the numbers ask for at the buildings in view. For the dev readout. */
  get count(): number {
    return this.drawn;
  }

  clear(): void {
    for (const site of this.sites) {
      for (const figure of site.figures) figure.sprite.destroy();
      for (const prop of site.props) prop.destroy();
    }
    for (const sprite of this.pool) sprite.destroy();
    this.sites = [];
    this.pool = [];
  }
}
