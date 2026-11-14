import { shownHour } from '../app/daylight';
import { figureNow, pillowOf, roomFor, ROOM_SIZE, ROOM_WALLS, type FigureNow, type Room, type RoomBed, type RoomFigure, type RoomPiece } from '../app/room';
import { session } from '../app/session';
import { studentCard, studentFigure, studentKey, type GameState, type StudentRef } from '../sim';
import { loadAtlas, type Atlas } from './atlas';

/**
 * The peek inside (DESIGN.md sections 46 and 60): a student's room as a
 * cut-away scene in a sheet over the map. It is drawn on a canvas of its own
 * from the art atlas, on a small grid that has the map's own projection, and
 * redrawn a dozen times a second while it is open, as the people in it go
 * about their round. Closed, it costs nothing.
 */

/** The map's cell, in atlas pixels: half its width and half its height. */
const HALF_W = 66;
const HALF_H = 37.640625;
/** The room in atlas pixels: how wide, how tall, and where its back corner sits. */
const MARGIN = 10;
const ORIGIN_X = MARGIN + ROOM_SIZE.y * HALF_W;
const ORIGIN_Y = 74;
const ROOM_W = ORIGIN_X + ROOM_SIZE.x * HALF_W + MARGIN;
const ROOM_H = Math.ceil(ORIGIN_Y + (ROOM_SIZE.x + ROOM_SIZE.y) * HALF_H + 44);
/** Redraws a second while open. The motions are slow; more would cost the map's frames for nothing. */
const FPS = 12;
/** How far down a figure sits: on the chair at the desk, on the sofa, and on the rug, with as much hidden below. */
const SEATED = { sit: { drop: 5, hide: 0 }, sofa: { drop: 3, hide: 6 }, floor: { drop: 6, hide: 9 } } as const;
/** How high a sleeper's feet are put, below the pillow's spot, so the head lies on it. */
const SLEEPER_DROP = 4;

/** For pictures of the room mid-round on the dev page (`&roomt=`): seconds into the round when it opens. */
let startAt = 0;
export function setRoomClock(seconds: number): void {
  startAt = seconds;
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Where a spot of the room falls on the room's own picture, in atlas pixels. */
function at(x: number, y: number): [number, number] {
  return [ORIGIN_X + (x - y) * HALF_W, ORIGIN_Y + (x + y) * HALF_H];
}

export function mountRoomView(): { node: HTMLElement; render: (state: GameState | null) => void } {
  const node = el('div', 'room-sheet');
  const head = el('div', 'room-head');
  const title = el('div', 'room-title');
  const close = el('button', 'room-close', 'Back') as HTMLButtonElement;
  close.type = 'button';
  close.addEventListener('click', () => session.closeRoom());
  head.append(title, close);
  const canvas = document.createElement('canvas');
  canvas.className = 'room-canvas';
  const line = el('div', 'room-line');
  const mate = el('div', 'room-mate');
  node.append(head, canvas, line, mate);

  let atlas: Atlas | null = null;
  void loadAtlas().then((loaded) => {
    atlas = loaded;
  });

  let open: { key: string; room: Room; hour: number; ref: StudentRef } | null = null;
  let timer: number | null = null;
  let started = 0;

  /**
   * Draws a sprite by its anchor. `hide` leaves off that many pixels at its foot. Mirrored, a sprite turns about its
   * own middle, or with `about` about its anchor: the bed, whose anchor is its back corner, then lies the other way.
   */
  function sprite(pen: CanvasRenderingContext2D, key: string, x: number, y: number, flip = false, alpha = 1, hide = 0, about = false): boolean {
    const rect = atlas?.frames[key]?.frame;
    const anchor = atlas?.anchors[key];
    if (!atlas || !rect || !anchor) return false;
    const h = Math.max(1, rect.h - hide);
    pen.save();
    pen.globalAlpha = alpha;
    if (flip) {
      pen.translate(x, y);
      pen.scale(-1, 1);
      pen.drawImage(atlas.sheet, rect.x, rect.y, rect.w, h, about ? -anchor[0] : -(rect.w - anchor[0]), -anchor[1], rect.w, h);
    } else pen.drawImage(atlas.sheet, rect.x, rect.y, rect.w, h, x - anchor[0], y - anchor[1], rect.w, h);
    pen.restore();
    return true;
  }

  /** A standing piece is drawn on its own cell, half a cell up from where it stands. */
  function piece(pen: CanvasRenderingContext2D, item: RoomPiece, turning: boolean): void {
    const [px, py] = at(item.x - 0.5, item.y - 0.5);
    // The open book turns a page now and then while someone reads it.
    const turned = item.pages === true && turning && Math.floor((performance.now() - started) / 2600) % 2 === 1;
    sprite(pen, item.key, px, py - (item.lift ?? 0), item.flip !== turned);
  }

  /** The bed lies by its back corner; mirrored, it lies the other way. Its sleeper, then its blanket, over them. */
  function bed(pen: CanvasRenderingContext2D, one: RoomBed, sleeper: RoomFigure | null, time: number): void {
    const [bx, by] = at(one.x, one.y);
    const flip = one.along === 'y';
    sprite(pen, 'room.bed', bx, by, flip, 1, 0, true);
    let breath = 0;
    if (sleeper) {
      // Breathing slowly: the blanket rises and falls a little, and the head with it.
      breath = Math.sin((time / 4200 + (sleeper.roommate ? 0.37 : 0)) * Math.PI * 2) * 0.6;
      const [hx, hy] = at(...pillowOf(one));
      if (!sprite(pen, `person.${sleeper.look}.sleep`, hx, hy - SLEEPER_DROP - breath * 0.5)) sprite(pen, `person.${sleeper.look}.sw.0`, hx, hy - SLEEPER_DROP);
    }
    sprite(pen, one.blanket, bx, by - breath, flip, 1, 0, true);
  }

  function figure(pen: CanvasRenderingContext2D, who: RoomFigure, now: FigureNow, time: number): void {
    const people = atlas?.people;
    if (!people) return;
    // Two ways are drawn and the other two are mirrored, as on the map.
    const drawn = people.flip?.[now.facing] ?? now.facing;
    const flip = drawn !== now.facing;
    const phase = (who.look * 0.13 + (who.roommate ? 0.5 : 0)) % 1;
    let lift = 0;
    if (now.motion === 'breathe') lift = Math.sin((time / 2400 + phase) * Math.PI * 2) * 0.6;
    else if (now.motion === 'nod') lift = Math.abs(Math.sin((time / 620 + phase) * Math.PI)) * 1.4;
    else if (now.motion === 'talk') lift = Math.max(0, Math.sin((time / 900 + phase) * Math.PI * 2)) * 0.8;
    else if (now.motion === 'reps') lift = -Math.abs(Math.sin((time / 1500 + phase) * Math.PI)) * 3;
    const seated = now.pose === 'sit' || now.pose === 'sofa' || now.pose === 'floor' ? SEATED[now.pose] : { drop: 0, hide: 0 };
    const [px, py] = at(now.x, now.y);
    sprite(pen, `person.${who.look}.${drawn}.${now.pose === 'walk' ? now.frame : 0}`, px, py - lift + seated.drop, flip, 1, seated.hide);
  }

  function draw(): void {
    if (!open) return;
    const pen = canvas.getContext('2d');
    if (!pen) return;
    const time = performance.now() - started + startAt * 1000;
    const ratio = canvas.width / ROOM_W;
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, canvas.width, canvas.height);
    pen.imageSmoothingEnabled = false;
    pen.setTransform(ratio, 0, 0, ratio, 0, 0);
    const room = open.room;
    // The floor, back to front, then the two back walls, back to front.
    for (let y = 0; y < ROOM_SIZE.y; y++) for (let x = 0; x < ROOM_SIZE.x; x++) sprite(pen, 'room.floor', ...at(x, y));
    ROOM_WALLS.left.forEach((step) => sprite(pen, 'room.wall.left', ...at(0, step)));
    ROOM_WALLS.right.forEach((step) => sprite(pen, 'room.wall.right', ...at(step, 0)));
    // What lies flat, under everyone.
    const turning = room.figures.some((who) => figureNow(who, time / 1000).pose === 'sit');
    for (const item of room.pieces.filter((one) => one.flat)) piece(pen, item, turning);
    // Everything that stands, nearest last. A bed sorts by its middle, with its sleeper in it.
    const things: Array<{ depth: number; draw: () => void }> = [];
    for (const item of room.pieces.filter((one) => !one.flat)) {
      const depth = item.x + item.y + (item.lift && item.lift > 20 ? -0.3 : 0) + (item.lift && item.lift <= 20 ? 0.05 : 0) + (item.chair ? 0.02 : 0);
      things.push({ depth, draw: () => piece(pen, item, turning) });
    }
    room.beds.forEach((one, n) => {
      const sleeper = room.figures.find((who) => who.bed === n) ?? null;
      const middle = one.along === 'x' ? one.x + 0.52 + one.y + 0.25 : one.x + 0.25 + one.y + 0.52;
      things.push({ depth: middle, draw: () => bed(pen, one, sleeper, time) });
    });
    for (const who of room.figures) {
      if (who.bed !== null) continue;
      const now = figureNow(who, time / 1000);
      things.push({ depth: now.x + now.y + 0.01, draw: () => figure(pen, who, now, time) });
    }
    things.sort((a, b) => a.depth - b.depth);
    for (const thing of things) thing.draw();
    // Notes drifting up from something being played.
    for (const item of room.pieces.filter((one) => one.notes)) {
      for (let n = 0; n < 2; n++) {
        const t = ((time + n * 1100) % 2200) / 2200;
        const [px, py] = at(item.x - 0.5, item.y - 0.5);
        sprite(pen, n === 0 ? 'room.notes' : 'room.notes2', px + 6 + n * 8, py - 22 - t * 26, false, 1 - t);
      }
    }
    // The light: daylight, the lamp alone at night, or low for the night with the moon in the window.
    if (room.lights !== 'on') {
      pen.fillStyle = room.lights === 'off' ? 'rgba(14, 20, 52, 0.5)' : 'rgba(22, 26, 64, 0.34)';
      pen.fillRect(0, 0, ROOM_W, ROOM_H);
      pen.globalCompositeOperation = 'lighter';
      if (room.lights === 'lamp') {
        const lamp = room.pieces.find((one) => one.key === 'decoration.globeLamp');
        if (lamp) {
          const [lx, ly] = at(lamp.x, lamp.y);
          const glow = pen.createRadialGradient(lx, ly - 46, 4, lx, ly - 30, 120);
          glow.addColorStop(0, 'rgba(255, 214, 140, 0.34)');
          glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
          pen.fillStyle = glow;
          pen.fillRect(0, 0, ROOM_W, ROOM_H);
        }
      } else {
        // Moonlight from the window, falling into the room.
        const drapes = room.pieces.find((one) => one.key === 'room.drapes');
        if (drapes) {
          const [wx, wy] = at(drapes.x, drapes.y);
          const moon = pen.createRadialGradient(wx, wy - 20, 6, wx - 10, wy + 30, 170);
          moon.addColorStop(0, 'rgba(150, 175, 235, 0.3)');
          moon.addColorStop(1, 'rgba(150, 175, 235, 0)');
          pen.fillStyle = moon;
          pen.fillRect(0, 0, ROOM_W, ROOM_H);
        }
      }
      pen.globalCompositeOperation = 'source-over';
    }
  }

  function size(): void {
    const css = Math.min(400, Math.max(240, (node.clientWidth || 360) - 24));
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.style.width = `${css}px`;
    canvas.style.height = `${Math.round((css * ROOM_H) / ROOM_W)}px`;
    canvas.width = Math.round(css * ratio);
    canvas.height = Math.round((css * ratio * ROOM_H) / ROOM_W);
  }

  function stop(): void {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function render(state: GameState | null): void {
    const ref = session.room;
    if (!state || !ref || !atlas) {
      node.classList.remove('show');
      open = null;
      stop();
      return;
    }
    const people = atlas.people;
    const looks = people ? Math.min(people.looks, people.crowd ?? people.looks) : 1;
    const hour = shownHour();
    const key = studentKey(ref);
    // Worked out again when the student or the hour changes: what they are doing follows the clock.
    if (!open || open.key !== key || Math.floor(open.hour * 4) !== Math.floor(hour * 4)) {
      const room = roomFor(state, ref, hour, { crowd: looks, look: (one) => studentFigure(state, one, looks, people?.roles?.athlete) });
      if (!room) {
        session.closeRoom();
        return;
      }
      const card = studentCard(state, ref);
      title.textContent = card ? `${card.name}'s room` : 'Their room';
      line.textContent = room.line;
      const where = room.where.charAt(0).toUpperCase() + room.where.slice(1);
      mate.textContent = room.roommate ? `${where} · Roommate: ${room.roommate.name}` : card?.residence === 'dorm' ? `${where} · A room of their own` : where;
      const fresh = !open || open.key !== key;
      open = { key, room, hour, ref };
      if (fresh) {
        started = performance.now();
        node.classList.add('show');
        size();
      }
    }
    if (timer === null) timer = window.setInterval(draw, 1000 / FPS);
    draw();
  }

  window.addEventListener('resize', () => {
    if (open) size();
  });

  return { node, render };
}
