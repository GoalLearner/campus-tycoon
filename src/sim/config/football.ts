import type { CalDate } from './academicCalendar';
import { TICKS_PER_HOUR } from './time';

/**
 * Football and the national field (DESIGN.md sections 10 and 11). Everything
 * marked [T] is a tuning value.
 *
 * Every name here is invented. School names are built from two made-up halves
 * of a place name and a pattern, checked against a blocklist. Nicknames,
 * conferences and bowls are plain words chosen to belong to no real school,
 * conference or game.
 */

// ---------------------------------------------------------- the field --

/** Schools in the field, the player's among them. */
export const FIELD_SIZE = 200;
/** Ratings run from 0 to 100, and the field's average is held here so it is never a treadmill. */
export const FIELD_MEAN = 50;
export const FIELD_SPREAD = 14;
export const RATING_MIN = 8;
export const RATING_MAX = 96;
/** [T] Each year a rating is pulled this far back toward its pedigree, and knocked about by up to this much. */
export const DRIFT_PULL = 0.25;
export const DRIFT_SHOCK = 4;
/** [T] A school starts a steady rise or fall this often, for this many years, by this much a year. */
export const ARC_CHANCE = 0.08;
export const ARC_YEARS = [2, 4] as const;
export const ARC_STEP = 2.5;
/** [T] Pedigree itself drifts very slowly. */
export const PEDIGREE_DRIFT = 0.4;

/** Invented place names: one start and one end. */
export const PLACE_STARTS: readonly string[] = [
  'Lark', 'Thistle', 'Wren', 'Quill', 'Tansy', 'Sorrel', 'Lumen', 'Pippin', 'Briar', 'Juniper',
  'Finch', 'Clover', 'Bramble', 'Heron', 'Otter', 'Plover', 'Sedge', 'Larch', 'Tarn', 'Fennel',
  'Marrow', 'Dapple', 'Linnet', 'Yarrow', 'Curlew', 'Teasel', 'Vetch', 'Whin', 'Kestrel', 'Mallow',
];
export const PLACE_ENDS: readonly string[] = [
  'mere', 'wick', 'combe', 'croft', 'stead', 'shaw', 'holt', 'dene', 'thorpe', 'garth',
  'beck', 'fell', 'hythe', 'wold', 'ness', 'haven',
];
/** `{p}` is the place. The plain forms are the commonest. */
export const SCHOOL_PATTERNS: ReadonlyArray<readonly [string, number]> = [
  ['{p} University', 5],
  ['{p} State', 5],
  ['University of {p}', 4],
  ['{p} College', 2],
  ['{p} Tech', 2],
  ['Northern {p}', 1],
  ['Southern {p}', 1],
  ['Eastern {p}', 1],
  ['Western {p}', 1],
  ['{p} Institute', 1],
];
/**
 * The second line of defence: a made-up place that happens to be the name of
 * a real school is thrown away and made again. Lower case, the place alone.
 */
export const NAME_BLOCKLIST: readonly string[] = [
  'rowan', 'ashford', 'ashland', 'stanford', 'oxford', 'bradford', 'stonehill', 'clemson', 'harvard', 'yale',
  'princeton', 'auburn', 'baylor', 'marshall', 'tulane', 'purdue', 'drake', 'butler', 'bryant', 'wofford',
  'furman', 'mercer', 'stetson', 'elon', 'bucknell', 'lehigh', 'colgate', 'hofstra', 'fordham', 'marist',
  'siena', 'radford', 'longwood', 'winthrop', 'samford', 'belmont', 'lipscomb', 'larkspur', 'brookhaven', 'lakehaven',
];
/** Team nicknames. Whimsical on purpose: none is the well-known name of a real team. */
export const NICKNAMES: readonly string[] = [
  'Herons', 'Otters', 'Kingfishers', 'Marmots', 'Newts', 'Puffins', 'Hedgehogs', 'Moths', 'Lanterns', 'Millers',
  'Ferrymen', 'Weavers', 'Coopers', 'Larks', 'Stoats', 'Voles', 'Dippers', 'Plovers', 'Wrens', 'Finches',
  'Mayflies', 'Thistles', 'Acorns', 'Pinecones', 'Lamplighters', 'Bellringers', 'Clockmakers', 'Mapmakers', 'Gardeners', 'Beekeepers',
  'Stargazers', 'Tailors', 'Bakers', 'Glassblowers', 'Kites', 'Shepherds', 'Tinkers', 'Swifts', 'Sandpipers', 'Dormice',
];
export const CONFERENCE_NAMES: readonly string[] = ['Tarn Valley', 'Greywater', 'Long Meadow', 'Seven Rivers', 'High Moor', 'Lantern Coast'];
export const DIVISION_NAMES = ['North', 'South'] as const;
/** The bowls, best first. The first is the national title game. */
export const BOWLS = ['Founders Bowl', 'Lantern Bowl', 'Clocktower Bowl', 'Mill Pond Bowl'] as const;

/** First names and surname halves for coaches. Surnames are built the way student surnames are. */
export const COACH_FIRST: readonly string[] = ['Dana', 'Lou', 'Pat', 'Chris', 'Terry', 'Jo', 'Sandy', 'Lee', 'Robin', 'Gale', 'Marty', 'Sal', 'Frankie', 'Ronnie', 'Val', 'Bernie'];
export const COACH_STARTS: readonly string[] = ['Hale', 'Brock', 'Tull', 'Mast', 'Garr', 'Pell', 'Stan', 'Whit', 'Dunn', 'Crane', 'Holt', 'Barr'];
export const COACH_ENDS: readonly string[] = ['wick', 'ridge', 'stock', 'low', 'more', 'well', 'by', 'combe'];

// ------------------------------------------------------- the conference --

export const CONFERENCE_SIZE = 12;
export const DIVISION_SIZE = 6;
/** [T] Rivals are drawn from this band of the field by football pedigree: not the giants, not the weakest. */
export const CONFERENCE_BAND = [0.25, 0.8] as const;

/**
 * The ten Saturdays of the regular season (DESIGN.md 4.8), and whether the
 * player's team is at home. Home games fall in waking hours and away games
 * overnight. The last is the rivalry, at home in odd years.
 */
export const SLOTS: ReadonlyArray<{ date: CalDate; home: boolean | 'rivalry'; label?: string }> = [
  { date: [9, 5, 0], home: true, label: 'Home opener' },
  { date: [9, 12, 0], home: true },
  { date: [9, 19, 0], home: false },
  { date: [9, 26, 0], home: false },
  { date: [10, 10, 0], home: true },
  { date: [10, 24, 0], home: true, label: 'Homecoming' },
  { date: [10, 31, 0], home: true },
  { date: [11, 14, 0], home: false },
  { date: [11, 21, 0], home: false },
  { date: [11, 28, 0], home: 'rivalry', label: 'The rivalry' },
];
export const HOMECOMING_SLOT = 5;
export const RIVALRY_SLOT = 9;
/** What each slot is: the opener against a school from outside, a division game, or a crossover. */
export const SLOT_KINDS: ReadonlyArray<'opener' | 'division' | 'cross'> = ['opener', 'cross', 'division', 'cross', 'division', 'cross', 'division', 'cross', 'division', 'division'];
/**
 * The five rounds in which six teams each meet the other five once. Round 0
 * pairs the rivals and is played last.
 */
export const DIVISION_ROUNDS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 1], [2, 3], [4, 5]],
  [[0, 2], [1, 4], [3, 5]],
  [[0, 3], [1, 5], [2, 4]],
  [[0, 4], [1, 3], [2, 5]],
  [[0, 5], [1, 2], [3, 4]],
];
export const TITLE_DATE: CalDate = [12, 5, 0];
export const BOWL_DATE: CalDate = [12, 26, 0];
export const TOP_BOWL_DATE: CalDate = [1, 18, 1];
/** A game is forty real minutes, shown a quarter at a time. */
export const GAME_TICKS = 40;
export const QUARTER_TICKS = 10;
/** The founding scrimmage kicks off this long after the first class moves in, if the founding day is at least this long. */
export const SCRIMMAGE_AFTER_TICKS = 2 * TICKS_PER_HOUR;
export const SCRIMMAGE_MIN_FOUNDING_TICKS = 5 * TICKS_PER_HOUR;

// ------------------------------------------------------------ the team --

/** rating = coach, roster, stadium and funding, by these weights. All four are on the field's 0 to 100. */
export const RATING_WEIGHTS = { coach: 0.35, roster: 0.35, stadium: 0.15, funding: 0.15 } as const;
/** Until the Athletics slider exists (layer 2), funding is full. */
export const FUNDING_FULL = 100;
/** [T] pWin = 1 / (1 + exp(-diff / K)): a ten-point edge wins about three games in four. */
export const WIN_K = 10 / Math.log(3);
/** [T] Points the home team is worth. */
export const HOME_EDGE = 3;
/** [T] A new programme's first four signing classes. */
export const FOUNDING_CLASSES: readonly number[] = [30, 32, 34, 36];
/** [T] A signing class: this base, plus these shares of standing, the coach and the stadium, plus a winning record. */
export const CLASS_BASE = 16;
export const CLASS_FROM = { standing: 0.3, coach: 0.25, stadium: 0.1, wins: 12, funding: 5 } as const;
export const CLASS_NOISE = 4;
/** [T] Chasing a star: it comes off this often, more with standing, and is worth this much either way. */
export const STAR_CHANCE = { base: 0.3, perStanding: 0.004, most: 0.6 } as const;
export const STAR_GAIN = 10;
export const STAR_MISS = -5;

export type CoachTrait = 'recruiter' | 'tactician' | 'developer' | 'showman';
export const TRAITS: Record<CoachTrait, { name: string; effect: string }> = {
  recruiter: { name: 'Recruiter', effect: 'Signing classes are 4 points better' },
  tactician: { name: 'Tactician', effect: 'Worth 2 more points on game day' },
  developer: { name: 'Developer', effect: 'The roster plays 3 points above its talent' },
  showman: { name: 'Showman', effect: 'A tenth more fans want tickets' },
};
export const TRAIT_BONUS = { recruiter: 4, tactician: 2, developer: 3, showman: 0.1 } as const;
/** [T] A coach's pay for a year: this for every point of rating above 20, and never less than the floor. */
export const COACH_PAY_PER_POINT = 4_500;
export const COACH_PAY_FLOOR = 80_000;
/** [T] The founding coach, and how long a first contract and an extension run. */
export const FOUNDING_COACH_RATING = 42;
export const CONTRACT_YEARS = 3;
/** [T] Candidates offered when a coach is replaced: this many, around the programme's level by this much. */
export const COACH_CANDIDATES = 3;
export const CANDIDATE_SPREAD = 14;
/** [T] A coach who is kept on improves by up to this much a year, or slips by one. */
export const COACH_GROWTH = 2;

// ---------------------------------------------------------- the stadium --

export const MAX_TIER = 5;
/** Seats by tier. Tier 0 is the rented field in town. */
export const SEATS: readonly number[] = [3_000, 8_000, 16_000, 28_000, 45_000, 70_000];
/** [T] What each tier costs to build, and how long the work takes once approved. */
export const TIER_COST: readonly number[] = [0, 1_200_000, 4_000_000, 10_000_000, 22_000_000, 45_000_000];
export const TIER_BUILD_TICKS: readonly number[] = [0, 24, 30, 36, 48, 60].map((hours) => hours * TICKS_PER_HOUR);
/** [T] Rent for the field in town, and upkeep and utilities for each tier, a year. */
export const FIELD_RENT = 20_000;
export const STADIUM_UPKEEP: readonly number[] = [0, 90_000, 220_000, 480_000, 950_000, 1_800_000];
export const STADIUM_UTILITIES: readonly number[] = [0, 40_000, 90_000, 180_000, 340_000, 620_000];
/** [T] The stadium's part of the team rating, by tier. */
export const TIER_SCORE: readonly number[] = [0, 20, 40, 60, 80, 100];
/** A tier is earned by a season whose home games averaged this share of the seats. */
export const SELL_OUT = 0.95;
/** The five ticket prices, and how many of the fans who would come at the middle price come at each. */
export const TICKET_PRICE: readonly number[] = [5, 9, 14, 20, 28];
export const PRICE_DEMAND: readonly number[] = [1.4, 1.18, 1, 0.82, 0.66];
export const DEFAULT_PRICE_STEP = 2;
/**
 * [T] Who wants a ticket at the middle price: this share of students and of
 * alumni, and fans from the region: for every point of athletic standing,
 * this many for each student, so a bigger school has a bigger following. A
 * winning streak of up to five adds a little, and Homecoming and the rivalry
 * draw a quarter more.
 */
export const FANS = { students: 0.45, alumni: 0.08, perStandingPerStudent: 0.08, streak: 0.04, bigGame: 1.25 } as const;
/** [T] Each fan through the gate spends this on food and a shirt, on top of the ticket. */
export const CONCESSIONS_PER_FAN = 3;
/** Home games in a season, for the yearly rate of ticket income: five, and the rivalry every other year. */
export const HOME_GAMES_PER_YEAR = 5.5;
/** [T] How far the noise of a home crowd carries, in cells from the plot's edge, by tier. 0 is the rented field. */
export const NOISE_RADIUS: readonly number[] = [0, 2, 3, 4, 5, 6];
/** [T] How much of the Grounds cause a dorm at the stadium's wall loses to noise. It fades to nothing at the radius. */
export const NOISE_WEIGHT = 0.5;

// -------------------------------------------------------------- money --

/**
 * [T] Football is never a fixed overhead: like every other cost it follows the
 * size of the school (DESIGN.md 31), so a small campus is not sunk by it.
 *
 * Athletics staff: assistants, trainers and an athletic director. One for
 * every so many students, and never fewer than a stadium of each tier needs.
 */
export const STUDENTS_PER_ATHLETICS_STAFF = 400;
export const ATHLETICS_STAFF: readonly number[] = [0, 5, 10, 16, 24, 34];
export const ATHLETICS_STAFF_PAY = 58_000;
/** [T] Operations: travel, kit and game days. So much a student, and never less than a stadium of each tier costs to run. */
export const OPERATIONS_PER_STUDENT = 40;
export const ATHLETICS_OPERATIONS: readonly number[] = [0, 120_000, 350_000, 800_000, 1_600_000, 3_000_000];
/** [T] A school of fewer students than this pays its head coach a share of the going rate, by its size. */
export const COACH_FULL_PAY_STUDENTS = 1_000;
/** [T] The rented field costs so much a student, up to the full rent. */
export const FIELD_RENT_PER_STUDENT = 20;
/** [T] The TV and conference deal a year, by stadium tier: none until there is a stadium. */
export const TV_BASE: readonly number[] = [0, 150_000, 500_000, 1_400_000, 3_200_000, 6_500_000];
/** A safe deal runs this long at the base. A bet runs half as long and pays by last season's wins. */
export const TV_SAFE_YEARS = 4;
export const TV_BET_YEARS = 2;
export const TV_BET = { floor: 0.7, perWin: 0.07 } as const;
/** The default: the deal rolls one year at a little less. */
export const TV_ROLL = 0.92;
/** [T] A home game day lifts what food places earn by this much while it lasts, from an hour before kickoff. */
export const GAME_DAY_FOOD = 2.5;
export const GAME_DAY_BEFORE_TICKS = 60;
/** [T] Applications rise by up to this share at the top of the athletic standing, and a TV deal adds a little. */
export const STANDING_LIFT = 0.12;
export const TV_LIFT = 0.02;
/** [T] Athletic standing moves this far toward each season's result. */
export const STANDING_PULL = 0.4;
/** [T] The standing a season is worth: wins, a title, a bowl and where the poll put the team. */
export const SEASON_STANDING = { perWin: 5, title: 12, bowl: 6, bowlWin: 6, top25: 14, base: 5 } as const;

// ------------------------------------------------------------- colours --

/** School colours the player can choose. Each is a name and the colour of a fan's tint on the map. */
export const SCHOOL_COLOURS: ReadonlyArray<{ id: string; name: string; hex: number }> = [
  { id: 'crimson', name: 'Crimson', hex: 0xc0392b },
  { id: 'navy', name: 'Navy', hex: 0x2c4a8a },
  { id: 'forest', name: 'Forest green', hex: 0x2e7d4f },
  { id: 'gold', name: 'Gold', hex: 0xe0a82e },
  { id: 'purple', name: 'Purple', hex: 0x7b4bb0 },
  { id: 'orange', name: 'Orange', hex: 0xe07a2e },
  { id: 'teal', name: 'Teal', hex: 0x1f8f8f },
  { id: 'maroon', name: 'Maroon', hex: 0x7a2238 },
];
export const DEFAULT_COLOUR = 'navy';

// ---------------------------------------------------------- personalities --

/** [T] Varsity Athletes: the roster, as a share of students, never more than this many. */
export const ROSTER_SIZE = 90;
/** [T] Superfans: this share of students at no standing, up to this at the top, doubled on a home game day and after a big win. */
export const SUPERFAN_SHARE = { floor: 0.02, top: 0.1 } as const;
/** [T] Each Superfan in a hundred students lifts ticket demand a little. */
export const SUPERFAN_ATTENDANCE = 0.5;
