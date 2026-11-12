import { advance, applyAction, incidentText, nearestSpot, newGame, PLACED, previewPlace, rowBetween, studentCard, type GameState, type Point, type Tool } from '../sim';
import { clock } from './clock';
import { forceHour } from './daylight';
import { openBuildMenu } from '../ui/buildMenu';
import { LOOK_MENU, lookCampus, lookItems, stadiumCampus, stadiumItems, townCampus, townItems, type LookScene } from './lookPreview';
import { session } from './session';
import { store } from './store';

/**
 * Dev builds only. Never shipped: main.ts loads this file behind a dev check.
 *
 * - `window.__campus` exposes the store, session and clock to the console.
 * - Opening the page with `?demo` shows a small tended campus that is about an
 *   hour old, without touching the saved game. It is what the screenshot
 *   script photographs.
 * - `?demo=look` shows every hand-placed item for approving the art, and
 *   `?demo=stadium` shows the rendered stadium between drawn buildings, and
 *   `?demo=town` shows the town, roads, cars and parking of the third play stop.
 * - `?demo=stop3` is the third play stop as built: locals who walk and who
 *   drive, a car park with a road and one without. `&hour=22` shows any page
 *   at that hour of the day, and `&select=x,y` opens the panel of a cell.
 */

function paint(state: GameState, tool: Tool, cells: Point[], variant = 0): GameState {
  const result = applyAction(state, { type: 'paint', tool, cells, variant });
  return result.ok ? result.state : state;
}

/** A campus a careful player might have after their first session. */
function demoCampus(): GameState {
  const now = clock.now();
  const started = now - 75 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  state.money.cash = 900_000;

  // Session one, before move-in: a cross street, quads of several shapes, and rows of lots.
  state = paint(state, 'path', [...rowBetween([19, 8], [19, 13]), ...rowBetween([12, 18], [12, 23]), ...rowBetween([13, 23], [18, 23])]);
  // A two-by-two quad, a single showpiece, a strip between the spines, and a three-by-three lawn.
  state = paint(state, 'quad', [[21, 12], [22, 12], [21, 11], [22, 11], [16, 12]]);
  state = paint(state, 'quad', rowBetween([8, 15], [12, 15]));
  for (let y = 20; y <= 22; y++) state = paint(state, 'quad', rowBetween([14, y], [16, y]));
  // One of each kind of tree in a row, and a small grove.
  for (let kind = 0; kind < 6; kind++) state = paint(state, 'tree', [[12 + kind, 24]], kind);
  state = paint(state, 'tree', [[18, 20], [18, 21], [17, 21]], 3);
  state = paint(state, 'academic', [...rowBetween([20, 13], [23, 13]), ...rowBetween([20, 9], [20, 11]), ...rowBetween([15, 13], [17, 13])]);
  state = paint(state, 'housing', [...rowBetween([8, 18], [11, 18]), ...rowBetween([13, 19], [13, 22]), ...rowBetween([13, 18], [16, 18])]);
  state = advance(state, started, started + 40 * 60_000).state;

  // A second visit: one more row, left without green space so it stalls at stage one.
  state = paint(state, 'housing', rowBetween([4, 13], [9, 13]));
  state = paint(state, 'path', rowBetween([4, 14], [7, 14]));
  return advance(state, state.clock.lastSimulatedAt, now).state;
}

/**
 * The tended campus with one of every building from the Build menu on it, each
 * put on the nearest free ground to the middle that touches a path. For
 * screenshots of the first play stop: `?demo=built`.
 */
function builtCampus(): GameState {
  let state = demoCampus();
  state.money.cash = 5_000_000;
  const { width, height, cells } = state.map;
  const spots: Array<[number, number]> = [];
  for (let y = 2; y < height - 4; y++) for (let x = 2; x < width - 4; x++) spots.push([x, y]);
  const far = ([x, y]: [number, number]): number => Math.max(Math.abs(x - 15), Math.abs(y - 16));
  spots.sort((a, b) => far(a) - far(b));
  const besidePath = (x: number, y: number, w: number, h: number): boolean => {
    for (let cy = y - 1; cy <= y + h; cy++) {
      for (let cx = x - 1; cx <= x + w; cx++) {
        const corner = (cx < x || cx >= x + w) && (cy < y || cy >= y + h);
        if (!corner && cells[cy * width + cx]?.kind === 'path') return true;
      }
    }
    return false;
  };
  for (const type of ['library', 'gym', 'track', 'store', 'coffee', 'pool', 'courts', 'field', 'pondLarge', 'pondMedium', 'pondSmall'] as const) {
    const spec = PLACED[type];
    const spot = spots.find(([x, y]) => previewPlace(state, type, x, y).problem === null && (spec.family === 'water' || besidePath(x, y, spec.w, spec.h)));
    if (!spot) continue;
    const result = applyAction(state, { type: 'place', building: type, x: spot[0], y: spot[1] });
    if (result.ok) state = result.state;
  }
  return state;
}

/**
 * The built campus with one injury at the courts: with a Medical Center in
 * reach and its responder half way there, or with nobody coming. For the two
 * screenshots of play stop 2: `?demo=built&incident=handled` or `=unhandled`.
 */
function incidentCampus(covered: boolean): GameState {
  let state = builtCampus();
  const courts = state.map.placed.find((p) => p?.type === 'courts');
  if (!courts) return state;
  let responder: number | null = null;
  if (covered) {
    const spot = nearestSpot(state, 'medical', courts.x, courts.y);
    const result = spot ? applyAction(state, { type: 'place', building: 'medical', x: spot.x, y: spot.y }) : null;
    if (result?.ok) {
      state = result.state;
      responder = state.map.placed.length - 1;
    }
  }
  const tick = state.clock.tick;
  state.incidents.active.push({ id: 1, kind: 'injury', x: courts.x, y: courts.y, place: 'Outdoor courts', line: 1, startTick: tick - 3, responder, endTick: tick + (covered ? 3 : 30) });
  state.incidents.nextId = 2;
  return state;
}

/**
 * The third play stop on one screen. Room for the whole founding class, a car
 * park and a parking structure with roads to College Avenue, so the locals of
 * the streets too far to walk drive in, and a second car park with no road,
 * which holds nobody.
 */
function stop3Campus(): GameState {
  const now = clock.now();
  const started = now - 50 * 60_000;
  let state = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
  state.money.cash = 5_000_000;
  state = paint(state, 'path', [...rowBetween([0, 14], [7, 14]), ...rowBetween([0, 17], [7, 17]), ...rowBetween([24, 14], [30, 14])]);
  state = paint(state, 'quad', [...rowBetween([4, 15], [9, 15]), ...rowBetween([4, 16], [9, 16]), ...rowBetween([22, 15], [27, 15]), ...rowBetween([22, 16], [27, 16])]);
  state = paint(state, 'academic', [...rowBetween([0, 13], [9, 13]), ...rowBetween([20, 13], [30, 13])]);
  state = paint(state, 'housing', [...rowBetween([0, 18], [18, 18]), ...rowBetween([22, 18], [30, 18])]);
  const place = (building: 'parking' | 'garage', x: number, y: number): void => {
    const result = applyAction(state, { type: 'place', building, x, y });
    if (result.ok) state = result.state;
  };
  // A car park with a road east to the street, and a road that crosses a walk on the way.
  place('parking', 27, 20);
  state = paint(state, 'road', rowBetween([29, 20], [31, 20]));
  place('garage', 28, 24);
  state = paint(state, 'road', [...rowBetween([30, 21], [30, 23]), [30, 24], [31, 24]]);
  state = paint(state, 'path', rowBetween([27, 22], [31, 22]));
  // And one that nobody can drive to.
  place('parking', 24, 21);
  return advance(state, started, now).state;
}

interface DevScene {
  cameras: { main: { zoom: number; width: number; height: number; scrollX: number; scrollY: number; setZoom(zoom: number): void; setScroll(x: number, y: number): void } };
  iso: { toWorld(x: number, y: number): { x: number; y: number } };
  walkers: {
    arrive(count: number): void;
    update(deltaMs: number): void;
    studentsNear(worldX: number, worldY: number): Array<{ entryYear: number; index: number }>;
  };
  art: { people: { roles?: Record<string, number> } | null };
  setPlaced(items: LookScene['items']): void;
  setTints(tints: LookScene['tints']): void;
  scale: { zoom: number };
  add: {
    text(x: number, y: number, text: string, style: Record<string, unknown>): {
      setOrigin(x: number, y: number): unknown;
      setDepth(depth: number): unknown;
      setScale(scale: number): unknown;
    };
  };
}

/**
 * Screenshot helpers, read from the address:
 *   &view=15,20,1.6   look at cell (15, 20), zoomed in 1.6 times
 *   &arrive=24        show 24 students moving in
 *   &card=2           open the student card of the third-nearest walker to the middle
 *   &card=2,follow    the same, with Follow on
 *   &card=unhappy     the least happy student in sight
 *   &place=gym,11,11  begin placing a building with its ghost at a cell
 *   &panel=happiness  open the Happiness panel
 */
let lookLabels: LookScene['labels'] = [];

function applyViewParams(params: URLSearchParams): void {
  const view = params.get('view')?.split(',').map(Number);
  const arrive = Number(params.get('arrive') ?? 0);
  const look = params.get('demo') === 'look';
  const stadium = params.get('demo') === 'stadium';
  const town = params.get('demo') === 'town';
  const card = params.get('card');
  const placing = params.get('place');
  const panel = params.get('panel');
  const incident = params.get('incident');
  const select = params.get('select')?.split(',').map(Number);
  if (select && select.length === 2 && select.every(Number.isFinite)) setTimeout(() => session.select(select[0]!, select[1]!), 2600);
  if (!view && !arrive && !look && !stadium && !town && card === null && !placing && !panel && !incident) return;
  const wait = setInterval(() => {
    const scene = (window as unknown as { __scene?: DevScene }).__scene;
    if (!scene || !store.hasGame) return;
    clearInterval(wait);
    setTimeout(() => {
      if (look) {
        const scene2 = lookItems(scene.art.people?.roles ?? {});
        scene.setPlaced(scene2.items);
        scene.setTints(scene2.tints);
        lookLabels = params.has('labels') ? scene2.labels : [];
      }
      if (stadium) scene.setPlaced(stadiumItems().items);
      if (town) scene.setPlaced(townItems().items);
      if (view && view.length >= 2 && view.every(Number.isFinite)) {
        const camera = scene.cameras.main;
        camera.setZoom(camera.zoom * (view[2] ?? 1));
        const aim = (): void => {
          const at = scene.iso.toWorld(view[0]!, view[1]!);
          camera.setScroll(at.x - camera.width / 2, at.y - camera.height / 2);
        };
        aim();
        // The canvas can still change size just after load, which moves the middle. Aim again.
        setTimeout(aim, 1200);
      }
      // Numbered markers for the guide copy of the look screenshot.
      for (const label of lookLabels) {
        const at = scene.iso.toWorld(label.x, label.y);
        const badge = scene.add.text(at.x, at.y - label.lift, String(label.n), {
          fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#16201b',
          backgroundColor: '#ffd24a',
          padding: { x: 12, y: 4 },
        });
        badge.setOrigin(0.5, 0.5);
        badge.setDepth(2_000_000);
        badge.setScale(0.44 / scene.scale.zoom / scene.cameras.main.zoom);
      }
      // Let the crowd settle in as if the view had been open for a while, so a
      // screenshot taken straight away shows people already on their way.
      const settle = (seconds: number): void => {
        for (let step = 0; step < seconds * 10; step++) scene.walkers.update(100);
      };
      settle(25);
      if (arrive > 0) {
        scene.walkers.arrive(arrive);
        settle(1.4);
      }
      const open = incident ? store.state.incidents.active[0] : undefined;
      if (open) {
        // Look at the incident and say its line, as a tap on its icon would.
        const camera = scene.cameras.main;
        camera.setZoom(camera.zoom * 1.5);
        const aim = (): void => {
          const at = scene.iso.toWorld(open.x + 0.5, open.y + 0.5);
          camera.setScroll(at.x - camera.width / 2, at.y - camera.height / 2);
        };
        aim();
        setTimeout(aim, 1200);
        // Said late, so a screenshot taken a few seconds in still shows it.
        setTimeout(() => session.notify(`${incidentText(open)} ${open.responder === null ? 'Nobody is coming.' : 'Help is on the way.'}`), 3200);
      }
      if (placing) {
        const [type, x, y] = placing.split(',');
        session.startPlacing(type as Parameters<typeof session.startPlacing>[0]);
        session.setGhost(Number(x), Number(y));
      }
      if (panel === 'happiness') setTimeout(() => document.querySelector<HTMLButtonElement>('.happy')?.click(), 1400);
      if (card !== null) {
        // After the view has been aimed for the last time.
        setTimeout(() => {
          const camera = scene.cameras.main;
          const near = scene.walkers.studentsNear(camera.scrollX + camera.width / 2, camera.scrollY + camera.height / 2);
          const [nth, mode] = card.split(',');
          // &card=unhappy picks the least happy student in sight.
          const saddest = [...near].sort(
            (a, b) => (studentCard(store.state, a)?.happiness ?? 100) - (studentCard(store.state, b)?.happiness ?? 100),
          )[0];
          const student = nth === 'unhappy' ? saddest : near[Math.min(near.length - 1, Number(nth) || 0)];
          if (!student) return;
          session.openStudent(student);
          if (mode === 'follow') session.setFollowing(true);
        }, 1500);
      }
    }, 600);
  }, 100);
}

export function installDevTools(): void {
  (window as unknown as Record<string, unknown>).__campus = { store, session, clock };
  const params = new URLSearchParams(window.location.search);
  // &hour=22 shows the light, lamps and crowds of that hour, whatever the clock says.
  const hour = Number(params.get('hour') ?? NaN);
  if (Number.isFinite(hour)) forceHour(hour);
  if (params.get('demo') === 'look') {
    store.adopt(lookCampus(clock.now()), { ephemeral: true });
  } else if (params.get('demo') === 'stadium') {
    store.adopt(stadiumCampus(clock.now()), { ephemeral: true });
  } else if (params.get('demo') === 'built' && params.get('incident')) {
    store.adopt(incidentCampus(params.get('incident') === 'handled'), { ephemeral: true });
  } else if (params.get('demo') === 'built') {
    store.adopt(builtCampus(), { ephemeral: true });
  } else if (params.get('demo') === 'town') {
    store.adopt(townCampus(clock.now()), { ephemeral: true });
  } else if (params.get('demo') === 'stop3') {
    store.adopt(stop3Campus(), { ephemeral: true });
  } else if (params.has('demo')) {
    store.adopt(demoCampus(), { ephemeral: true });
  }
  applyViewParams(params);
  // &buildmenu shows the Build menu as it would look, over whatever is on screen.
  if (params.has('buildmenu')) {
    const wait = setInterval(() => {
      const root = document.getElementById('ui');
      if (!root || !store.hasGame || root.childElementCount === 0) return;
      clearInterval(wait);
      // The look preview shows its example cards. Anywhere else, the real menu.
      if (params.get('demo') === 'look') openBuildMenu(root, LOOK_MENU, () => undefined);
      else document.querySelector<HTMLButtonElement>('.build-fab')?.click();
    }, 150);
  }
}
