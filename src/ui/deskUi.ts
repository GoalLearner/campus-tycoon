import type { AwayReport } from '../app/away';
import {
  advisorByline,
  advisorLines,
  duration,
  edition,
  EDITION_MINUTES,
  inboxBlocked,
  ROUTINE_CAP,
  summarizeAway,
  welcomeEdition,
  type AdvisorLine,
  type AwaySummary,
  type Edition,
  type GameState,
  type InboxItem,
  type TopKind,
} from '../sim';
import { clockTime, decisionView, pastDecisions, type DecisionView } from './footballUi';

/**
 * Words for the Inbox and for the newspaper that fronts the away list
 * (DESIGN.md section 36). Nothing here touches the page: it turns the game
 * into the lines the two screens show.
 */

const KIND_NAME: Record<InboxItem['kind'], string> = { petition: 'Petition', deal: 'Deal', event: 'Event' };

export interface DeskItemView {
  id: number;
  /** "Petition", "Deal" or "Event". */
  kind: string;
  /** "From Dean of Students Ada Fernwick". */
  from: string;
  title: string;
  body: string;
  closes: string;
  options: Array<{ id: string; label: string; detail: string; tags: string[]; blocked: string | null }>;
}

export function deskItemView(state: GameState, item: InboxItem): DeskItemView {
  const who = advisorByline(state, item.advisor);
  return {
    id: item.id,
    kind: KIND_NAME[item.kind],
    from: `From ${who}`,
    title: item.title,
    body: item.body,
    closes: `Closes in ${duration(Math.max(1, item.closes - state.clock.tick))}, at ${clockTime(state, item.closes)}`,
    options: item.options.map((option) => {
      const tags: string[] = [];
      if (option.id === item.advised) tags.push(`${state.inbox.advisors[item.advisor]}'s pick`);
      if (option.id === item.fallback) tags.push('Happens by itself if you leave it');
      return { id: option.id, label: option.label, detail: option.detail, tags, blocked: inboxBlocked(state, item, option.id) };
    }),
  };
}

export interface InboxView {
  /** The year's decisions. They never count against the desk's four. */
  annual: DecisionView[];
  desk: DeskItemView[];
  /** "On your desk: 2 of 4". */
  deskHead: string;
  /** Said when nothing at all is waiting. */
  empty: string;
  advisors: AdvisorLine[];
  settled: string[];
}

export function inboxView(state: GameState): InboxView {
  const desk = state.inbox.open.map((item) => deskItemView(state, item));
  const annual = state.decisions.open.map((decision) => decisionView(state, decision));
  const past = [...state.inbox.past].reverse().map((item) => `${item.title}: ${item.outcome}${item.byDefault ? ', by default' : ''}.`);
  return {
    annual,
    desk,
    deskHead: `On your desk: ${desk.length} of ${ROUTINE_CAP}`,
    empty: annual.length + desk.length === 0 ? 'Nothing is waiting for you.' : '',
    advisors: advisorLines(state),
    settled: [...past, ...pastDecisions(state)],
  };
}

/** The chip on the HUD: what is waiting and how long the soonest has left, or plain "Inbox" when nothing is. */
export function inboxChip(state: GameState): { text: string; urgent: boolean } {
  const waiting = [...state.decisions.open.filter((item) => item.chosen === null).map((item) => item.closes), ...state.inbox.open.map((item) => item.closes)];
  if (waiting.length === 0) return { text: 'Inbox', urgent: false };
  const left = duration(Math.max(1, Math.min(...waiting) - state.clock.tick));
  return { text: `${waiting.length} to decide · ${left} left`, urgent: true };
}

// ------------------------------------------------------------ the paper --

const TOP_TAG: Record<TopKind, string> = {
  decisions: 'To decide',
  defaults: 'Decided without you',
  game: 'Football',
  intake: 'Admissions',
  money: 'Money',
  problem: 'Trouble',
  news: 'News',
};

export interface PaperView {
  /** How long the player was away, in words: "Away 1 day 2 hours". */
  awayFor: string;
  edition: Edition;
  top: Array<{ tag: string; text: string; go?: 'inbox' | 'football' | 'build' | 'policies' }>;
  /** The label on the button that opens the rest: "The rest of the paper · 23 lines". '' when there is no rest. */
  restLabel: string;
  /** The poll, as bars: a label, a share of 100 and the words beside it. */
  poll: Array<{ label: string; share: number; words: string }>;
  pollNote: string;
  /** True for the first issue: the poll is on the front, and there is no rest. */
  front: boolean;
  /** The words on the button that puts the paper down. */
  leave: string;
}

export type AwayView = { kind: 'paper'; paper: PaperView } | { kind: 'list'; summary: AwaySummary; grounds: string; groundsFirst: boolean };

/**
 * What the away screen shows. An hour or more away gets the newspaper. A
 * shorter absence gets the plain list it always had.
 */
export function awayView(state: GameState, report: AwayReport): AwayView {
  if (report.minutes < EDITION_MINUTES) {
    return { kind: 'list', summary: summarizeAway(report.log, report), grounds: report.grounds ?? '', groundsFirst: report.groundsFirst === true };
  }
  const paper = edition(state, report.log, report, { line: report.grounds ?? '', first: report.groundsFirst === true });
  return {
    kind: 'paper',
    paper: {
      awayFor: `Away ${duration(report.minutes)}`,
      edition: paper,
      top: paper.top.map((item) => (item.go ? { tag: TOP_TAG[item.kind], text: item.text, go: item.go } : { tag: TOP_TAG[item.kind], text: item.text })),
      restLabel: paper.folded > 0 ? `The rest of the paper · ${paper.folded} ${paper.folded === 1 ? 'line' : 'lines'}` : '',
      poll: paper.poll.map((line) => ({ label: line.label, share: line.share, words: `${line.share} in 100` })),
      pollNote: paper.poll.length > 0 ? `${paper.content} in 100 named something they like instead.` : '',
      front: false,
      leave: 'Back to campus',
    },
  };
}

/** The first issue, shown once when a game begins (DESIGN.md 36.10). */
export function welcomeView(state: GameState): PaperView {
  const paper = welcomeEdition(state);
  return {
    awayFor: 'First edition',
    edition: paper,
    top: paper.top.map((item) => (item.go ? { tag: TOP_TAG[item.kind], text: item.text, go: item.go } : { tag: TOP_TAG[item.kind], text: item.text })),
    restLabel: '',
    poll: paper.poll.map((line) => ({ label: line.label, share: line.share, words: `${line.share} in 100` })),
    pollNote: paper.poll.length > 0 ? `${paper.content} in 100 named something they like instead.` : '',
    front: true,
    leave: 'See your campus',
  };
}
