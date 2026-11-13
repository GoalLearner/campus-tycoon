import {
  conditionHolds,
  CAUSE_NAMES,
  duration,
  ERAS,
  eraOf,
  hasDaily,
  nextDay,
  TRADITION_SLOTS,
  TRADITIONS,
  traditionShare,
  traditionSlots,
  traditionSpec,
  traditionToChoose,
  type GameState,
  type TraditionSpec,
} from '../sim';

/**
 * The Traditions page (DESIGN.md 50): behind the student count, beside
 * Policies. Each tradition chosen, with its condition, how often it has been
 * kept, what it lifts now and its record; and, while a place is open, the
 * ones there are to choose from.
 */

export interface TraditionRow {
  id: string;
  name: string;
  when: string;
  needs: string;
  /** True when its condition holds now. */
  holds: boolean;
  /** "Kept 4 times", or for one to choose, what it would lift. */
  status: string;
  lifts: string;
  /** "In 2 d 4 h", or '' when its day is the end of the season. */
  next: string;
  /** The record book: each year since it was chosen, kept or not. */
  record: string;
}

export interface TraditionsView {
  places: string;
  chosen: TraditionRow[];
  /** Empty when no place is open. */
  choices: TraditionRow[];
}

/** What a tradition lifts now, in its own number. */
function liftNow(state: GameState, spec: TraditionSpec, share: number): string {
  const lift = spec.lift;
  if (share <= 0) return `Lifts ${lift.kind === 'cause' ? CAUSE_NAMES[lift.cause] : spec.lifts.toLowerCase()} once it is kept`;
  if (lift.kind === 'cause') return `${CAUSE_NAMES[lift.cause]} ${(Math.round(lift.points * share * 10) / 10).toFixed(1)} points higher`;
  if (lift.kind === 'exams') return `Stress at finals ${(Math.round(lift.points * share * 10) / 10).toFixed(1)} points lower`;
  return `${Math.round(lift.lift * share * 1000) / 10}% more of a crowd want a seat`;
}

/** What it lifts at its fullest, for one still to choose. */
function liftFull(spec: TraditionSpec): string {
  const lift = spec.lift;
  if (lift.kind === 'cause') return `Up to ${lift.points} points of ${CAUSE_NAMES[lift.cause]}`;
  if (lift.kind === 'exams') return `Up to ${lift.points} points off Stress at finals`;
  return `Up to ${Math.round(lift.lift * 100)}% more of a crowd at home games`;
}

export function traditionsView(state: GameState): TraditionsView | null {
  if (!hasDaily(state) || !state.traditions) return null;
  const slots = traditionSlots(state);
  const chosenList = state.traditions.chosen;
  if (slots === 0 && chosenList.length === 0) return null;
  const era = eraOf(state.goals!);
  const nextPlace = slots >= TRADITION_SLOTS ? '' : !state.traditions.began ? ' The first comes at commencement.' : ` The next comes with the ${ERAS[era + 1] ?? 'next'} era.`;
  const chosen: TraditionRow[] = chosenList.map((one) => {
    const spec = traditionSpec(one.id)!;
    const next = spec.day === 'rivalryGame' ? null : nextDay(state, spec.day);
    const holds = conditionHolds(state, spec.condition);
    return {
      id: spec.id,
      name: spec.name,
      when: spec.when,
      needs: spec.needs,
      holds,
      status: one.kept === 0 ? 'Not kept yet' : one.kept === 1 ? 'Kept once' : `Kept ${one.kept} times`,
      lifts: liftNow(state, spec, traditionShare(state, one)),
      next: next ? `In ${duration(next.at - state.clock.tick)}` : '',
      record: one.years.map(([year, kept]) => `Year ${year} ${kept ? '✓' : '–'}`).join(' · '),
    };
  });
  const choices: TraditionRow[] = traditionToChoose(state)
    ? TRADITIONS.filter((spec) => !chosenList.some((one) => one.id === spec.id)).map((spec) => ({
        id: spec.id,
        name: spec.name,
        when: spec.when,
        needs: spec.needs,
        holds: conditionHolds(state, spec.condition),
        status: '',
        lifts: liftFull(spec),
        next: '',
        record: '',
      }))
    : [];
  return { places: `${chosenList.length} of ${slots} ${slots === 1 ? 'place' : 'places'} taken.${nextPlace}`, chosen, choices };
}

/** The Goals page's button to it: with a note while a place waits. */
export function traditionsButton(state: GameState): string | null {
  const view = traditionsView(state);
  if (!view) return null;
  return traditionToChoose(state) ? 'Traditions · choose one' : 'Traditions';
}
