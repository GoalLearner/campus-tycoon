import { clock } from '../app/clock';
import { backupReminder } from '../app/away';
import { alwaysDaylight, setAlwaysDaylight } from '../app/daylight';
import { HOME_SCREEN_TIP, markHomeScreenTipShown, shouldShowHomeScreenTip } from '../app/homeScreenTip';
import { markTwistTipShown, TWIST_TIP, twistTipDue } from '../app/twistTip';
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
  DEFAULT_SCHOOL_NAME,
  DEFAULT_WAKE_HOUR,
  SCHOOL_COLOURS,
  weatherAt,
  enrollmentCap,
  nextApplicants,
} from '../sim';
import { craftsReady, decorSpec, giftReady, hasMakerspace, previewDecor, scorecard, waits as waitsNow } from '../sim';
import { footballChip, footballMoney } from './footballUi';
import { openAwayScreen, openInbox } from './deskPanels';
import { inboxChip } from './deskUi';
import { policiesView, policyChip } from './policyUi';
import { collectAllChip, finishConfirm, gainedWords, levelChip, levelView } from './levelUi';
import { boardTop, giftCard } from './rhythmUi';
import { footballStat, inboxStat, policyStat, type StatChip } from './chips';
import { ordersChip, ordersView, paidWords } from './ordersUi';
import { DECOR_ENTRY, WORKSHOP_ENTRY, decorEntries, decorPanel, decorPlacedWords, decorPlacingLine, liftedCount, liftsNear, photoCaption, workshopPage } from './decorUi';
import { sharePhoto } from '../app/photo';
import { drawSprite, loadAtlas } from './atlas';
import { mcView } from './mcUi';
import { studentFigure } from '../sim';
import { openFootball } from './footballPanels';
import { capacityView, instructionView, sizeView, type CapacityRow } from './sizeUi';
import { buildEntries, happinessView, lotFacts, moneyView, placedFacts, placedSummary, placingLine } from './buildUi';
import { openBuildMenu } from './buildMenu';
import { labPage } from './labUi';
import { chapterPage, STATUS_NAME } from './greekUi';
import { traditionsButton, traditionsView } from './traditionsUi';
import { hoodSummary, housingFixLines, lampSummary, parcelSummary, SECOND_BUILDER_ENTRY, TOOL_ENTRY } from './buildUi';
import { CROWD_NAMES, CROWDS, crowdSetting, setCrowdSetting } from '../app/crowd';
import { effectsSetting, muted, musicVolume, setEffectsSetting, setMusicVolume, setMuted, setSoundVolume, soundVolume } from '../app/life';
import { sound } from '../app/sound';
import { mountPersonCard } from './personCard';
import { face, mountStudentCard } from './studentCard';
import { mountRoomView } from './roomView';

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
  // The student count. Tapping it opens the Goals and Capacity screen: the cap, this fall's applicants, the rank, and every need of a student.
  const students = el('button', 'students');
  students.type = 'button';
  const studentCount = el('span', 'count');
  students.append(studentCount, el('span', 'label', 'students'));
  students.addEventListener('click', () => openSize());
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
  // The Main Character's portrait (DESIGN.md 53.2): their figure from the atlas, or a figure waiting to be chosen.
  const mainButton = button('', 'main-button', () => openMain());
  const mainArt = document.createElement('canvas');
  mainArt.className = 'main-art';
  mainArt.width = 64;
  mainArt.height = 76;
  mainButton.append(mainArt);
  mainButton.setAttribute('aria-label', 'Your main character');
  let mainShown = '';
  top.append(money, students, happy, menuButton);

  const calendar = el('div', 'calendar');
  const when = el('span', 'when');
  const next = el('span', 'next');
  calendar.append(when, next);

  // Football has a chip when there is a season behind it. The Inbox always has one, and says so when something waits.
  const chips = el('div', 'hud-chips');
  // Each is a number over a word, as the student count is, so that all of them hold one row on a phone 375 wide
  // (DESIGN.md 42.16). The sentence each used to carry is still what a screen reader hears.
  const statChip = (onClick: () => void): { node: HTMLButtonElement; set: (stat: StatChip | null, said: string) => void } => {
    const node = button('', 'hud-chip stat', onClick);
    const value = el('span', 'chip-value');
    const label = el('span', 'chip-label');
    node.append(value, label);
    return {
      node,
      set: (stat, said) => {
        node.classList.toggle('show', stat !== null);
        if (!stat) return;
        setText(value, stat.value);
        setText(label, stat.label);
        node.classList.toggle('alone', stat.value === '');
        node.classList.toggle('urgent', stat.tone === 'urgent');
        node.classList.toggle('good', stat.tone === 'good');
        node.setAttribute('aria-label', said);
      },
    };
  };
  const footballButton = statChip(() => openFootball(openModal));
  const inboxButton = statChip(() => openInbox(openModal));
  // The orders board: things to do, beside the Inbox, which is things to decide (DESIGN.md 42.3).
  const ordersButton = statChip(() => openOrders());
  // Policies have a chip from the day the Growth era opens them, and none before (DESIGN.md section 41).
  const policyButton = statChip(() => openSize('policies'));
  // The University Level and the Gold Seals held (DESIGN.md section 42): one small button on the right of the row.
  // The badge and the Seal are the pack's drawings, from the atlas. The level's number is text set on the badge.
  const levelButton = button('', 'hud-chip level-chip', () => openLevel());
  const levelBadge = el('span', 'level-badge');
  const levelArt = document.createElement('canvas');
  levelArt.className = 'level-art';
  levelArt.width = 78;
  levelArt.height = 78;
  const levelNumber = el('span', 'level-number');
  levelBadge.append(levelArt, levelNumber);
  const sealArt = document.createElement('canvas');
  sealArt.className = 'seal-art';
  sealArt.width = 48;
  sealArt.height = 60;
  const sealCount = el('span', 'seal-count');
  levelButton.append(levelBadge, sealArt, sealCount);
  void loadAtlas().then((atlas) => {
    drawSprite(levelArt, atlas, 'ui.level');
    drawSprite(sealArt, atlas, 'ui.seal');
  });
  let shownLevel = -1;
  // The Main Character's portrait sits beside the level, where the row has room whatever the cash reads (DESIGN.md 57).
  chips.append(footballButton.node, inboxButton.node, ordersButton.node, policyButton.node, mainButton, levelButton);

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
  // Set instead when the panel is the Makerspace: the button opens the Workshop (DESIGN.md 42.6).
  let actionWorkshop = false;
  // Set instead when the panel is a research lab: the button opens its discoveries (DESIGN.md 49).
  let actionLab: number | null = null;
  // Set instead when the panel is a chapter house: the button opens its chapter (DESIGN.md 51).
  let actionChapter: number | null = null;
  // A decoration: move it, turn it, or put it away. All three are free, and nothing is lost (DESIGN.md 42.5).
  let decorHere: number | null = null;
  const inspectorDecor = el('div', 'inspector-decor');
  const decorTurn = button('Turn', '', () => {
    if (decorHere === null) return;
    const result = store.dispatch({ type: 'turnDecor', placed: decorHere });
    if (!result.ok) session.notify(result.error, 'error');
  });
  inspectorDecor.append(
    button('Move', 'primary', () => {
      const placed = decorHere === null ? null : store.state.map.placed[decorHere];
      if (!placed || !placed.decor) return;
      session.startDecor(placed.decor, placed.id, placed.flip === true);
      session.setGhost(placed.x, placed.y);
    }),
    decorTurn,
    button('Put away', '', () => {
      if (decorHere === null) return;
      const result = store.dispatch({ type: 'storeDecor', placed: decorHere });
      if (!result.ok) session.notify(result.error, 'error');
      else {
        session.clearSelection();
        session.notify('Put away. It is in storage, in the Build menu.');
      }
    }),
  );
  const inspectorAction = button('Build a dining hall here', 'primary inspector-action', () => {
    if (actionWorkshop) {
      openWorkshop();
      return;
    }
    if (actionLab !== null) {
      openLab(actionLab);
      return;
    }
    if (actionChapter !== null) {
      openChapter(actionChapter);
      return;
    }
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
  inspector.append(inspectorClose, inspectorTitle, inspectorState, inspectorFacts, inspectorStaff, inspectorDecor, inspectorAction);

  const studentPanel = mountStudentCard();
  const roomPanel = mountRoomView();
  const personPanel = mountPersonCard();

  // ---------------------------------------------------------------- build --
  const buildButton = button('Build', 'build-fab', () => openBuild());
  // Collect all (DESIGN.md 42.4). The map shows the burst over each building as its marker goes.
  const collectButton = button('', 'collect-fab', () => collectAll());
  function collectAll(): void {
    const result = store.dispatch({ type: 'collectAll' });
    if (!result.ok) {
      session.notify(result.error, 'error');
      return;
    }
    sound.ui('collect');
    if (result.gained) pushToast(gainedWords(result.gained));
  }
  // Shown while a building picked from the menu is being placed.
  const placer = el('div', 'placer');
  const placerTitle = el('div', 'placer-title');
  const placerState = el('div', 'placer-state');
  const placerButtons = el('div', 'placer-buttons');
  // A decoration bought with Gold Seals asks once more before a Seal is spent.
  let sealAsked: string | null = null;
  const placeDecoration = (id: string, ghost: { x: number; y: number }): void => {
    const moving = session.moving;
    // What it does is said as it lands: how many buildings near it look better for it.
    const before = liftsNear(store.state, ghost.x, ghost.y);
    const lifted = (): number => liftedCount(before, liftsNear(store.state, ghost.x, ghost.y));
    if (moving !== null) {
      const result = store.dispatch({ type: 'moveDecor', placed: moving, x: ghost.x, y: ghost.y });
      if (!result.ok) {
        session.notify(result.error, 'error');
        return;
      }
      sound.ui('place');
      session.notify(decorPlacedWords(store.state, id, 'moved', lifted()));
      session.setTool('look');
      return;
    }
    const preview = previewDecor(store.state, id, ghost.x, ghost.y);
    if (preview.way === 'seals' && preview.problem === null && sealAsked !== `${id}:${ghost.x}:${ghost.y}`) {
      sealAsked = `${id}:${ghost.x}:${ghost.y}`;
      render();
      return;
    }
    sealAsked = null;
    const result = store.dispatch({ type: 'placeDecor', id, x: ghost.x, y: ghost.y, flip: session.decorFlip });
    if (!result.ok) {
      session.notify(result.error, 'error');
      return;
    }
    sound.ui('place');
    session.notify(decorPlacedWords(store.state, id, preview.way ?? 'cash', lifted()));
    // Another of the same can go down at once while storage has one, or the shelf sells it for cash.
    const next = previewDecor(store.state, id, ghost.x, ghost.y).way;
    if (next === 'storage' || next === 'cash') session.startDecor(id, null, session.decorFlip);
    else session.setTool('look');
  };
  const placeButton = button('Place', 'primary', () => {
    const type = session.placing;
    const ghost = session.ghost;
    if (!type || !ghost) return;
    if (type === 'decor') {
      if (session.decor) placeDecoration(session.decor, ghost);
      return;
    }
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
    const entries = buildEntries(scaleOf(store.state), store.state);
    const later = entries.findIndex((entry) => entry.category === 'On the way');
    entries.splice(later < 0 ? entries.length : later, 0, ...decorEntries(store.state));
    openBuildMenu(root, entries, (entry) => {
      // Roads, bins, benches and tables are laid by dragging. Everything else is placed one at a time.
      if (entry.id?.startsWith(TOOL_ENTRY)) session.setTool(entry.id.slice(TOOL_ENTRY.length) as Tool);
      else if (entry.id?.startsWith(DECOR_ENTRY)) session.startDecor(entry.id.slice(DECOR_ENTRY.length));
      else if (entry.id === SECOND_BUILDER_ENTRY) {
        // The second builder is bought for Seals, once (DESIGN.md 45).
        const result = store.dispatch({ type: 'buySecondBuilder' });
        if (!result.ok) session.notify(result.error, 'error');
        else {
          sound.ui('collect');
          session.notify('A second builder is hired: two big builds can go up at once.');
        }
      }
      else if (entry.id === WORKSHOP_ENTRY) {
        // The Workshop is in the Makerspace. A campus with none is handed one to place.
        if (hasMakerspace(store.state)) openWorkshop();
        else {
          session.startPlacing('makerspace');
          session.notify('The Workshop is in the Makerspace. Place one and it opens.');
        }
      } else if (entry.id) session.startPlacing(entry.id as PlacedType);
    });
  }

  const toast = el('div', 'toast');
  const modalRoot = el('div', 'modal-root');
  root.append(hud, toast, chip, treePicker, inspector, studentPanel.node, studentPanel.strip, roomPanel.node, personPanel.node, placer, modeBar, clearer, buildButton, collectButton, toolbar, modalRoot);

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

  const NEWSWORTHY: ReadonlySet<LogEntry['kind']> = new Set(['intake', 'waitlistClosed', 'graduation', 'yearEnd', 'grant', 'calendar', 'exam', 'weather', 'game', 'football', 'decision', 'rankings', 'goal', 'level', 'order', 'craft', 'season', 'rhythm', 'lab', 'tradition', 'greek']);
  /** An incident is only worth a line when nobody came: that is the one the player can do something about. */
  const worthSaying = (entry: LogEntry): boolean => NEWSWORTHY.has(entry.kind) || (entry.kind === 'incident' && entry.data?.handled === 0);

  // --------------------------------------------------------------- modals --
  let modalOpen = false;
  /** The Home Screen tip is looked at once a visit, after any away list. */
  let tipChecked = false;
  let twistTipChecked = false;

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

  // Cloud saves (DESIGN.md 48) are switched off in every build. Only the dev server loads the Account page, and only
  // when the sync has a server to talk to.
  let account: { open: () => void } | null = null;
  if (import.meta.env.DEV) {
    void import('./accountUi').then((module) => {
      account = module.mountAccount(openModal, pushToast);
    });
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
      input.value = DEFAULT_SCHOOL_NAME;
      input.autocomplete = 'off';
      const wake = hourSelect(DEFAULT_WAKE_HOUR);
      const colour = colourSelect(DEFAULT_COLOUR);
      const start = (): void => {
        const name = input.value.trim() || DEFAULT_SCHOOL_NAME;
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
      // A building a rank goal gave is waiting in the Build menu.
      else if (where === 'build') openBuild();
      // An era opened switches: straight to them.
      else if (where === 'policies') openSize('policies');
      // A tradition's day, or one at risk, or a place to choose one (DESIGN.md 50).
      else if (where === 'traditions') openSize('traditions');
      // The Main Character's page (DESIGN.md 53.2).
      else if (where === 'main') openMain();
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

      // Photo mode (DESIGN.md 42.5): the bars go away, and the campus can be shared as a picture.
      card.append(
        button('Photo', 'wide', () => {
          close();
          session.setPhoto(true);
        }),
      );
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
      if (store.visiting === null && account !== null) {
        const page = account;
        card.append(
          button('Account', 'wide', () => {
            close();
            page.open();
          }),
        );
      }
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
    // The Main Character's portrait: redrawn only when who it is changes.
    const main = state.story?.mc ?? null;
    const mainKey = main ? `${main.ref.entryYear}:${main.ref.index}` : 'none';
    if (mainKey !== mainShown) {
      mainShown = mainKey;
      mainButton.classList.toggle('none', !main);
      void loadAtlas().then((atlas) => {
        const people = atlas?.people;
        if (!atlas || !people) return;
        const looks = Math.min(people.looks, people.crowd ?? people.looks);
        const figure = main ? studentFigure(store.state, main.ref, looks, people.roles?.athlete) : 0;
        drawSprite(mainArt, atlas, `person.${figure}.${people.flip?.sw ?? 'sw'}.0`);
      });
    }
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
    footballButton.set(footballStat(state), footballChip(state) ?? 'Football');
    inboxButton.set(inboxStat(state), inboxChip(state).text);
    const board = ordersChip(state);
    ordersButton.set(board, board ? `Orders${board.value ? `: ${board.value}` : ''}` : 'Orders');
    policyButton.set(policyStat(state), policyChip(state) ?? 'Policies');
    const level = levelChip(state);
    levelButton.classList.toggle('show', level !== null);
    if (level) {
      setText(levelNumber, String(level.level));
      setText(sealCount, String(level.seals));
      const gift = giftReady(state);
      levelButton.classList.toggle('gift', gift);
      levelButton.setAttribute('aria-label', `University Level ${level.level}, ${level.seals} Gold Seals${gift ? ". Today's gift is waiting" : ''}`);
      // A level reached while the player is here has a short tune.
      if (shownLevel > 0 && level.level > shownLevel) sound.jingle('reward');
      shownLevel = level.level;
    } else shownLevel = -1;
    // Collect all: there once five or more buildings are ready, and gone again when they are collected.
    const all = collectAllChip(state);
    setText(collectButton, all ?? '');
    collectButton.classList.toggle('show', all !== null);
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
      // A campus at its cap: the next class is as many as the cap leaves room for, and the rest are turned away.
      const cap = enrollmentCap(state);
      const applicants = nextApplicants(state);
      if (!add && cap !== null && plan.students < applicants) {
        action = plan.students === 0 ? `The campus is full at ${headCount(cap)} students` : `The next class fills the campus: ${headCount(plan.students)} of ${headCount(applicants)} applicants`;
      }
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
        const cap = enrollmentCap(state);
        const applicants = nextApplicants(state);
        lead = `The next class is ${headCount(plan.students)} students.`;
        // At its cap a campus takes as many as the cap leaves room for.
        if (cap !== null && plan.students < applicants) lead = plan.students === 0 ? `The campus is full at ${headCount(cap)} students. ${headCount(applicants)} will apply, and there is no place for them until commencement.` : `The next class is ${headCount(plan.students)} students, which fills the campus. ${headCount(applicants - plan.students)} more will apply and be turned away.`;
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
    actionWorkshop = false;
    actionLab = null;
    actionChapter = null;
    decorHere = null;
    staffYard = null;
    inspectorStaff.classList.remove('show');
    inspectorDecor.classList.remove('show');
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
      const decoration = decorPanel(placedHere);
      setText(inspectorTitle, decoration?.title ?? PLACED[placedHere.type].name);
      setText(inspectorState, placedSummary(state, placedHere));
      setText(inspectorFacts, placedFacts(state, placedHere));
      if (decoration) {
        decorHere = placedHere.id;
        decorTurn.classList.toggle('hidden', !decoration.turns);
        inspectorDecor.classList.add('show');
      }
      if (placedHere.type === 'yard') {
        staffYard = placedHere.id;
        const workers = workersAt(state, placedHere.id);
        const heads = workers * scaleOf(state);
        setText(staffCount, `${heads.toLocaleString('en-US')} ${heads === 1 ? 'worker' : 'workers'} · ${dollars(WAGE_PER_YEAR * (1 + BENEFITS_SHARE))} a year each`);
        fewer.disabled = workers <= 0;
        more.disabled = workers >= YARD_MAX_WORKERS;
        inspectorStaff.classList.add('show');
      }
      // The Workshop is in the Makerspace: its panel is the way in.
      if (placedHere.type === 'makerspace' && workshopPage(state)) {
        actionWorkshop = true;
        const ready = craftsReady(state);
        setText(inspectorAction, ready > 0 ? `Open the Workshop · ${ready} ready` : 'Open the Workshop');
        inspectorAction.classList.add('show');
      } else if (PLACED[placedHere.type].family === 'lab') {
        // A research lab: its discoveries, kept for good (DESIGN.md 49).
        actionLab = placedHere.id;
        const found = state.labs.found.filter((one) => one.lab === placedHere.type).length;
        setText(inspectorAction, found > 0 ? `Discoveries · ${found}` : 'Discoveries');
        inspectorAction.classList.add('show');
      } else if (PLACED[placedHere.type].family === 'chapter') {
        // A chapter house: its chapter's panel, with its standing on the button (DESIGN.md 51).
        const page = chapterPage(state, placedHere);
        actionChapter = placedHere.id;
        if (page) setText(inspectorTitle, page.title);
        setText(inspectorAction, page ? `The chapter · ${STATUS_NAME[page.status]}` : 'The chapter');
        inspectorAction.classList.add('show');
      } else inspectorAction.classList.remove('show');
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
    collectButton.classList.toggle('hidden', type !== null || session.clearing !== null || DRAG_FROM_MENU.includes(session.tool) || session.overlay !== null);
    if (!type) return;
    setText(placeButton, 'Place');
    if (type === 'decor' && session.decor) {
      // A decoration: from storage, from its shelf for cash or Gold Seals, or one on the map being moved.
      const id = session.decor;
      const moving = session.moving !== null;
      setText(placerTitle, decorPlacingLine(state, id, moving));
      const spot = session.ghost;
      const look = spot ? previewDecor(state, id, spot.x, spot.y) : null;
      let problem = look?.problem ?? null;
      // One being moved is paid for already, and may be set down where it stands.
      if (moving && look) {
        const from = state.map.placed[session.moving!];
        problem = problem === 'blocked' && from && from.x === look.x && from.y === look.y ? null : problem === 'blocked' || problem === 'offMap' ? problem : null;
      }
      let line = moving ? 'Tap the map where it should go.' : 'Tap the map where it should go. Each kind near a dorm or a lecture hall lifts how it looks.';
      if (problem === 'blocked') line = 'Something is in the way. It needs empty ground.';
      else if (problem === 'offMap') line = 'That does not fit on your land.';
      else if (problem === 'cash') line = `You have ${dollars(state.money.cash)}. It costs ${dollars(look!.cost)}.`;
      else if (problem === 'seals') line = `You have ${state.daily.seals} Gold Seals. It takes ${look!.seals}.`;
      else if (problem === 'locked') line = `${decorSpec(id)?.name ?? 'That'} cannot be got just now.`;
      else if (look && look.way === 'seals' && !moving) {
        const asked = sealAsked === `${id}:${look.x}:${look.y}`;
        line = asked ? `Spend ${look.seals} of your ${state.daily.seals} Gold Seals? It is yours for good.` : `${look.seals} Gold Seals. You have ${state.daily.seals}.`;
        setText(placeButton, asked ? `Spend ${look.seals}` : 'Place');
      }
      setText(placerState, line);
      placer.classList.toggle('bad', problem !== null);
      placeButton.disabled = !look || problem !== null;
      return;
    }
    sealAsked = null;
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

        // Instruction: how many students one member of faculty is hired for (DESIGN.md 38).
        body.append(el('div', 'money-head', 'Instruction'), ...instructionSteps(() => draw()));

        // Recruiting and marketing: the other cost here the player sets.
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

        // The endowment: cash paid in for good. Alumni giving builds it too (DESIGN.md 54.3).
        body.append(el('div', 'money-head', 'Endowment'), el('p', '', view.endowment.line));
        if (view.alumni) body.append(el('p', 'fine', view.alumni));
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

  /** The Instruction slider: a step down, the ratio it asks for, a step up. Used on the Capacity page and in Money. */
  function instructionSteps(redraw: () => void, brief = false): HTMLElement[] {
    const view = instructionView(store.state);
    const steps = el('div', 'money-steps');
    const set = (step: number): void => {
      const result = store.dispatch({ type: 'instruction', step });
      if (!result.ok) session.notify(result.error, 'error');
      redraw();
    };
    const down = button('−', 'staff-button', () => set(view.step - 1));
    const up = button('+', 'staff-button', () => set(view.step + 1));
    down.disabled = view.step <= 0;
    up.disabled = view.step >= view.max;
    steps.append(down, el('span', 'staff-count', view.line), up);
    return [steps, el('p', 'fine', brief ? view.cost : view.note)];
  }

  /** The page the Goals and Capacity screen was last on, kept for the visit. */
  let campusPage: 'goals' | 'capacity' | 'policies' | 'traditions' | 'scorecard' = 'goals';

  /** Goals and Capacity: one screen with two pages, opened from the student count (DESIGN.md 38.2). */
  function openSize(page: 'goals' | 'capacity' | 'policies' | 'traditions' | 'scorecard' = campusPage): void {
    campusPage = page;
    /** The row of the Capacity page that is open. One at a time. */
    let openRow: string | null = null;
    openModal((close, card) => {
      card.classList.add('card-fixed');
      const head = el('div', 'money-top');
      const body = el('div', 'card-scroll');
      card.append(head, body, button('Close', 'wide', close));

      const goFix = (row: CapacityRow): void => {
        const fix = row.fix;
        if (fix.kind === 'plan') {
          close();
          openPlan(fix.zone);
        } else if (fix.kind === 'zone') {
          session.setTool(fix.zone);
          close();
        } else if (fix.kind === 'build') {
          close();
          if (fix.at) session.lookAt(fix.at.x, fix.at.y);
          openBuild();
        } else if (fix.kind === 'place') {
          session.startPlacing(fix.type);
          close();
        } else if (fix.kind === 'yard') {
          session.setTool('look');
          session.lookAt(fix.x, fix.y);
          session.select(fix.x, fix.y);
          close();
        }
      };

      const draw = (): void => {
        const state = store.state;
        const size = sizeView(state);
        const needs = capacityView(state);
        // The Policies page is there once an era has opened a switch, and not before.
        const policies = policiesView(state);
        if (campusPage === 'policies' && !policies) campusPage = 'goals';
        // The Traditions page is there once the first commencement has opened a place (DESIGN.md 50).
        const traditions = traditionsView(state);
        if (campusPage === 'traditions' && !traditions) campusPage = 'goals';
        // The Scorecard (DESIGN.md 54.3): on a game with a drive.
        const card7 = scorecard(state);
        if (campusPage === 'scorecard' && !card7) campusPage = 'goals';
        const scrolled = body.scrollTop;
        head.textContent = '';
        head.append(el('h1', '', size.title));
        const tabs = el('div', 'fb-tabs');
        const pages: Array<['goals' | 'capacity' | 'policies' | 'traditions' | 'scorecard', string]> = [['goals', 'Goals'], ['capacity', needs.tab]];
        if (policies) pages.push(['policies', 'Policies']);
        if (traditions) pages.push(['traditions', 'Traditions']);
        // The Scorecard last: on a phone the row scrolls sideways, and the open page is brought into view.
        if (card7) pages.push(['scorecard', 'Scorecard']);
        for (const [id, label] of pages) {
          const tab = button(label, id === campusPage ? 'fb-tab active' : 'fb-tab', () => {
            campusPage = id;
            body.scrollTop = 0;
            draw();
          });
          tabs.append(tab);
        }
        head.append(tabs);
        const open = tabs.querySelector<HTMLElement>('.fb-tab.active');
        if (open && typeof open.scrollIntoView === 'function') open.scrollIntoView({ block: 'nearest', inline: 'nearest' });

        body.textContent = '';
        if (campusPage === 'goals') {
          if (size.cap) {
            const bar = el('div', 'cause-bar size-bar');
            const fill = el('div', 'cause-fill');
            fill.style.width = `${size.cap.percent}%`;
            bar.append(fill);
            body.append(el('div', 'size-goal', size.cap.line), bar, el('p', 'fine', size.cap.note));
          }
          // This fall's applicants, from where they start to what each cause adds, and who gets a place.
          const total = el('div', 'size-row total');
          total.append(el('span', '', size.applicants.head), el('span', 'size-value', size.applicants.total));
          body.append(total);
          for (const row of size.applicants.rows) {
            const line = el('div', 'size-row');
            line.append(el('span', '', row.name), el('span', 'size-value', row.value));
            body.append(line);
          }
          if (size.places) {
            for (const [name, value] of [['Admitted', size.places.admitted], ['Turned away', size.places.turnedAway]] as const) {
              const line = el('div', 'size-row places');
              line.append(el('span', '', name), el('span', 'size-value', value));
              body.append(line);
            }
          }
          body.append(el('div', 'size-goal', size.rank));
          if (size.rankNext) body.append(el('p', 'fine', size.rankNext));
          // The era, what the next one will open, and the way to what this one opened.
          if (size.era) body.append(el('div', 'size-goal', size.era));
          if (size.eraNext) body.append(el('p', 'fine', size.eraNext));
          if (policies) {
            body.append(
              button('Policies', 'wide', () => {
                campusPage = 'policies';
                body.scrollTop = 0;
                draw();
              }),
            );
          }
          const toTraditions = traditionsButton(state);
          if (toTraditions) {
            body.append(
              button(toTraditions, 'wide', () => {
                campusPage = 'traditions';
                body.scrollTop = 0;
                draw();
              }),
            );
          }
          if (size.reached.length > 0) {
            body.append(el('div', 'money-head', 'Goals reached'));
            for (const line of size.reached) body.append(el('p', 'fine', line));
          }
        } else if (campusPage === 'scorecard' && card7) {
          // Seven rows, one for each stage of the spine: its number, an arrow against last year, and what limits it most.
          for (const row of card7) {
            const box = el('div', 'score-row');
            const top = el('div', 'size-row');
            const arrow = row.trend ? (row.trend.way === 'up' ? '▲' : row.trend.way === 'down' ? '▼' : '▬') : '';
            const mark = el('span', `score-arrow${row.trend?.good === true ? ' good' : row.trend?.good === false ? ' bad' : ''}`, arrow);
            const value = el('span', 'size-value', row.value);
            value.prepend(mark);
            top.append(el('span', 'score-name', row.name), value);
            box.append(top, el('p', 'fine', row.limit));
            body.append(box);
          }
        } else if (campusPage === 'policies' && policies) {
          for (const row of policies.rows) {
            const box = el('div', row.on ? 'policy on' : 'policy');
            const top = el('div', 'policy-top');
            const flip = button(row.on ? 'On' : 'Off', row.on ? 'policy-switch on' : 'policy-switch', () => {
              const result = store.dispatch({ type: 'policy', id: row.id, on: !row.on });
              if (!result.ok) session.notify(result.error, 'error');
              draw();
            });
            // A switch changed since the last class moved in stays as it is until the next one does.
            flip.disabled = row.locked;
            top.append(el('span', 'policy-name', row.name), flip);
            box.append(top);
            for (const [mark, words, lines] of [['+', row.gain, row.gainLines], ['\u2212', row.cost, row.costLines]] as const) {
              const side = el('div', mark === '+' ? 'policy-side gain' : 'policy-side cost');
              const text = el('div', 'policy-text');
              text.append(el('span', 'policy-words', words));
              for (const line of lines) text.append(el('span', 'policy-line', line));
              side.append(el('span', 'policy-mark', mark), text);
              box.append(side);
            }
            if (row.locked) {
              box.append(el('p', 'fine policy-locked', 'Set until the next class moves in.'));
              // Seals can free it now (DESIGN.md 42.7): the same price and the same confirm as on the Level page.
              const held = levelView(state)?.waits.find((wait) => wait.id === `policy:${row.id}`);
              if (held) box.append(finishControl(held, draw));
            }
            body.append(box);
          }
          if (policies.next) body.append(el('p', 'fine', policies.next));
        } else if (campusPage === 'traditions' && traditions) {
          // Traditions (DESIGN.md 50): those kept, then, while a place is open, those to choose from.
          body.append(el('p', 'fine', traditions.places));
          for (const row of traditions.chosen) {
            const box = el('div', row.holds ? 'policy on tradition' : 'policy tradition at-risk');
            const top = el('div', 'policy-top');
            top.append(el('span', 'policy-name', row.name), el('span', row.holds ? 'tradition-state' : 'tradition-state risk', row.holds ? row.status : 'At risk'));
            box.append(top, el('p', 'tradition-line', `${row.when}${row.next ? ` · ${row.next}` : ''}`), el('p', row.holds ? 'tradition-line' : 'tradition-line risk', `Needs: ${row.needs}`), el('p', 'tradition-line', row.lifts));
            if (!row.holds) box.append(el('p', 'tradition-line', row.status));
            if (row.record) box.append(el('p', 'fine', row.record));
            body.append(box);
          }
          if (traditions.choices.length > 0) {
            body.append(el('div', 'money-head', 'Choose a tradition'));
            for (const row of traditions.choices) {
              const box = el('div', 'policy tradition');
              const top = el('div', 'policy-top');
              const pick = button('Choose', 'policy-switch', () => {
                const result = store.dispatch({ type: 'chooseTradition', id: row.id });
                if (!result.ok) session.notify(result.error, 'error');
                body.scrollTop = 0;
                draw();
              });
              top.append(el('span', 'policy-name', row.name), pick);
              box.append(top, el('p', 'tradition-line', row.when), el('p', row.holds ? 'tradition-line' : 'tradition-line risk', `Needs: ${row.needs}${row.holds ? '' : ' (not yet)'}`), el('p', 'tradition-line', row.lifts));
              body.append(box);
            }
          }
        } else {
          body.append(el('p', 'fine', needs.lead));
          for (const row of needs.rows) {
            const open = openRow === row.id;
            const top = el('button', open ? `need open ${row.status}` : `need ${row.status}`);
            top.type = 'button';
            const text = el('div', 'need-text');
            text.append(el('span', 'need-name', row.name), el('span', 'need-line', row.line));
            top.append(text, el('span', `need-status ${row.status}`, row.word));
            top.addEventListener('click', () => {
              openRow = open ? null : row.id;
              draw();
            });
            body.append(top);
            if (!open) continue;
            const detail = el('div', 'need-detail');
            for (const line of row.detail) detail.append(el('p', '', line));
            // Faculty: the fix is the Instruction slider, right here.
            // Who is on the way is said once: in the row's own words when it has any.
            if (row.fix.kind === 'slider') detail.append(...instructionSteps(draw, row.detail.length > 1));
            if (row.fixLabel) detail.append(button(row.fixLabel, 'wide', () => goFix(row)));
            body.append(detail);
          }
        }
        body.scrollTop = scrolled;
      };
      draw();
    });
  }

  /**
   * "Finish now" for one wait (DESIGN.md 42.7): the price is on the button before the tap, and the tap asks
   * once more before any Seal is spent. `done` runs after it is finished, to redraw whatever holds it.
   */
  function finishControl(wait: { id: string; name: string; price: number; can: boolean }, done: () => void): HTMLElement {
    const box = el('div', 'finish');
    const ask = (): void => {
      box.textContent = '';
      const go = button(`Finish now · ${wait.price} ${wait.price === 1 ? 'Seal' : 'Seals'}`, 'finish-go', confirm);
      go.disabled = !wait.can;
      box.append(go);
      if (!wait.can) box.append(el('span', 'fine', `You have ${store.state.daily.seals}.`));
    };
    const confirm = (): void => {
      box.textContent = '';
      box.append(el('p', 'finish-ask', finishConfirm(wait)));
      const row = el('div', 'finish-row');
      row.append(
        button(`Spend ${wait.price}`, 'primary', () => {
          const result = store.dispatch({ type: 'finish', wait: wait.id });
          if (!result.ok) session.notify(result.error, 'error');
          else sound.ui('place');
          done();
        }),
        button('Keep waiting', '', ask),
      );
      box.append(row);
    };
    ask();
    return box;
  }

  /**
   * The Workshop (DESIGN.md 42.6): what each bench is making, what it keeps making, and the recipes. A bench's
   * recipe is a standing choice: collecting the finished thing starts the next one.
   */
  /** A research lab's discoveries, newest first (DESIGN.md 49). */
  function openLab(id: number): void {
    const lab = store.state.map.placed[id];
    if (!lab) return;
    const page = labPage(store.state, lab);
    openModal((close, card) => {
      card.classList.add('card-fixed');
      const body = el('div', 'card-scroll');
      for (const one of page.discoveries) {
        const row = el('div', 'order done');
        row.append(el('span', 'order-from', one.when), el('span', 'order-title', one.text));
        body.append(row);
      }
      card.append(el('h1', '', page.title), el('p', 'fine', page.lead), body, button('Close', 'wide', close));
    });
  }

  /** A chapter's panel (DESIGN.md 51): its house, its standing and why, its members, and Greek Row as a whole. */
  function openChapter(id: number): void {
    openModal((close, card) => {
      card.classList.add('card-fixed');
      const head = el('div', 'money-top');
      const body = el('div', 'card-scroll');
      card.append(head, body, button('Close', 'wide', close));
      const draw = (): void => {
        const house = store.state.map.placed[id];
        const page = house ? chapterPage(store.state, house) : null;
        if (!house || !page) {
          close();
          return;
        }
        head.textContent = '';
        body.textContent = '';
        const picture = document.createElement('canvas');
        picture.className = 'chapter-picture';
        picture.width = 144;
        picture.height = 144;
        const chapter = store.state.greek.chapters.find((one) => one.house === id);
        void loadAtlas().then((atlas) => {
          const looks = Math.max(1, Object.keys(atlas?.frames ?? {}).filter((key) => /^chapter\.\d+$/.test(key)).length);
          drawSprite(picture, atlas, `chapter.${(chapter?.look ?? 0) % looks}`);
        });
        head.append(picture, el('h1', '', page.title));
        const standing = el('div', `chapter-standing ${page.status}`);
        standing.append(el('strong', '', page.standing[0]!));
        for (const line of page.standing.slice(1)) standing.append(el('p', 'fine', line));
        body.append(standing);
        for (const [label, value] of page.rows) {
          const row = el('div', 'chapter-row');
          row.append(el('span', 'chapter-label', label), el('span', 'chapter-value', value));
          body.append(row);
        }
        body.append(el('p', 'fine', page.row));
      };
      draw();
    });
  }

  function openWorkshop(): void {
    openModal((close, card) => {
      card.classList.add('card-fixed');
      const head = el('div', 'money-top');
      const body = el('div', 'card-scroll');
      card.append(head, body, button('Close', 'wide', close));
      let benchAsked = false;
      const draw = (): void => {
        const page = workshopPage(store.state);
        if (!page) {
          close();
          return;
        }
        const scrolled = body.scrollTop;
        head.textContent = '';
        head.append(el('h1', '', 'The Workshop'));
        if (page.lead) head.append(el('p', 'fine', page.lead));
        body.textContent = '';
        if (!page.makerspace) {
          body.append(
            button('Place a Makerspace', 'primary wide', () => {
              close();
              session.startPlacing('makerspace');
            }),
          );
        }
        const open = page.recipes.filter((recipe) => recipe.locked === '');
        const pending = waitsNow(store.state);
        for (const bench of page.benches) {
          const box = el('div', bench.ready ? 'order done' : 'order');
          box.append(el('span', 'order-from', page.benches.length > 1 ? `Bench ${bench.index + 1}` : 'The bench'));
          box.append(el('span', 'order-title', bench.making || 'Nothing on it'));
          box.append(el('span', 'order-pays', bench.line));
          if (bench.ready) {
            box.append(
              button('Collect', 'primary wide', () => {
                const result = store.dispatch({ type: 'collectCraft', bench: bench.index });
                if (!result.ok) session.notify(result.error, 'error');
                else {
                  sound.ui('collect');
                  pushToast(result.note ?? 'Collected. It is in storage, in the Build menu.');
                }
                draw();
              }),
            );
          } else if (bench.making) {
            const wait = pending.find((one) => one.id === `craft:${bench.index}`);
            if (wait) box.append(finishControl({ id: wait.id, name: wait.name, price: wait.price, can: store.state.daily.seals >= wait.price }, draw));
          }
          if (page.makerspace && open.length > 0) {
            // What it keeps making. A native picker: it is one choice from a short list.
            const row = el('label', 'bench-keeps');
            const pick = document.createElement('select');
            const none = document.createElement('option');
            none.value = '';
            none.textContent = 'Nothing';
            pick.append(none);
            for (const recipe of open) {
              const option = document.createElement('option');
              option.value = recipe.id;
              option.textContent = `${recipe.name} · ${recipe.line}`;
              pick.append(option);
            }
            pick.value = open.find((recipe) => recipe.name === bench.recipe)?.id ?? '';
            pick.addEventListener('change', () => {
              const result = store.dispatch({ type: 'setRecipe', bench: bench.index, recipe: pick.value === '' ? null : pick.value });
              if (!result.ok) session.notify(result.error, 'error');
              else if (result.note) session.notify(result.note, 'error');
              else if (pick.value !== '') sound.ui('place');
              draw();
            });
            row.append(el('span', '', 'Keeps making'), pick);
            box.append(row);
          }
          body.append(box);
        }
        if (page.secondBench > 0 && page.makerspace) {
          const more = el('div', 'finish');
          if (!benchAsked) {
            const go = button(`A second bench · ${page.secondBench} Gold Seals`, 'finish-go', () => {
              benchAsked = true;
              draw();
            });
            go.disabled = store.state.daily.seals < page.secondBench;
            more.append(go);
            if (go.disabled) more.append(el('span', 'fine', `You have ${store.state.daily.seals}.`));
          } else {
            more.append(el('p', 'finish-ask', `Spend ${page.secondBench} of your ${store.state.daily.seals} Gold Seals on a second bench? It is yours for good.`));
            const row = el('div', 'finish-row');
            row.append(
              button(`Spend ${page.secondBench}`, 'primary', () => {
                const result = store.dispatch({ type: 'buyBench' });
                if (!result.ok) session.notify(result.error, 'error');
                else sound.ui('place');
                benchAsked = false;
                draw();
              }),
              button('Not now', '', () => {
                benchAsked = false;
                draw();
              }),
            );
            more.append(row);
          }
          body.append(more);
        }
        body.append(el('span', 'order-from recipes-title', 'Recipes'));
        void loadAtlas().then((atlas) => {
          const list = el('div', 'recipes');
          for (const recipe of page.recipes) {
            const line = el('div', recipe.locked ? 'recipe locked' : 'recipe');
            const picture = document.createElement('canvas');
            picture.width = 96;
            picture.height = 96;
            drawSprite(picture, atlas, recipe.sprite);
            const text = el('div', 'recipe-text');
            text.append(el('span', 'order-title', recipe.name), el('span', 'fine', recipe.locked ? `Comes at ${recipe.locked}` : `${recipe.line}${recipe.owned > 0 ? ` · you have ${recipe.owned}` : ''}`));
            line.append(picture, text);
            list.append(line);
          }
          body.append(list);
          body.scrollTop = scrolled;
        });
      };
      draw();
    });
  }

  /**
   * Photo mode (DESIGN.md 42.5): the bars go, the campus is framed with the school's name and rank under it,
   * and Share hands the picture to the phone's share sheet, or saves it in a browser.
   */
  const photoBar = el('div', 'photo-bar');
  const photoName = el('div', 'photo-name');
  const photoLine = el('div', 'photo-line');
  const photoCaptionBox = el('div', 'photo-caption');
  photoCaptionBox.append(photoName, photoLine);
  const photoButtons = el('div', 'photo-buttons');
  const photoShare = button('Share', 'primary', () => {
    const snap = session.snap;
    if (!snap) return;
    photoShare.disabled = true;
    void snap()
      .then((image) => sharePhoto(image, photoCaption(store.state)))
      .then((how) => {
        if (how === 'saved') pushToast('Saved to your downloads.');
      })
      .catch(() => session.notify('The picture could not be shared.', 'error'))
      .finally(() => {
        photoShare.disabled = false;
      });
  });
  // Two fingers turn the map here too (DESIGN.md section 43).
  photoButtons.append(photoShare, button('Done', '', () => session.setPhoto(false)));
  photoBar.append(photoButtons, photoCaptionBox);
  root.append(photoBar);
  function renderPhoto(state: GameState): void {
    root.classList.toggle('photo-mode', session.photo);
    if (!session.photo) return;
    const caption = photoCaption(state);
    setText(photoName, caption.name);
    setText(photoLine, caption.line);
  }

  /** How long a claimed order stays in place, faded, while its medal rises: the burst's own length. */
  const CLAIM_SETTLE_MS = 800;

  /**
   * The orders board (DESIGN.md 42.3): things to do. Opening it is what starts a new order's clock, so it tells
   * the game it has been looked at before it draws. A finished order is claimed with the medal's burst.
   */
  function openOrders(): void {
    store.dispatch({ type: 'seeOrders' });
    openModal((close, card) => {
      card.classList.add('card-fixed');
      const head = el('div', 'money-top');
      const body = el('div', 'card-scroll');
      card.append(head, body, button('Close', 'wide', close));
      // What the page says about the last thing done on it. A toast would sit behind the page.
      let told = '';
      // A claimed order stays where it was, faded, while its medal rises; then the list closes up under it.
      const settle = (box: HTMLElement): void => {
        box.classList.add('claimed');
        for (const one of box.querySelectorAll('button')) one.remove();
        window.setTimeout(draw, CLAIM_SETTLE_MS);
      };
      const draw = (): void => {
        const view = ordersView(store.state);
        if (!view) {
          close();
          return;
        }
        const scrolled = body.scrollTop;
        head.textContent = '';
        head.append(el('h1', '', 'Orders'), el('p', 'fine', view.count));
        body.textContent = '';
        if (view.note) body.append(el('p', 'order-note', view.note));
        if (told) body.append(el('p', 'order-note', told));
        // The goals for the year, then the calendar's moments: they take none of the board's places (DESIGN.md 44).
        for (const part of boardTop(store.state, (row, box) => {
          const result = store.dispatch({ type: 'claimMoment', id: row.id });
          if (!result.ok) {
            session.notify(result.error, 'error');
            draw();
            return;
          }
          sound.ui('collect');
          const from = box.getBoundingClientRect();
          const within = card.getBoundingClientRect();
          const burst = el('div', 'claim-burst');
          const medal = document.createElement('canvas');
          medal.width = 84;
          medal.height = 98;
          void loadAtlas().then((atlas) => drawSprite(medal, atlas, 'icon.collect'));
          burst.append(el('span', 'claim-paid', result.paid ? paidWords(result.paid) : ''), medal);
          burst.style.left = `${from.left - within.left + from.width / 2}px`;
          burst.style.top = `${from.top - within.top + from.height / 2}px`;
          card.append(burst);
          burst.addEventListener('animationend', () => burst.remove());
          told = '';
          settle(box);
        }))
          body.append(part);
        for (const row of view.rows) {
          const box = el('div', row.done ? 'order done' : 'order');
          box.append(el('span', 'order-from', row.from), el('span', 'order-title', row.title));
          if (row.ask) box.append(el('p', 'fine order-ask', row.ask));
          if (!row.fresh) {
            const bar = el('div', 'cause-bar size-bar');
            const fill = el('div', 'cause-fill');
            fill.style.width = `${Math.round(row.share * 100)}%`;
            bar.append(fill);
            const facts = el('div', 'order-facts');
            facts.append(el('span', '', row.progress), el('span', '', row.left));
            box.append(bar, facts, el('span', 'order-pays', `Pays ${row.reward}`));
          }
          if (row.done) {
            const claim = button('Claim', 'primary wide', () => {
              const result = store.dispatch({ type: 'claimOrder', id: row.id });
              if (!result.ok) {
                session.notify(result.error, 'error');
                draw();
                return;
              }
              sound.ui('collect');
              // The medal rises from where the order was, with what it paid.
              const from = box.getBoundingClientRect();
              const within = card.getBoundingClientRect();
              const burst = el('div', 'claim-burst');
              const medal = document.createElement('canvas');
              medal.width = 84;
              medal.height = 98;
              void loadAtlas().then((atlas) => drawSprite(medal, atlas, 'icon.collect'));
              burst.append(el('span', 'claim-paid', result.paid ? paidWords(result.paid) : ''), medal);
              burst.style.left = `${from.left - within.left + from.width / 2}px`;
              burst.style.top = `${from.top - within.top + from.height / 2}px`;
              card.append(burst);
              burst.addEventListener('animationend', () => burst.remove());
              told = '';
              settle(box);
            });
            box.append(claim);
          } else {
            box.append(
              button('Dismiss', 'order-dismiss', () => {
                const result = store.dispatch({ type: 'dismissOrder', id: row.id });
                if (!result.ok) session.notify(result.error, 'error');
                else told = 'Dismissed. A new order comes tomorrow.';
                draw();
              }),
            );
          }
          body.append(box);
        }
        if (view.rows.length === 0) body.append(el('p', '', 'Every order is done.'));
        if (view.next && !told) body.append(el('p', 'fine', view.next));
        body.scrollTop = scrolled;
      };
      draw();
    });
  }

  /** The Level page: how far to the next level, what feeds it, what the next level gives, and what Seals can finish. */
  /** Which page of the Main Character's screen is open: today, or the story so far (DESIGN.md 53.3). */
  let mainPage: 'now' | 'story' = 'now';

  /** The Main Character's page (DESIGN.md 53.2), or with none chosen, a suggestion and the hall of fame. */
  function openMain(): void {
    openModal((close, card) => {
      card.classList.add('card-fixed');
      const head = el('div', 'money-top');
      const body = el('div', 'card-scroll');
      card.append(head, body, button('Close', 'wide', close));
      const draw = (): void => {
        const view = mcView(store.state);
        head.textContent = '';
        body.textContent = '';
        const fame = (): void => {
          if (view.fame.length === 0) return;
          body.append(el('div', 'money-head', 'Hall of fame'));
          for (const one of view.fame) {
            const entry = el('details', 'main-fame');
            entry.append(el('summary', '', `${one.name} · ${one.line}`));
            for (const line of one.story) entry.append(el('p', 'fine', line));
            body.append(entry);
          }
        };
        if (!view.chosen) {
          head.append(el('h1', '', 'Your main character'));
          if (view.suggestion) {
            const suggestion = view.suggestion;
            body.append(el('p', '', `${suggestion.name} · ${suggestion.about}`));
            body.append(
              button(`Make ${suggestion.name.split(' ')[0]} your main character`, 'wide', () => {
                const result = store.dispatch({ type: 'makeMain', ref: suggestion.ref });
                if (!result.ok) session.notify(result.error, 'error');
                draw();
              }),
            );
          }
          body.append(el('p', 'fine', 'Or tap any student and choose them on their card.'));
          fame();
          return;
        }
        const mc = view.chosen;
        head.append(el('h1', '', mc.name), el('p', 'fine', mc.about));
        const tabs = el('div', 'fb-tabs');
        for (const [id, label] of [['now', 'Now'], ['story', 'Story']] as const) {
          tabs.append(
            button(label, id === mainPage ? 'fb-tab active' : 'fb-tab', () => {
              mainPage = id;
              body.scrollTop = 0;
              draw();
            }),
          );
        }
        head.append(tabs);
        if (mainPage === 'story') {
          // Chapters, newest first: each scene what happened, what they did, and how it went, with the odds.
          if (mc.chapters.length === 0) body.append(el('p', 'fine', 'The first chapter is still to come.'));
          for (const chapter of mc.chapters) {
            body.append(el('div', 'money-head', chapter.open ? `${chapter.title} · going on` : chapter.title));
            for (const scene of chapter.scenes) {
              const box = el('div', scene.good ? 'main-scene good' : 'main-scene');
              box.append(el('p', '', scene.text), el('p', 'fine', scene.chose), el('p', '', scene.outcome));
              if (scene.odds) box.append(el('p', 'fine main-odds', scene.odds));
              body.append(box);
            }
          }
          return;
        }
        body.append(el('div', 'size-goal', mc.doing));
        for (const [label, value] of mc.rows) {
          const line = el('div', 'size-row');
          line.append(el('span', '', label), el('span', 'size-value', value));
          body.append(line);
        }
        body.append(el('div', 'money-head', 'Needs'));
        for (const need of mc.needs) {
          const line = el('div', 'main-need');
          const bar = el('div', 'cause-bar');
          const fill = el('div', need.low ? 'cause-fill low' : 'cause-fill');
          fill.style.width = `${need.level}%`;
          bar.append(fill);
          line.append(el('span', 'main-need-name', need.name), bar);
          body.append(line);
        }
        body.append(el('div', 'money-head', "Today's plan"));
        for (const item of mc.plan) body.append(el('p', item.done ? 'fine main-done' : 'fine', `${item.done ? '\u2713 ' : ''}${item.text}`));
        body.append(el('div', 'money-head', 'Goals'));
        for (const [name, status] of mc.goals) {
          const line = el('div', 'size-row');
          line.append(el('span', '', name), el('span', 'size-value', status));
          body.append(line);
        }
        body.append(el('div', 'money-head', 'People'));
        for (const [role, who] of mc.people) {
          const line = el('div', 'size-row');
          line.append(el('span', '', role), el('span', 'size-value', who));
          body.append(line);
        }
        body.append(el('div', 'money-head', 'Lately'));
        for (const line of mc.timeline) body.append(el('p', 'fine', line));
        const actions = el('div', 'main-actions');
        actions.append(
          button('Follow', '', () => {
            close();
            session.openStudent(mc.ref);
          }),
          button('Choose someone else', '', () => {
            const result = store.dispatch({ type: 'setAsideMain' });
            if (!result.ok) session.notify(result.error, 'error');
            draw();
          }),
        );
        body.append(actions);
        fame();
      };
      draw();
    });
  }

  function openLevel(): void {
    openModal((close, card) => {
      card.classList.add('card-fixed');
      const head = el('div', 'money-top');
      const body = el('div', 'card-scroll');
      card.append(head, body, button('Close', 'wide', close));
      const draw = (): void => {
        const view = levelView(store.state);
        if (!view) {
          close();
          return;
        }
        const scrolled = body.scrollTop;
        head.textContent = '';
        const top = el('div', 'level-top');
        const badge = el('span', 'level-badge big');
        const art = document.createElement('canvas');
        art.className = 'level-art';
        art.width = 216;
        art.height = 216;
        badge.append(art, el('span', 'level-number', String(view.level)));
        void loadAtlas().then((atlas) => drawSprite(art, atlas, 'ui.level'));
        const words = el('div', 'level-words');
        const bar = el('div', 'cause-bar size-bar');
        const fill = el('div', 'cause-fill');
        fill.style.width = `${view.percent}%`;
        bar.append(fill);
        words.append(el('h1', '', view.title), bar, el('p', 'fine', view.line));
        top.append(badge, words);
        head.append(top);

        body.textContent = '';
        // The day's gift (DESIGN.md 44): taken here, or on the paper.
        const gift = giftCard(store.state, (words) => {
          if (words) session.notify(words);
          draw();
        });
        if (gift) body.append(gift);
        body.append(el('p', '', view.next));
        if (view.ready) {
          body.append(
            el('p', 'fine', view.ready.line),
            button('Collect', 'primary wide', () => {
              collectAll();
              draw();
            }),
          );
        }
        const sealsHead = el('div', 'money-head seals-head');
        const seal = document.createElement('canvas');
        seal.className = 'seal-art';
        seal.width = 48;
        seal.height = 60;
        void loadAtlas().then((atlas) => drawSprite(seal, atlas, 'ui.seal'));
        sealsHead.append(seal, el('span', '', `Gold Seals · ${view.seals}`));
        body.append(sealsHead);
        if (view.waits.length === 0) body.append(el('p', 'fine', 'A Seal finishes a wait at once. Nothing is waiting now.'));
        for (const wait of view.waits) {
          const row = el('div', 'wait');
          const text = el('div', 'need-text');
          text.append(el('span', 'need-name', wait.name), el('span', 'need-line', wait.detail));
          row.append(text, finishControl(wait, draw));
          body.append(row);
        }
        body.append(el('div', 'money-head', 'What earns experience'));
        for (const feed of view.feeds) {
          const line = el('div', 'size-row');
          line.append(el('span', '', feed.name), el('span', 'size-value', feed.value));
          body.append(line);
        }
        body.scrollTop = scrolled;
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
        // A policy that is on is inside its cause, and is named here, on that cause's line.
        for (const note of cause.notes) list.append(el('p', 'fine cause-note', note));
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
      roomPanel.render(null);
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
    roomPanel.render(state);
    personPanel.render(state);
    renderModeBar();
    renderPlacer(state);
    renderPhoto(state);
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

    // Once, the first time the map is open after the Turn button went: two fingers turn it now (DESIGN.md 43).
    if (store.hasGame && !modalOpen && !session.photo && !twistTipChecked) {
      twistTipChecked = true;
      if (twistTipDue()) {
        markTwistTipShown();
        pushToast(TWIST_TIP);
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
