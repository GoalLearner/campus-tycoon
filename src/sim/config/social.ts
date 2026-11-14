/**
 * The social campus, tunables (DESIGN.md section 62). Named regulars and the
 * ties between them: friends, a best friend, a friend group with a vibe, a
 * roommate, a crush or a partner, a rival, an ex. They form from what students
 * share and from time spent together, and fade without contact.
 *
 * Time here is real time, as the Main Character's is: a game year is a real
 * week, so a friendship forms over hours and fades over days.
 */
import { TICKS_PER_HOUR } from './time';

/** How often the regulars' lives are stepped: once a real hour. */
export const SOCIAL_STEP = TICKS_PER_HOUR;

/** Named regulars in each entering class (DESIGN.md 13.5's [T]). Picked from the first students of the class, who stay. */
export const REGULARS_PER_CLASS = 8;
/** Regulars come from the students who entered first, so they are rarely the ones who leave. */
export const REGULAR_POOL = 120;
/** The most regulars at once, the Main Character's people included. */
export const REGULARS_MOST = 48;

/** What each thing two students share adds to the chance they spend an hour together. */
export const SHARED = {
  year: 0.5,
  dorm: 1.2,
  major: 0.7,
  field: 0.25,
  club: 1.4,
  team: 1.4,
  chapter: 1.4,
} as const;
/** A roommate is with them most of the time; the bond itself pulls friends together. */
export const ROOMMATE_PULL = 2.6;
export const BOND_PULL = 1 / 35;
/** The base chance of an hour together for each point of what they share, before the campus and the hour. */
export const CONTACT_RATE = 0.045;
/** How much the campus's social life moves that: a campus with nowhere to go halves it, a lively one adds half. */
export const CAMPUS_LOW = 0.5;
export const CAMPUS_HIGH = 1.5;
/** The hour of the player's day moves it too: busiest in the evening, and nobody meets anyone asleep. */
export const HOUR_PULL: ReadonlyArray<readonly [number, number, number]> = [
  // from, to (hours after waking), share
  [0, 2, 0.6],
  [2, 9, 0.8],
  [9, 13, 1.4],
  [13, 16, 0.5],
  [16, 24, 0],
];

/** What an hour together does to a tie, in points: friends grow closer, a sore pair sorer. */
export const GROW = 7;
/** A first meeting is this close; friends at this; a best friend at this, the closest of them. */
export const MET_AT = 8;
export const FRIEND_AT = 30;
export const BEST_AT = 70;
/** A pair this far apart in nature grows sore, not close: past this they are rivals. */
export const CLASH_BELOW = 0.22;
export const RIVAL_AT = 35;
/** Points lost each real day without an hour together. Friends drift slowly, acquaintances fast. */
export const FADE_PER_DAY = { met: 6, friend: 3, crush: 4, partner: 2, rival: 4, ex: 5, roommate: 0 } as const;
/** An acquaintance or an ex this faint is forgotten. */
export const FORGET_BELOW = 4;

/** Romance (13+, DESIGN.md 52): a crush comes from a rare spark between two single friends; it can become a date. */
export const SPARK_ABOVE = 0.88;
export const CRUSH_FROM = 18;
export const ASK_OUT_AT = 52;
/** The chance in each evening hour together that a crush this close asks the other out, and that it is a yes. */
export const ASK_CHANCE = 0.18;
export const YES_SHARE = 0.65;
/** A partner tie this faint ends, and each real day any couple has this small chance of ending. */
export const BREAKUP_BELOW = 28;
export const BREAKUP_PER_DAY = 0.012;
/** An ex is this sore at first, and is avoided: their hours together are this share of what they would be. */
export const EX_AT = 30;
export const EX_AVOID = 0.15;
/** Rivals still run into each other. */
export const RIVAL_MEET = 0.6;

/** Talks kept for today on each regular. */
export const TALKS_KEPT = 8;
/** Things that happened between regulars lately, kept for the cards. */
export const NEWS_KEPT = 40;

/** Friend groups: three to six friends at least this close, and the vibe of the most of them. */
export const GROUP_AT = 38;
export const GROUP_MOST = 6;

export type VibeId = 'athletes' | 'studyCrew' | 'partyGroup' | 'theatreKids' | 'gamers' | 'musicians' | 'greek' | 'quiet' | 'mixed';

/** A group's vibe, how it is named on a card, and the kind of place it hangs out. */
export const VIBES: Record<VibeId, { name: string; hangout: string }> = {
  athletes: { name: 'the athletes', hangout: 'on a court or a field' },
  studyCrew: { name: 'the study crew', hangout: 'somewhere to study' },
  partyGroup: { name: 'the party group', hangout: 'wherever the party is' },
  theatreKids: { name: 'the theatre kids', hangout: 'on the quad, rehearsing' },
  gamers: { name: 'the gamers', hangout: 'in someone’s room, playing' },
  musicians: { name: 'the music crowd', hangout: 'on the quad with a guitar' },
  greek: { name: 'the chapter crowd', hangout: 'at the chapter house' },
  quiet: { name: 'the quiet ones', hangout: 'somewhere quiet' },
  mixed: { name: 'a mixed crowd', hangout: 'over food' },
};

/** What two students talk about, by how they stand: friends laugh, rivals argue, a crush is awkward, exes avoid. */
export type TalkTone = 'met' | 'laughed' | 'studied' | 'ate' | 'argued' | 'awkward' | 'date' | 'avoided' | 'roommate';

/** What rivals argue about: small things, never cruel (DESIGN.md 62). */
export const ARGUMENTS = ['the dishes', 'a game', 'a seat', 'the thermostat', 'whose turn it was', 'a group project', 'the music'] as const;
