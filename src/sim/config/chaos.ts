/**
 * [T] The chaos sandbox, stop C1 (DESIGN.md 68): the Chaos meter, the incidents the levers set going, and what chaos
 * costs and gives. Every number is a tuning target, checked in the long run: the usual players sit Calm to Lively, a
 * campus run for Pandemonium gets there, and every one recovers once the levers are put back.
 *
 * Tone (DESIGN.md 16, 52.2, and the owner's limits for chaos): comic words on screen. A dust-up is a cloud of dust and
 * stars, never a drawn punch; nobody is hurt worse than a bruise; no weapons, no fire, nothing graphic; protests are
 * about campus things only; the paper never mocks a student.
 */

/**
 * The kinds of chaos the meter counts. Calls from parties are the party calls of DESIGN.md 55. Football's (C3, DESIGN.md
 * 77): goalposts carried off after a field storming, couches in the street, and the rival's mascot kidnapped.
 */
export type ChaosKind = 'dustUp' | 'shouting' | 'prank' | 'graffiti' | 'protest' | 'party' | 'goalposts' | 'street' | 'mascot';
export const CHAOS_KINDS: readonly ChaosKind[] = ['dustUp', 'shouting', 'prank', 'graffiti', 'protest', 'party', 'goalposts', 'street', 'mascot'];
/** The kinds that begin as an incident at a building, with Campus Safety on its way (68.1). */
export type IncidentChaosKind = 'dustUp' | 'shouting' | 'prank' | 'graffiti' | 'protest';

/** The meter's six steps, from 0 to 100, and where each begins. */
export const CHAOS_STEPS = ['Serene', 'Calm', 'Lively', 'Rowdy', 'Chaotic', 'Pandemonium'] as const;
export type ChaosStep = (typeof CHAOS_STEPS)[number];
export const CHAOS_FROM: readonly number[] = [0, 8, 20, 36, 55, 75];
/** The step from which the trustees write, and headlines cost applicants. */
export const ROWDY = 3;

/**
 * What one of each, in a game week, for every thousand students as the small game counts them, adds to the meter. The
 * web's drama (breakups, rivals, students picked on) adds this much for each share of students in it.
 */
export const CHAOS_WEIGHT: Readonly<Record<ChaosKind, number>> = { dustUp: 12, shouting: 5, prank: 6, graffiti: 8, protest: 16, party: 6, goalposts: 10, street: 8, mascot: 6 };
/** One nobody came to weighs this much more: it lingers, and everyone sees it. */
export const MISSED_EXTRA = 0.6;
export const DRAMA_WEIGHT = 60;
/** Each game week the meter moves this share of the way to the week's reading: one wild night does not swing it. */
export const CHAOS_SMOOTH = 0.45;

/**
 * Chance at each incident check, for every thousand students, at a tension of 1 (DESIGN.md 68.2). Dust-ups, pranks and
 * graffiti have free rein where Campus Safety does not reach the dorms: from a quarter of the rate with every dorm
 * reached to twice it with none.
 */
export const CHAOS_RATE: Readonly<Record<IncidentChaosKind, number>> = { dustUp: 0.1, shouting: 0.12, prank: 0.08, graffiti: 0.06, protest: 0.06 };
export const FREE_REIN = { reached: 0.25, none: 2 } as const;
/** No more chaos incidents than this at once, apart from the incidents of before, so they never crowd them out. */
export const MAX_ACTIVE_CHAOS = 4;
/** A protest lasts this long, in ticks, and has no responder: the students say their piece and go home. */
export const PROTEST_TICKS = 90;

/**
 * Tension: how short tempers are, read once a game week. 1 on a middling campus; more with Stress, low Happiness, dorms
 * Campus Safety does not reach, students waiting for a bed, and drama; never below or above these.
 */
export const TENSION = { base: 0.5, stress: 0.35, unhappy: 0.6, uncovered: 0.6, waiting: 3, drama: 4, least: 0.3, most: 3 } as const;
/** On a home game day dust-ups and shouting matches are this many times as likely; in rivalry week, pranks. */
export const GAME_DAY_TEMPER = 2;
/** On the rivalry game day at home, tempers run higher still (C3, DESIGN.md 77.1). */
export const RIVALRY_TEMPER = 3;
export const RIVALRY_PRANKS = 3;

/** A protest's topics, campus things only (the owner's answer 11), and what each asks for. */
export type ProtestTopic = 'beds' | 'food' | 'parking' | 'policy';

/** Painting over graffiti costs this much each, in the small game, times the campus scale. */
export const GRAFFITI_BILL = 2_000;

/**
 * Bad headlines from a Rowdy week or worse: applicants' reach down this much for each step past Lively, fading over
 * this many game weeks. Spirit's headline ("Most Spirited Campus") lifts it. All of it together never past CHAOS_REACH_MOST.
 */
export const HEADLINE_REACH = 0.005;
export const SPIRIT_REACH = 0.01;
export const CHAOS_REACH_MOST = 0.02;
export const REACH_FADE_WEEKS = 3;

/**
 * Good chaos (the owner's answer 7): on a Lively campus that is happy and looked after, a week can bring a legendary
 * night: spirit lifts Happiness a little for some real days and reach a little, at most once a real day.
 */
export const SPIRIT = { chance: 0.12, happiness: 2, days: 2, least: 65 } as const;

/**
 * The trustees' letters (the owner's answer 6): after two Rowdy readings in a row, one ask, to bring the meter below
 * Rowdy within two real days. Met, a small reward; ignored, a small dip in Reputation for some game weeks. One letter
 * at a time, and a rest between.
 */
export const LETTER = { days: 2, rest: 1, reward: 40_000, dip: 2, dipWeeks: 10 } as const;

/**
 * [T] Football chaos, stop C3 (DESIGN.md 77). Every number is checked in the long run: the usual players stay Calm to
 * Lively, and every effect is capped and fades (the owner's answer 8).
 *
 * - Goalposts: after a field storming (a big home win at the campus's own stadium), the chance they come down and are
 *   carried off, by whether Campus Safety reaches the stadium; and what new ones cost, in the small game, times the
 *   campus scale.
 * - Street celebrations: after a big win, or a loss in the rivalry, the chance of couches dragged into the street outside
 *   a dorm (never burned), at a tension of 1 and with no Campus Safety near the halls; how long after the whistle they
 *   start and how long they last, in ticks; and hauling the couches back.
 * - The rival's mascot: in rivalry week, the chance at each incident check that students take it, by free rein; and how
 *   long until Campus Safety drives it home, in ticks.
 */
export const FOOTBALL_CHAOS = {
  goalposts: { reached: 0.15, none: 0.7 },
  goalpostBill: 25_000,
  street: { win: 0.4, rivalryLoss: 0.55, reached: 0.35, after: 45, lasts: 90 },
  couchBill: 3_000,
  mascot: { chance: 0.02, homeReached: 60, homeNone: 240 },
} as const;
