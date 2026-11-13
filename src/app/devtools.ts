import { DECOR, gainXp, giveDecor, hurryCraft, readyToCollect } from '../sim';
import { collectShow } from '../game/CampusScene';
import { advance, applyAction, DEFAULT_SCHOOL_NAME, incidentText, lampAt, nearestSpot, newGame, parseSave, PLACED, previewPaint, previewPlace, rowBetween, studentCard, yardOver, yardStatus, type GameState, type Point, type Tool, landRankGoals, rewardsWaiting } from '../sim';
import { clock } from './clock';
import { forceHour } from './daylight';
import { openBuildMenu } from '../ui/buildMenu';
import { LOOK_MENU, lookCampus, lookItems, stadiumCampus, stadiumItems, townCampus, townItems, type LookScene } from './lookPreview';
import { setCrowdSetting } from './crowd';
import { foodCampus, footballCampus, lifeCampus, playCampus, unjoinedCampus } from './demoAlive';
import { session } from './session';
import { sound } from './sound';
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
 * park and a parking structure with roads to Lantern Avenue, so the locals of
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

/**
 * Grounds on one screen, for the fourth play stop. The dining hall's corner is
 * tended: bins, benches, a picnic table, and a Facilities Yard with two
 * workers. The recreation field's corner is not: no yard reaches it, its bin
 * is full, litter is deep and a bench is broken. `?demo=grounds`.
 */
function groundsCampus(): GameState {
  let state = builtCampus();
  state.money.cash = 5_000_000;
  const first = (type: string) => state.map.placed.find((placed) => placed?.type === type) ?? null;
  const free = (x: number, y: number): boolean => previewPaint(state, 'bin', [[x, y]]).cells.length === 1;
  /** The nearest free cell to a building, a ring at a time. */
  const beside = (of: { x: number; y: number; w: number; h: number }, skip = 0): Point | null => {
    let left = skip;
    for (let ring = 1; ring <= 3; ring++) {
      for (let y = of.y - ring; y <= of.y + of.h - 1 + ring; y++) {
        for (let x = of.x - ring; x <= of.x + of.w - 1 + ring; x++) {
          if (!free(x, y)) continue;
          if (left === 0) return [x, y];
          left -= 1;
        }
      }
    }
    return null;
  };
  const lay = (tool: 'bin' | 'bench' | 'table', cell: Point | null): void => {
    if (cell) state = paint(state, tool, [cell]);
  };
  const hall = first('dining');
  // A court at the south end of the land, out of the yard's reach: the corner nobody tends.
  state = paint(state, 'path', rowBetween([4, 29], [11, 29]));
  const cornerAt = [5, 6, 7, 8, 4, 9].map((x): Point => [x, 30]).find(([x, y]) => previewPlace(state, 'courts', x, y).problem === null);
  const corner = cornerAt ? applyAction(state, { type: 'place', building: 'courts', x: cornerAt[0], y: cornerAt[1] }) : null;
  if (corner?.ok) state = corner.state;
  const shop = corner?.ok ? (state.map.placed[state.map.placed.length - 1] ?? null) : null;
  if (hall) {
    lay('bench', beside(hall, 2));
    lay('table', beside(hall, 4));
    const spot = nearestSpot(state, 'yard', hall.x, hall.y);
    const built = spot ? applyAction(state, { type: 'place', building: 'yard', x: spot.x, y: spot.y }) : null;
    if (built?.ok) {
      state = built.state;
      const yard = first('yard');
      const hired = yard ? applyAction(state, { type: 'staff', yard: yard.id, workers: 2 }) : null;
      if (hired?.ok) state = hired.state;
    }
  }
  // A bin across the quad from the yard, nearly full, so a worker is seen walking out to it with a cart.
  const courts = first('courts');
  if (courts) lay('bin', beside(courts));
  const farBin = state.map.placed.filter((placed) => placed?.type === 'bin').pop() ?? null;
  if (shop) {
    lay('bin', beside(shop));
    lay('bench', beside(shop, 2));
    lay('bench', beside(shop, 3));
  }
  state = structuredClone(state);
  state.cohorts = [1400, 0, 0, 0];
  // Let a day of litter fall, then leave the store's corner as a neglected one looks.
  state = advance(state, state.clock.lastSimulatedAt, state.clock.lastSimulatedAt + 60_000).state;
  state = structuredClone(state);
  for (const placed of state.map.placed) {
    if (!placed) continue;
    const tended = state.map.care.yard[placed.id] !== undefined && state.map.care.yard[placed.id]! >= 0;
    if (placed.type === 'bin') state.grounds.bins[placed.id] = tended ? 16 : 40;
    else if (['dining', 'store', 'recreation'].includes(PLACED[placed.type].family)) state.grounds.litter[placed.id] = tended ? 4 : 88;
  }
  if (farBin && (state.map.care.yard[farBin.id] ?? -1) >= 0) state.grounds.bins[farBin.id] = 31;
  const benches = state.map.placed.filter((placed) => placed?.type === 'bench' && (state.map.care.yard[placed.id] ?? -1) < 0);
  if (benches[0]) {
    state.grounds.broken[benches[0].id] = 3.3;
    if (shop) state.grounds.brokenFrom[benches[0].id] = { spot: shop.id, line: 0 };
  }
  // Two broken street lamps: one a worker will reach, and one no yard covers. &select=lamp and &select=lamp2 open them.
  const breakLampBy = (spot: { id: number; x: number; y: number } | null, line: number): void => {
    if (!spot) return;
    for (let ring = 1; ring <= 4; ring++) {
      for (let y = spot.y - ring; y <= spot.y + ring; y++) {
        for (let x = spot.x - ring; x <= spot.x + ring; x++) {
          const cell = y * state.map.width + x;
          if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height || !lampAt(state.map, x, y) || state.grounds.lamps[cell]) continue;
          state.grounds.lamps[cell] = 3.3;
          state.grounds.lampFrom[cell] = { spot: spot.id, line };
          return;
        }
      }
    }
  };
  breakLampBy(hall, 0);
  breakLampBy(shop, 1);
  // The yard has the hands its circle asks for, so its corner reads as a tended one does.
  const yard = first('yard');
  if (yard) {
    for (let n = 0; n < 4; n++) {
      const status = yardStatus(state, yard);
      if (status.hire === 0 || status.workers >= status.max) break;
      const hired = applyAction(state, { type: 'staff', yard: yard.id, workers: Math.min(status.max, status.workers + status.hire) });
      if (!hired.ok) break;
      state = hired.state;
    }
  }
  return state;
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
  standerIn(role: string): { student: { entryYear: number; index: number } | null; look: number } | null;
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
 *   &card=in:court    the first student standing in that role, with the view put on them: court, field, runner,
 *                     swimmer, door, line, seat, stall, clubHost, clubVisitor, pickup, picnic, busker, tailgate, band, storm
 *   &place=gym,11,11  begin placing a building with its ghost at a cell
 *   &panel=happiness  open the Happiness panel
 *   &panel=money      open the Money panel; &group=payroll opens one of its groups
 *   &panel=policies   open the Policies page (with &rank=120 or better, so an era has opened it)
 *   &policies=a,b     turn those policies on; &unlock=1 then lets them be changed again, as a class moving in does
 *   &panel=level      open the Level page; &xp=900 and &seals=20 give experience and Gold Seals first
 *   &collect=all      collect everything that is ready; &collect=3 collects that many; &slowburst slows the burst
 *   &panel=orders     open the orders board; &ordersdone finishes the counting orders first, &claim=1 then taps
 *                     Claim and &dismiss=1 taps Dismiss; &ordersclaim claims them at once, for the paper
 *   &stored=sofa:2,banner:1   put decorations in storage; &decor=120 stands that many about the campus, a mix
 *                     of kinds; &placedecor=sofa,3,15 begins placing one with its ghost at a cell, and
 *                     &movedecor=1 begins moving the first on the map
 *   &dress=fountain:20:23,bunting:21:24:flip   set those decorations out at those cells
 *   &craft=bunting    set the Workshop's bench to make it; &craftdone finishes what is on it; &benches=2 gives
 *                     the second bench; &panel=workshop opens the Workshop
 *   &panel=build      open the Build menu; &shelf=Decor scrolls it to that heading
 *   &photo            photo mode
 *   &turn=1           turn the view a quarter (2 a half, 3 three quarters); &view= then aims at the turned map
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
  // &select=broken opens the first broken bin, bench or table.
  if (params.get('select') === 'broken') {
    setTimeout(() => {
      const id = Number(Object.keys(store.state.grounds.broken)[0]);
      const thing = Number.isFinite(id) ? store.state.map.placed[id] : null;
      if (thing) session.focusOn(thing.x, thing.y);
    }, 2600);
  }
  // &select=lamp opens a broken street lamp a yard covers, and &select=lamp2 one that none does.
  const lampPick = params.get('select');
  if (lampPick === 'lamp' || lampPick === 'lamp2') {
    setTimeout(() => {
      const map = store.state.map;
      for (const key of Object.keys(store.state.grounds.lamps)) {
        const cell = Number(key);
        const x = cell % map.width;
        const y = Math.floor(cell / map.width);
        if ((yardOver(map, x, y) !== null) !== (lampPick === 'lamp')) continue;
        session.focusOn(x, y);
        return;
      }
    }, 2600);
  }
  if (!view && !arrive && !look && !stadium && !town && card === null && !placing && !panel && !incident && !params.has('tool') && !params.has('overlay') && !params.has('person') && !params.has('scene') && !params.has('weather') && !params.has('movein') && !params.has('sound') && !params.has('storm')) return;
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
        // The camera works out what it can see when it next draws. Do it now, so the crowd settles into this view.
        (camera as unknown as { preRender?: () => void }).preRender?.();
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
      // &crewinfo prints where the grounds workers are, for checking them in a screenshot.
      if (params.has('crewinfo')) {
        setTimeout(() => {
          const crew = (scene as unknown as { crew: { trips: Array<{ toX: number; toY: number; cart: boolean; body: { visible: boolean; x: number; y: number; frame: { name: string } } }> } }).crew;
          const note = document.createElement('div');
          note.style.cssText = 'position:fixed;left:8px;top:190px;z-index:99;background:#000c;color:#fff;font:11px monospace;padding:6px;max-width:340px;white-space:pre-wrap';
          note.textContent = JSON.stringify(crew.trips.map((t) => ({ to: [t.toX, t.toY], cart: t.cart, vis: t.body.visible, at: [Math.round(t.body.x), Math.round(t.body.y)], frame: t.body.frame.name })), null, 0);
          document.body.append(note);
        }, 3000);
      }
      if (panel === 'happiness') setTimeout(() => document.querySelector<HTMLButtonElement>('.happy')?.click(), 1400);
      // &panel=plan opens the room plan as a tap on the Housing bar would.
      if (panel === 'plan') setTimeout(() => document.querySelector<HTMLElement>('.bars .bar')?.click(), 1400);
      // &crowd=low|normal|high sets the crowd density for this visit, and &stats shows frames a second and
      // who is on screen in the corner, read once a second.
      const crowd = params.get('crowd');
      if (crowd === 'low' || crowd === 'normal' || crowd === 'high') setCrowdSetting(crowd);
      // &pin holds the crowd at its setting: a machine taking screenshots draws slowly, and the frame budget would thin it.
      if (params.has('pin')) (scene as unknown as { holdCrowd?: () => void }).holdCrowd?.();
      // &weather=rain sets the sky, which the calendar layer will do by itself: rain is heard and empties the lawns.
      const sky = params.get('weather');
      if (sky === 'rain' || sky === 'snow' || sky === 'clear') (scene as unknown as { setWeather?: (weather: string) => void }).setWeather?.(sky);
      // &sound starts the sound without a tap, for measuring the work of a frame with it on. A browser only allows
      // this where it has been told to, as the screenshot browser has.
      if (params.has('sound')) setTimeout(() => sound.unlock(), 1500);
      // &movein=120 has that many students move in now, with parents and boxes, as on the first day of a semester.
      if (params.has('movein')) {
        const count = Number(params.get('movein')) || 120;
        setTimeout(() => (scene as unknown as { moveInNow?: (count: number) => void }).moveInNow?.(count), 2500);
      }
      // &storm puts fans on the stadium's field, as after a big home win.
      if (params.has('storm')) (scene as unknown as { holdStorm?: () => void }).holdStorm?.();
      // &scene=club puts the middle of the view on the first small scene of that kind: club, pickup, busker or boxes.
      const kind = params.get('scene');
      if (kind) {
        const look = (tries: number): void => {
          const at = (scene as unknown as { sceneSpot?: (kind: string) => { x: number; y: number } | null }).sceneSpot?.(kind);
          if (at) {
            const camera = scene.cameras.main;
            const world = scene.iso.toWorld(at.x, at.y);
            camera.setScroll(world.x - camera.width / 2, world.y - camera.height / 2);
          } else if (tries > 0) setTimeout(() => look(tries - 1), 600);
        };
        setTimeout(() => look(20), 1500);
      }
      // &truck brings a delivery truck to its door at once, for a screenshot of its driver.
      if (params.has('truck')) (scene as unknown as { cars?: { truckNow?: () => void } }).cars?.truckNow?.();
      // &weekend shows a weekend's visitors, tour groups and boosters, on any day of the game's week.
      if (params.has('weekend')) (scene as unknown as { holdWeekend?: () => void }).holdWeekend?.();
      // &person=professor opens the card of the nearest person of that role to the middle of the view:
      // professor, advisor, chef, clerk, guide, parent, booster, townie, worker, medic, officer or driver.
      const role = params.get('person');
      if (role) {
        const look = (tries: number): void => {
          const found = (scene as unknown as { personInView?: (role: string) => Parameters<typeof session.openPerson>[0] | null }).personInView?.(role);
          if (found) {
            session.openPerson(found);
            // &centre puts them in the middle of the view, above their card.
            if (params.has('centre')) (scene as unknown as { lookAtPerson?: (ref: typeof found) => void }).lookAtPerson?.(found);
          } else if (tries > 0) setTimeout(() => look(tries - 1), 700);
        };
        // &wait=60 keeps looking for that many seconds: a delivery driver is only out while a truck stands at a door.
        setTimeout(() => look(Math.round(Number(params.get('wait') ?? 10) / 0.7)), 1600);
      }
      if (params.has('stats')) {
        const box = document.createElement('div');
        Object.assign(box.style, { position: 'fixed', left: '8px', bottom: '70px', zIndex: '99', padding: '4px 8px', font: '12px monospace', color: '#fff', background: 'rgba(0,0,0,0.7)', borderRadius: '6px', pointerEvents: 'none', whiteSpace: 'pre' });
        document.body.append(box);
        setInterval(() => {
          const live = (window as unknown as { __scene?: { stats?: () => { fps: number; step: number; walkers: Record<string, number>; vehicles: Record<string, number>; extras: number } } }).__scene?.stats?.();
          if (!live) return;
          const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
          box.textContent = `${live.fps.toFixed(0)} fps · step ${live.step}
${sum(live.walkers)} walking (${live.walkers.commuters} in from town, ${live.walkers.neighbours} neighbours)
${live.walkers.professors ?? 0} professors, ${live.walkers.staff ?? 0} staff, ${live.walkers.visitors ?? 0} visitors
${sum(live.vehicles) - (live.vehicles.parked ?? 0)} driving, ${live.vehicles.parked ?? 0} parked · ${live.extras} playing or seated`;
        }, 1000);
      }
      // &phone=375x667 lays the interface out in a box of that size at the top left, for a screenshot of a
      // panel on a phone narrower than a desktop browser window can be made.
      const phone = params.get('phone')?.split('x').map(Number);
      if (phone && phone.length === 2 && phone.every((n) => Number.isFinite(n) && n > 0)) {
        const ui = document.getElementById('ui');
        if (ui) Object.assign(ui.style, { width: `${phone[0]}px`, height: `${phone[1]}px`, right: 'auto', bottom: 'auto', transform: 'translateZ(0)', overflow: 'hidden' });
      }
      // &panel=money opens the Money panel as a tap on the cash figure would, and &group=payroll opens one of its groups.
      if (panel === 'money') {
        setTimeout(() => document.querySelector<HTMLButtonElement>('button.money')?.click(), 1400);
        const group = params.get('group');
        if (group) {
          setTimeout(() => {
            const order = ['payroll', 'buildings', 'other'];
            const heads = [...document.querySelectorAll<HTMLButtonElement>('.money-group')];
            const names: Record<string, string> = { payroll: 'Payroll', buildings: 'Buildings', other: 'Other' };
            (heads.find((head) => head.textContent?.startsWith(names[group] ?? '')) ?? heads[order.indexOf(group)])?.click();
          }, 1900);
        }
      }
      // &panel=size opens the Goals and Capacity screen as a tap on the student count would. &panel=capacity turns to
      // its Capacity page, and &row=Faculty opens one of that page's rows.
      if (panel === 'size' || panel === 'capacity') {
        setTimeout(() => document.querySelector<HTMLButtonElement>('button.students:not(.happy)')?.click(), 1400);
        if (panel === 'capacity') setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('.fb-tab')].find((b) => b.textContent?.startsWith('Capacity'))?.click(), 1900);
        const row = params.get('row');
        if (row) setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('.need')].find((b) => b.querySelector('.need-name')?.textContent === row)?.click(), 2300);
      }
      // &panel=orders opens the orders board as a tap on its button would. &claim=1 then taps the first Claim, and
      // &dismiss=1 the first Dismiss.
      if (panel === 'orders') {
        setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('.hud-chip.stat')].find((b) => b.querySelector('.chip-label')?.textContent === 'orders')?.click(), 2600);
        if (params.has('claim')) setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('.order button')].find((b) => b.textContent === 'Claim')?.click(), 3400);
        if (params.has('dismiss')) setTimeout(() => document.querySelector<HTMLButtonElement>('.order-dismiss')?.click(), 3400);
      }
      // &panel=workshop opens the Workshop from the Makerspace's own panel, as a player would.
      if (panel === 'workshop') {
        setTimeout(() => {
          const shop = store.state.map.placed.find((placed) => placed && placed.type === 'makerspace');
          if (shop) session.select(shop.x, shop.y);
        }, 2600);
        setTimeout(() => document.querySelector<HTMLButtonElement>('.inspector-action.show')?.click(), 3200);
      }
      // &panel=build opens the Build menu. &shelf=Decor scrolls it to the heading that begins with that word.
      if (panel === 'build') {
        setTimeout(() => document.querySelector<HTMLButtonElement>('.build-fab')?.click(), 2600);
        const shelf = params.get('shelf');
        if (shelf) setTimeout(() => [...document.querySelectorAll('.build-category')].find((node) => node.textContent?.startsWith(shelf))?.scrollIntoView(), 3400);
      }
      // &panel=level opens the Level page as a tap on its button would. &finish=1 then taps the first Finish now.
      if (panel === 'level') {
        setTimeout(() => document.querySelector<HTMLButtonElement>('.level-chip')?.click(), 2600);
        if (params.has('finish')) setTimeout(() => document.querySelector<HTMLButtonElement>('.finish-go')?.click(), 3200);
      }
      // &panel=policies opens the Policies page as a tap on its chip would. &panel=goals opens the Goals page.
      if (panel === 'policies') setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('.hud-chip')].find((b) => b.textContent?.startsWith('Policies'))?.click(), 2600);
      if (panel === 'goals') setTimeout(() => document.querySelector<HTMLButtonElement>('button.students:not(.happy)')?.click(), 1400);
      // &panel=inbox opens the Inbox as a tap on its chip would, and &tab=Advisors turns to one of its pages.
      if (panel === 'inbox') {
        setTimeout(() => document.querySelector<HTMLButtonElement>('.hud-chips .hud-chip:last-child')?.click(), 1400);
        const tab = params.get('tab');
        if (tab) setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('.fb-tab')].find((b) => b.textContent === tab)?.click(), 1900);
      }
      // &tool=road puts the road tool in hand, and &overlay=parking shows the Parking overlay.
      if (params.get('tool') === 'road') setTimeout(() => session.setTool('road'), 1400);
      const overlay = params.get('overlay');
      if (overlay === 'parking' || overlay === 'clean') setTimeout(() => session.setOverlay(overlay), 1400);
      const hand = params.get('tool');
      if (hand === 'bin' || hand === 'bench' || hand === 'table') setTimeout(() => session.setTool(hand), 1400);
      if (card !== null) {
        // After the view has been aimed for the last time.
        setTimeout(() => {
          const camera = scene.cameras.main;
          const near = scene.walkers.studentsNear(camera.scrollX + camera.width / 2, camera.scrollY + camera.height / 2);
          const [nth, mode] = card.split(',');
          if (nth?.startsWith('in:')) {
            // They may not have come into view yet: look again for a few seconds.
            let tries = 0;
            const look = (): void => {
              const who = scene.standerIn(nth.slice(3));
              if (who?.student) session.openStudent(who.student, who.look);
              else if (++tries < 12) setTimeout(look, 500);
            };
            look();
            return;
          }
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
  // &turn=1 turns the view a quarter before the map is drawn (DESIGN.md section 43).
  const turn = Number(params.get('turn') ?? NaN);
  if (turn === 0 || turn === 1 || turn === 2 || turn === 3) session.setTurn(turn);
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
  } else if (params.get('demo') === 'grounds') {
    store.adopt(groundsCampus(), { ephemeral: true });
  } else if (params.get('demo') === 'founding') {
    // A brand-new campus a minute after its first class moved in: beds short, a waitlist open, locals with no way in.
    const started = clock.now() - 16 * 60_000;
    const fresh = newGame({ seed: 20261111, name: 'Larkspur University', now: started });
    store.adopt(advance(fresh, started, clock.now()).state, { ephemeral: true });
  } else if (params.get('demo') === 'play') {
    // &students=800 sets how many are enrolled, to show a quieter campus or a more crowded one.
    store.adopt(playCampus(Number(params.get('students') ?? 1500)), { ephemeral: true });
  } else if (params.get('demo') === 'food') {
    store.adopt(foodCampus(Number(params.get('students') ?? 1200)), { ephemeral: true });
  } else if (params.get('demo') === 'football') {
    store.adopt(footballCampus(params.get('at') ?? 'live', Number(params.get('students') ?? 2400), Number(params.get('tier') ?? 2)), { ephemeral: true });
    // &away=24 then lets that many hours pass at once, so the away list opens as it would after a day away.
    if (params.has('away')) {
      clock.skip((Number(params.get('away')) || 24) * 3_600_000);
      store.catchUp();
    }
  } else if (params.get('demo') === 'life') {
    store.adopt(lifeCampus(Number(params.get('students') ?? 1200)), { ephemeral: true });
  } else if (params.get('demo') === 'model') {
    // The model campus of DESIGN.md section 35, unsaved. The same thing the Menu's visit opens.
    store.adopt(newGame({ seed: Number(params.get('seed') ?? 20261112), name: DEFAULT_SCHOOL_NAME, now: clock.now(), campus: 'model' }), { ephemeral: true });
    // &days=9 lets that many days pass with nobody looking in, and puts the away list aside. &answer takes the
    // advisor's pick on the desk each of those days, as a player would. &away=24 then lets that many hours pass
    // at once, so the newspaper opens as it would after a day away.
    const days = Number(params.get('days') ?? 0);
    for (let day = 0; day < days; day++) {
      clock.skip(86_400_000);
      store.catchUp();
      if (params.has('answer')) for (const item of [...store.state.inbox.open]) store.dispatch({ type: 'inbox', id: item.id, option: item.advised });
    }
    store.away = null;
    // &grow=58000 puts that many students on the campus before the time away, to show a goal or an era being reached.
    const grow = Number(params.get('grow') ?? 0);
    if (grow > 0 && store.hasGame) {
      const share = grow / Math.max(1, store.state.cohorts.reduce((sum, n) => sum + n, 0));
      const grown = structuredClone(store.state);
      grown.cohorts = grown.cohorts.map((n) => Math.round(n * share)) as typeof grown.cohorts;
      grown.offCampus = grown.offCampus.map((n) => Math.round(n * share)) as typeof grown.offCampus;
      store.adopt(grown, { ephemeral: true });
    }
    // &rank=90 puts the campus at that rank with every rank goal down to it reached, so their buildings are
    // waiting in the Build menu (DESIGN.md section 40). &rewards=8 then places that many of them, each on the
    // free ground nearest &at=x,y, for a picture of them on the campus.
    const rank = Number(params.get('rank') ?? 0);
    if (rank > 0 && store.hasGame && store.state.goals) {
      const ranked = structuredClone(store.state);
      ranked.field.rank = rank;
      ranked.field.rankYear = Math.max(1, ranked.clock.week.year);
      landRankGoals(ranked, []);
      store.adopt(ranked, { ephemeral: true });
      const [cx, cy] = (params.get('at') ?? '16,16').split(',').map(Number) as [number, number];
      const wanted = Number(params.get('rewards') ?? 0);
      for (const type of rewardsWaiting(store.state).slice(0, wanted)) {
        let best: [number, number] | null = null;
        let near = Infinity;
        const map = store.state.map;
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            const far = Math.abs(x - cx) + Math.abs(y - cy);
            if (far >= near || previewPlace(store.state, type, x, y).problem !== null) continue;
            near = far;
            best = [x, y];
          }
        }
        if (best) store.dispatch({ type: 'place', building: type, x: best[0], y: best[1] });
      }
      // &policies=parkingFees,quietHours turns those on, as taps on their switches would (DESIGN.md section 41).
      // &unlock=1 then frees them, as the next class moving in does, so a picture can show both kinds of switch.
      for (const id of (params.get('policies') ?? '').split(',').filter((one) => one !== '')) store.dispatch({ type: 'policy', id, on: true });
      if (params.has('unlock')) {
        const freed = structuredClone(store.state);
        freed.policies.locked = freed.policies.locked.filter((id) => !(params.get('unlock') ?? '').split(',').includes(id) && params.get('unlock') !== '1');
        store.adopt(freed, { ephemeral: true });
      }
    }
    // The daily layer (DESIGN.md section 42): &xp=900 gives experience, &seals=20 sets the Gold Seals held, and
    // &collect=all collects everything ready (&collect=3, that many) a few seconds in, so the burst can be seen.
    if (store.hasGame && (params.has('xp') || params.has('seals'))) {
      const given = structuredClone(store.state);
      gainXp(given, Number(params.get('xp') ?? 0));
      if (params.has('seals')) given.daily.seals = Number(params.get('seals'));
      store.adopt(given, { ephemeral: true });
    }
    // &giftbox=6 fills six boxes of the gift card, so the next is the seventh (DESIGN.md 44).
    if (store.hasGame && params.has('giftbox') && store.state.rhythm) {
      const card = structuredClone(store.state);
      card.rhythm.box = Math.max(0, Math.min(6, Number(params.get('giftbox')) || 0));
      store.adopt(card, { ephemeral: true });
    }
    if (params.has('slowburst')) {
      collectShow.burstMs = 9000;
      document.documentElement.style.setProperty('--burst-ms', '9000ms');
    }
    // &ordersdone looks at the orders board and then finishes every order that counts something: a picture of a
    // finished order waiting to be claimed.
    if (params.has('ordersdone') && store.hasGame) {
      store.dispatch({ type: 'seeOrders' });
      const done = structuredClone(store.state);
      for (const order of done.orders.open) {
        if (order.kind && order.kind in { plantTrees: 1, layQuads: 1, benches: 1, collectRound: 1 }) {
          const what = { plantTrees: 'trees', layQuads: 'quads', benches: 'furniture', collectRound: 'collects' }[order.kind as 'plantTrees'];
          done.orders.tally[what] = (order.from ?? 0) + (order.target ?? 1);
        }
      }
      store.adopt(done, { ephemeral: true });
      // &ordersclaim then claims them, so that with &away the paper has its line for each.
      if (params.has('ordersclaim')) for (const order of [...store.state.orders.open]) store.dispatch({ type: 'claimOrder', id: order.id });
    }
    // Decorations and the Workshop (DESIGN.md 42.5 and 42.6).
    if (store.hasGame && (params.has('stored') || params.has('decor') || params.has('dress') || params.has('craft') || params.has('benches'))) {
      let dressed = structuredClone(store.state);
      for (const part of (params.get('stored') ?? '').split(',').filter(Boolean)) {
        const [id, count] = part.split(':');
        for (let n = 0; n < (Number(count) || 1); n++) giveDecor(dressed, id!);
      }
      if (params.has('benches')) while (dressed.decor.benches.length < Number(params.get('benches'))) dressed.decor.benches.push({ recipe: null, making: null, done: null });
      // &decor=120: every third free cell beside a dorm or a lecture hall takes the next kind, until that many stand.
      const want = Number(params.get('decor') ?? 0);
      if (want > 0) {
        const kinds = DECOR.filter((spec) => spec.home.kind !== 'founder');
        let n = 0;
        const map = dressed.map;
        for (let i = 0; i < map.cells.length && n < want; i++) {
          const x = i % map.width;
          const y = Math.floor(i / map.width);
          if ((x + 2 * y) % 3 !== 0 || previewPlace(dressed, 'decor', x, y).problem !== null) continue;
          const near = map.buildings.some((lot) => lot && Math.max(Math.abs(lot.x - x), Math.abs(lot.y - y)) <= 3);
          if (!near) continue;
          const id = kinds[n % kinds.length]!.id;
          giveDecor(dressed, id);
          const placed = applyAction(dressed, { type: 'placeDecor', id, x, y });
          if (placed.ok) dressed = placed.state;
          n += 1;
        }
      }
      // &dress=fountain:20:23,banner:19:22,bunting:21:24:flip sets those out at those cells.
      for (const part of (params.get('dress') ?? '').split(',').filter(Boolean)) {
        const [id, x, y, flip] = part.split(':');
        giveDecor(dressed, id!);
        const placed = applyAction(dressed, { type: 'placeDecor', id: id!, x: Number(x), y: Number(y), flip: flip === 'flip' });
        if (placed.ok) dressed = placed.state;
      }
      if (params.has('craft')) {
        const level = Math.max(dressed.daily.level, 60);
        dressed.daily.level = level;
        const set = applyAction(dressed, { type: 'setRecipe', bench: 0, recipe: params.get('craft') });
        if (set.ok) dressed = set.state;
        if (params.has('craftdone')) hurryCraft(dressed, 0);
        // &craft2=banner sets the second bench to work as well, so one is finished and one is under way.
        if (params.has('craft2')) {
          const second = applyAction(dressed, { type: 'setRecipe', bench: 1, recipe: params.get('craft2') });
          if (second.ok) dressed = second.state;
        }
      }
      store.adopt(dressed, { ephemeral: true });
      if (params.has('craftdone')) {
        clock.skip(120_000);
        store.catchUp();
      }
    }
    const placeDecor = params.get('placedecor')?.split(',');
    if (placeDecor && placeDecor.length === 3) {
      setTimeout(() => {
        session.startDecor(placeDecor[0]!);
        session.setGhost(Number(placeDecor[1]), Number(placeDecor[2]));
      }, 2600);
    }
    if (params.has('movedecor')) {
      setTimeout(() => {
        const first = store.state.map.placed.find((placed) => placed && placed.type === 'decor');
        if (!first || !first.decor) return;
        session.startDecor(first.decor, first.id, first.flip === true);
        session.setGhost(first.x + 1, first.y);
      }, 2600);
    }
    if (params.has('photo')) setTimeout(() => session.setPhoto(true), 2600);
    if (params.has('collect')) {
      const many = params.get('collect');
      setTimeout(() => {
        if (many === 'all') store.dispatch({ type: 'collectAll' });
        else for (const one of readyToCollect(store.state).slice(0, Number(many) || 1)) store.dispatch({ type: 'collect', key: one.key });
      }, Number(params.get('collectAt') ?? 5000));
    }
    // &standing=115 gives the campus the published rating of the school at that rank, so its next rankings day
    // lands it about there. With &away, that is the paper of the day a goal and an era are reached.
    const standing = Number(params.get('standing') ?? 0);
    if (standing > 0 && store.hasGame) {
      const set = structuredClone(store.state);
      const ratings = set.field.schools.map((school) => school.ar).sort((a, b) => b - a);
      set.field.academic = ratings[Math.min(ratings.length, standing) - 1] ?? set.field.academic;
      store.adopt(set, { ephemeral: true });
    }
    if (params.has('away')) {
      clock.skip((Number(params.get('away')) || 24) * 3_600_000);
      store.catchUp();
    }
  } else if (params.get('demo') === 'unjoined') {
    store.adopt(unjoinedCampus(), { ephemeral: true });
  } else if (params.get('demo') === 'mature') {
    // A large campus: the save the tests keep of a campus eight years old, read from the dev server.
    void fetch('/tests/fixtures/save-v8-mature.json')
      .then((response) => response.text())
      .then((text) => {
        const loaded = parseSave(text);
        if (loaded.ok) store.adopt(loaded.state, { ephemeral: true });
      });
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
      // &shelf=Grounds scrolls the menu to that shelf.
      const shelf = params.get('shelf');
      if (shelf) {
        setTimeout(() => {
          const heads = [...document.querySelectorAll<HTMLElement>('.build-category')];
          heads.find((head) => head.textContent === shelf)?.scrollIntoView();
        }, 900);
      }
    }, 150);
  }
}
