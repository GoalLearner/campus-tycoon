import { clock } from '../app/clock';
import { exportSave, isStoragePersistent, pickSaveFile, requestPersistentStorage } from '../app/persistence';
import { session, type ToolChoice } from '../app/session';
import { store } from '../app/store';
import {
  bottleneck,
  buildingAt,
  calendarAt,
  capacityWanted,
  cellAt,
  COST,
  demandBar,
  desirabilityHint,
  dollars,
  dollarsShort,
  duration,
  enrollment,
  lotStatus,
  MAX_STAGE,
  netPerRealHour,
  nextMilestone,
  openCapacity,
  stageSpec,
  type GameState,
  type LogEntry,
  type StallCause,
  summarizeAway,
  type Zone,
} from '../sim';

/**
 * The HUD and every panel, as plain HTML over the map. It reads the game from
 * the store and the session, and sends the player's choices back to them.
 * One thing per panel, and as little on screen as will do.
 */

const ZONES: readonly Zone[] = ['housing', 'academic'];
const ZONE_LABEL: Record<Zone, string> = { housing: 'Housing', academic: 'Academics' };
const ZONE_UNIT: Record<Zone, string> = { housing: 'beds', academic: 'seats' };
const PHASE_LABEL = { moveIn: 'Move-in day', fall: 'Fall', spring: 'Spring', graduation: 'Graduation', summer: 'Summer' };
const MILESTONE_LABEL = {
  fallIntake: 'Fall class arrives',
  springIntake: 'Spring class arrives',
  graduation: 'Graduation',
  yearEnd: 'Year closes',
};

const TOOLS: Array<{ id: ToolChoice; label: string; hint: string }> = [
  { id: 'look', label: 'Look', hint: '' },
  { id: 'housing', label: 'Housing', hint: `Drag to zone a row. ${dollars(COST.zoneLot)} a lot.` },
  { id: 'academic', label: 'Academic', hint: `Drag to zone a row. ${dollars(COST.zoneLot)} a lot.` },
  { id: 'path', label: 'Path', hint: `Drag to lay a path. ${dollars(COST.path)} a cell.` },
  { id: 'quad', label: 'Quad', hint: `Drag to plant a quad. ${dollars(COST.quad)} a cell.` },
  { id: 'clear', label: 'Clear', hint: `Drag to clear. ${dollars(COST.clear)} a cell.` },
];

const TOOL_NOUN: Record<Exclude<ToolChoice, 'look'>, [string, string]> = {
  housing: ['lot', 'lots'],
  academic: ['lot', 'lots'],
  path: ['path cell', 'path cells'],
  quad: ['quad cell', 'quad cells'],
  clear: ['cell', 'cells'],
};

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
  const menuButton = button('Menu', 'menu-button', () => openMenu());
  top.append(money, students, menuButton);

  const calendar = el('div', 'calendar');
  const when = el('span', 'when');
  const next = el('span', 'next');
  calendar.append(when, next);

  const bars = el('div', 'bars');
  const barParts = {} as Record<Zone, { tag: HTMLElement; amount: HTMLElement; fill: HTMLElement; row: HTMLElement }>;
  for (const zone of ZONES) {
    const row = el('div', 'bar');
    const head = el('div', 'bar-head');
    const tag = el('span', 'tag', 'Bottleneck');
    const amount = el('span', 'amount');
    head.append(el('span', 'name', ZONE_LABEL[zone]), tag, amount);
    const track = el('div', 'track');
    const fill = el('div', 'fill');
    track.append(fill, el('div', 'mid'));
    row.append(head, track);
    bars.append(row);
    barParts[zone] = { tag, amount, fill, row };
  }

  const status = el('div', 'status');
  hud.append(top, calendar, bars, status);

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

  // ------------------------------------------------------------ inspector --
  const inspector = el('div', 'inspector');
  const inspectorTitle = el('div', 'inspector-title');
  const inspectorState = el('div', 'inspector-state');
  const inspectorFacts = el('div', 'inspector-facts');
  const inspectorClose = button('Close', 'inspector-close', () => session.clearSelection());
  inspector.append(inspectorClose, inspectorTitle, inspectorState, inspectorFacts);

  const toast = el('div', 'toast');
  const modalRoot = el('div', 'modal-root');
  root.append(hud, toast, chip, inspector, toolbar, modalRoot);

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
    if (!report) return;
    store.away = null;
    const summary = summarizeAway(report.log, report);
    openModal((close, card) => {
      card.append(el('h1', '', summary.headline));
      const list = el('ul', 'away-list');
      for (const line of summary.lines) list.append(el('li', '', line));
      card.append(list, button('Back to campus', 'primary', close));
    });
  }

  function openMenu(): void {
    openModal((close, card) => {
      card.append(el('h1', '', store.state.school.name));
      const note = el('p', 'fine', '');
      void isStoragePersistent().then((kept) => {
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

      if (import.meta.env.DEV) {
        const dev = el('div', 'dev');
        dev.append(el('div', 'dev-title', 'Dev: skip time'));
        const skip = (label: string, ms: number): HTMLButtonElement =>
          button(label, 'dev-button', () => {
            clock.skip(ms);
            store.catchUp();
            close();
          });
        dev.append(skip('+1 hour', 3_600_000), skip('+1 day', 86_400_000), skip('+1 year', 7 * 86_400_000));
        card.append(dev);
      }

      card.append(el('p', 'fine', 'Art by Kenney (kenney.nl), public domain.'), button('Close', 'primary', close));
    });
  }

  // --------------------------------------------------------------- render --

  function renderHud(state: GameState): void {
    setText(cash, dollars(state.money.cash));
    const perHour = netPerRealHour(state);
    setText(rate, `${perHour >= 0 ? '+' : '-'}${dollarsShort(Math.abs(perHour))}/hr`);
    rate.className = perHour >= 0 ? 'rate up' : 'rate down';
    setText(studentCount, String(enrollment(state)));

    const pos = calendarAt(state.clock.tick);
    setText(when, pos.year === 0 ? 'Move-in day' : `Year ${pos.year} · ${PHASE_LABEL[pos.phase]} · Day ${pos.day}`);
    const milestone = nextMilestone(state.clock.tick);
    setText(next, `${MILESTONE_LABEL[milestone.event]} in ${duration(milestone.inTicks)}`);

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

    const a = state.admissions;
    let line = '';
    if (a.waitlist > 0 && a.waitlistUntilTick > state.clock.tick) {
      line = `${a.waitlist} on the waitlist. It closes in ${duration(a.waitlistUntilTick - state.clock.tick)}.`;
    } else if (a.lastIntake && a.lastIntake.turnedAway > 0 && a.lastIntake.bottleneck) {
      line = `${a.lastIntake.turnedAway} turned away at the last intake for want of ${ZONE_UNIT[a.lastIntake.bottleneck]}.`;
    } else if (a.lastIntake) {
      line = 'Everyone found a place at the last intake.';
    } else {
      line = 'Zone lots beside a path before the first class arrives.';
    }
    setText(status, line);
  }

  const CAUSE_TEXT: Record<StallCause, string> = {
    noPath: 'no path beside it',
    noDemand: 'no demand right now',
    lowDesirability: 'low desirability',
  };

  function renderInspector(state: GameState): void {
    const selected = session.selected;
    const cell = selected ? cellAt(state.map, selected.x, selected.y) : null;
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
    setText(inspectorFacts, facts.join(' · '));
    inspector.classList.add('show');
  }

  function renderTools(): void {
    for (const [id, b] of toolButtons) b.classList.toggle('active', session.tool === id);
    const preview = session.preview;
    const tool = session.tool;
    if (tool === 'look') {
      chip.classList.remove('show');
      return;
    }
    if (preview && preview.cells.length > 0) {
      const n = preview.cells.length;
      const noun = TOOL_NOUN[tool][n === 1 ? 0 : 1];
      setText(chip, `${n} ${noun} · ${dollars(preview.cost)}${preview.affordable ? '' : ' · not enough cash'}`);
      chip.className = preview.affordable ? 'chip show' : 'chip show bad';
    } else if (preview) {
      setText(chip, 'Nothing here can take that');
      chip.className = 'chip show bad';
    } else {
      setText(chip, TOOLS.find((t) => t.id === tool)?.hint ?? '');
      chip.className = 'chip show';
    }
  }

  function render(): void {
    if (!store.hasGame) {
      hud.classList.add('hidden');
      toolbar.classList.add('hidden');
      chip.classList.remove('show');
      inspector.classList.remove('show');
      if (!modalOpen) openSetup();
      return;
    }
    hud.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    const state = store.state;
    renderHud(state);
    renderInspector(state);
    renderTools();

    if (store.away && !modalOpen) openAway();

    if (store.recent.length > 0) {
      for (const entry of store.recent) {
        if (NEWSWORTHY.has(entry.kind)) pushToast(entry.text);
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
  setInterval(render, 1000);
  render();
}
