import { clock } from '../app/clock';
import { exportSave, isStoragePersistent, pickSaveFile, requestPersistentStorage } from '../app/persistence';
import { hasTimeSkip, isNative } from '../app/platform';
import { session, type ToolChoice } from '../app/session';
import { store } from '../app/store';
import { updates } from '../app/updates';
import {
  bottleneck,
  buildingAt,
  calendarAt,
  dateAt,
  formatDate,
  capacityWanted,
  cellAt,
  COST,
  demandBar,
  desirabilityHint,
  dollars,
  dollarsShort,
  duration,
  enrollment,
  expectedClass,
  FIRST_INTAKE_TICK,
  lotStatus,
  MAX_STAGE,
  netPerRealHour,
  nextMilestone,
  openCapacity,
  roomForNewStudents,
  roomPlan,
  stageSpec,
  TREE_KINDS,
  acceptanceRate,
  nearestSpot,
  PLACED,
  placedAt,
  previewPlace,
  type GameState,
  type LogEntry,
  type PlacedType,
  type StallCause,
  summarizeAway,
  type Zone,
} from '../sim';
import { buildEntries, happinessView, lotFacts, placedFacts, placedSummary, placingLine } from './buildUi';
import { openBuildMenu } from './buildMenu';
import { face, mountStudentCard } from './studentCard';

/**
 * The HUD and every panel, as plain HTML over the map. It reads the game from
 * the store and the session, and sends the player's choices back to them.
 * One thing per panel, and as little on screen as will do.
 */

const ZONES: readonly Zone[] = ['housing', 'academic'];
const ZONE_LABEL: Record<Zone, string> = { housing: 'Housing', academic: 'Academics' };
const ZONE_UNIT: Record<Zone, string> = { housing: 'beds', academic: 'seats' };
/** What is happening right now, in words a first-time player reads at a glance. */
const NOW_LABEL = {
  moveIn: 'Founding day',
  fall: 'Fall semester in session',
  spring: 'Spring semester in session',
  graduation: 'Graduation day',
  summer: 'Summer break',
};
/** What to add when a zone is short. */
const ZONE_ASK: Record<Zone, string> = { housing: 'Housing beds', academic: 'Academic seats' };
const ZONE_LOT: Record<Zone, [string, string]> = {
  housing: ['Housing lot', 'Housing lots'],
  academic: ['Academic lot', 'Academic lots'],
};
const MILESTONE_LABEL = {
  fallIntake: 'Fall class arrives',
  springIntake: 'Spring class arrives',
  graduation: 'Graduation',
  yearEnd: 'Year closes',
};

const TOOLS: Array<{ id: ToolChoice; label: string; hint: string }> = [
  { id: 'look', label: 'Look', hint: '' },
  { id: 'housing', label: 'Housing', hint: `Drag a row of dorm lots · ${dollars(COST.zoneLot)} each · two fingers move the map` },
  { id: 'academic', label: 'Academic', hint: `Drag a row of lecture-hall lots · ${dollars(COST.zoneLot)} each · two fingers move the map` },
  { id: 'path', label: 'Path', hint: `Drag to lay a path · ${dollars(COST.path)} a cell` },
  { id: 'quad', label: 'Quad', hint: `Drag to plant a quad · ${dollars(COST.quad)} a cell` },
  { id: 'tree', label: 'Tree', hint: `Tap or drag to plant trees · ${dollars(COST.tree)} each` },
  { id: 'clear', label: 'Clear', hint: 'Drag over what to clear · you see what comes back before it goes' },
];

const TOOL_NOUN: Record<Exclude<ToolChoice, 'look' | 'place'>, [string, string]> = {
  housing: ['lot', 'lots'],
  academic: ['lot', 'lots'],
  path: ['path cell', 'path cells'],
  quad: ['quad cell', 'quad cells'],
  tree: ['tree', 'trees'],
  clear: ['cell', 'cells'],
};

/** Taps on the version line that show or hide the tester tools. */
const TESTER_TAPS = 7;
const TESTER_KEY = 'campus-tycoon.testerTools';

/** Dev builds always show the time-skip panel. Tester builds show it only after the hidden switch. */
function testerToolsOn(): boolean {
  if (import.meta.env.DEV) return true;
  if (!hasTimeSkip) return false;
  try {
    return localStorage.getItem(TESTER_KEY) === 'on';
  } catch {
    return false;
  }
}

function setTesterTools(on: boolean): void {
  try {
    if (on) localStorage.setItem(TESTER_KEY, 'on');
    else localStorage.removeItem(TESTER_KEY);
  } catch {
    // Without storage the switch simply does not stick.
  }
}

interface UiManifest {
  menuCredit?: string;
  credits?: Array<{ author?: string }>;
  atlas?: { image: string; data: string };
  sprites?: Record<string, unknown>;
  trees?: string[];
}

/** The art manifest, fetched once. The UI reads the credit line and the tree names from it. */
let manifestOnce: Promise<UiManifest> | null = null;
function loadManifest(): Promise<UiManifest> {
  manifestOnce ??= fetch('./assets/manifest.json')
    .then((response) => response.json() as Promise<UiManifest>)
    .catch(() => ({}));
  return manifestOnce;
}

/** The art credit for the Menu, read from the art manifest so a new pack brings its own. */
function loadArtCredit(): Promise<string> {
  return loadManifest().then((manifest) => {
    if (manifest.menuCredit) return manifest.menuCredit;
    const authors = (manifest.credits ?? []).map((credit) => credit.author).filter(Boolean);
    return authors.length > 0 ? `Art by ${authors.join(', ')}.` : '';
  });
}

interface TreeChoice {
  name: string;
  /** A small picture of the tree, cut from the atlas. Null if the atlas could not be read. */
  picture: HTMLCanvasElement | null;
}

/** The kinds of tree the pack offers, with a thumbnail of each for the picker. */
async function loadTreeChoices(): Promise<TreeChoice[]> {
  const manifest = await loadManifest();
  let kinds = 0;
  while (kinds < TREE_KINDS && manifest.sprites?.[`tree.${kinds}`]) kinds += 1;
  if (kinds === 0 || !manifest.atlas) return [];

  let frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};
  let sheet: HTMLImageElement | null = null;
  try {
    frames = ((await (await fetch(`./assets/${manifest.atlas.data}`)).json()) as { frames: typeof frames }).frames;
    sheet = new Image();
    sheet.src = `./assets/${manifest.atlas.image}`;
    await sheet.decode();
  } catch {
    sheet = null;
  }

  const choices: TreeChoice[] = [];
  for (let kind = 0; kind < kinds; kind++) {
    const rect = frames[`tree.${kind}`]?.frame;
    let picture: HTMLCanvasElement | null = null;
    if (sheet && rect) {
      // Twice the shown size, so it stays sharp on a phone.
      const side = 88;
      picture = document.createElement('canvas');
      picture.width = side;
      picture.height = side;
      const scale = Math.min(side / rect.w, side / rect.h);
      const w = rect.w * scale;
      const h = rect.h * scale;
      picture.getContext('2d')?.drawImage(sheet, rect.x, rect.y, rect.w, rect.h, (side - w) / 2, side - h, w, h);
    }
    choices.push({ name: manifest.trees?.[kind] ?? `Tree ${kind + 1}`, picture });
  }
  return choices;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function mountUi(root: HTMLElement): void {
  // ------------------------------------------------------------------ HUD --
  const hud = el('div', 'hud');
  const top = el('div', 'hud-top');
  const money = el('div', 'money');
  const cash = el('span', 'cash');
  const rate = el('span', 'rate');
  money.append(cash, rate);
  const students = el('div', 'students');
  const studentCount = el('span', 'count');
  students.append(studentCount, el('span', 'label', 'students'));
  // Happiness: a face and a number. Tapping it shows the causes.
  const happy = el('button', 'students happy');
  happy.type = 'button';
  const happyFace = el('span', 'happy-face');
  const happyCount = el('span', 'count');
  const happyTop = el('span', 'happy-top');
  happyTop.append(happyFace, happyCount);
  happy.append(happyTop, el('span', 'label', 'happiness'));
  happy.addEventListener('click', () => openHappiness());
  let shownMood = -1;
  const menuButton = button('Menu', 'menu-button', () => openMenu());
  top.append(money, students, happy, menuButton);

  const calendar = el('div', 'calendar');
  const when = el('span', 'when');
  const next = el('span', 'next');
  calendar.append(when, next);

  const bars = el('div', 'bars');
  const barParts = {} as Record<Zone, { tag: HTMLElement; amount: HTMLElement; fill: HTMLElement; row: HTMLElement }>;
  for (const zone of ZONES) {
    const row = el('div', 'bar');
    const head = el('div', 'bar-head');
    const tag = el('span', 'tag', 'Bottleneck \u203a');
    const amount = el('span', 'amount');
    head.append(el('span', 'name', ZONE_LABEL[zone]), tag, amount);
    const track = el('div', 'track');
    const fill = el('div', 'fill');
    track.append(fill, el('div', 'mid'));
    row.append(head, track);
    // Tapping a bar says exactly what to build.
    row.addEventListener('click', () => openPlan(zone));
    bars.append(row);
    barParts[zone] = { tag, amount, fill, row };
  }

  const status = el('div', 'status');
  const upcoming = el('div', 'upcoming');

  // Shown when a new build has been downloaded. The player picks the moment to switch.
  const updateRow = el('div', 'update-row');
  const updateButton = button('Update', 'update-button', () => {
    updateButton.disabled = true;
    updateButton.textContent = 'Updating';
    void store.flush().then(() => {
      updates.apply();
      // If the new build does not take over by itself, a plain reload picks it up.
      setTimeout(() => window.location.reload(), 4000);
    });
  });
  updateRow.append(el('span', '', 'A new version is ready.'), updateButton);
  hud.append(top, calendar, bars, status, upcoming, updateRow);

  // -------------------------------------------------------------- toolbar --
  const chip = el('div', 'chip');
  const toolbar = el('div', 'toolbar');
  const toolButtons = new Map<ToolChoice, HTMLButtonElement>();
  for (const tool of TOOLS) {
    const b = button(tool.label, `tool tool-${tool.id}`, () => {
      session.setTool(session.tool === tool.id ? 'look' : tool.id);
    });
    toolButtons.set(tool.id, b);
    toolbar.append(b);
  }

  // ---------------------------------------------------------- tree picker --
  // Shown above the toolbar while the Tree tool is in hand.
  const treePicker = el('div', 'tree-picker');
  const treeButtons: HTMLButtonElement[] = [];
  let treeNames: string[] = [];
  void loadTreeChoices().then((choices) => {
    treeNames = choices.map((choice) => choice.name);
    choices.forEach((choice, kind) => {
      const b = button('', 'tree-choice', () => session.setTreeKind(kind));
      if (choice.picture) b.append(choice.picture);
      b.append(el('span', '', choice.name));
      treeButtons.push(b);
      treePicker.append(b);
    });
    render();
  });

  // ------------------------------------------------------------ inspector --
  const inspector = el('div', 'inspector');
  const inspectorTitle = el('div', 'inspector-title');
  const inspectorState = el('div', 'inspector-state');
  const inspectorFacts = el('div', 'inspector-facts');
  const inspectorClose = button('Close', 'inspector-close', () => session.clearSelection());
  // Shown on a dorm held back for want of dining: a shortcut to placing a hall beside it.
  let actionLot: { x: number; y: number } | null = null;
  const inspectorAction = button('Build a dining hall here', 'primary inspector-action', () => {
    if (!actionLot) return;
    const spot = nearestSpot(store.state, 'dining', actionLot.x, actionLot.y);
    if (!spot) {
      session.notify('There is no free ground in reach of this dorm. Clear some first.', 'error');
      return;
    }
    session.startPlacing('dining');
    session.setGhost(spot.x, spot.y);
    session.lookAt(spot.x, spot.y);
  });
  inspector.append(inspectorClose, inspectorTitle, inspectorState, inspectorFacts, inspectorAction);

  const studentPanel = mountStudentCard();

  // ---------------------------------------------------------------- build --
  const buildButton = button('Build', 'build-fab', () => openBuild());
  // Shown while a building picked from the menu is being placed.
  const placer = el('div', 'placer');
  const placerTitle = el('div', 'placer-title');
  const placerState = el('div', 'placer-state');
  const placerButtons = el('div', 'placer-buttons');
  const placeButton = button('Place', 'primary', () => {
    const type = session.placing;
    const ghost = session.ghost;
    if (!type || !ghost) return;
    const result = store.dispatch({ type: 'place', building: type, x: ghost.x, y: ghost.y });
    if (!result.ok) {
      session.notify(result.error, 'error');
      return;
    }
    session.notify(`${PLACED[type].name} built.`);
    session.setTool('look');
  });
  placerButtons.append(placeButton, button('Cancel', '', () => session.setTool('look')));
  placer.append(placerTitle, placerState, placerButtons);

  const clearer = el('div', 'placer clearer');
  const clearerTitle = el('div', 'placer-title');
  const clearerState = el('div', 'placer-state');
  const clearerButtons = el('div', 'placer-buttons');
  clearerButtons.append(
    button('Clear', 'primary', () => {
      const pending = session.clearing;
      if (!pending) return;
      session.cancelClear();
      const result = store.dispatch({ type: 'paint', tool: 'clear', cells: pending.cells });
      if (!result.ok) session.notify(result.error, 'error');
      else if (pending.refund > 0) session.notify(`Cleared. ${dollars(pending.refund)} came back.`);
    }),
    button('Cancel', '', () => session.cancelClear()),
  );
  clearer.append(clearerTitle, clearerState, clearerButtons);

  function openBuild(): void {
    openBuildMenu(root, buildEntries(), (entry) => {
      if (entry.id) session.startPlacing(entry.id as PlacedType);
    });
  }

  const toast = el('div', 'toast');
  const modalRoot = el('div', 'modal-root');
  root.append(hud, toast, chip, treePicker, inspector, studentPanel.node, placer, clearer, buildButton, toolbar, modalRoot);

  // --------------------------------------------------------------- toasts --
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let lastToastId = 0;
  const toastQueue: Array<{ text: string; kind: 'info' | 'error' }> = [];

  function showNextToast(): void {
    const item = toastQueue.shift();
    if (!item) {
      toast.classList.remove('show');
      toastTimer = null;
      return;
    }
    toast.textContent = item.text;
    toast.className = `toast show ${item.kind}`;
    toastTimer = setTimeout(showNextToast, item.kind === 'error' ? 3200 : 4200);
  }

  function pushToast(text: string, kind: 'info' | 'error' = 'info'): void {
    if (kind === 'error') toastQueue.length = 0;
    toastQueue.push({ text, kind });
    if (kind === 'error' && toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (!toastTimer) showNextToast();
  }

  const NEWSWORTHY: ReadonlySet<LogEntry['kind']> = new Set(['intake', 'waitlistClosed', 'graduation', 'yearEnd', 'grant']);
  /** An incident is only worth a line when nobody came: that is the one the player can do something about. */
  const worthSaying = (entry: LogEntry): boolean => NEWSWORTHY.has(entry.kind) || (entry.kind === 'incident' && entry.data?.handled === 0);

  // --------------------------------------------------------------- modals --
  let modalOpen = false;

  function openModal(build: (close: () => void, card: HTMLElement) => void, dismissable = true): void {
    modalRoot.textContent = '';
    const backdrop = el('div', 'backdrop');
    const card = el('div', 'card');
    const close = (): void => {
      modalRoot.textContent = '';
      modalOpen = false;
      render();
    };
    if (dismissable) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
      });
    }
    build(close, card);
    backdrop.append(card);
    modalRoot.append(backdrop);
    modalOpen = true;
  }

  function openSetup(): void {
    openModal((close, card) => {
      card.append(el('h1', '', 'Found your university'));
      card.append(el('p', '', 'Your first class moves in fifteen minutes from now.'));
      const input = el('input', 'name-input');
      input.type = 'text';
      input.maxLength = 40;
      input.placeholder = 'University name';
      input.value = 'Larkspur University';
      input.autocomplete = 'off';
      const start = (): void => {
        const name = input.value.trim() || 'Larkspur University';
        store.startNewGame(name);
        close();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') start();
      });
      card.append(input, button('Open the gates', 'primary', start));
      if (store.loadProblem) card.append(el('p', 'fine', store.loadProblem));
    }, false);
  }

  function openAway(): void {
    const report = store.away;
    const notes = store.upgradeNotes;
    if (!report && notes.length === 0) return;
    store.away = null;
    store.upgradeNotes = [];
    const summary = report ? summarizeAway(report.log, report) : null;
    openModal((close, card) => {
      card.append(el('h1', '', summary ? summary.headline : 'New since your last visit'));
      const list = el('ul', 'away-list');
      for (const line of summary?.lines ?? []) list.append(el('li', '', line));
      // Rules that are new to an older save, told once.
      for (const note of notes) list.append(el('li', 'away-note', note));
      card.append(list, button('Back to campus', 'primary', close));
    });
  }

  function openMenu(): void {
    openModal((close, card) => {
      card.append(el('h1', '', store.state.school.name));
      const note = el('p', 'fine', '');
      void isStoragePersistent().then((kept) => {
        if (isNative) {
          note.textContent = 'Your save is kept on this device. Export a save to move it to another one.';
          return;
        }
        note.textContent = kept
          ? 'This browser has agreed to keep your save.'
          : 'This browser may clear saved games it has not seen for a while. Export a save to be safe.';
      });

      card.append(
        button('Export save', 'wide', () => {
          void exportSave(store.exportText(), store.state.school.name).then((how) => {
            if (how === 'downloaded') pushToast('Save file downloaded.');
          });
        }),
        button('Import save', 'wide', () => {
          void pickSaveFile().then((text) => {
            if (text === null) return;
            const problem = store.importSave(text);
            if (problem) {
              pushToast(problem, 'error');
            } else {
              void requestPersistentStorage();
              close();
              pushToast('Save loaded.');
            }
          });
        }),
      );

      const startOver = button('Start a new university', 'wide danger', () => {
        if (startOver.dataset.armed !== 'yes') {
          startOver.dataset.armed = 'yes';
          startOver.textContent = 'Tap again to erase this one';
          return;
        }
        void store.deleteGame().then(() => {
          close();
          openSetup();
        });
      });
      card.append(startOver, note);

      if (testerToolsOn()) {
        const dev = el('div', 'dev');
        dev.append(el('div', 'dev-title', import.meta.env.DEV ? 'Dev: skip time' : 'Tester tools: skip time'));
        const skip = (label: string, ms: number): HTMLButtonElement =>
          button(label, 'dev-button', () => {
            clock.skip(ms);
            store.catchUp();
            close();
          });
        dev.append(skip('+1 hour', 3_600_000), skip('+1 day', 86_400_000), skip('+1 year', 7 * 86_400_000));
        card.append(dev);
      }

      const credit = el('p', 'fine', '');
      void loadArtCredit().then((text) => {
        credit.textContent = text;
      });

      // Tester builds: seven taps on the version line show or hide the time-skip panel.
      const version = el('p', 'fine version', `Version ${__APP_VERSION__} (${__BUILD_LABEL__})`);
      if (hasTimeSkip && !import.meta.env.DEV) {
        let taps = 0;
        version.addEventListener('click', () => {
          taps += 1;
          if (taps < TESTER_TAPS) return;
          const on = !testerToolsOn();
          setTesterTools(on);
          close();
          openMenu();
          pushToast(on ? 'Tester tools are on.' : 'Tester tools are off.');
        });
      }

      card.append(credit, version, button('Close', 'primary', close));
    });
  }

  // --------------------------------------------------------------- render --

  function renderHud(state: GameState): void {
    setText(cash, dollars(state.money.cash));
    const perHour = netPerRealHour(state);
    setText(rate, `${perHour >= 0 ? '+' : '-'}${dollarsShort(Math.abs(perHour))}/hr`);
    rate.className = perHour >= 0 ? 'rate up' : 'rate down';
    setText(studentCount, String(enrollment(state)));
    const mood = happinessView(state);
    setText(happyCount, String(mood.score));
    if (mood.mood !== shownMood) {
      shownMood = mood.mood;
      happyFace.innerHTML = face(mood.mood);
    }

    // Lead with what is happening now. The date is the small print.
    const tick = state.clock.tick;
    const pos = calendarAt(tick);
    setText(when, NOW_LABEL[pos.phase]);
    setText(next, pos.year === 0 ? formatDate(dateAt(tick)) : `${formatDate(dateAt(tick))} · Year ${pos.year}`);

    const tight = bottleneck(state);
    for (const zone of ZONES) {
      const parts = barParts[zone];
      const value = demandBar(state, zone);
      const gap = capacityWanted(state, zone) - openCapacity(state, zone);
      parts.fill.style.width = `${Math.abs(value) * 50}%`;
      parts.fill.className = value >= 0 ? 'fill short' : 'fill spare';
      parts.row.classList.toggle('tight', tight === zone);
      setText(
        parts.amount,
        gap > 0 ? `short ${gap} ${ZONE_UNIT[zone]}` : gap < 0 ? `${-gap} spare ${ZONE_UNIT[zone]}` : 'just enough',
      );
    }

    // Then what the player can do about it, and last the countdown.
    const plan = roomPlan(state);
    const asks = ZONES.filter((zone) => plan.zones[zone].lots > 0).map((zone) => ZONE_ASK[zone]);
    const add = asks.join(' and ');
    const milestone = nextMilestone(tick);
    const coming = `${MILESTONE_LABEL[milestone.event]} in ${duration(milestone.inTicks)}`;

    let action: string;
    let later: string;
    if (plan.goal === 'waitlist') {
      action = add ? `${plan.students} waiting: add ${add} to admit them` : `${plan.students} waiting: their room is being built`;
      later = `Waitlist closes in ${duration(state.admissions.waitlistUntilTick - tick)} · ${coming}`;
    } else if (tick < FIRST_INTAKE_TICK) {
      const arrives = duration(FIRST_INTAKE_TICK - tick);
      action = add ? `${plan.students} students arrive in ${arrives}: add ${add}` : `${plan.students} students arrive in ${arrives}`;
      const fits = Math.min(plan.students, roomForNewStudents(state).room);
      later = fits >= plan.students ? 'There is room for all of them.' : `There is room for ${fits} of them so far.`;
    } else {
      action = add ? `Next class is ${plan.students}: add ${add} to fit them all` : `Room for the whole next class of ${plan.students}`;
      later = coming;
    }
    setText(status, action);
    status.classList.toggle('urgent', add !== '');
    setText(upcoming, later);
  }

  /** The Bottleneck tag and both bars open this: how many lots of which kind would do it. */
  function openPlan(focus: Zone): void {
    const state = store.state;
    const tick = state.clock.tick;
    const plan = roomPlan(state);
    const tight = bottleneck(state);
    const order = [focus, ...ZONES.filter((zone) => zone !== focus)];

    openModal((close, card) => {
      card.append(el('h1', '', tight ? `${ZONE_LABEL[tight]} is the bottleneck` : 'There is room for everyone'));
      let lead: string;
      if (plan.goal === 'waitlist') {
        lead = `${plan.students} students are waiting for a place. The waitlist closes in ${duration(state.admissions.waitlistUntilTick - tick)}.`;
      } else if (tick < FIRST_INTAKE_TICK) {
        lead = `${plan.students} students arrive in ${duration(FIRST_INTAKE_TICK - tick)}.`;
      } else {
        lead = `The next class is ${plan.students} students.`;
      }
      card.append(el('p', '', lead));
      const rate = acceptanceRate(state);
      const lastIntake = state.admissions.lastIntake;
      if (rate !== null && lastIntake) {
        const placed = lastIntake.admitted + state.admissions.waitlistAdmitted;
        card.append(el('p', 'fine', `Acceptance rate ${Math.round(rate * 100)}%: ${placed} of the ${lastIntake.expected} who applied got a place.`));
      }

      const list = el('ul', 'away-list');
      for (const zone of order) {
        const need = plan.zones[zone];
        const unit = ZONE_UNIT[zone];
        let text: string;
        if (need.short === 0) {
          text = `${ZONE_LABEL[zone]}: enough ${unit}.`;
        } else if (need.lots === 0) {
          text = `${ZONE_LABEL[zone]}: ${need.short} ${unit} short, and all of them are being built.`;
        } else {
          const lots = `${need.lots} more ${ZONE_LOT[zone][need.lots === 1 ? 0 : 1]}`;
          const already = need.building > 0 ? ` ${need.building} ${unit} are already being built.` : '';
          text = `${ZONE_LABEL[zone]}: ${need.short} ${unit} short.${already} ${lots} would cover it: ${need.perLot} ${unit} each, ${dollarsShort(need.lots * COST.zoneLot)} in all.`;
        }
        list.append(el('li', '', text));
      }
      card.append(list);
      if (plan.goal === 'waitlist') {
        // The bars look ahead to the next class too, so they can show more than this list.
        card.append(el('p', 'fine', `The bars also count the next class of about ${expectedClass(state)}, so they show a little more.`));
      }
      card.append(el('p', 'fine', 'A lot must touch a path. Lots near a quad grow bigger by themselves.'));

      for (const zone of order) {
        if (plan.zones[zone].lots === 0) continue;
        card.append(
          button(`Zone ${ZONE_LOT[zone][1]}`, 'primary', () => {
            session.setTool(zone);
            close();
          }),
        );
      }
      card.append(button('Close', 'wide', close));
    });
  }

  const CAUSE_TEXT: Record<StallCause, string> = {
    noPath: 'no path beside it',
    noDemand: 'no demand right now',
    noDining: 'no dining nearby',
    lowDesirability: 'low desirability',
  };

  function renderInspector(state: GameState): void {
    const selected = session.selected;
    const cell = selected ? cellAt(state.map, selected.x, selected.y) : null;
    const placedHere = selected ? placedAt(state.map, selected.x, selected.y) : null;
    if (placedHere) {
      setText(inspectorTitle, PLACED[placedHere.type].name);
      setText(inspectorState, placedSummary(state, placedHere));
      setText(inspectorFacts, placedFacts(placedHere));
      inspectorAction.classList.remove('show');
      inspector.classList.add('show');
      return;
    }
    if (!selected || !cell || cell.kind !== 'lot' || !cell.zone) {
      inspector.classList.remove('show');
      return;
    }
    const zone = cell.zone;
    const building = buildingAt(state.map, selected.x, selected.y);
    const stage = building?.stage ?? 0;
    const lotStatusNow = lotStatus(state, selected.x, selected.y);
    const index = selected.y * state.map.width + selected.x;
    const score = Math.round(state.map.score[index] ?? 0);
    const walk = state.map.walkMinutes[index] ?? -1;

    setText(
      inspectorTitle,
      stage > 0
        ? `${ZONE_LABEL[zone]} · stage ${stage} of ${MAX_STAGE} · ${stageSpec(zone, stage).capacity} ${ZONE_UNIT[zone]}`
        : `${ZONE_LABEL[zone]} lot · nothing built yet`,
    );

    let text = '';
    if (lotStatusNow) {
      switch (lotStatusNow.kind) {
        case 'building':
          text = `Building stage ${lotStatusNow.toStage}. ${duration(lotStatusNow.doneTick - state.clock.tick)} left.`;
          break;
        case 'top':
          text = 'At its top stage for now.';
          break;
        case 'ready':
          text = 'Ready to grow. Work starts within minutes.';
          break;
        case 'stalled': {
          if (lotStatusNow.cause === 'noPath') {
            text = 'Held back: no path beside it. Lay a path next to this lot.';
          } else if (lotStatusNow.cause === 'noDemand') {
            text = 'Held back: no demand right now. The campus already has room for the next class.';
          } else if (lotStatusNow.cause === 'noDining') {
            text = 'Held back: no dining nearby. Build a Dining hall or a Coffee stand in reach of this lot.';
          } else {
            text = `Held back: desirability is ${score} and stage ${lotStatusNow.nextStage} needs ${lotStatusNow.needed}. ${desirabilityHint(state, selected.x, selected.y)}`;
          }
          if (lotStatusNow.also.length > 0) {
            text += ` Also: ${lotStatusNow.also.map((c) => CAUSE_TEXT[c]).join(', ')}.`;
          }
          break;
        }
      }
    }
    setText(inspectorState, text);

    const facts = [`Desirability ${score}`];
    if (zone === 'housing') facts.push(walk < 0 ? 'No route to class' : `${Math.round(walk)} min walk to class`);
    facts.push(...lotFacts(state, selected.x, selected.y));
    setText(inspectorFacts, facts.join(' · '));
    const hungry = lotStatusNow?.kind === 'stalled' && (lotStatusNow.cause === 'noDining' || lotStatusNow.also.includes('noDining'));
    actionLot = hungry ? { x: selected.x, y: selected.y } : null;
    inspectorAction.classList.toggle('show', hungry);
    inspector.classList.add('show');
  }

  /** The prompt before anything is cleared: what goes, and what comes back. */
  function renderClearer(): void {
    const pending = session.clearing;
    clearer.classList.toggle('show', pending !== null);
    if (!pending) return;
    const n = pending.cells.length;
    const only = pending.buildings.length === 1 && n <= PLACED[pending.buildings[0]!].w * PLACED[pending.buildings[0]!].h;
    setText(clearerTitle, only ? `Clear the ${PLACED[pending.buildings[0]!].name}?` : `Clear ${n} ${TOOL_NOUN.clear[n === 1 ? 0 : 1]}?`);
    let text: string;
    if (pending.refund === 0) text = 'Nothing comes back for what the campus began with.';
    else if (pending.undo) text = `You get ${dollars(pending.refund)} back, the full price. It was built less than a minute ago.`;
    else text = `You get ${dollars(pending.refund)} back.`;
    setText(clearerState, text);
  }

  function renderPlacer(state: GameState): void {
    const type = session.tool === 'place' ? session.placing : null;
    placer.classList.toggle('show', type !== null);
    buildButton.classList.toggle('hidden', type !== null || session.clearing !== null);
    if (!type) return;
    setText(placerTitle, placingLine(type));
    const ghost = session.ghost;
    const preview = ghost ? previewPlace(state, type, ghost.x, ghost.y) : null;
    let text = 'Tap the map where it should go.';
    if (preview?.problem === 'blocked') text = 'Something is in the way. It needs empty ground.';
    else if (preview?.problem === 'offMap') text = 'That does not fit on your land.';
    else if (preview?.problem === 'cash') text = `You have ${dollars(state.money.cash)}. It costs ${dollars(preview.cost)}.`;
    else if (preview) text = PLACED[type].radius > 0 ? `${PLACED[type].effect}. The blue cells are its reach.` : `${PLACED[type].effect}.`;
    setText(placerState, text);
    placer.classList.toggle('bad', !!preview?.problem);
    placeButton.disabled = !preview || preview.problem !== null;
  }

  function openHappiness(): void {
    const view = happinessView(store.state);
    openModal((close, card) => {
      card.append(el('h1', '', `Happiness ${view.score}`));
      const list = el('div', 'cause-list');
      for (const cause of view.rows) {
        const line = el('div', cause.worst ? 'cause worst' : 'cause');
        const bar = el('div', 'cause-bar');
        const fill = el('div', 'cause-fill');
        fill.style.width = `${cause.percent}%`;
        bar.append(fill);
        line.append(el('span', 'cause-name', cause.name), bar, el('span', 'cause-value', `${cause.percent}%`));
        list.append(line);
      }
      card.append(list);
      if (view.advice) card.append(el('p', '', view.advice));
      card.append(el('p', 'fine', view.staying));
      if (view.lastSemester) card.append(el('p', 'fine', view.lastSemester));
      if (view.build) {
        card.append(
          button('Open the Build menu', 'primary wide', () => {
            close();
            openBuild();
          }),
        );
      }
      card.append(button('Close', 'wide', close));
    });
  }

  function renderTools(): void {
    for (const [id, b] of toolButtons) b.classList.toggle('active', session.tool === id);
    const preview = session.preview;
    const tool = session.tool;

    const picking = tool === 'tree' && treeButtons.length > 0;
    treePicker.classList.toggle('show', picking);
    chip.classList.toggle('raised', picking);
    treeButtons.forEach((b, kind) => b.classList.toggle('active', kind === session.treeKind));
    if (tool === 'look' || tool === 'place') {
      chip.classList.remove('show', 'bad');
      return;
    }
    if (preview && preview.cells.length > 0 && tool === 'clear') {
      const n = preview.cells.length;
      setText(chip, `${n} ${TOOL_NOUN.clear[n === 1 ? 0 : 1]} · ${preview.refund > 0 ? `${dollars(preview.refund)} back` : 'nothing back'}`);
      chip.classList.add('show');
      chip.classList.remove('bad');
    } else if (preview && preview.cells.length > 0) {
      const n = preview.cells.length;
      const noun = TOOL_NOUN[tool][n === 1 ? 0 : 1];
      setText(chip, `${n} ${noun} · ${dollars(preview.cost)}${preview.affordable ? '' : ' · not enough cash'}`);
      chip.classList.add('show');
      chip.classList.toggle('bad', !preview.affordable);
    } else if (preview) {
      setText(chip, 'Nothing here can take that');
      chip.classList.add('show', 'bad');
    } else {
      const name = picking ? treeNames[session.treeKind] : undefined;
      setText(
        chip,
        name ? `${name} · tap or drag to plant · ${dollars(COST.tree)} each` : (TOOLS.find((t) => t.id === tool)?.hint ?? ''),
      );
      chip.classList.add('show');
      chip.classList.remove('bad');
    }
  }

  function render(): void {
    if (!store.hasGame) {
      hud.classList.add('hidden');
      toolbar.classList.add('hidden');
      chip.classList.remove('show');
      inspector.classList.remove('show');
      studentPanel.render(null);
      if (!modalOpen) openSetup();
      return;
    }
    hud.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    const state = store.state;
    renderHud(state);
    renderInspector(state);
    studentPanel.render(state);
    renderPlacer(state);
    renderClearer();
    renderTools();

    updateRow.classList.toggle('show', updates.ready);
    // Toasts sit just under the HUD, however tall it is.
    const hudBottom = `${Math.round(hud.getBoundingClientRect().bottom)}px`;
    if (root.style.getPropertyValue('--hud-bottom') !== hudBottom) root.style.setProperty('--hud-bottom', hudBottom);

    if ((store.away || store.upgradeNotes.length > 0) && !modalOpen) openAway();

    if (store.recent.length > 0) {
      for (const entry of store.recent) {
        if (worthSaying(entry)) pushToast(entry.text);
      }
      store.recent.length = 0;
    }

    const note = session.toast;
    if (note && note.id !== lastToastId) {
      lastToastId = note.id;
      pushToast(note.text, note.kind);
    }
  }

  store.subscribe(render);
  session.subscribe(render);
  updates.subscribe(render);
  setInterval(render, 1000);
  render();
}
