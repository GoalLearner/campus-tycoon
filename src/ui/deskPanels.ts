import type { AwayReport } from '../app/away';
import { session } from '../app/session';
import { sound } from '../app/sound';
import { store } from '../app/store';
import { awayView, inboxView, welcomeView, type PaperView } from './deskUi';

/**
 * The Inbox and the away screen (DESIGN.md section 36). The Inbox has three
 * short pages: what is waiting, the four advisors, and what was settled. The
 * away screen is the campus newspaper after an hour or more away, and the
 * plain list after less.
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

const TABS = ['To decide', 'Advisors', 'Settled'] as const;
export type InboxTab = (typeof TABS)[number];

interface Choice {
  id: string;
  label: string;
  detail: string;
  tags: string[];
  chosen?: boolean;
  blocked?: string | null;
}

/** One thing to decide: a title, what it is about, when it closes and its choices. */
function drawItem(parent: HTMLElement, head: { kicker: string; title: string; body: string; closes: string }, choices: Choice[], pick: (id: string) => void): void {
  const box = el('div', 'decision');
  if (head.kicker) box.append(el('div', 'desk-kicker', head.kicker));
  box.append(el('div', 'decision-title', head.title), el('p', '', head.body), el('p', 'fine', head.closes));
  for (const choice of choices) {
    const b = button('', choice.chosen ? 'decision-option chosen' : choice.blocked ? 'decision-option blocked' : 'decision-option', () => pick(choice.id));
    b.append(el('span', 'decision-label', choice.label), el('span', 'decision-detail', choice.detail));
    for (const tag of choice.tags) b.append(el('span', tag.startsWith('Happens') ? 'decision-tag default' : 'decision-tag', tag));
    if (choice.chosen) b.append(el('span', 'decision-tag yours', 'Your pick'));
    box.append(b);
  }
  parent.append(box);
}

export function openInbox(openModal: OpenModal, start: InboxTab = 'To decide'): void {
  openModal((close, card) => {
    card.classList.add('card-fixed');
    const head = el('div', 'money-top');
    const tabs = el('div', 'fb-tabs');
    const body = el('div', 'card-scroll');
    card.append(head, tabs, body, button('Close', 'wide', close));
    head.append(el('h1', '', 'Inbox'));
    let tab: InboxTab = start;
    const draw = (): void => {
      if (!store.hasGame) return;
      const state = store.state;
      const view = inboxView(state);
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
      if (tab === 'To decide') {
        if (view.empty) body.append(el('p', '', view.empty));
        if (view.annual.length > 0) {
          body.append(el('div', 'money-head', "This year's decisions"));
          for (const item of view.annual) {
            drawItem(body, { kicker: '', title: item.title, body: item.body, closes: item.closes }, item.options, (option) => {
              const result = store.dispatch({ type: 'decide', id: item.id, option });
              if (!result.ok) session.notify(result.error, 'error');
              else {
                session.notify(item.changeable ? 'Chosen. You can change it until it closes.' : 'Done.');
                sound.jingle('reward');
              }
              draw();
            });
          }
        }
        if (view.desk.length > 0) {
          body.append(el('div', 'money-head', view.deskHead));
          for (const item of view.desk) {
            drawItem(body, { kicker: `${item.kind} · ${item.from}`, title: item.title, body: item.body, closes: item.closes }, item.options, (option) => {
              const result = store.dispatch({ type: 'inbox', id: item.id, option });
              if (!result.ok) session.notify(result.error, 'error');
              else {
                session.notify('Done.');
                sound.jingle('reward');
              }
              draw();
            });
          }
        }
      } else if (tab === 'Advisors') {
        for (const advisor of view.advisors) {
          const box = el('div', 'advisor');
          box.append(el('div', 'advisor-who', `${advisor.title} ${advisor.name}`), el('div', 'fine', advisor.domain), el('p', 'advisor-issue', advisor.issue));
          body.append(box);
        }
      } else {
        if (view.settled.length === 0) body.append(el('p', '', 'Nothing has been settled yet.'));
        for (const line of view.settled) body.append(el('p', 'fine', line));
      }
    };
    draw();
  });
}

// ------------------------------------------------------------ the paper --

function pollRow(line: PaperView['poll'][number]): HTMLElement {
  const row = el('div', 'paper-poll');
  const bar = el('div', 'paper-bar');
  const fill = el('div', 'paper-fill');
  fill.style.width = `${Math.max(2, line.share)}%`;
  bar.append(fill);
  row.append(el('span', 'paper-poll-name', line.label), bar, el('span', 'paper-poll-share', line.words));
  return row;
}

function drawPaper(body: HTMLElement, paper: PaperView, go: (where: 'inbox' | 'football' | 'build') => void): void {
  const page = el('div', 'paper');
  const edition = paper.edition;
  page.append(el('div', 'paper-name', edition.paper), el('div', 'paper-date', `${edition.dateline} · ${paper.awayFor}`), el('h2', 'paper-headline', edition.headline), el('p', 'paper-deck', edition.deck));

  const top = el('div', 'paper-top');
  for (const item of paper.top) {
    const where = item.go;
    const row = where ? button('', 'paper-item go', () => go(where)) : el('div', 'paper-item');
    row.append(el('span', 'paper-tag', item.tag), el('span', 'paper-text', item.text));
    top.append(row);
  }
  page.append(top);

  // The first issue has the poll on its front: nothing has happened yet to fold away.
  if (paper.front && paper.poll.length > 0) {
    page.append(el('div', 'paper-section', 'Student poll: what is wrong here'));
    for (const line of paper.poll) page.append(pollRow(line));
    page.append(el('p', 'paper-small', paper.pollNote));
  }

  if (paper.restLabel) {
    const rest = el('div', 'paper-rest');
    const toggle = button(paper.restLabel, 'paper-more', () => {
      const open = rest.classList.toggle('show');
      toggle.classList.toggle('open', open);
      // The rest opens under the button, so the button goes to the top of what can be seen.
      if (open && typeof toggle.scrollIntoView === 'function') toggle.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    const section = (name: string): void => void rest.append(el('div', 'paper-section', name));
    if (edition.scores.length > 0) {
      section('Scores');
      for (const line of edition.scores) rest.append(el('p', 'paper-line', line));
    }
    if (edition.admissions) {
      section('Admissions');
      rest.append(el('p', 'paper-line', edition.admissions));
    }
    if (paper.poll.length > 0) {
      section('Student poll: what is wrong here');
      for (const line of paper.poll) rest.append(pollRow(line));
      rest.append(el('p', 'paper-small', paper.pollNote));
    }
    if (edition.movers) {
      section('Rankings day');
      rest.append(el('p', 'paper-line', edition.movers));
    }
    if (edition.more.length > 0) {
      section('Also');
      for (const line of edition.more) rest.append(el('p', 'paper-line', line));
    }
    if (edition.days.length > 0) {
      section('Day by day');
      if (edition.earlier > 0) rest.append(el('p', 'paper-small', `${edition.earlier} earlier ${edition.earlier === 1 ? 'line is' : 'lines are'} left out.`));
      for (const day of edition.days) {
        rest.append(el('div', 'paper-day', day.date));
        for (const line of day.lines) rest.append(el('p', 'paper-line', line));
      }
    }
    page.append(toggle, rest);
  }
  body.append(page);
}

/**
 * The away screen. It stays saved until "Back to campus" is tapped: closing
 * the app first loses nothing. `notes` are rules new to an older save, told
 * once. `go` opens the Inbox or the Football page from a line that leads there.
 */
export function openAwayScreen(openModal: OpenModal, report: AwayReport | null, notes: string[], go: (where: 'inbox' | 'football' | 'build') => void): void {
  // A game's first screen is the paper's first issue. An away list, if there is one too, waits for the next look.
  const welcome = store.welcome ? welcomeView(store.state) : null;
  const view = !welcome && report ? awayView(store.state, report) : null;
  openModal((close, card) => {
    card.classList.add('card-fixed');
    const body = el('div', 'card-scroll');
    const leave = (): void => {
      if (welcome) store.welcomeSeen();
      else if (report) store.awaySeen(report);
      close();
    };
    if (welcome) {
      drawPaper(body, welcome, (where) => {
        leave();
        go(where);
      });
    } else if (view?.kind === 'paper') {
      drawPaper(body, view.paper, (where) => {
        leave();
        go(where);
      });
    } else {
      body.append(el('h1', '', view ? view.summary.headline : 'New since your last visit'));
      const list = el('ul', 'away-list');
      const lines = [...(view?.summary.lines ?? [])];
      // Grounds has one line. It leads only when cleanliness is what is holding Happiness back.
      if (view?.grounds) {
        if (view.groundsFirst) lines.unshift(view.grounds);
        else lines.push(view.grounds);
      }
      for (const line of lines) list.append(el('li', '', line));
      body.append(list);
      if (view && view.summary.days.length > 0) {
        const dated = el('div', 'away-days');
        if (view.summary.earlier > 0) dated.append(el('p', 'fine', `${view.summary.earlier} earlier ${view.summary.earlier === 1 ? 'line is' : 'lines are'} left out.`));
        for (const day of view.summary.days) {
          dated.append(el('div', 'away-date', day.date));
          const dayLines = el('ul', 'away-list');
          for (const line of day.lines) dayLines.append(el('li', '', line));
          dated.append(dayLines);
        }
        body.append(dated);
      }
    }
    if (notes.length > 0) {
      const list = el('ul', 'away-list');
      for (const note of notes) list.append(el('li', 'away-note', note));
      body.append(list);
    }
    card.append(body, button(welcome ? welcome.leave : 'Back to campus', 'primary', leave));
  }, false);
}
