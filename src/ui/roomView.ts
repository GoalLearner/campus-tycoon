import { shownHour } from '../app/daylight';
import { roomFor, ROOM_WALLS, type Room, type RoomFigure, type RoomPiece } from '../app/room';
import { session } from '../app/session';
import { studentCard, studentFigure, studentKey, type GameState, type StudentRef } from '../sim';
import { loadAtlas, type Atlas } from './atlas';

/**
 * The peek inside (DESIGN.md section 46): a student's room as a cut-away
 * scene in a sheet over the map. It is drawn on a canvas of its own from the
 * art atlas, on a small grid that has the map's own projection, and redrawn
 * a dozen times a second while it is open for its small motions. Closed, it
 * costs nothing.
 */

/** The map's cell, in atlas pixels: half its width and half its height. */
const HALF_W = 66;
const HALF_H = 37.640625;
/** The room in atlas pixels: how wide, how tall, and where its back corner sits. */
const ROOM_W = 300;
const ROOM_H = 268;
const ORIGIN_X = ROOM_W / 2;
const ORIGIN_Y = 74;
/** Redraws a second while open. The motions are slow; more would cost the map's frames for nothing. */
const FPS = 12;

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

  function sprite(pen: CanvasRenderingContext2D, key: string, x: number, y: number, flip = false, alpha = 1): boolean {
    const rect = atlas?.frames[key]?.frame;
    const anchor = atlas?.anchors[key];
    if (!atlas || !rect || !anchor) return false;
    pen.save();
    pen.globalAlpha = alpha;
    if (flip) {
      pen.translate(x, y);
      pen.scale(-1, 1);
      pen.drawImage(atlas.sheet, rect.x, rect.y, rect.w, rect.h, -(rect.w - anchor[0]), -anchor[1], rect.w, rect.h);
    } else pen.drawImage(atlas.sheet, rect.x, rect.y, rect.w, rect.h, x - anchor[0], y - anchor[1], rect.w, rect.h);
    pen.restore();
    return true;
  }

  /** A standing piece is drawn on its own cell, half a cell up from where it stands. */
  function piece(pen: CanvasRenderingContext2D, item: RoomPiece, time: number): void {
    const [px, py] = at(item.x - 0.5, item.y - 0.5);
    // The open book turns a page now and then.
    const turned = item.pages === true && Math.floor(time / 2600) % 2 === 1;
    sprite(pen, item.key, px, py - (item.lift ?? 0), item.flip !== turned);
  }

  function figure(pen: CanvasRenderingContext2D, who: RoomFigure, time: number): void {
    const people = atlas?.people;
    if (!people) return;
    // Two ways are drawn and the other two are mirrored, as on the map.
    const drawn = people.flip?.[who.facing] ?? who.facing;
    const flip = drawn !== who.facing;
    const phase = (who.x * 7 + who.y * 3) % 1;
    let lift = 0;
    if (who.motion === 'breathe') lift = Math.sin((time / 2400 + phase) * Math.PI * 2) * 0.6;
    else if (who.motion === 'nod') lift = Math.abs(Math.sin((time / 620 + phase) * Math.PI)) * 1.4;
    else if (who.motion === 'talk') lift = Math.max(0, Math.sin((time / 900 + phase) * Math.PI * 2)) * 0.8;
    const [px, py] = at(who.x, who.y);
    sprite(pen, `person.${who.look}.${drawn}.0`, px, py - lift, flip);
  }

  function draw(): void {
    if (!open) return;
    const pen = canvas.getContext('2d');
    if (!pen) return;
    const time = performance.now() - started;
    const ratio = canvas.width / ROOM_W;
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, canvas.width, canvas.height);
    pen.imageSmoothingEnabled = false;
    pen.setTransform(ratio, 0, 0, ratio, 0, 0);
    const room = open.room;
    // The floor, back to front, then the two back walls, back to front.
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) sprite(pen, 'room.floor', ...at(x, y));
    ROOM_WALLS.left.forEach((step) => sprite(pen, 'room.wall.left', ...at(0, step)));
    ROOM_WALLS.right.forEach((step) => sprite(pen, 'room.wall.right', ...at(step, 0)));
    // Everything that stands, nearest last.
    const things: Array<{ depth: number; draw: () => void }> = [
      ...room.pieces.map((item) => ({ depth: item.x + item.y + (item.lift ? -0.3 : 0), draw: () => piece(pen, item, time) })),
      ...room.figures.map((who) => ({ depth: who.x + who.y + 0.01, draw: () => figure(pen, who, time) })),
    ];
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
    // The light: the lamp alone at night, and out when they are asleep.
    if (room.lights !== 'on') {
      pen.fillStyle = room.lights === 'off' ? 'rgba(12, 16, 44, 0.62)' : 'rgba(22, 26, 64, 0.34)';
      pen.fillRect(0, 0, ROOM_W, ROOM_H);
      if (room.lights === 'lamp') {
        const lamp = room.pieces.find((one) => one.key === 'decoration.globeLamp');
        if (lamp) {
          const [lx, ly] = at(lamp.x, lamp.y);
          const glow = pen.createRadialGradient(lx, ly - 46, 4, lx, ly - 30, 120);
          glow.addColorStop(0, 'rgba(255, 214, 140, 0.34)');
          glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
          pen.globalCompositeOperation = 'lighter';
          pen.fillStyle = glow;
          pen.fillRect(0, 0, ROOM_W, ROOM_H);
          pen.globalCompositeOperation = 'source-over';
        }
      }
    }
  }

  function size(): void {
    const css = Math.min(380, Math.max(240, (node.clientWidth || 360) - 24));
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
      mate.textContent = room.roommate ? `Roommate: ${room.roommate.name}` : 'A room of their own';
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
