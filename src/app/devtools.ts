import { advance, applyAction, newGame, rowBetween, studentCard, type GameState, type Point, type Tool } from '../sim';
import { clock } from './clock';
import { openBuildMenu } from '../ui/buildMenu';
import { LOOK_MENU, lookCampus, lookItems, stadiumCampus, stadiumItems, type LookScene } from './lookPreview';
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
 *   `?demo=stadium` shows the rendered stadium between drawn buildings.
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
 */
let lookLabels: LookScene['labels'] = [];

function applyViewParams(params: URLSearchParams): void {
  const view = params.get('view')?.split(',').map(Number);
  const arrive = Number(params.get('arrive') ?? 0);
  const look = params.get('demo') === 'look';
  const stadium = params.get('demo') === 'stadium';
  const card = params.get('card');
  if (!view && !arrive && !look && !stadium && card === null) return;
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
  if (params.get('demo') === 'look') {
    store.adopt(lookCampus(clock.now()), { ephemeral: true });
  } else if (params.get('demo') === 'stadium') {
    store.adopt(stadiumCampus(clock.now()), { ephemeral: true });
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
      openBuildMenu(root, LOOK_MENU, () => undefined);
    }, 150);
  }
}
