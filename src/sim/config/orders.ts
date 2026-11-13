import type { NeedId } from '../systems/capacity';

/**
 * The orders board (DESIGN.md 42.3 and 42.16 on): things to do, where the
 * Inbox is things to decide. Only a game with goals has it.
 *
 * Everything here is data. A giver is a voice and a line for the paper. A
 * kind of order is a number the game already has, how its target is set from
 * where the campus stands, how long it runs and what it pays. A new kind that
 * reads a number already listed in `systems/orders.ts` is one more entry
 * here, and so is a giver's new line.
 *
 * Bonus only: an order can never hurt a campus, missing one costs nothing,
 * and ignoring every one for ever is safe. Every size is [T].
 */

export type GiverId = 'advisors' | 'state' | 'town' | 'donors';

export interface GiverSpec {
  /** Who is asking, as the board names them. `{donor}` is the game's own made-up family. */
  name: string;
  /** As a sentence names them: "the town". */
  called: string;
  /** How often they give, against the others. */
  weight: number;
}

export const GIVERS: Record<GiverId, GiverSpec> = {
  advisors: { name: 'Your advisors', called: 'your advisors', weight: 3 },
  state: { name: 'The state', called: 'the state', weight: 2 },
  town: { name: 'The town', called: 'the town', weight: 3 },
  donors: { name: 'The {donor} family', called: 'the {donor} family', weight: 2 },
};

/** What an order pays. A new kind of reward is one more line here, and one place that pays it. */
export type OrderReward =
  | { kind: 'xp'; amount: number }
  | { kind: 'seals'; amount: number }
  | { kind: 'cash'; amount: number }
  /** A decoration of the town's own (DESIGN.md 42.5). Which one is fixed when the order is first seen. */
  | { kind: 'decor'; amount: number; id?: string };

/** The numbers an order may ask for. Each is read by one function in `systems/orders.ts`. */
export type OrderMetric =
  // Read from the campus as it stands, when somebody asks.
  | 'happiness'
  | 'safety'
  | 'life'
  | 'clean'
  | 'seats'
  | 'walkIn'
  | 'level'
  | 'rowOk'
  | 'rowHave'
  | 'rewardPlaced'
  // Counted from the moment the order was first seen.
  | 'trees'
  | 'quads'
  | 'furniture'
  | 'collects'
  | 'homeWins'
  | 'sellOuts'
  | 'crafts'
  | 'decorPlaced'
  // Measured once, at a point of the calendar.
  | 'graduates'
  | 'fullFall'
  | 'cleanIntake'
  | 'calmSemester'
  | 'semesterLeft';

/** A point of the calendar a season order runs to. */
export type OrderPoint = 'intake' | 'fallIntake' | 'graduation' | 'semesterEnd' | 'fallEnd';

/** What must be so for a kind to be offered. Each is one small check in `systems/orders.ts`. */
export type OrderWhen = 'rowNotOk' | 'rewardWaiting' | 'roomToPlant' | 'parkingNotOk' | 'streetNotWalking' | 'hasStadiumPlot' | 'collects' | 'readyToCollect' | 'seatsWanted' | 'homeGamesAhead' | 'workshopOpen';

export interface OrderKind {
  id: string;
  giver: GiverId;
  /** What it asks, as its title. `{n}` is the target, `{what}` the row or the building it is about, `{unit}` what a row counts. */
  title: string;
  /** The giver's own words. */
  ask: string;
  metric: OrderMetric;
  /**
   * How the target is set when the order is first seen.
   * `add`: where the number stands now, plus this (never asked past `most`).
   * `n`: a count from now. `share`: this share of the number that will be measured.
   * `scaled`: `add` is on the small campus's count.
   */
  target: { add?: number; most?: number; n?: number; share?: number; scaled?: true };
  /** A short order runs this many hours from when it is first seen. Never under 36. */
  hours?: number;
  /** A season order runs to the next such point of the calendar that is at least 36 hours away. */
  point?: OrderPoint;
  reward: readonly OrderReward[];
  /** True when it can be finished in one sitting: every step it needs is a tap that takes effect at once. */
  sitting?: true;
  when?: OrderWhen;
  /**
   * True when answering it means something with a yearly cost: a building to staff, a lot to teach in. It is
   * asked only while the campus keeps `ORDER_UPKEEP_KEPT` or more of every $100, so the board never talks a
   * campus out of the owner's money target.
   */
  upkeep?: true;
  /** True for the kind a giver falls back on when nothing else of theirs can be asked: it can always be offered. */
  always?: true;
}

const xp = (amount: number): OrderReward => ({ kind: 'xp', amount });
const seals = (amount: number): OrderReward => ({ kind: 'seals', amount });
/** A grant from the state, on the small campus's count. */
const grant = (amount: number): OrderReward => ({ kind: 'cash', amount });
/** One of the town's own decorations. Once the campus holds them all it is experience instead. */
const gift: OrderReward = { kind: 'decor', amount: 1 };

export const ORDER_KINDS: readonly OrderKind[] = [
  // ---- your advisors: what holds the campus back, with its fix. They pay experience.
  // The weakest line of the Capacity page, a step at a time: two in a hundred of what the students ask of it,
  // which one new lot or one building gives.
  { id: 'fixRow', giver: 'advisors', title: '{what}: reach {n} {unit}', ask: 'It is the weakest line on the Capacity page. The page says what would lift it.', metric: 'rowHave', target: { share: 0.02 }, hours: 48, reward: [xp(160)], sitting: true, when: 'rowNotOk', upkeep: true },
  { id: 'happier', giver: 'advisors', title: 'Lift Happiness to {n}', ask: 'The Happiness page names the biggest gap. Close a little of it.', metric: 'happiness', target: { add: 1, most: 90 }, hours: 48, reward: [xp(160)], sitting: true, upkeep: true },
  { id: 'safer', giver: 'advisors', title: 'Lift Safety & health to {n}', ask: 'More students inside the circle of a Medical Center or a Campus Safety office.', metric: 'safety', target: { add: 1, most: 90 }, hours: 48, reward: [xp(160)], sitting: true, upkeep: true },
  { id: 'fedAndBusy', giver: 'advisors', title: 'Lift Food & fun to {n}', ask: 'Somewhere to eat or something to do, nearer to where students live and study.', metric: 'life', target: { add: 1, most: 90 }, hours: 48, reward: [xp(160)], sitting: true, upkeep: true },
  { id: 'calmSemester', giver: 'advisors', title: 'End the semester with Stress at {n} or under', ask: 'Room in the classes, places to unwind and a library in reach all bring it down.', metric: 'calmSemester', target: { add: 1 }, point: 'semesterEnd', reward: [xp(300)], always: true },

  // ---- the state: seats, graduation, staying full. It pays a small grant.
  { id: 'moreSeats', giver: 'state', title: 'Have {n} seats', ask: 'The state counts seats. One more lecture hall would do it.', metric: 'seats', target: { add: 20, scaled: true }, hours: 48, reward: [grant(2000), xp(60)], sitting: true, when: 'seatsWanted', upkeep: true },
  { id: 'graduateClass', giver: 'state', title: 'Graduate {n} seniors this spring', ask: 'The state pays for degrees. Keep this class together to commencement.', metric: 'graduates', target: { share: 0.96 }, point: 'graduation', reward: [grant(4000), xp(100)], always: true },
  { id: 'stayFull', giver: 'state', title: 'Be full when the fall class moves in', ask: 'A full campus is what the state funds. Have every place taken on move-in day.', metric: 'fullFall', target: { n: 1 }, point: 'fallIntake', reward: [grant(4000), xp(100)] },
  { id: 'noWaitlist', giver: 'state', title: 'Turn nobody away for want of a bed or a seat', ask: 'When the next class moves in, have a bed and a seat for everyone you admit.', metric: 'cleanIntake', target: { n: 1 }, point: 'intake', reward: [grant(4000), xp(100)] },
  { id: 'keepStudents', giver: 'state', title: 'Lose no more than {n} students this semester', ask: 'The state funds the students who stay. Happiness is what keeps them.', metric: 'semesterLeft', target: { add: 0 }, point: 'semesterEnd', reward: [grant(4000), xp(100)] },

  // ---- the town: litter, parking, the avenue. It pays a decoration of its own, and a little experience.
  // A round of collecting, the order any campus can do for nothing, pays experience alone.
  { id: 'plantTrees', giver: 'town', title: 'Plant {n} trees', ask: 'The avenue looks bare from our side of it.', metric: 'trees', target: { n: 8 }, hours: 36, reward: [gift, xp(60)], sitting: true, when: 'roomToPlant', always: true },
  // Free, and there on any campus with somewhere to eat: asked when that many are ready, so it is done in one sitting.
  { id: 'collectRound', giver: 'town', title: 'Collect from {n} buildings', ask: 'The shops and the food places like to see the president come by.', metric: 'collects', target: { n: 6 }, hours: 36, reward: [xp(100)], sitting: true, when: 'readyToCollect' },
  { id: 'benches', giver: 'town', title: 'Set out {n} benches, tables or bins', ask: 'Somewhere to sit, and somewhere to put a wrapper.', metric: 'furniture', target: { n: 4 }, hours: 36, reward: [gift, xp(60)], sitting: true, when: 'roomToPlant' },
  { id: 'cleaner', giver: 'town', title: 'Bring the campus to {n}% clean', ask: 'Litter blows down the avenue. Bins beside where students eat, and workers to empty them.', metric: 'clean', target: { add: 3, most: 95 }, hours: 48, reward: [gift, xp(100)], upkeep: true },
  { id: 'parkingOk', giver: 'town', title: 'A parking space for every student who drives', ask: 'They park on our streets when the campus has no room. The Capacity page says how many spaces are short.', metric: 'rowOk', target: { n: 1 }, hours: 48, reward: [gift, xp(100)], when: 'parkingNotOk', upkeep: true },
  // The Workshop (DESIGN.md 42.6): one thing takes a day or two to make, so the town gives three days.
  { id: 'craftOne', giver: 'town', title: 'Make something at the Workshop', ask: 'The avenue is dressed for the season, and the town would like to see the campus join in.', metric: 'crafts', target: { n: 1 }, hours: 72, reward: [gift, xp(60)], when: 'workshopOpen' },

  // ---- donors: looks, football, landmarks. They pay Gold Seals: one for a short order and two for a season's,
  // which with the levels' own keeps a free player near a wait and a half a week (42.7, and 42.17).
  { id: 'layQuads', giver: 'donors', title: 'Lay {n} cells of quad', ask: 'Green between the buildings is what visitors remember. It lifts how the campus looks.', metric: 'quads', target: { n: 6 }, hours: 36, reward: [seals(1), xp(60)], sitting: true, when: 'roomToPlant' },
  { id: 'placeReward', giver: 'donors', title: 'Place {what}', ask: 'It was earned and it is waiting in the Build menu. We would like to see it stand.', metric: 'rewardPlaced', target: { n: 1 }, hours: 36, reward: [seals(1), xp(60)], sitting: true, when: 'rewardWaiting' },
  { id: 'levelUp', giver: 'donors', title: 'Reach University Level {n}', ask: 'A school on the move is one worth giving to.', metric: 'level', target: { add: 1 }, hours: 48, reward: [seals(1), xp(60)], always: true },
  { id: 'homeWin', giver: 'donors', title: 'Win {n} home games', ask: 'We have seats at the stadium and we would like something to cheer.', metric: 'homeWins', target: { n: 1 }, point: 'fallEnd', reward: [seals(2), xp(100)], when: 'homeGamesAhead' },
  { id: 'craftTwo', giver: 'donors', title: 'Make {n} things at the Workshop', ask: 'We like to see what the students can build with their own hands.', metric: 'crafts', target: { n: 2 }, hours: 96, reward: [seals(2), xp(100)], when: 'workshopOpen' },
  { id: 'sellOuts', giver: 'donors', title: 'Fill the stadium at {n} home games', ask: 'A full house looks well. The ticket price and a good team both fill seats.', metric: 'sellOuts', target: { n: 2 }, point: 'fallEnd', reward: [seals(2), xp(100)], when: 'homeGamesAhead' },
];

/** Which advisor speaks for each line of the Capacity page. */
export const ROW_ADVISOR: Record<NeedId, 'provost' | 'cfo' | 'athletics' | 'dean'> = {
  beds: 'dean',
  seats: 'provost',
  faculty: 'provost',
  dining: 'dean',
  recreation: 'dean',
  care: 'dean',
  parking: 'cfo',
  workers: 'cfo',
  staff: 'cfo',
};

/** What each line of the Capacity page counts, for an order about it: "reach 51,900 seats". */
export const ROW_UNIT: Record<NeedId, string> = {
  beds: 'beds',
  seats: 'seats',
  faculty: 'faculty',
  dining: 'meals an hour',
  recreation: 'places to play',
  care: 'students covered',
  parking: 'spaces',
  workers: 'workers',
  staff: 'staff',
};

/**
 * The most cash orders pay in one school year, on the small campus's count:
 * three of the state's larger grants. Past it a grant pays its experience
 * alone until the next fall. It keeps the cash far inside the room the
 * owner's money target leaves, however the board is played (42.17).
 */
export const ORDER_CASH_YEAR = 12_000;

/**
 * An order that means a yearly cost is asked only while the campus keeps this much or more of every $100: the
 * upper half of the owner's $12 to $17. At 14 the keenest test player was talked down to $10.60.
 */
export const ORDER_UPKEEP_KEPT = 15;

/** A kind of order the player dismissed is not asked again for this many hours. */
export const ORDER_REST_HOURS = 7 * 24;

/** Orders open at once to begin with. Levels add to it: see `LEVEL_UNLOCKS`. */
export const ORDER_SLOTS = 3;

/**
 * One new order each real day. And on a day whose new order is a long one,
 * with nothing else on the board that can be finished in one sitting, a
 * second comes with it that can: so the board never opens with nothing to do
 * today (42.3, and 42.18 for why both lines of it could not hold as written).
 * False leaves it at one a day and no promise.
 */
export const ORDER_SECOND_FOR_TODAY = true;

/** No window is shorter than this, whatever a kind says: once a day is the slowest rhythm the game supports. */
export const ORDER_LEAST_HOURS = 36;

/** How many marks of the calendar are kept for the season orders to read. */
export const ORDER_MARKS_KEPT = 12;

/** A home game counts as a full house from this share of the seats. */
export const SELL_OUT_SHARE = 0.95;
