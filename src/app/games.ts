/**
 * Real games on the courts and pitches (DESIGN.md 72): basketball with dribbling, passes, shots that arc to the hoop
 * and go in or rim out, rebounds and defense; soccer with passes, dribbling, shots and a keeper; rallies at tennis and
 * at volleyball. For show only and seeded: the same game plays the same way for the same seed and the same steps.
 *
 * Everything is in cells on the court's own drawing, before the view is turned: `x` across it, `y` along it from its
 * far end. Players move no faster than `RUN`; the ball no faster than `BALL_MOST`, and it never jumps: held, it is at
 * its holder's hand; in the air, it flies from where it left to where it is going, along an arc of `z`, its height.
 */

export type Sport = 'basketball' | 'tennis' | 'volleyball' | 'soccer';

/** The playing surface inside a building's footprint, in cells from its north corner. */
export interface Area {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The most who play at once on a court of each kind; the rest wait on the side and rotate in. */
export const GAME_CAP: Record<Sport, number> = { basketball: 10, tennis: 4, volleyball: 12, soccer: 10 };
/** A player runs at most this many cells a second. */
export const RUN = 1.7;
/** The ball moves at most this many cells a second. */
export const BALL_MOST = 6;
/** The rim's height, and the net's top at tennis and volleyball, in cells of height (a cell is about 66 pixels up). */
export const RIM = 1.06;

export interface GamePlayer {
  /** The figure it is: its slot at its building. */
  slot: number;
  x: number;
  y: number;
  /** Where they are going. */
  tx: number;
  ty: number;
  team: 0 | 1;
  /** A keeper stays in goal at soccer. */
  keeper: boolean;
  moving: boolean;
  /** Up off the ground, 0 to 1: a jump shot, a block, a spike, a header. */
  lift: number;
}

export interface GameBall {
  x: number;
  y: number;
  /** Its height, in the same units as `RIM`. */
  z: number;
}

/** Something that happened, for the cheers and the paper of the crowd: a basket, a goal, a point won. */
export interface GameEvent {
  kind: 'score' | 'miss' | 'save' | 'point';
  team: 0 | 1;
  /** The one who scored or won it, by slot; -1 when nobody did. */
  slot: number;
  /** Points, at basketball 2 or 3. */
  points: number;
}

type Flight = { kind: 'flight'; fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; to: number; arc: number; t: number; dur: number; then: Then };
type Held = { kind: 'held'; by: number; dribble: boolean };
type Loose = { kind: 'loose' };
type BallState = Flight | Held | Loose;
/** What happens when a flight lands. */
type Then = { kind: 'catch'; by: number } | { kind: 'rim'; make: boolean; points: number; by: number } | { kind: 'drop'; team: 0 | 1 } | { kind: 'rebound' } | { kind: 'bounce'; next: Then } | { kind: 'rally'; side: 0 | 1 } | { kind: 'land'; side: 0 | 1 } | { kind: 'goal'; team: 0 | 1; by: number } | { kind: 'save'; keeper: number };

/** A steady pseudo-random stream: the same seed gives the same game. */
function stream(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export class Game {
  readonly players: GamePlayer[] = [];
  readonly ball: GameBall;
  private state: BallState = { kind: 'loose' };
  private readonly random: () => number;
  private events: GameEvent[] = [];
  /** The team with the ball, and how many passes before it shoots. */
  private offense: 0 | 1 = 0;
  private passes = 0;
  /** Seconds the holder has held it, and how long they mean to. */
  private holdS = 0;
  private holdFor = 1;
  /** A pause after a point, a basket or a goal, before play goes on. */
  private restS = 0;
  /** At basketball: whether both ends are in play (8 or more players), and the end each team attacks. */
  private full = false;
  /** At tennis and volleyball: the side that serves next. At volleyball: touches on the side with the ball. */
  private serveSide: 0 | 1 = 0;
  private touches = 0;
  private rallyLeft = 0;
  private dribbleS = 0;
  private hand = { x: 0.12, y: 0 };

  constructor(
    readonly sport: Sport,
    readonly area: Area,
    seed: number,
    readonly cap = GAME_CAP[sport],
  ) {
    this.random = stream(seed);
    this.ball = { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2, z: 0 };
  }

  get width(): number {
    return this.area.x1 - this.area.x0;
  }

  get length(): number {
    return this.area.y1 - this.area.y0;
  }

  private get cx(): number {
    return (this.area.x0 + this.area.x1) / 2;
  }

  private get cy(): number {
    return (this.area.y0 + this.area.y1) / 2;
  }

  /** Who is on now, by slot, where each stands: the new come on from there, those not listed leave. At most `cap`. */
  roster(on: ReadonlyArray<{ slot: number; x: number; y: number }>): void {
    const keep = new Set(on.slice(0, this.cap).map((one) => one.slot));
    let changed = false;
    for (let i = this.players.length - 1; i >= 0; i--) {
      if (keep.has(this.players[i]!.slot)) continue;
      // Whoever held the ball leaves it where they stood.
      if (this.state.kind === 'held' && this.state.by === this.players[i]!.slot) this.state = { kind: 'loose' };
      this.players.splice(i, 1);
      changed = true;
    }
    for (const one of on.slice(0, this.cap)) {
      if (this.players.some((player) => player.slot === one.slot)) continue;
      this.players.push({ slot: one.slot, x: one.x, y: one.y, tx: one.x, ty: one.y, team: 0, keeper: false, moving: false, lift: 0 });
      changed = true;
    }
    if (!changed) return;
    this.players.sort((a, b) => a.slot - b.slot);
    // Sides by order: one each way in turn, so a side is never more than one short.
    this.players.forEach((player, i) => {
      player.team = (i % 2) as 0 | 1;
      player.keeper = false;
    });
    if (this.sport === 'soccer') {
      for (const team of [0, 1] as const) {
        const side = this.players.filter((player) => player.team === team);
        if (side.length >= 3) side[0]!.keeper = true;
      }
    }
    this.full = this.sport === 'basketball' && this.players.length >= 8;
  }

  /** The team a figure plays for, or -1 when it is not on. */
  teamOf(slot: number): number {
    return this.players.find((player) => player.slot === slot)?.team ?? -1;
  }

  /** The player holding the ball, or null. */
  holder(): GamePlayer | null {
    return this.state.kind === 'held' ? (this.byslot((this.state as Held).by) ?? null) : null;
  }

  /** What happened since the last call. */
  take(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  step(dtMs: number): void {
    const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
    if (this.players.length === 0) {
      this.settleBall(dt);
      return;
    }
    if (this.restS > 0) this.restS -= dt;
    this.plan(dt);
    for (const player of this.players) {
      const dx = player.tx - player.x;
      const dy = player.ty - player.y;
      const d = Math.hypot(dx, dy);
      const most = RUN * dt;
      if (d > most) {
        player.x += (dx / d) * most;
        player.y += (dy / d) * most;
      } else {
        player.x = player.tx;
        player.y = player.ty;
      }
      player.moving = d > 0.02;
      player.lift = Math.max(0, player.lift - dt * 2.2);
    }
    this.moveBall(dt);
  }

  // ------------------------------------------------------------- the ball --

  private byslot(slot: number): GamePlayer | undefined {
    return this.players.find((player) => player.slot === slot);
  }

  /** Where a player holds the ball: by their hand, a little ahead; at their feet at soccer. */
  private handOf(player: GamePlayer): { x: number; y: number; z: number } {
    const feet = this.sport === 'soccer';
    const dx = player.tx - player.x;
    const dy = player.ty - player.y;
    const d = Math.hypot(dx, dy);
    // The hand eases round to the way they are going, so the ball never jumps from one side to the other.
    const want = d > 0.02 ? { x: (dx / d) * 0.12, y: (dy / d) * 0.12 } : { x: 0.1, y: 0.05 };
    this.hand.x += (want.x - this.hand.x) * 0.15;
    this.hand.y += (want.y - this.hand.y) * 0.15;
    const dribble = this.sport === 'basketball' && this.state.kind === 'held' && this.state.dribble ? 0.32 * Math.abs(Math.sin(this.dribbleS * 7)) : 0;
    return { x: player.x + this.hand.x, y: player.y + this.hand.y, z: feet ? 0 : 0.42 + player.lift * 0.3 + (dribble > 0 ? dribble - 0.4 : 0) };
  }

  private settleBall(dt: number): void {
    this.ball.z = Math.max(0, this.ball.z - dt * 2);
  }

  /** Throw, pass, kick or hit the ball to a point, or to a player (followed as they move), over `dur` seconds. */
  private fly(tx: number, ty: number, tz: number, dur: number, arc: number, then: Then, to = -1): void {
    const d = Math.hypot(tx - this.ball.x, ty - this.ball.y);
    // Never faster than the fastest ball.
    const least = d / (BALL_MOST * 0.92);
    this.state = { kind: 'flight', fx: this.ball.x, fy: this.ball.y, fz: this.ball.z, tx, ty, tz, to, arc, t: 0, dur: Math.max(dur, least, 0.15), then };
  }

  private moveBall(dt: number): void {
    const s = this.state;
    const before = { x: this.ball.x, y: this.ball.y };
    if (s.kind === 'held') {
      const holder = this.byslot(s.by);
      if (!holder) {
        this.state = { kind: 'loose' };
        return;
      }
      this.dribbleS += dt;
      const at = this.handOf(holder);
      this.ball.x = at.x;
      this.ball.y = at.y;
      this.ball.z = Math.max(0, at.z);
    } else if (s.kind === 'flight') {
      s.t += dt;
      // Thrown to a player: to where they are now.
      if (s.to >= 0) {
        const to = this.byslot(s.to);
        if (to) {
          const at = this.handOf(to);
          s.tx = at.x;
          s.ty = at.y;
        }
      }
      const k = Math.min(1, s.t / s.dur);
      this.ball.x = s.fx + (s.tx - s.fx) * k;
      this.ball.y = s.fy + (s.ty - s.fy) * k;
      this.ball.z = Math.max(0, s.fz + (s.tz - s.fz) * k + 4 * s.arc * k * (1 - k));
      if (k >= 1) this.land(s.then);
    } else {
      this.settleBall(dt);
    }
    // However the plan changed, the ball moves no faster than the fastest ball.
    const d = Math.hypot(this.ball.x - before.x, this.ball.y - before.y);
    const most = BALL_MOST * dt;
    if (d > most) {
      this.ball.x = before.x + ((this.ball.x - before.x) / d) * most;
      this.ball.y = before.y + ((this.ball.y - before.y) / d) * most;
    }
  }

  private give(slot: number, dribble = this.sport === 'basketball'): void {
    this.state = { kind: 'held', by: slot, dribble };
    this.holdS = 0;
  }

  private land(then: Then): void {
    switch (then.kind) {
      case 'catch':
        if (this.byslot(then.by)) this.give(then.by);
        else this.state = { kind: 'loose' };
        return;
      case 'rim': {
        const basket = this.basketFor(this.offense);
        if (then.make) {
          this.events.push({ kind: 'score', team: this.offense, slot: then.by, points: then.points });
          // Through the net and down.
          this.fly(basket.x, basket.y, 0, 0.45, 0, { kind: 'drop', team: this.offense });
        } else {
          this.events.push({ kind: 'miss', team: this.offense, slot: then.by, points: 0 });
          // Off the rim, out a little way.
          const a = this.random() * Math.PI * 2;
          const r = 0.25 + this.random() * 0.3;
          const into = this.intoCourt(basket);
          const rx = clamp(basket.x + Math.cos(a) * r * 0.8, this.area.x0 + 0.1, this.area.x1 - 0.1);
          const ry = clamp(basket.y + into * (0.2 + Math.abs(Math.sin(a)) * r), this.area.y0 + 0.1, this.area.y1 - 0.1);
          this.fly(rx, ry, 0.5, 0.5, 0.35, { kind: 'rebound' });
        }
        return;
      }
      case 'drop': {
        // The other side takes it out under the basket.
        this.offense = (1 - then.team) as 0 | 1;
        this.restS = 0.6;
        const near = this.nearest(this.ball.x, this.ball.y, this.offense);
        if (near) this.fly(near.x, near.y, 0.42, 0.5, 0.1, { kind: 'catch', by: near.slot }, near.slot);
        else this.state = { kind: 'loose' };
        this.newPossession();
        return;
      }
      case 'rebound': {
        // Whoever is nearest gets it, the defense more often than not.
        const defense = (1 - this.offense) as 0 | 1;
        const team = this.random() < 0.7 ? defense : this.offense;
        const near = this.nearest(this.ball.x, this.ball.y, team) ?? this.nearest(this.ball.x, this.ball.y, null);
        if (!near) {
          this.state = { kind: 'loose' };
          return;
        }
        this.fly(near.x, near.y, 0.42, 0.25, 0.05, { kind: 'catch', by: near.slot }, near.slot);
        const offensive = near.team === this.offense;
        this.offense = near.team;
        this.newPossession(offensive);
        return;
      }
      case 'bounce':
        this.landNext(then.next);
        return;
      case 'rally':
      case 'land':
        this.landNext(then);
        return;
      case 'goal':
        this.events.push({ kind: 'score', team: then.team, slot: then.by, points: 1 });
        this.restS = 1.6;
        this.state = { kind: 'loose' };
        // Kick-off at the middle by the side that let it in.
        this.offense = (1 - then.team) as 0 | 1;
        this.fly(this.cx, this.cy, 0, 1.2, 0.2, { kind: 'catch', by: this.kickOffTaker() }, -1);
        return;
      case 'save':
        this.events.push({ kind: 'save', team: this.teamOf(then.keeper) as 0 | 1, slot: then.keeper, points: 0 });
        this.give(then.keeper, false);
        this.offense = this.teamOf(then.keeper) as 0 | 1;
        this.holdFor = 0.8;
        return;
    }
  }

  private landNext(then: Then): void {
    if (then.kind === 'rally') this.rallyArrives(then.side);
    // Hit out: the side it landed beyond wins the point.
    else if (then.kind === 'land') this.pointTo(then.side, -1);
  }

  private nearest(x: number, y: number, team: 0 | 1 | null): GamePlayer | null {
    let best: GamePlayer | null = null;
    let near = Infinity;
    for (const player of this.players) {
      if (team !== null && player.team !== team) continue;
      if (player.keeper && this.sport === 'soccer' && team === null) continue;
      const d = Math.hypot(player.x - x, player.y - y);
      if (d < near) {
        near = d;
        best = player;
      }
    }
    return best;
  }

  // ----------------------------------------------------------- the plan --

  private plan(dt: number): void {
    if (this.sport === 'basketball') this.basketball(dt);
    else if (this.sport === 'soccer') this.soccer(dt);
    else this.rally(dt);
  }

  private newPossession(offensive = false): void {
    this.passes = offensive ? Math.floor(this.random() * 2) : 1 + Math.floor(this.random() * 3);
    this.holdFor = 0.8 + this.random() * 0.8;
    this.holdS = 0;
  }

  /** The basket a team attacks: the far one, or at full court each its own end. */
  private basketFor(team: 0 | 1): { x: number; y: number } {
    const far = { x: this.cx, y: this.area.y0 + 0.2 };
    if (!this.full) return far;
    return team === 0 ? far : { x: this.cx, y: this.area.y1 - 0.2 };
  }

  /** Which way is into the court from a basket: +1 from the far end, -1 from the near one. */
  private intoCourt(basket: { x: number; y: number }): number {
    return basket.y < this.cy ? 1 : -1;
  }

  /** Spots round a basket for a side of `n`: across and out from the basket, in cells of a court 1.72 wide. */
  private spots(n: number): Array<[number, number]> {
    const all: Record<number, Array<[number, number]>> = {
      1: [[0, 0.8]],
      2: [[-0.25, 0.9], [0.45, 0.5]],
      3: [[0, 0.95], [-0.55, 0.45], [0.5, 0.4]],
      4: [[0, 1.0], [-0.6, 0.65], [0.6, 0.65], [0.35, 0.25]],
      5: [[0, 1.05], [-0.62, 0.72], [0.62, 0.72], [-0.55, 0.15], [0.4, 0.3]],
    };
    return all[Math.max(1, Math.min(5, n))]!;
  }

  private basketball(dt: number): void {
    const off = this.players.filter((player) => player.team === this.offense);
    const def = this.players.filter((player) => player.team !== this.offense);
    const basket = this.basketFor(this.offense);
    const into = this.intoCourt(basket);
    const scaleX = this.width / 1.72;
    const scaleY = Math.min(1, this.length / 2.7) * (this.full ? 1 : 0.9);
    const spot = (i: number, n: number): { x: number; y: number } => {
      const [a, d] = this.spots(n)[i] ?? [0, 0.8];
      return { x: clamp(basket.x + a * scaleX, this.area.x0 + 0.1, this.area.x1 - 0.1), y: clamp(basket.y + into * d * scaleY, this.area.y0 + 0.08, this.area.y1 - 0.08) };
    };
    // The offense goes to its spots, one cutting in now and then; each defender stays between their player and the basket.
    const t = this.dribbleS;
    off.forEach((player, i) => {
      const at = spot(i, off.length);
      const cut = i > 0 && Math.sin(t * 0.9 + i * 2.1) > 0.85 ? 0.35 : 0;
      player.tx = at.x + (basket.x - at.x) * cut;
      player.ty = at.y + (basket.y - at.y) * cut;
    });
    def.forEach((player, i) => {
      const man = off[i % Math.max(1, off.length)];
      if (!man) {
        player.tx = basket.x;
        player.ty = basket.y + into * 0.3;
        return;
      }
      player.tx = man.x + (basket.x - man.x) * 0.3 + 0.04;
      player.ty = man.y + (basket.y - man.y) * 0.3;
    });
    const s = this.state;
    if (s.kind === 'loose') {
      // A loose ball: the nearest goes and picks it up.
      const near = this.nearest(this.ball.x, this.ball.y, null);
      if (!near) return;
      near.tx = this.ball.x;
      near.ty = this.ball.y;
      if (Math.hypot(near.x - this.ball.x, near.y - this.ball.y) < 0.12) {
        this.offense = near.team;
        this.give(near.slot);
        this.newPossession();
      }
      return;
    }
    if (s.kind === 'flight') {
      // A shot in the air: the bigs crash the boards.
      if (s.then.kind === 'rim' || s.then.kind === 'rebound') {
        for (const player of [...off.slice(-2), ...def.slice(-2)]) {
          player.tx = basket.x + (player.x - basket.x) * 0.5;
          player.ty = basket.y + into * 0.35;
        }
      }
      return;
    }
    const holder = this.byslot(s.by);
    if (!holder) return;
    if (holder.team !== this.offense) {
      this.offense = holder.team;
      this.newPossession();
      return;
    }
    if (this.restS > 0) return;
    this.holdS += dt;
    // Bringing it up: no decision until near their spot.
    const mine = off.indexOf(holder);
    const target = spot(Math.max(0, mine), off.length);
    if (Math.hypot(holder.x - target.x, holder.y - target.y) > 0.3 && this.holdS < 3) return;
    if (this.holdS < this.holdFor) return;
    const mates = off.filter((player) => player !== holder);
    if (this.passes > 0 && mates.length > 0) {
      this.passes -= 1;
      const to = mates[Math.floor(this.random() * mates.length)]!;
      const at = this.handOf(to);
      this.fly(at.x, at.y, at.z, 0.42 + this.random() * 0.15, 0.12, { kind: 'catch', by: to.slot }, to.slot);
      this.holdFor = 0.6 + this.random() * 0.9;
      return;
    }
    // The shot: up, and an arc to the rim.
    const d = Math.hypot(holder.x - basket.x, holder.y - basket.y);
    const make = this.random() < (d < 0.5 ? 0.62 : d < 0.95 ? 0.46 : 0.36);
    holder.lift = 1;
    this.fly(basket.x, basket.y, RIM, 0.75 + d * 0.25, 0.75 + d * 0.3, { kind: 'rim', make, points: d > 0.95 ? 3 : 2, by: holder.slot });
  }

  // -------------------------------------------------------------- soccer --

  private goalOf(team: 0 | 1): { x: number; y: number } {
    // Team 0 attacks the near end, team 1 the far.
    return team === 0 ? { x: this.cx, y: this.area.y1 - 0.02 } : { x: this.cx, y: this.area.y0 + 0.02 };
  }

  private kickOffTaker(): number {
    const side = this.players.filter((player) => player.team === this.offense && !player.keeper);
    return (side[0] ?? this.players[0])?.slot ?? -1;
  }

  private soccer(dt: number): void {
    const ball = this.ball;
    // How far up the pitch the ball is, 0 at the far end and 1 at the near.
    const up = clamp((ball.y - this.area.y0) / this.length, 0, 1);
    for (const team of [0, 1] as const) {
      const side = this.players.filter((player) => player.team === team);
      const field = side.filter((player) => !player.keeper);
      const own = this.goalOf((1 - team) as 0 | 1);
      for (const player of side) {
        if (player.keeper) {
          // In goal, across with the ball.
          player.tx = clamp(ball.x, this.cx - 0.32, this.cx + 0.32);
          player.ty = own.y + (own.y < this.cy ? 0.12 : -0.12);
        }
      }
      field.forEach((player, i) => {
        // A shape that slides up and down the pitch with the ball, spread across it.
        const lanes = field.length;
        const across = this.area.x0 + this.width * ((i + 0.5) / lanes);
        const depth = team === 0 ? 0.25 + up * 0.5 + (i % 2) * 0.12 : 0.75 - (1 - up) * 0.5 - (i % 2) * 0.12;
        player.tx = clamp(across, this.area.x0 + 0.12, this.area.x1 - 0.12);
        player.ty = clamp(this.area.y0 + this.length * depth, this.area.y0 + 0.12, this.area.y1 - 0.12);
      });
    }
    const s = this.state;
    if (s.kind === 'flight') return;
    if (s.kind === 'loose') {
      const near = this.nearest(ball.x, ball.y, null);
      if (!near) return;
      near.tx = ball.x;
      near.ty = ball.y;
      if (Math.hypot(near.x - ball.x, near.y - ball.y) < 0.12) {
        this.offense = near.team;
        this.give(near.slot, false);
        this.holdFor = 0.6 + this.random();
      }
      return;
    }
    const holder = this.byslot(s.by);
    if (!holder) return;
    this.offense = holder.team;
    if (this.restS > 0) return;
    this.holdS += dt;
    const goal = this.goalOf(holder.team);
    // The nearest defender closes them down.
    const presser = this.nearest(holder.x, holder.y, (1 - holder.team) as 0 | 1);
    if (presser && !presser.keeper) {
      presser.tx = holder.x;
      presser.ty = holder.y;
    }
    // Dribbling on towards goal.
    if (!holder.keeper) {
      holder.tx = clamp(holder.x + (goal.x - holder.x) * 0.3, this.area.x0 + 0.1, this.area.x1 - 0.1);
      holder.ty = clamp(holder.y + Math.sign(goal.y - holder.y) * 0.45, this.area.y0 + 0.1, this.area.y1 - 0.1);
    }
    if (this.holdS < this.holdFor) return;
    this.holdS = 0;
    this.holdFor = 0.6 + this.random() * 1.2;
    const toGoal = Math.hypot(goal.x - holder.x, goal.y - holder.y);
    const mates = this.players.filter((player) => player.team === holder.team && player !== holder && !player.keeper);
    const roll = this.random();
    if (!holder.keeper && toGoal < this.length * 0.4 && roll < 0.55) {
      // A shot: the keeper saves some, the rest go in.
      const keeper = this.players.find((player) => player.keeper && player.team !== holder.team);
      const aim = { x: goal.x + (this.random() - 0.5) * 0.5, y: goal.y };
      const saved = keeper ? this.random() < 0.5 : this.random() < 0.15;
      if (saved && keeper) this.fly(keeper.x, keeper.y, 0, 0.45 + toGoal * 0.1, 0.1, { kind: 'save', keeper: keeper.slot }, keeper.slot);
      else this.fly(aim.x, aim.y, 0.1, 0.45 + toGoal * 0.1, 0.1, { kind: 'goal', team: holder.team, by: holder.slot });
      return;
    }
    if (presser && !presser.keeper && Math.hypot(presser.x - holder.x, presser.y - holder.y) < 0.15 && roll < 0.75) {
      // Tackled: the defender takes it off them.
      this.fly(presser.x, presser.y, 0, 0.3, 0.02, { kind: 'catch', by: presser.slot }, presser.slot);
      return;
    }
    if (mates.length > 0 && (holder.keeper || roll < 0.85)) {
      const to = mates[Math.floor(this.random() * mates.length)]!;
      this.fly(to.x, to.y, 0, 0.5 + Math.hypot(to.x - holder.x, to.y - holder.y) * 0.25, 0.05, { kind: 'catch', by: to.slot }, to.slot);
    }
  }

  // -------------------------------------------------- tennis, volleyball --

  /** The side a player stands on: team 0 the far half, team 1 the near. */
  private sideY(side: 0 | 1, depth: number): number {
    const half = this.length / 2;
    return side === 0 ? this.cy - half * depth : this.cy + half * depth;
  }

  private rally(dt: number): void {
    const volley = this.sport === 'volleyball';
    for (const side of [0, 1] as const) {
      const mine = this.players.filter((player) => player.team === side);
      const rows = volley ? Math.min(2, Math.ceil(mine.length / 3)) : mine.length > 1 ? 1 : 1;
      const perRow = Math.max(1, Math.ceil(mine.length / rows));
      mine.forEach((player, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const inRow = Math.min(perRow, mine.length - row * perRow);
        const across = this.area.x0 + this.width * ((col + 0.5) / inRow);
        const depth = volley ? (row === 0 ? 0.35 : 0.75) : mine.length > 1 ? 0.7 : 0.8;
        // Unless running for the ball, back to their place.
        if (this.chasing !== player.slot) {
          player.tx = clamp(across, this.area.x0 + 0.1, this.area.x1 - 0.1);
          player.ty = this.sideY(side, depth);
        }
      });
    }
    const s = this.state;
    if (s.kind === 'flight') return;
    if (this.restS > 0) return;
    if (s.kind === 'loose') {
      // Serve: the server takes it at the back of their side.
      const server = this.nearest(this.cx, this.sideY(this.serveSide, 0.9), this.serveSide) ?? this.players[0];
      if (!server) return;
      this.give(server.slot, false);
      this.holdFor = 0.9;
      this.rallyLeft = (volley ? 2 : 3) + Math.floor(this.random() * (volley ? 4 : 7));
      this.touches = 0;
      return;
    }
    const holder = this.byslot(s.by);
    if (!holder) return;
    this.holdS += dt;
    if (this.holdS < this.holdFor) return;
    this.hit(holder);
  }

  /** Who is running for the ball now. */
  private chasing = -1;

  /** A hit over the net (or, at volleyball, a touch to a teammate), to where the other side must reach it. */
  private hit(by: GamePlayer): void {
    const volley = this.sport === 'volleyball';
    const other = (1 - by.team) as 0 | 1;
    by.lift = volley && this.touches === 2 ? 1 : 0.4;
    if (volley && this.touches < 2 && this.players.filter((player) => player.team === by.team).length > 1) {
      // Bump and set: up to a teammate, nearer the net.
      this.touches += 1;
      const mates = this.players.filter((player) => player.team === by.team && player !== by);
      const to = mates.reduce((best, player) => (Math.abs(player.y - this.cy) < Math.abs(best.y - this.cy) ? player : best), mates[0]!);
      this.chasing = to.slot;
      const tx = clamp(to.x, this.area.x0 + 0.1, this.area.x1 - 0.1);
      const ty = this.sideY(by.team, 0.3);
      to.tx = tx;
      to.ty = ty;
      this.fly(tx, ty, 0.5, 0.75, 0.9, { kind: 'catch', by: to.slot }, -1);
      this.holdFor = 0.05;
      return;
    }
    this.touches = 0;
    this.rallyLeft -= 1;
    const out = this.rallyLeft <= 0;
    const tx = clamp(this.area.x0 + this.width * (0.15 + this.random() * 0.7), this.area.x0 + 0.08, this.area.x1 - 0.08);
    const ty = this.sideY(other, out ? 1.15 : 0.35 + this.random() * 0.5);
    // Whoever on the other side is nearest runs for it.
    const receiver = this.nearest(tx, ty, other);
    if (receiver && !out) {
      this.chasing = receiver.slot;
      receiver.tx = tx;
      receiver.ty = ty;
    }
    const flight = volley ? 0.7 : 0.95 + this.random() * 0.3;
    this.fly(tx, ty, out ? 0 : 0.42, flight, volley ? 0.6 : 0.45, out ? { kind: 'land', side: other } : { kind: 'rally', side: other }, -1);
  }

  /** The ball reaches a side: hit back if someone got there, or the point is lost. */
  private rallyArrives(side: 0 | 1): void {
    const receiver = this.byslot(this.chasing);
    this.chasing = -1;
    if (receiver && receiver.team === side && Math.hypot(receiver.x - this.ball.x, receiver.y - this.ball.y) < 0.3) {
      this.give(receiver.slot, false);
      this.holdFor = 0.02;
      this.holdS = 0;
      return;
    }
    this.pointTo((1 - side) as 0 | 1, -1);
  }

  private pointTo(team: 0 | 1, slot: number): void {
    this.events.push({ kind: 'point', team, slot, points: 1 });
    this.serveSide = team;
    this.restS = 1.2;
    this.chasing = -1;
    // The ball rolls to a stop where it fell, then the server fetches it.
    this.state = { kind: 'loose' };
  }
}
