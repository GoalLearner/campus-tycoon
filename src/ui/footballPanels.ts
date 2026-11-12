import { session } from '../app/session';
import { sound } from '../app/sound';
import { store } from '../app/store';
import { TICKET_PRICE } from '../sim';
import { decisionView, footballView, pastDecisions, type FootballView } from './footballUi';

/**
 * The Football page and the Decisions list. Each is one card over the map.
 * The Football page has a few tabs, one thing on each, and redraws itself
 * every few seconds while it is open so a live score moves.
 */

type OpenModal = (build: (close: () => void, card: HTMLElement) => void, dismissable?: boolean) => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const TABS = ['Season', 'Standings', 'Poll', 'Team', 'Rankings'] as const;
type Tab = (typeof TABS)[number];

function drawSeason(body: HTMLElement, view: FootballView): void {
  if (view.live) {
    const live = el('div', 'fb-live');
    live.append(el('div', 'fb-live-when', `${view.live.where} · ${view.live.quarter}`), el('div', 'fb-live-score', view.live.score));
    body.append(live);
  }
  if (view.next) body.append(el('p', 'fb-next', view.next));
  const list = el('div', 'fb-games');
  for (const game of view.games) {
    const row = el('div', `fb-game ${game.state}`);
    const text = el('div', 'fb-game-text');
    text.append(el('span', 'fb-game-name', `${game.where === 'Home' ? 'vs' : game.where === 'Away' ? 'at' : 'vs'} ${game.opponent}`), el('span', 'fb-game-detail', game.label ? `${game.date} · ${game.label}` : game.date));
    row.append(text, el('span', 'fb-game-result', game.outcome));
    list.append(row);
  }
  body.append(list);
}

function drawStandings(body: HTMLElement, view: FootballView): void {
  for (const division of view.divisions) {
    body.append(el('div', 'money-head', division.name));
    const table = el('div', 'fb-table');
    table.append(rowOf(['Team', 'Conf.', 'All'], 'fb-row head'));
    for (const row of division.rows) table.append(rowOf([row.name, row.conference, row.overall], row.mine ? 'fb-row mine' : 'fb-row'));
    body.append(table);
  }
  body.append(el('p', 'fine', 'The two division winners play for the conference title on the first Saturday of December.'));
}

function rowOf(cells: string[], className: string): HTMLElement {
  const row = el('div', className);
  cells.forEach((cell, n) => row.append(el('span', n === 0 ? 'fb-cell wide' : 'fb-cell', cell)));
  return row;
}

function drawPoll(body: HTMLElement, view: FootballView): void {
  if (!view.poll) {
    body.append(el('p', '', 'The first poll comes out as the season opens.'));
    return;
  }
  body.append(el('div', 'money-head', view.poll.label), el('p', 'fb-next', view.poll.mine));
  const table = el('div', 'fb-table');
  for (const row of view.poll.rows) table.append(rowOf([`${row.rank}. ${row.name}`, row.record], row.mine ? 'fb-row mine' : 'fb-row'));
  body.append(table);
}

function drawTeam(body: HTMLElement, view: FootballView, redraw: () => void): void {
  body.append(el('div', 'money-head', `Team rating ${view.rating.total}`));
  const list = el('div', 'cause-list');
  for (const part of view.rating.parts) {
    const line = el('div', 'cause');
    const bar = el('div', 'cause-bar');
    const fill = el('div', 'cause-fill');
    fill.style.width = `${Math.max(0, Math.min(100, part.value))}%`;
    bar.append(fill);
    line.append(el('span', 'cause-name', part.name), bar, el('span', 'cause-value', String(part.value)));
    list.append(line, el('p', 'fine fb-note', part.note));
  }
  body.append(list, el('p', 'fine', 'Coach and roster count for a third each. The stadium and funding share the rest.'));

  body.append(el('div', 'money-head', 'Coach'), el('p', '', view.coach));

  body.append(el('div', 'money-head', 'Stadium'), el('p', '', view.stadium.line));
  if (view.stadium.earned) body.append(el('p', 'fb-next', view.stadium.earned));
  const steps = el('div', 'money-steps');
  const set = (step: number): void => {
    const result = store.dispatch({ type: 'ticketPrice', step });
    if (!result.ok) session.notify(result.error, 'error');
    redraw();
  };
  const down = button('−', 'staff-button', () => set(view.stadium.price - 1));
  const up = button('+', 'staff-button', () => set(view.stadium.price + 1));
  down.disabled = view.stadium.price <= 0;
  up.disabled = view.stadium.price >= TICKET_PRICE.length - 1;
  steps.append(down, el('span', 'staff-count', view.stadium.priceLine), up);
  body.append(steps, el('p', 'fine', view.stadium.crowd));

  body.append(el('div', 'money-head', 'Television'), el('p', '', view.tv));
  body.append(el('div', 'money-head', 'Standing'), el('p', '', view.standing));
}

function drawRankings(body: HTMLElement, view: FootballView): void {
  body.append(el('div', 'money-head', 'Academics'), el('p', 'fb-next', view.academic.line));
  const table = el('div', 'fb-table');
  table.append(rowOf(['What it is made of', 'Share', 'Level'], 'fb-row head'));
  for (const row of view.academic.rows) {
    table.append(rowOf([row.name, row.weight, row.level], 'fb-row'));
    table.append(el('p', 'fine fb-note', row.detail));
  }
  body.append(table);
  if (view.academic.grades) body.append(el('p', 'fine', view.academic.grades));
  body.append(el('p', 'fine', 'A part with nothing to read yet shares its weight among the others. Alumni success and money per student join later.'));
  body.append(el('div', 'money-head', 'Football'), el('p', '', view.poll ? view.poll.mine : 'No poll yet.'), el('p', '', view.standing));
}

export function openFootball(openModal: OpenModal, first: Tab = 'Season'): void {
  openModal((close, card) => {
    card.classList.add('card-fixed');
    const head = el('div', 'money-top');
    const tabs = el('div', 'fb-tabs');
    const body = el('div', 'card-scroll');
    card.append(head, tabs, body, button('Close', 'wide', close));
    let tab: Tab = first;
    const draw = (): void => {
      if (!store.hasGame) return;
      const view = footballView(store.state);
      const scrolled = body.scrollTop;
      head.textContent = '';
      head.append(el('h1', '', view.title));
      if (!view.playing) {
        tabs.textContent = '';
        body.textContent = '';
        body.append(el('p', '', view.waiting));
        drawRankings(body, view);
        return;
      }
      head.append(el('p', 'money-lead', view.record));
      tabs.textContent = '';
      for (const name of TABS) {
        tabs.append(
          button(name, name === tab ? 'fb-tab active' : 'fb-tab', () => {
            tab = name;
            body.scrollTop = 0;
            draw();
          }),
        );
      }
      body.textContent = '';
      if (tab === 'Season') drawSeason(body, view);
      else if (tab === 'Standings') drawStandings(body, view);
      else if (tab === 'Poll') drawPoll(body, view);
      else if (tab === 'Team') drawTeam(body, view, draw);
      else drawRankings(body, view);
      body.scrollTop = scrolled;
    };
    draw();
    // A live score moves a quarter at a time. The page looks again every few seconds while it is open.
    const timer = setInterval(() => {
      if (!card.isConnected) {
        clearInterval(timer);
        return;
      }
      if (tab === 'Season') draw();
    }, 5000);
  });
}

export function openDecisions(openModal: OpenModal): void {
  openModal((close, card) => {
    card.classList.add('card-fixed');
    const head = el('div', 'money-top');
    const body = el('div', 'card-scroll');
    card.append(head, body, button('Close', 'wide', close));
    head.append(el('h1', '', 'Decisions'), el('p', 'money-lead', 'Each closes by itself. Leave one alone and its default happens.'));
    const draw = (): void => {
      if (!store.hasGame) return;
      const state = store.state;
      body.textContent = '';
      if (state.decisions.open.length === 0) body.append(el('p', '', 'Nothing is waiting for you. The next ones come in the spring.'));
      for (const decision of state.decisions.open) {
        const view = decisionView(state, decision);
        const box = el('div', 'decision');
        box.append(el('div', 'decision-title', view.title), el('p', '', view.body), el('p', 'fine', view.closes));
        for (const option of view.options) {
          const pick = button('', option.chosen ? 'decision-option chosen' : 'decision-option', () => {
            const result = store.dispatch({ type: 'decide', id: view.id, option: option.id });
            if (!result.ok) session.notify(result.error, 'error');
            else {
              session.notify(view.changeable ? 'Chosen. You can change it until it closes.' : 'Done.');
              sound.jingle('reward');
            }
            draw();
          });
          pick.append(el('span', 'decision-label', option.label), el('span', 'decision-detail', option.detail));
          for (const tag of option.tags) pick.append(el('span', 'decision-tag', tag));
          if (option.chosen) pick.append(el('span', 'decision-tag yours', 'Your pick'));
          box.append(pick);
        }
        body.append(box);
      }
      const past = pastDecisions(state);
      if (past.length > 0) {
        body.append(el('div', 'money-head', 'Settled'));
        for (const line of past) body.append(el('p', 'fine', line));
      }
    };
    draw();
  });
}
