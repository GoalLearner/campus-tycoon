/**
 * Traditions (DESIGN.md 14.2, adapted and built in section 50). A campus
 * picks a few from this list as its slots open: the first at its first
 * commencement, then one with each era. Each has its day in the school year
 * and a standing condition read from what the campus has. On its day a
 * tradition whose condition holds is kept, and the paper says so. One that is
 * not met simply does not count that year: nothing is lost. Each lifts one
 * number the game already has, through the cause it belongs to, more the
 * more times it has been kept. Every size is [T].
 */
import type { CauseId } from './students';

/** The day of a school year a tradition is checked on. */
export type TraditionDay = 'opener' | 'homecoming' | 'rivalryEve' | 'rivalryGame' | 'fallFinals' | 'springFinals' | 'commencement';

/** What a tradition lifts, as one of the effects policies already use, at its fullest. */
export type TraditionLift = { kind: 'cause'; cause: CauseId; points: number } | { kind: 'exams'; points: number } | { kind: 'fans'; lift: number };

/** What must be so on its day. Each is read by one function in `systems/traditions.ts`. */
export type TraditionCondition = 'quadInSafety' | 'ownStadium' | 'fountainByPath' | 'always' | 'roadToStadium' | 'bellTower' | 'quadWithPath' | 'lateDiner';

export interface TraditionSpec {
  id: string;
  name: string;
  /** Its day, in words, for the card. */
  when: string;
  day: TraditionDay;
  condition: TraditionCondition;
  /** The condition, in words: what the campus keeps. */
  needs: string;
  lift: TraditionLift;
  /** What it lifts, in words. */
  lifts: string;
  /** The paper's line the day it is kept. `{n}` is the ordinal ("4th"), `{rival}` the rival, `{wins}` the home wins. */
  kept: string;
}

export const TRADITIONS: readonly TraditionSpec[] = [
  {
    id: 'lanternWalk',
    name: 'Rivalry Lantern Walk',
    when: 'The day of the rivalry',
    day: 'rivalryEve',
    condition: 'quadInSafety',
    needs: 'Six cells of quad inside a Campus Safety office’s reach',
    lift: { kind: 'cause', cause: 'safety', points: 2 },
    lifts: 'Safety & health',
    kept: 'The {n} Rivalry Lantern Walk: students carried paper lanterns across the quad to wish the team well against {rival}.',
  },
  {
    id: 'fightSong',
    name: 'Fight Song',
    when: 'The home opener',
    day: 'opener',
    condition: 'ownStadium',
    needs: 'A stadium of the campus’s own',
    lift: { kind: 'fans', lift: 0.04 },
    lifts: 'The crowd at home games',
    kept: 'The {n} singing of the Fight Song: the whole stadium joined in at the home opener.',
  },
  {
    id: 'luckyFountain',
    name: 'Lucky Fountain',
    when: 'Fall finals',
    day: 'fallFinals',
    condition: 'fountainByPath',
    needs: 'Founders’ Fountain, with a path beside it',
    lift: { kind: 'exams', points: 2 },
    lifts: 'Stress at finals',
    kept: 'The {n} Lucky Fountain: students dropped a coin in Founders’ Fountain for luck before their exams.',
  },
  {
    id: 'rivalryTrophy',
    name: 'Rivalry Trophy',
    when: 'The rivalry game',
    day: 'rivalryGame',
    condition: 'always',
    needs: 'Nothing: it is played for every year. It counts double while the campus holds the trophy',
    lift: { kind: 'fans', lift: 0.04 },
    lifts: 'The crowd at home games',
    kept: 'The {n} game for the Rivalry Trophy, against {rival}.',
  },
  {
    id: 'homecomingParade',
    name: 'Homecoming Parade',
    when: 'Homecoming',
    day: 'homecoming',
    condition: 'roadToStadium',
    needs: 'A road from a town street to the stadium',
    lift: { kind: 'cause', cause: 'life', points: 2 },
    lifts: 'Food & fun',
    kept: 'The {n} Homecoming Parade: the band led alumni and students from town to the stadium.',
  },
  {
    id: 'victoryBell',
    name: 'Victory Bell',
    when: 'The end of the football season',
    day: 'rivalryGame',
    condition: 'bellTower',
    needs: 'The Bell Tower, and a home win in the fall',
    lift: { kind: 'cause', cause: 'life', points: 2 },
    lifts: 'Food & fun',
    kept: 'The {n} season of the Victory Bell: it rang for {wins} this fall.',
  },
  {
    id: 'seniorWalk',
    name: 'Senior Walk',
    when: 'Commencement',
    day: 'commencement',
    condition: 'quadWithPath',
    needs: 'A quad of six cells or more, with a path beside it',
    lift: { kind: 'cause', cause: 'grounds', points: 2 },
    lifts: 'Grounds',
    kept: 'The {n} Senior Walk: the graduating class walked across the quad together before commencement.',
  },
  {
    id: 'midnightBreakfast',
    name: 'Midnight Breakfast',
    when: 'Spring finals',
    day: 'springFinals',
    condition: 'lateDiner',
    needs: 'A Late-night diner on campus',
    lift: { kind: 'exams', points: 2 },
    lifts: 'Stress at finals',
    kept: 'The {n} Midnight Breakfast: the staff of the Late-night diner served pancakes to students studying for finals.',
  },
];

/** The most traditions a campus keeps: one from its first commencement, and one with each of the three eras. */
export const TRADITION_SLOTS = 4;

/**
 * How much of its lift a tradition gives, by the times it has been kept: `kept / (kept + TRADITION_HALF)`. Kept once,
 * a quarter; three times, a half; nine times, three quarters. Diminishing, and never past the whole.
 */
export const TRADITION_HALF = 3;

/** The Rivalry Trophy gives its whole lift while the campus holds the trophy, and this share while it does not. */
export const TROPHY_AWAY_SHARE = 0.5;

/** A tradition whose day is this near, and whose condition does not hold, is said to be at risk, once. */
export const AT_RISK_HOURS = 60;

/** Cells of quad its conditions ask for. */
export const TRADITION_QUAD = 6;
