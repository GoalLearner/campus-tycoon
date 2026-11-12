import { clock } from '../app/clock';
import { backupReminder } from '../app/away';
import { alwaysDaylight, setAlwaysDaylight } from '../app/daylight';
import { HOME_SCREEN_TIP, markHomeScreenTipShown, shouldShowHomeScreenTip } from '../app/homeScreenTip';
import { exportSave, isStoragePersistent, pickSaveFile, requestPersistentStorage } from '../app/persistence';
import { hasTimeSkip, isNative } from '../app/platform';
import { session, type ToolChoice } from '../app/session';
import { noticeSetting, setNoticesPerDay, turnNoticesOff, turnNoticesOn } from '../app/notices';
import { anchorFor, hourName, store, wakeHourOf } from '../app/store';
import { updates } from '../app/updates';
import {
  NOTICES_MOST,
  bottleneck,
  buildingAt,
  calendarAt,
  dateAt,
  formatDate,
  capacityWanted,
  BENEFITS_SHARE,
  WAGE_PER_YEAR,
  workersAt,
  YARD_MAX_WORKERS,
  type Tool,
  hasRoadAccess,
  housingFixes,
  hoodAt,
  parcelAt,
  townLiving,
  cellAt,
  paintCost,
  placedCars,
  placedCost,
  scaleOf,
  demandBar,
  desirabilityHint,
  dollars,
  dollarsTop,
  headCount,
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
  type Zone,
  anchorFreeAt,
  dayRead,
  DEFAULT_COLOUR,
  DEFAULT_WAKE_HOUR,
  SCHOOL_COLOURS,
  weatherAt,
} from '../sim';
import { footballChip, footballMoney } from './footballUi';
import { openAwayScreen, openInbox } from './deskPanels';
import { inboxChip } from './deskUi';
import { openFootball } from './footballPanels';
import { buildEntries, happinessView, lotFacts, moneyView, placedFacts, placedSummary, placingLine } from './buildUi';
import { openBuildMenu } from './buildMenu';
import { hoodSummary, housingFixLines, lampSummary, parcelSummary, TOOL_ENTRY } from './buildUi';
import { CROWD_NAMES, CROWDS, crowdSetting, setCrowdSetting } from '../app/crowd';
import { effectsSetting, muted, musicVolume, setEffectsSetting, setMusicVolume, setMuted, setSoundVolume, soundVolume } from '../app/life';
import { sound } from '../app/sound';
import { mountPersonCard } from './personCard';
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
  founding: 'Founding day',
  fall: 'Fall semester in session',
  spring: 'Spring semester in session',
  graduation: 'Graduation day',
  summer: 'Summer break',
};
/** The weather in a word, beside the date. Nothing in fair weather. */
const SKY_WORD: Record<string, string> = { fair: '', sunny: 'Sunny', rain: 'Rain', snow: 'Snow', heat: 'Heat wave' };
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

/** Each tool, with its hint. A price in a hint is this campus's own (DESIGN.md 35.7). */
const TOOLS: Array<{ id: ToolChoice; label: string; hint: (scale: number) => string }> = [
  { id: 'look', label: 'Look', hint: () => '' },
  { id: 'housing', label: 'Housing', hint: (scale) => `Drag a row of dorm lots · ${dollars(paintCost('zoneLot', scale))} each · two fingers move the map` },
  { id: 'academic', label: 'Academic', hint: (scale) => `Drag a row of lecture-hall lots · ${dollars(paintCost('zoneLot', scale))} each · two fingers move the map` },
  { id: 'path', label: 'Path', hint: (scale) => `Drag to lay a path · ${dollars(paintCost('path', scale))} a cell` },
  { id: 'quad', label: 'Quad', hint: (scale) => `Drag to plant a quad · ${dollars(paintCost('quad', scale))} a cell` },
  { id: 'tree', label: 'Tree', hint: (scale) => `Tap or drag to plant trees · ${dollars(paintCost('tree', scale))} each` },
  { id: 'clear', label: 'Clear', hint: () => 'Drag over what to clear · you see what comes back before it goes' },
];


/** Tools picked from the Build menu and kept in hand until Done: they have no button in the bar. */
const DRAG_FROM_MENU: readonly ToolChoice[] = ['road', 'bin', 'bench', 'table'];
const ROW_HINT: Record<'bin' | 'bench' | 'table', string> = {
  bin: 'Tap or drag to place. One within three cells of each place students eat, shop or play is enough.',
  bench: 'Tap or drag to place. It seats the lots within three cells.',
  table: 'Tap or drag to place. It seats the lots within three cells, and adds to social life near dining or lecture halls.',
};

const TOOL_NOUN: Record<Exclude<ToolChoice, 'look' | 'place'>, [string, string]> = {
  housing: ['lot', 'lots'],
  academic: ['lot', 'lots'],
  path: ['path cell', 'path cells'],
  road: ['road cell', 'road cells'],
  bin: ['trash bin', 'trash bins'],
  bench: ['bench', 'benches'],
  table: ['picnic table', 'picnic tables'],
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
  // Cash, and what is earned an hour. Tapping it opens the Money panel.
  const money = el('button', 'money');
  money.type = 'button';
  money.addEventListener('click', () => openMoney());
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

  // Football has a chip when there is a season behind it. The Inbox always has one, and says so when something waits.
  const chips = el('div', 'hud-chips');
  const footballButton = button('', 'hud-chip', () => openFootball(openModal));
  const inboxButton = button('', 'hud-chip', () => openInbox(openModal));
  chips.append(footballButton, inboxButton);

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
  // Shown while the model campus is being visited: where the player is, and the way home.
  const visitRow = el('div', 'update-row visit-row');
  const visitText = el('span', '', '');
  const visitButton = button('Back', 'update-button', () => void store.leaveVisit());
  visitRow.append(visitText, visitButton);
  hud.append(top, calendar, chips, bars, status, upcoming, updateRow, visitRow);

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
  // Set instead when the panel is a field for sale: the button buys it.
  let actionLand: number | null = null;
  const inspectorAction = button('Build a dining hall here', 'primary inspector-action', () => {
    if (actionLand !== null) {
      const result = store.dispatch({ type: 'buyLand', parcel: actionLand });
      if (result.ok) {
        session.notify('The land is yours. You can build on it now.');
        session.clearSelection();
      } else session.notify(result.error, 'error');
      return;
    }
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
  // A Facilities Yard: a minus and a plus for its workers.
  let staffYard: number | null = null;
  const changeStaff = (by: number): void => {
    if (staffYard === null) return;
    const result = store.dispatch({ type: 'staff', yard: staffYard, workers: workersAt(store.state, staffYard) + by });
    if (!result.ok) session.notify(result.error, 'error');
  };
  const inspectorStaff = el('div', 'inspector-staff');
  const fewer = button('\u2212', 'staff-button', () => changeStaff(-1));
  const more = button('+', 'staff-button', () => changeStaff(1));
  const staffCount = el('span', 'staff-count');
  inspectorStaff.append(fewer, staffCount, more);
  inspector.append(inspectorClose, inspectorTitle, inspectorState, inspectorFacts, inspectorStaff, inspectorAction);

  const studentPanel = mountStudentCard();
  const personPanel = mountPersonCard();

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
    // A car park is no use until a road reaches it. Say so at once, not at the next intake.
    const built = store.state.map.placed[store.state.map.placed.length - 1];
    if (built && placedCars(type, 1) > 0 && !hasRoadAccess(store.state.map, built)) {
      session.notify(`${PLACED[type].name} built. No road access yet: lay a road from it to a town street.`);
    } else session.notify(`${PLACED[type].name} built.`);
    session.setTool('look');
  });
  placerButtons.append(placeButton, button('Cancel', '', () => session.setTool('look')));
  placer.append(placerTitle, placerState, placerButtons);

  // The road tool is picked from the Build menu and stays in hand until Done. The Parking overlay closes the same way.
  const modeBar = el('div', 'placer mode-bar');
  const modeTitle = el('div', 'placer-title');
  const modeState = el('div', 'placer-state');
  const modeButtons = el('div', 'placer-buttons');
  modeButtons.append(
    button('Done', 'primary mode-done', () => {
      if (DRAG_FROM_MENU.includes(session.tool)) session.setTool('look');
      else session.setOverlay(null);
    }),
  );
  modeBar.append(modeTitle, modeState, modeButtons);

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
    openBuildMenu(root, buildEntries(scaleOf(store.state)), (entry) => {
      // Roads, bins, benches and tables are laid by dragging. Everything else is placed one at a time.
      if (entry.id?.startsWith(TOOL_ENTRY)) session.setTool(entry.id.slice(TOOL_ENTRY.length) as Tool);
      else if (entry.id) session.startPlacing(entry.id as PlacedType);
    });
  }

  const toast = el('div', 'toast');
  const modalRoot = el('div', 'modal-root');
  root.append(hud, toast, chip, treePicker, inspector, studentPanel.node, personPanel.node, placer, modeBar, clearer, buildButton, toolbar, modalRoot);

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

  const NEWSWORTHY: ReadonlySet<LogEntry['kind']> = new Set(['intake', 'waitlistClosed', 'graduation', 'yearEnd', 'grant', 'calendar', 'exam', 'weather', 'game', 'football', 'decision', 'rankings']);
  /** An incident is only worth a line when nobody came: that is the one the player can do something about. */
  const worthSaying = (entry: LogEntry): boolean => NEWSWORTHY.has(entry.kind) || (entry.kind === 'incident' && entry.data?.handled === 0);

  // --------------------------------------------------------------- modals --
  let modalOpen = false;
  /** The Home Screen tip is looked at once a visit, after any away list. */
  let tipChecked = false;

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

  /** A labelled choice from a short list, one row. */
  function pick(label: string, select: HTMLSelectElement): HTMLElement {
    const row = el('label', 'pick');
    row.append(el('span', 'pick-name', label), select);
    return row;
  }

  function hourSelect(hour: number): HTMLSelectElement {
    const select = document.createElement('select');
    for (let h = 0; h < 24; h++) {
      const option = document.createElement('option');
      option.value = String(h);
      option.textContent = hourName(h);
      select.append(option);
    }
    select.value = String(hour);
    return select;
  }

  function colourSelect(colour: string): HTMLSelectElement {
    const select = document.createElement('select');
    for (const one of SCHOOL_COLOURS) {
      const option = document.createElement('option');
      option.value = one.id;
      option.textContent = one.name;
      select.append(option);
    }
    select.value = colour;
    return select;
  }

  function openSetup(): void {
    openModal((close, card) => {
      card.append(el('h1', '', 'Found your university'));
      // Every new game begins on the model campus (DESIGN.md 35.6): whole from the first minute.
      card.append(el('p', '', 'Your campus opens whole: every district built, and 46,000 students already there. It is yours to change.'));
      const input = el('input', 'name-input');
      input.type = 'text';
      input.maxLength = 40;
      input.placeholder = 'University name';
      input.value = 'Larkspur University';
      input.autocomplete = 'off';
      const wake = hourSelect(DEFAULT_WAKE_HOUR);
      const colour = colourSelect(DEFAULT_COLOUR);
      const start = (): void => {
        const name = input.value.trim() || 'Larkspur University';
        store.foundUniversity(name, Number(wake.value), colour.value);
        close();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') start();
      });
      card.append(input, pick('When does your day usually start?', wake), pick('School colour', colour), button('Open the gates', 'primary', start));
      if (store.loadProblem) card.append(el('p', 'fine', store.loadProblem));
    }, false);
  }

  function openAway(): void {
    const report = store.away;
    const notes = store.upgradeNotes;
    if (!report && notes.length === 0 && !store.welcome) return;
    // The away list stays saved until its button is tapped. Closing the app first loses nothing.
    store.upgradeNotes = [];
    openAwayScreen(openModal, report, notes, (where) => {
      if (where === 'inbox') openInbox(openModal);
      else openFootball(openModal);
    });
  }

  function openMenu(): void {
    openModal((close, card) => {
      card.append(el('h1', '', store.state.school.name));
      const note = el('p', 'fine', '');
      // On the web, a gentle reminder when the browser has not promised to keep the save or the last backup is old.
      const remind = el('p', 'backup-reminder', '');
      const tellStorage = (): void => {
        void isStoragePersistent().then((kept) => {
          if (isNative) {
            note.textContent = 'Your save is kept on this device. Export a save to move it to another one.';
            return;
          }
          const reminder = backupReminder({ native: false, persistent: kept, lastExportAt: store.lastExportAt, createdAt: store.state.clock.createdAt, now: clock.now() });
          remind.textContent = reminder ?? '';
          remind.classList.toggle('show', reminder !== null);
          note.textContent = reminder === null ? 'This browser has agreed to keep your save.' : '';
        });
      };
      tellStorage();
      card.append(remind);

      if (store.visiting !== null) {
        // On a visit nothing is saved, and the things that act on a save are put away until the player is home.
        card.append(
          button(`Back to ${store.visiting}`, 'primary', () => {
            close();
            void store.leaveVisit();
          }),
          el('p', 'fine', 'This is the model campus. Nothing you do here is saved, and your own campus is untouched.'),
        );
      } else if (store.offersVisit) {
        // A game that began on the small campus can look at the model campus. One that began on it is already there.
        card.append(
          button('Visit the model campus', 'wide', () => {
            close();
            void store.visitModel();
          }),
        );
      }

      if (store.visiting === null) card.append(
        button('Export save', 'wide', () => {
          void exportSave(store.exportText(), store.state.school.name).then((how) => {
            if (how === 'downloaded') pushToast('Save file downloaded.');
            store.markExported();
            tellStorage();
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
      // Day and night follow the player's own clock. This shows the campus in daylight at any hour.
      const daylight = button('', 'wide', () => {
        setAlwaysDaylight(!alwaysDaylight());
        setText(daylight, alwaysDaylight() ? 'Daylight at any hour: on' : 'Daylight at any hour: off');
      });
      setText(daylight, alwaysDaylight() ? 'Daylight at any hour: on' : 'Daylight at any hour: off');
      card.append(daylight);

      // How many people the map shows. The setting is a ceiling: the map shows fewer by itself if frames run short.
      const crowd = button('', 'wide', () => {
        setCrowdSetting(CROWDS[(CROWDS.indexOf(crowdSetting()) + 1) % CROWDS.length]!);
        setText(crowd, `Crowd density: ${CROWD_NAMES[crowdSetting()]}`);
      });
      setText(crowd, `Crowd density: ${CROWD_NAMES[crowdSetting()]}`);
      card.append(crowd);

      // Notifications are the iPhone app's. A browser tab has none, and says so.
      // On the dev server only, &notices=1 shows the iPhone app's two rows, to see how they read. They send nothing.
      const staged = import.meta.env.DEV && window.location.search.includes('notices=1');
      if (!isNative && !staged) {
        card.append(el('p', 'fine', 'Notifications come with the iPhone app. A browser tab has none.'));
      } else {
        const notices = button('', 'wide', () => {
          if (noticeSetting().on) {
            turnNoticesOff();
            drawNotices();
            return;
          }
          // The phone asks for permission here, the first time they are turned on, and never before.
          void turnNoticesOn().then((answer) => {
            if (answer === 'refused') pushToast('Notifications are turned off for this app in Settings.', 'error');
            else if (answer === 'unavailable') pushToast('This build cannot send notifications yet.', 'error');
            drawNotices();
          });
        });
        const most = button('', 'wide', () => {
          setNoticesPerDay((noticeSetting().perDay % NOTICES_MOST) + 1);
          drawNotices();
        });
        const drawNotices = (): void => {
          const setting = noticeSetting();
          setText(notices, setting.on ? 'Notifications: on' : 'Notifications: off');
          setText(most, `Most in a day: ${setting.perDay}`);
          most.style.display = setting.on ? '' : 'none';
        };
        drawNotices();
        card.append(notices, most);
      }

      // Reduce effects: no swaying trees, ripples or sprinklers, and fewer small scenes. For an older phone or a still map.
      const effects = button('', 'wide', () => {
        setEffectsSetting(effectsSetting() === 'full' ? 'reduced' : 'full');
        setText(effects, effectsSetting() === 'full' ? 'Reduce effects: off' : 'Reduce effects: on');
      });
      setText(effects, effectsSetting() === 'full' ? 'Reduce effects: off' : 'Reduce effects: on');
      card.append(effects);

      // Sound and music each have a volume of their own. Both start low, and zero is off.
      const volume = (label: string, value: number, set: (value: number) => void): HTMLElement => {
        const row = el('label', 'volume');
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.step = '5';
        slider.value = String(Math.round(value * 100));
        const shown = el('span', 'volume-value', slider.value === '0' ? 'Off' : `${slider.value}%`);
        slider.addEventListener('input', () => {
          set(Number(slider.value) / 100);
          sound.applyVolumes();
          setText(shown, slider.value === '0' ? 'Off' : `${slider.value}%`);
        });
        // Let go, and hear what that level sounds like.
        slider.addEventListener('change', () => sound.ui('tap'));
        row.append(el('span', 'volume-name', label), slider, shown);
        return row;
      };
      // Mute: one tap silences sound and music together. The two volumes stay as they were set.
      const sliders = [volume('Sound', soundVolume(), setSoundVolume), volume('Music', musicVolume(), setMusicVolume)];
      const mute = button('', 'wide', () => {
        setMuted(!muted());
        sound.applyVolumes();
        showMute();
        if (!muted()) sound.ui('tap');
      });
      const showMute = (): void => {
        setText(mute, muted() ? 'Muted. Tap to turn the sound back on' : 'Mute');
        mute.classList.toggle('muted', muted());
        for (const row of sliders) row.classList.toggle('dimmed', muted());
      };
      showMute();
      card.append(mute, ...sliders);

      // When the player's day starts: every day of the campus week begins two hours later. It can be moved every four weeks.
      const wake = hourSelect(wakeHourOf(store.state.clock.anchor));
      wake.addEventListener('change', () => {
        const result = store.dispatch({ type: 'anchor', minute: anchorFor(Number(wake.value)) });
        if (!result.ok) {
          pushToast(result.error, 'error');
          wake.value = String(wakeHourOf(store.state.clock.anchor));
          return;
        }
        const extra = store.state.clock.week.extra;
        pushToast(`From the next fall, each day of the campus week begins at ${hourName(Number(wake.value) + 2)}. This summer runs ${duration(extra)} longer to get there.`);
      });
      const free = anchorFreeAt(store.state);
      wake.disabled = free > 0;
      card.append(pick('Your day starts', wake));
      if (free > 0) card.append(el('p', 'fine', `It can be changed again in ${duration(free - store.state.clock.tick)}.`));
      const colour = colourSelect(store.state.football.colour);
      colour.addEventListener('change', () => {
        const result = store.dispatch({ type: 'colour', colour: colour.value });
        if (!result.ok) pushToast(result.error, 'error');
      });
      card.append(pick('School colour', colour));

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
      if (store.visiting === null) card.append(startOver, note);

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
    setText(cash, dollarsTop(state.money.cash));
    const perHour = netPerRealHour(state);
    setText(rate, `${perHour >= 0 ? '+' : '-'}${dollarsShort(Math.abs(perHour))}/hr`);
    rate.className = perHour >= 0 ? 'rate up' : 'rate down';
    setText(studentCount, headCount(enrollment(state)));
    const mood = happinessView(state);
    setText(happyCount, String(mood.score));
    if (mood.mood !== shownMood) {
      shownMood = mood.mood;
      happyFace.innerHTML = face(mood.mood);
    }

    // Lead with what is happening now. The date is the small print.
    const tick = state.clock.tick;
    const pos = calendarAt(state.clock);
    // A holiday, a break or an exam week is what is happening now. Otherwise the semester is.
    const day = dayRead(state.clock);
    setText(when, day.kind === 'term' || day.name === null ? NOW_LABEL[pos.phase] : day.name);
    const sky = SKY_WORD[weatherAt(state.seed, state.clock)];
    setText(next, pos.year === 0 ? formatDate(dateAt(state.clock)) : `${formatDate(dateAt(state.clock))} · Year ${pos.year}${sky ? ` · ${sky}` : ''}`);
    const ball = footballChip(state);
    setText(footballButton, ball ?? '');
    footballButton.classList.toggle('show', ball !== null);
    const desk = inboxChip(state);
    setText(inboxButton, desk.text);
    inboxButton.classList.toggle('urgent', desk.urgent);
    inboxButton.classList.add('show');
    chips.classList.add('show');

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
        gap > 0 ? `short ${headCount(gap)} ${ZONE_UNIT[zone]}` : gap < 0 ? `${headCount(-gap)} spare ${ZONE_UNIT[zone]}` : 'just enough',
      );
    }

    // Then what the player can do about it, and last the countdown.
    const plan = roomPlan(state);
    const asks = ZONES.filter((zone) => plan.zones[zone].lots > 0).map((zone) => ZONE_ASK[zone]);
    const add = asks.join(' and ');
    const milestone = nextMilestone(state.clock);
    const coming = `${MILESTONE_LABEL[milestone.event]} in ${duration(milestone.inTicks)}`;

    let action: string;
    let later: string;
    if (plan.goal === 'waitlist') {
      action = add ? `${headCount(plan.students)} waiting: add ${add} to admit them` : `${headCount(plan.students)} waiting: their room is being built`;
      later = `Waitlist closes in ${duration(state.admissions.waitlistUntilTick - tick)} · ${coming}`;
    } else if (tick < FIRST_INTAKE_TICK) {
      const arrives = duration(FIRST_INTAKE_TICK - tick);
      action = add ? `${headCount(plan.students)} students arrive in ${arrives}: add ${add}` : `${headCount(plan.students)} students arrive in ${arrives}`;
      const fits = Math.min(plan.students, roomForNewStudents(state).room);
      later = fits >= plan.students ? 'There is room for all of them.' : `There is room for ${fits} of them so far.`;
    } else {
      action = add ? `Next class is ${headCount(plan.students)}: add ${add} to fit them all` : `Room for the whole next class of ${headCount(plan.students)}`;
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
        lead = `${headCount(plan.students)} students are waiting for a place. The waitlist closes in ${duration(state.admissions.waitlistUntilTick - tick)}.`;
      } else if (tick < FIRST_INTAKE_TICK) {
        lead = `${headCount(plan.students)} students arrive in ${duration(FIRST_INTAKE_TICK - tick)}.`;
      } else {
        lead = `The next class is ${headCount(plan.students)} students.`;
      }
      card.append(el('p', '', lead));
      const rate = acceptanceRate(state);
      const lastIntake = state.admissions.lastIntake;
      if (rate !== null && lastIntake) {
        const placed = lastIntake.admitted + state.admissions.waitlistAdmitted;
        card.append(el('p', 'fine', `Acceptance rate ${Math.round(rate * 100)}%: ${headCount(placed)} of the ${headCount(lastIntake.expected)} who applied got a place.`));
      }

      const list = el('ul', 'away-list');
      for (const zone of order) {
        const need = plan.zones[zone];
        const unit = ZONE_UNIT[zone];
        let text: string;
        if (need.short === 0) {
          text = `${ZONE_LABEL[zone]}: enough ${unit}.`;
        } else if (need.lots === 0) {
          text = `${ZONE_LABEL[zone]}: ${headCount(need.short)} ${unit} short, and all of them are being built.`;
        } else {
          const lots = `${need.lots} more ${ZONE_LOT[zone][need.lots === 1 ? 0 : 1]}`;
          const already = need.building > 0 ? ` ${headCount(need.building)} ${unit} are already being built.` : '';
          text = `${ZONE_LABEL[zone]}: ${headCount(need.short)} ${unit} short.${already} ${lots} would cover it: ${headCount(need.perLot)} ${unit} each, ${dollarsShort(need.lots * paintCost('zoneLot', scaleOf(state)))} in all.`;
        }
        list.append(el('li', '', text));
      }
      card.append(list);
      if (plan.goal === 'waitlist') {
        // The bars look ahead to the next class too, so they can show more than this list.
        card.append(el('p', 'fine', `The bars also count the next class of about ${expectedClass(state)}, so they show a little more.`));
      }
      // When beds are short: the three fixes, each with its numbers. Locals who live at home need no bed.
      const fixes = housingFixes(state);
      const lines = housingFixLines(fixes);
      if (fixes.bedsShort > 0 && (lines.path || lines.parking)) {
        card.append(el('p', 'fix-head', `Three ways to find ${headCount(fixes.bedsShort)} beds`));
        const ways = el('ol', 'fix-list');
        for (const line of [lines.lots, lines.path, lines.parking]) if (line) ways.append(el('li', '', line));
        card.append(ways);
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
      if (fixes.path) {
        const way = fixes.path;
        card.append(
          button(`Lay a path to ${way.street}`, 'wide', () => {
            session.setTool('path');
            session.lookAt(way.gate[0], way.gate[1]);
            close();
          }),
        );
      }
      if (fixes.parking) {
        card.append(
          button('Build a Parking lot', 'wide', () => {
            session.startPlacing('parking');
            close();
          }),
        );
      }
      if (state.map.placed.some((placed) => placed && placedCars(placed.type, 1) > 0)) {
        card.append(
          button('Show car parks', 'wide', () => {
            session.setTool('look');
            session.setOverlay('parking');
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

  /** The broken street lamp whose panel is open, so the panel can say when it has been fixed. */
  let lampOpen: { x: number; y: number } | null = null;

  function renderInspector(state: GameState): void {
    const selected = session.selected;
    const cell = selected ? cellAt(state.map, selected.x, selected.y) : null;
    const placedHere = selected ? placedAt(state.map, selected.x, selected.y) : null;
    actionLand = null;
    staffYard = null;
    inspectorStaff.classList.remove('show');
    setText(inspectorAction, 'Build a dining hall here');
    // A broken street lamp: what broke it, whether a yard covers it, and when it will be fixed.
    const lamp = selected ? lampSummary(state, selected.x, selected.y) : null;
    if (selected && lamp) {
      lampOpen = { x: selected.x, y: selected.y };
      setText(inspectorTitle, 'Street lamp');
      setText(inspectorState, lamp);
      setText(inspectorFacts, '');
      inspectorAction.classList.remove('show');
      inspector.classList.add('show');
      return;
    }
    if (lampOpen) {
      // Its panel was open and a worker has just fixed it: say so, and close the panel.
      const was = lampOpen;
      lampOpen = null;
      if (selected && selected.x === was.x && selected.y === was.y) {
        inspector.classList.remove('show');
        queueMicrotask(() => {
          session.clearSelection();
          session.notify('A worker fixed the street lamp.');
        });
        return;
      }
    }
    // A field for sale: its price, and a button to buy it.
    const parcel = selected ? parcelAt(state.map, selected.x, selected.y) : null;
    if (selected && parcel && !parcel.owned) {
      const sale = parcelSummary(state, parcel);
      setText(inspectorTitle, parcel.name);
      setText(inspectorState, sale.state);
      setText(inspectorFacts, sale.facts);
      actionLand = parcel.id;
      setText(inspectorAction, `Buy for ${dollarsShort(parcel.price)}`);
      inspectorAction.classList.add('show');
      inspector.classList.add('show');
      return;
    }
    // A neighbourhood in town: who lives there and how they get to class.
    const hood = selected ? hoodAt(state.map, selected.x, selected.y) : null;
    if (hood) {
      const living = townLiving(state)[hood.id]!;
      const text = hoodSummary(state, living);
      setText(inspectorTitle, hood.name);
      setText(inspectorState, text.state);
      setText(inspectorFacts, text.facts);
      inspectorAction.classList.remove('show');
      inspector.classList.add('show');
      return;
    }
    if (placedHere) {
      setText(inspectorTitle, PLACED[placedHere.type].name);
      setText(inspectorState, placedSummary(state, placedHere));
      setText(inspectorFacts, placedFacts(state, placedHere));
      if (placedHere.type === 'yard') {
        staffYard = placedHere.id;
        const workers = workersAt(state, placedHere.id);
        const heads = workers * scaleOf(state);
        setText(staffCount, `${heads.toLocaleString('en-US')} ${heads === 1 ? 'worker' : 'workers'} · ${dollars(WAGE_PER_YEAR * (1 + BENEFITS_SHARE))} a year each`);
        fewer.disabled = workers <= 0;
        more.disabled = workers >= YARD_MAX_WORKERS;
        inspectorStaff.classList.add('show');
      }
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
        ? `${ZONE_LABEL[zone]} · stage ${stage} of ${MAX_STAGE} · ${stageSpec(zone, stage, scaleOf(state)).capacity.toLocaleString('en-US')} ${ZONE_UNIT[zone]}`
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

  /** The bar for a mode that lasts until Done: laying road, or looking at the Parking overlay. */
  function renderModeBar(): boolean {
    const tool = session.tool;
    const road = tool === 'road';
    const row = tool === 'bin' || tool === 'bench' || tool === 'table';
    const overlay = !road && !row && tool === 'look' ? session.overlay : null;
    const parking = overlay === 'parking';
    const show = (road || row || overlay !== null) && session.clearing === null;
    modeBar.classList.toggle('show', show);
    if (!show) return false;
    if (road) {
      setText(modeTitle, `Road · ${dollars(paintCost('road', scaleOf(store.state)))} a cell`);
      setText(modeState, 'Drag to lay road. Green road reaches a street. Red does not yet. The street to reach is blue.');
    } else if (row) {
      setText(modeTitle, `${PLACED[tool].name} · ${dollars(placedCost(tool, scaleOf(store.state)))} each`);
      setText(modeState, ROW_HINT[tool]);
    } else if (overlay === 'clean') {
      setText(modeTitle, 'Cleanliness');
      setText(modeState, "Green is clean, yellow is getting messy, red is dirty or needs a worker. Blue is where a yard's workers reach.");
    } else if (!parking) {
      return false;
    } else {
      setText(modeTitle, 'Parking');
      setText(modeState, 'Green car parks have a road to a street. Red ones hold no cars until a road joins them to the blue street.');
    }
    return true;
  }

  function renderPlacer(state: GameState): void {
    const type = session.tool === 'place' ? session.placing : null;
    placer.classList.toggle('show', type !== null);
    buildButton.classList.toggle('hidden', type !== null || session.clearing !== null || DRAG_FROM_MENU.includes(session.tool) || session.overlay !== null);
    if (!type) return;
    setText(placerTitle, placingLine(type, scaleOf(store.state)));
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

  /** Money: what comes in, what goes out and what it buys, marketing, and the endowment. */
  function openMoney(): void {
    /** The groups the player has opened, kept while the panel is redrawn after a tap. */
    const open = new Set<string>();
    openModal((close, card) => {
      // The title and the Close button stay put. Everything between them scrolls, on the shortest phone too.
      card.classList.add('card-fixed');
      const head = el('div', 'money-top');
      const body = el('div', 'card-scroll');
      const foot = button('Close', 'wide', close);
      card.append(head, body, foot);
      const row = (item: { name: string; detail: string; amount: string }, className: string): HTMLElement => {
        const line = el('div', className);
        const text = el('div', 'money-text');
        text.append(el('span', 'money-name', item.name), el('span', 'money-detail', item.detail));
        line.append(text, el('span', 'money-amount', item.amount));
        return line;
      };
      /** Redraw after a tap, keeping the list where the player had scrolled it. `show` is a group to bring into view. */
      const draw = (show?: string): void => {
        const view = moneyView(store.state);
        const scrolled = body.scrollTop;
        head.textContent = '';
        head.append(el('h1', '', 'Money'), el('p', 'money-lead', view.lead));
        if (view.phase) head.append(el('p', 'fine', view.phase));

        body.textContent = '';
        body.append(el('div', 'money-head', `Coming in · ${view.incomeTotal} a year`));
        for (const item of view.income) body.append(row(item, 'money-row'));

        body.append(el('div', 'money-head', `Going out · ${view.spendingTotal} a year`));
        let shown: HTMLElement | null = null;
        for (const group of view.groups) {
          const top = el('button', open.has(group.id) ? 'money-group open' : 'money-group');
          top.type = 'button';
          top.append(el('span', 'money-name', group.name), el('span', 'money-share', group.share), el('span', 'money-amount', group.amount));
          top.addEventListener('click', () => {
            const opening = !open.has(group.id);
            if (opening) open.add(group.id);
            else open.delete(group.id);
            draw(opening ? group.id : undefined);
          });
          body.append(top);
          if (open.has(group.id)) {
            let last: HTMLElement = top;
            for (const item of group.lines) {
              last = row(item, 'money-row inner');
              body.append(last);
            }
            if (show === group.id) shown = last;
          }
        }

        // Football's own profit and loss, with the applicants it draws.
        const ball = footballMoney(store.state);
        if (ball) {
          body.append(el('div', 'money-head', 'Football'));
          for (const item of ball.rows) body.append(row({ name: item.name, detail: '', amount: item.amount }, 'money-row'));
          body.append(el('p', '', ball.net), el('p', 'fine', ball.applicants));
        }

        // Recruiting and marketing: the one cost here the player sets.
        body.append(el('div', 'money-head', 'Recruiting and marketing'));
        const steps = el('div', 'money-steps');
        const set = (step: number): void => {
          const result = store.dispatch({ type: 'marketing', step });
          if (!result.ok) session.notify(result.error, 'error');
          draw();
        };
        const down = button('−', 'staff-button', () => set(view.marketing.step - 1));
        const up = button('+', 'staff-button', () => set(view.marketing.step + 1));
        down.disabled = view.marketing.step <= 0;
        up.disabled = view.marketing.step >= view.marketing.max;
        steps.append(down, el('span', 'staff-count', view.marketing.line), up);
        body.append(steps);

        // The endowment: cash paid in for good.
        body.append(el('div', 'money-head', 'Endowment'), el('p', '', view.endowment.line));
        if (view.endowment.payIn.length > 0) {
          const pay = el('div', 'money-pay');
          for (const amount of view.endowment.payIn) {
            pay.append(
              button(`Pay in ${dollarsShort(amount)}`, '', () => {
                const result = store.dispatch({ type: 'endow', amount });
                if (!result.ok) session.notify(result.error, 'error');
                draw();
              }),
            );
          }
          body.append(pay, el('p', 'fine', 'It never comes back out.'));
        }
        body.scrollTop = scrolled;
        // A group that has just been opened is brought into view, lines and all, without jumping the list.
        if (shown && typeof shown.scrollIntoView === 'function') shown.scrollIntoView({ block: 'nearest' });
      };
      draw();
    });
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
      // The calendar's one line beside the four causes: exams, a break, the weather.
      view.week.forEach((part, n) => {
        const line = el('div', 'cause week');
        line.append(el('span', 'cause-name', n === 0 ? 'This week' : ''), el('span', 'week-label', part.label), el('span', 'cause-value', part.points));
        card.append(line);
      });
      const stress = el('div', 'cause');
      const stressBar = el('div', 'cause-bar');
      const stressFill = el('div', 'cause-fill stress');
      stressFill.style.width = `${view.stress.score}%`;
      stressBar.append(stressFill);
      stress.append(el('span', 'cause-name', 'Stress'), stressBar, el('span', 'cause-value', String(view.stress.score)));
      card.append(stress, el('p', 'fine', view.stress.note));
      if (view.advice) card.append(el('p', '', view.advice));
      card.append(el('p', 'fine', view.staying));
      if (view.lastSemester) card.append(el('p', 'fine', view.lastSemester));
      // Grounds is partly how clean the campus is. The overlay shows where the mess is and who can reach it.
      if (view.rows.some((row) => row.id === 'grounds')) {
        card.append(
          button('Show cleanliness', 'wide', () => {
            session.setTool('look');
            session.setOverlay('clean');
            close();
          }),
        );
      }
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
    // The tree picker and the road bar both sit where the chip would be, so it moves up.
    chip.classList.toggle('raised', picking || DRAG_FROM_MENU.includes(tool));
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
        name ? `${name} · tap or drag to plant · ${dollars(paintCost('tree', scaleOf(store.state)))} each` : (TOOLS.find((t) => t.id === tool)?.hint(scaleOf(store.state)) ?? ''),
      );
      // The road tool says what to do in its own bar, so there is nothing for the chip to say until a drag begins.
      chip.classList.toggle('show', chip.textContent !== '');
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
      personPanel.render(null);
      if (!modalOpen) openSetup();
      return;
    }
    hud.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    const state = store.state;
    renderHud(state);
    renderInspector(state);
    studentPanel.render(state);
    personPanel.render(state);
    renderModeBar();
    renderPlacer(state);
    renderClearer();
    renderTools();

    updateRow.classList.toggle('show', updates.ready);
    visitRow.classList.toggle('show', store.visiting !== null);
    if (store.visiting !== null) setText(visitText, 'Visiting the model campus. Nothing here is saved.');
    // Toasts sit just under the HUD, however tall it is.
    const hudBottom = `${Math.round(hud.getBoundingClientRect().bottom)}px`;
    if (root.style.getPropertyValue('--hud-bottom') !== hudBottom) root.style.setProperty('--hud-bottom', hudBottom);

    if ((store.away || store.upgradeNotes.length > 0 || store.welcome) && !modalOpen) openAway();
    // Once, on a return visit in an iPhone or iPad browser tab: the Home Screen keeps saves safe there.
    if (store.returning && !modalOpen && !tipChecked) {
      tipChecked = true;
      if (shouldShowHomeScreenTip()) {
        markHomeScreenTipShown();
        openModal((close, card) => {
          card.append(el('h1', '', 'A tip'), el('p', '', HOME_SCREEN_TIP), button('OK', 'primary', close));
        });
      }
    }

    if (store.recent.length > 0) {
      for (const entry of store.recent) {
        if (worthSaying(entry)) pushToast(entry.text);
        // A result that comes in while the game is open has its short tune.
        if (entry.kind === 'game') sound.jingle(entry.data?.won === 1 ? 'win' : 'loss');
        else if (entry.kind === 'football' && (entry.data?.earned !== undefined || entry.data?.tier !== undefined)) sound.jingle('reward');
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
