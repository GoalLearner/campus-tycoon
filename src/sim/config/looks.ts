/**
 * Who each figure in a people pack looks like (DESIGN.md 69.3, the owner's play feedback of builds 33-34): "The genders
 * are all wrong ... make sure the name and genders align correctly", and "We don't need so many hijabs in the game".
 * Every look is tagged by gender as drawn (a beard or moustache is masculine; long hair, a bob, a bun or a flower
 * feminine; the rest either; each looked over at eight to sixteen times its size, 2026-11-15), by what it is for (a student, an athlete, a member of staff in uniform, an older person), and by a
 * religious head covering if it has one. Figures are picked from these tags everywhere a person is drawn.
 */

/** Drawn as a woman, a man, or either. */
export type LookGender = 'f' | 'm' | 'x';
/**
 * What a look is for: everyday students, the varsity in their kit, staff in a uniform, the town's neighbours, older
 * people (parents). Only the crowd's looks have the seated, sleeping and face drawings a student needs, so a look past
 * the crowd is never a student's.
 */
export type LookUse = 'student' | 'athlete' | 'uniform' | 'town' | 'older';

export interface LookTag {
  g: LookGender;
  use: LookUse;
  /** A religious head covering, kept at a real campus's share and never tied to how anyone behaves. */
  cover?: 'hijab' | 'turban';
  /** What it shows, for the page and the tests. */
  what: string;
}

/**
 * The Penzilla people pack, in the order its recipe lists them (art/recipes/penzilla.json). The first twelve are
 * everyday students; the four in helmets are the varsity's; the rest are staff in their uniform, the two neighbours of
 * the town and the older faces of parents.
 */
const PENZILLA: readonly LookTag[] = [
  { g: 'f', use: 'student', what: 'hair in a bun with a flower' },
  { g: 'x', use: 'student', what: 'a bucket hat' },
  { g: 'f', use: 'student', what: 'a ponytail and a headband' },
  { g: 'm', use: 'student', what: 'glasses, a bobble hat and a beard' },
  { g: 'f', use: 'student', cover: 'hijab', what: 'a pink hijab' },
  { g: 'f', use: 'student', cover: 'hijab', what: 'a dark headscarf' },
  { g: 'm', use: 'student', cover: 'turban', what: 'a grey turban and a beard' },
  { g: 'm', use: 'student', cover: 'turban', what: 'an orange turban and a beard' },
  { g: 'm', use: 'student', what: 'spiky grey hair and a beard' },
  { g: 'x', use: 'student', what: 'a blue crest' },
  { g: 'x', use: 'student', what: 'curly white hair' },
  { g: 'x', use: 'student', what: 'a green bowl cut' },
  { g: 'x', use: 'athlete', what: 'a blue helmet' },
  { g: 'x', use: 'athlete', what: 'an orange helmet' },
  { g: 'x', use: 'athlete', what: 'a blue helmet' },
  { g: 'x', use: 'athlete', what: 'an orange helmet' },
  { g: 'f', use: 'uniform', what: 'a teacher’s hat (professor)' },
  { g: 'm', use: 'uniform', what: 'a waiter (advisor)' },
  { g: 'x', use: 'uniform', what: 'a bellhop’s cap (tour guide)' },
  { g: 'f', use: 'uniform', what: 'a chef’s hat (dining)' },
  { g: 'm', use: 'uniform', what: 'a bus driver’s cap (store clerk)' },
  { g: 'm', use: 'uniform', what: 'a top hat (booster)' },
  { g: 'x', use: 'uniform', what: 'a mail carrier’s cap (driver)' },
  { g: 'm', use: 'town', what: 'a trucker cap and a red beard (a neighbour)' },
  { g: 'f', use: 'town', what: 'a red cap and long hair (a neighbour)' },
  { g: 'f', use: 'older', what: 'long grey hair, glasses and a flower (a parent)' },
  { g: 'm', use: 'older', what: 'a black hat and a white beard (a parent)' },
  { g: 'f', use: 'uniform', what: 'a nurse’s cap (Medical Center)' },
  { g: 'f', use: 'uniform', what: 'a police cap and a bob (Campus Safety)' },
  { g: 'x', use: 'uniform', what: 'a hard hat (Facilities)' },
];

/** The built-in pack (Kenney): six women and seven men, all everyday. */
const KENNEY: readonly LookTag[] = [
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((v): LookTag => ({ g: 'f', use: 'student', what: `woman ${v}` })),
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((v): LookTag => ({ g: 'm', use: 'student', what: `man ${v}` })),
];

/** The tags for each pack, by the name its manifest gives it. */
export const LOOKS_BY_PACK: Readonly<Record<string, readonly LookTag[]>> = {
  'penzilla-giant-city': PENZILLA,
  'kenney-isometric': KENNEY,
};

/**
 * Religious head coverings at a real campus's share. A judgement, not a survey figure: Muslim students are a few in a
 * hundred of US undergraduates and not all women among them wear a hijab (Pew Research Center, "Muslims in America",
 * 2017: about 4 in 10 Muslim women in the US always or usually do), and Sikh men, who wear the turban, are far fewer
 * than one in a hundred. So about 2 in 100 women and under 1 in 100 men.
 */
export const COVER_SHARE: Readonly<Record<'hijab' | 'turban', number>> = { hijab: 0.02, turban: 0.008 };
