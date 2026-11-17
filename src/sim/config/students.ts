/**
 * Content and tuning for the student card: names, majors, personalities,
 * clubs and thoughts. Everything a card shows is picked from these lists by a
 * student's seeded identity and by live campus numbers. Adding a name, a club
 * or a thought is a change to this file only. See DESIGN.md section 13.8.
 *
 * Written under the tone guide (section 16): jokes aim at types, never at a
 * student, and nothing here mentions drink, smoking, drugs or betting.
 */

/** First names are ones anyone can carry, so a name never clashes with a walker's look. */
export const FIRST_NAMES: readonly string[] = [
  'Alex', 'Sam', 'Jordan', 'Riley', 'Kai', 'Rowan', 'Quinn', 'Avery', 'Morgan', 'Casey',
  'Jules', 'Robin', 'Sage', 'Remy', 'Ari', 'Noor', 'Devon', 'Emerson', 'Skyler', 'Reese',
  'Harper', 'Blake', 'Dakota', 'Finley', 'Hayden', 'Jamie', 'Kendall', 'Lane', 'Micah', 'Nico',
  'Oakley', 'Parker', 'Phoenix', 'River', 'Shiloh', 'Tatum', 'Wren', 'Zion', 'Amari', 'Kit',
  'Lou', 'Max', 'Charlie', 'Frankie', 'Toni', 'Yael', 'Indigo', 'Marlowe', 'Ellis', 'Sasha',
];

/**
 * Surnames are built from two invented halves, like the school names, so no
 * card can carry the full name of a real person.
 */
export const SURNAME_STARTS: readonly string[] = [
  'Lark', 'Penny', 'Thistle', 'Wren', 'Briar', 'Marsh', 'Elder', 'Hollow', 'Fern', 'Stone',
  'Reed', 'Vale', 'Finch', 'Clover', 'Maple', 'Juniper', 'Ash', 'Bram', 'Quill', 'Tansy',
  'Hazel', 'Alder', 'Moss', 'Plum', 'Sorrel', 'Birch', 'Heron', 'Lumen', 'Otter', 'Pippin',
];
export const SURNAME_ENDS: readonly string[] = [
  'well', 'field', 'grove', 'wood', 'brook', 'ford', 'by', 'mere', 'wick', 'croft',
  'ley', 'ham', 'worth', 'dale', 'combe', 'shaw', 'stead', 'more', 'bank', 'gate',
];

/** Fifth- and sixth-year seniors (DESIGN.md 65.2) are the real Super Seniors: no longer a passing phase of seniors. */
export const CLASS_YEAR_NAMES = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Fifth-year senior', 'Sixth-year senior'] as const;

/** The eight departments of the building catalog (section 23). A club leans toward some of them. */
export type MajorGroup = 'engineering' | 'sciences' | 'letters' | 'business' | 'education' | 'music' | 'arts' | 'health';

/**
 * The fields the real figures are counted in (DESIGN.md 65.3): the degree shares of NCES Digest table 322.10 and the
 * rates of changing major of NCES 2018-434.
 */
export type MajorField =
  | 'business'
  | 'health'
  | 'socialSciences'
  | 'biology'
  | 'psychology'
  | 'engineering'
  | 'computerScience'
  | 'arts'
  | 'education'
  | 'communication'
  | 'math'
  | 'physicalSciences'
  | 'languages'
  | 'other';

/**
 * Majors (DESIGN.md 65.3), each with its building department, its field, and its share of bachelor's degrees, in
 * percent: NCES Digest of Education Statistics table 322.10, degrees conferred 2021-22. Business 18.6, health 13.1,
 * social sciences and history 7.5, biology 6.5, psychology 6.4, engineering 6.1, computer science 5.4, the arts 4.5,
 * education 4.4, communication 4.3; within a field the split is by judgement. Liberal Studies, for general and
 * combined studies, takes what is left, so the shares sum to 100.
 */
const MAJOR_LIST: ReadonlyArray<{ name: string; group: MajorGroup; field: MajorField; share: number }> = [
  { name: 'Business', group: 'business', field: 'business', share: 11.5 },
  { name: 'Accounting', group: 'business', field: 'business', share: 3.5 },
  { name: 'Marketing', group: 'business', field: 'business', share: 3.6 },
  { name: 'Nursing', group: 'health', field: 'health', share: 6.3 },
  { name: 'Health Sciences', group: 'health', field: 'health', share: 3.4 },
  { name: 'Public Health', group: 'health', field: 'health', share: 2.2 },
  { name: 'Nutrition', group: 'health', field: 'health', share: 1.2 },
  { name: 'Economics', group: 'business', field: 'socialSciences', share: 2.2 },
  { name: 'Political Science', group: 'letters', field: 'socialSciences', share: 2.0 },
  { name: 'Sociology', group: 'letters', field: 'socialSciences', share: 1.8 },
  { name: 'History', group: 'letters', field: 'socialSciences', share: 1.5 },
  { name: 'Biology', group: 'sciences', field: 'biology', share: 6.5 },
  { name: 'Psychology', group: 'letters', field: 'psychology', share: 6.4 },
  { name: 'Mechanical Engineering', group: 'engineering', field: 'engineering', share: 2.4 },
  { name: 'Electrical Engineering', group: 'engineering', field: 'engineering', share: 1.9 },
  { name: 'Civil Engineering', group: 'engineering', field: 'engineering', share: 1.8 },
  { name: 'Computer Science', group: 'engineering', field: 'computerScience', share: 5.4 },
  { name: 'Studio Art', group: 'arts', field: 'arts', share: 1.9 },
  { name: 'Film', group: 'arts', field: 'arts', share: 1.4 },
  { name: 'Music', group: 'music', field: 'arts', share: 1.2 },
  { name: 'Education', group: 'education', field: 'education', share: 4.4 },
  { name: 'Communication', group: 'letters', field: 'communication', share: 4.3 },
  { name: 'Mathematics', group: 'sciences', field: 'math', share: 1.4 },
  { name: 'Chemistry', group: 'sciences', field: 'physicalSciences', share: 1.0 },
  { name: 'Physics', group: 'sciences', field: 'physicalSciences', share: 0.4 },
  { name: 'English', group: 'letters', field: 'languages', share: 1.8 },
  { name: 'Spanish', group: 'letters', field: 'languages', share: 0.8 },
  { name: 'Philosophy', group: 'letters', field: 'languages', share: 0.6 },
  { name: 'Kinesiology', group: 'health', field: 'other', share: 2.6 },
  { name: 'Criminal Justice', group: 'letters', field: 'other', share: 2.7 },
  { name: 'Social Work', group: 'letters', field: 'other', share: 1.6 },
  { name: 'Environmental Science', group: 'sciences', field: 'other', share: 2.2 },
  { name: 'Architecture', group: 'arts', field: 'other', share: 0.4 },
];
const LISTED = MAJOR_LIST.reduce((sum, major) => sum + major.share, 0);
export const MAJORS: ReadonlyArray<{ name: string; group: MajorGroup; field: MajorField; share: number }> = [
  ...MAJOR_LIST,
  { name: 'Liberal Studies', group: 'letters', field: 'other', share: Math.round((100 - LISTED) * 10) / 10 },
];

/**
 * [T] The share of students who change major within their first three years, by the field they began in: NCES
 * 2018-434 (about a third of all, mathematics 52%, the natural sciences 40%, health 26%); the other fields are near the
 * report's figures for them.
 */
export const SWITCH_RATE: Record<MajorField, number> = {
  math: 0.52,
  biology: 0.4,
  physicalSciences: 0.4,
  engineering: 0.32,
  computerScience: 0.28,
  health: 0.26,
  business: 0.28,
  education: 0.35,
  languages: 0.33,
  socialSciences: 0.29,
  psychology: 0.29,
  communication: 0.3,
  arts: 0.3,
  other: 0.3,
};

/**
 * [T] The share of a class still undeclared at each of its first four semesters (DESIGN.md 65.3): most declare in their
 * first year, and everyone by the spring of their second, as most large publics ask. No national figure: judgement.
 */
export const UNDECLARED: readonly number[] = [0.35, 0.22, 0.08, 0];

/** [T] The share with a second major, from the junior year: about 5% (American Academy of Arts and Sciences; an undercount). */
export const DOUBLE_SHARE = 0.05;
/** The semester a second major is shown from, counted from entry: the junior year. */
export const DOUBLE_FROM = 4;
/** A change of major comes in one of these semesters, counted from entry: the sophomore and junior years. */
export const SWITCH_SEMESTERS: readonly number[] = [2, 3, 4, 5];

/**
 * The archetypes whose campus stat exists today. Superfan and Varsity Athlete
 * came with football, All-Nighter with finals week, and Pledge and Greek
 * Loyalist with Greek Row (DESIGN.md 51): a chapter's members, a pledge in
 * their first year.
 */
export type ArchetypeId =
  | 'superfan'
  | 'athlete'
  | 'allNighter'
  | 'lost'
  | 'homesick'
  | 'commuter'
  | 'broke'
  | 'scholar'
  | 'stressed'
  | 'slacker'
  | 'butterfly'
  | 'ra'
  | 'superSenior'
  | 'clown'
  | 'party'
  | 'charmer'
  | 'attention'
  | 'pledge'
  | 'greekLoyalist'
  | 'heartbroken';

export const ARCHETYPE_NAMES: Record<ArchetypeId, string> = {
  superfan: 'Superfan',
  athlete: 'Varsity Athlete',
  allNighter: 'All-Nighter',
  lost: 'Lost Freshman',
  homesick: 'Homesick',
  commuter: 'Commuter',
  broke: 'Broke Student',
  scholar: 'Scholar',
  stressed: 'Stressed-Out',
  slacker: 'Slacker',
  butterfly: 'Social Butterfly',
  ra: 'Resident Advisor',
  superSenior: 'Super Senior',
  clown: 'Class Clown',
  party: 'Party Animal',
  charmer: 'Charmer',
  attention: 'Attention Seeker',
  pledge: 'Pledge',
  greekLoyalist: 'Greek Loyalist',
  heartbroken: 'Heartbroken',
};

/**
 * [T] How common each lasting nature is. A student's nature never changes.
 * Lost Freshman, Homesick and Super Senior are passing phases laid over it.
 */
export const NATURE_WEIGHTS: ReadonlyArray<readonly [ArchetypeId, number]> = [
  ['scholar', 10],
  ['stressed', 10],
  ['slacker', 9],
  ['butterfly', 10],
  ['broke', 8],
  ['party', 8],
  ['clown', 7],
  ['charmer', 7],
  ['attention', 5],
  ['ra', 4],
];
/** [T] Students with no bed on campus are mostly this. */
export const COMMUTER_WEIGHT = 40;

/** [T] In finals week this share of students reads as All-Nighter, a passing phase like Lost Freshman. */
export const ALL_NIGHTER_SHARE = 0.18;
/** [T] Share of freshmen who read as Lost Freshman: first in the fall, then for the rest of the year. Homesick: config/wellbeing.ts. */
export const LOST_SHARE = { fall: 0.3, later: 0.12 };

export const QUIRKS: readonly string[] = [
  'Night owl',
  'Always late',
  'Always hungry',
  'Caffeine-powered',
  'Skateboards everywhere',
  'Feeds the squirrels',
];

/** A short list for now. A club is a name only: it has no rules. */
export const CLUBS: ReadonlyArray<{ name: string; groups?: readonly MajorGroup[]; natures?: readonly ArchetypeId[]; quirk?: string }> = [
  { name: 'Robotics Club', groups: ['engineering'], natures: ['scholar'] },
  { name: 'Coding Club', groups: ['engineering', 'sciences'], natures: ['scholar', 'slacker'] },
  { name: 'Astronomy Club', groups: ['sciences'], natures: ['scholar', 'charmer'], quirk: 'Night owl' },
  { name: 'Pre-Health Society', groups: ['health', 'sciences'], natures: ['scholar', 'stressed'] },
  { name: 'Debate Society', groups: ['letters', 'business'], natures: ['attention', 'scholar'] },
  { name: 'Student Newspaper', groups: ['letters'], natures: ['attention', 'stressed'] },
  { name: 'Entrepreneurs Club', groups: ['business'], natures: ['charmer', 'attention'] },
  { name: 'Future Teachers', groups: ['education'], natures: ['butterfly', 'ra'] },
  { name: 'A Cappella Group', groups: ['music'], natures: ['attention', 'butterfly'] },
  { name: 'Campus Radio', groups: ['music', 'letters'], natures: ['party'], quirk: 'Night owl' },
  { name: 'Film Society', groups: ['arts'], natures: ['slacker', 'charmer'] },
  { name: 'Improv Troupe', groups: ['arts', 'letters'], natures: ['clown', 'attention'] },
  { name: 'Hiking Club', natures: ['butterfly', 'charmer'] },
  { name: 'Garden Club', groups: ['sciences'], natures: ['charmer'], quirk: 'Feeds the squirrels' },
  { name: 'Board Game Club', natures: ['slacker', 'clown'] },
  { name: 'Chess Club', natures: ['scholar'] },
  { name: 'Intramural Soccer', groups: ['health'], natures: ['butterfly', 'party'] },
  { name: 'Volunteer Corps', groups: ['education', 'health'], natures: ['ra', 'butterfly'] },
  { name: 'Baking Club', natures: ['broke'], quirk: 'Always hungry' },
  { name: 'Skate Club', natures: ['clown'], quirk: 'Skateboards everywhere' },
];

/** [T] A club that suits the student's major, nature or quirk is this many times likelier. */
export const CLUB_MATCH = { group: 4, nature: 4, quirk: 6 };
/** [T] Share of students in no club, by nature. */
export const NO_CLUB_SHARE: Partial<Record<ArchetypeId, number>> & { default: number } = {
  default: 0.3,
  slacker: 0.5,
  stressed: 0.4,
  commuter: 0.5,
  butterfly: 0.1,
  ra: 0.15,
};

/** Classes feel crowded once this share of seats is taken. A full campus loses the whole crowding share. */
export const SEATS_COMFORTABLE = 0.7;
export const TEACHING_WEIGHTS = { lots: 0.55, room: 0.45 };
/** Grades are at the real spread since R1: config/grades.ts (DESIGN.md 65.4). */

/**
 * Happiness is approval, read at one student's spot: the dorm for a resident,
 * the lecture hall for a commuter.
 *
 * What a student feels there is a list of drivers, each scored 0 to 1. They
 * are gathered into the named causes the player sees: never more than four,
 * all at full weight (DESIGN.md 24.2, and the owner's instruction of
 * 2026-11-11). A cause is the average of its drivers. A new driver, such as
 * noise, joins by being given a cause here; nothing else has to change.
 */
export type DriverId = 'walk' | 'green' | 'clean' | 'seating' | 'noise' | 'dining' | 'recreation' | 'safety';
export type CauseId = 'walk' | 'grounds' | 'life' | 'safety';
/** The four causes of Happiness, as the player reads them. */
export const CAUSE_NAMES: Record<CauseId, string> = { walk: 'Walk to class', grounds: 'Grounds', life: 'Food & fun', safety: 'Safety & health' };

/** Which cause each driver counts toward. Dining and things to do share one: "Food & fun". */
export const CAUSE_OF: Record<DriverId, CauseId> = { walk: 'walk', green: 'grounds', clean: 'grounds', seating: 'grounds', noise: 'grounds', dining: 'life', recreation: 'life', safety: 'safety' };
/**
 * How much each driver counts inside its cause. Grounds is green space, how
 * clean it is and somewhere to sit, and they do not count the same: a bench
 * must not weigh as much as a quad.
 *
 * Noise joined Grounds with the stadium (DESIGN.md 29.5). Only a dorm inside
 * a stadium's reach has it, so no other lot's Grounds changed.
 */
export const PART_WEIGHTS: Record<DriverId, number> = { walk: 1, green: 0.5, clean: 0.3, seating: 0.2, noise: 0.5, dining: 1, recreation: 1, safety: 1 };
/** The causes in the order they are listed. Every one counts the same. */
export const CAUSE_WEIGHTS: Record<CauseId, number> = { walk: 1, grounds: 1, life: 1, safety: 1 };
/** [T] How far one student's mood can sit from their spot's score. */
export const TEMPERAMENT_SPREAD = 6;
/** [T] The lowest score for each face, from delighted down. Below the last is the saddest. */
export const MOOD_STEPS: readonly number[] = [80, 62, 45, 28];
/** At or above this face a student names what they like. Below it, what would help most. */
export const CONTENT_MOOD = 3;

/**
 * Relationship status: the card's sixth line. A student is single, with
 * someone, or with someone far away, and on the happy or the unhappy side of
 * that. Which of the three can change at each intake, by seed alone. Which
 * side they are on leans with the campus's social life, which is the part the
 * player can change. It shows on the card only and is never a campus stat.
 *
 * Tone: light and neutral. The status and nothing more: never who, never why.
 */
export type RelationshipKind = 'single' | 'together' | 'distance';
export type RelationshipId =
  | 'singleLooking'
  | 'singleHappy'
  | 'togetherHappy'
  | 'togetherUnhappy'
  | 'distanceHappy'
  | 'distanceStruggling';

/** The happy and the unhappy side of each kind. */
export const RELATIONSHIP_SIDES: Record<RelationshipKind, readonly [RelationshipId, RelationshipId]> = {
  single: ['singleHappy', 'singleLooking'],
  together: ['togetherHappy', 'togetherUnhappy'],
  distance: ['distanceHappy', 'distanceStruggling'],
};
export const RELATIONSHIP_NAMES: Record<RelationshipId, string> = {
  singleLooking: 'Single and looking',
  singleHappy: 'Happily single',
  togetherHappy: 'In a happy relationship',
  togetherUnhappy: 'In an unhappy relationship',
  distanceHappy: 'Happy long-distance',
  distanceStruggling: 'Struggling long-distance',
};
/**
 * [T] How a new student arrives: a quarter still have someone back home, a hometown partner (DESIGN.md 65.6), and
 * fewer as the years go on. On the cards a student with a partner on campus shows the web's; "together" here is read
 * only without the web.
 */
export const KIND_AT_ENTRY: ReadonlyArray<readonly [RelationshipKind, number]> = [
  ['single', 60],
  ['together', 12],
  ['distance', 28],
];
/** [T] At each intake most students stay as they are. */
export const KIND_STAYS = 0.6;
/** [T] Where the others go. */
export const KIND_MOVES: Record<RelationshipKind, ReadonlyArray<readonly [RelationshipKind, number]>> = {
  single: [['together', 95], ['distance', 5]],
  together: [['single', 85], ['distance', 15]],
  distance: [['single', 60], ['together', 40]],
};
/**
 * [T] Natures lean toward a kind, never toward a side, so no nature is happier
 * than another on average. Hopeless Romantic and Heartbroken join here when
 * they ship, and must keep that balance.
 */
export const KIND_LEAN: Partial<Record<ArchetypeId, Partial<Record<RelationshipKind, number>>>> = {
  charmer: { together: 2 },
  butterfly: { together: 1.5 },
  scholar: { single: 1.5 },
  stressed: { single: 1.3 },
  party: { single: 1.3 },
  commuter: { together: 1.4, distance: 0.5 },
};
/** [T] With a middling social life half of students are on the happy side. Social life moves that share by up to half of SOCIAL_SWING either way. */
export const SOCIAL_SWING = 0.4;
/** [T] Points of happiness a status adds or takes. The same size both ways, so across the campus they cancel. */
export const RELATIONSHIP_POINTS = 4;
/** [T] One place to meet for this many students is a middling social life. Twice as many is the best it gets. */
export const STUDENTS_PER_SOCIAL_SPOT = 40;
/** [T] Below this, someone single and looking says there is nowhere to meet people. */
export const SOCIAL_THIN = 0.35;
export const RELATIONSHIP_NOTES = {
  happier: 'a little happier',
  lessHappy: 'a little less happy',
  thin: 'nowhere to meet people',
} as const;

/**
 * A breakup (DESIGN.md 52.1, as built in 55): someone who was with someone last semester and is single now. It is a
 * normal part of life here, felt for a semester and got over. The status keeps its own side and its own points, so
 * the campus's balance holds; only the words change, and the student reads as Heartbroken while it lasts.
 */
export const BREAKUP_NAME = 'Single, after a breakup';
export const BREAKUP_NOTES = { happier: 'doing better than expected', lessHappy: 'getting over it, slowly' } as const;

/**
 * A Party Animal's weekends on a campus with parties (DESIGN.md 52.3), said plainly on the card. Drinking belongs to
 * students of 21 and over: juniors and seniors.
 */
export const PARTY_CARD = {
  over21: 'Parties, and a drink or two. Mondays are harder',
  under21: 'Parties, but under 21, so no drinks',
} as const;

/**
 * Thoughts. `{m}` is the walk in minutes. Each names something the player can
 * change, and tapping it jumps to the building it is about.
 */
/**
 * A favourite place to eat, by its kind (DESIGN.md 30.2). A student who is
 * pleased with the food names the place they eat at most (83.5).
 * Tone: light. Nothing here but food.
 */
export const FAVOURITES: Partial<Record<string, readonly string[]>> = {
  taco: ['Taco Tuesday is the only reason I go to class.', 'Two tacos between lectures and the afternoon is saved.'],
  pizza: ['A slice from the pizza place at midnight is my whole study plan.', 'The pizza place knows my order. I am not sure how I feel about that.'],
  burger: ['The burger grill at lunch is worth the line.', 'I timed it. Burger grill to my seat in class: four minutes.'],
  diner: ['Pancakes at the diner at two in the morning fix most things.', 'The diner never closes. Neither, it turns out, do I.'],
  foodcourt: ['I have eaten at every stall in the food court. I have a ranking.', 'The food court means nobody has to agree on lunch.'],
  smoothie: ['A smoothie between classes. Today I am a healthy person.', 'The juice bar has a flavour of the week. I plan around it.'],
  convenience: ['The convenience store has kept me going on snacks since move-in.', 'Instant noodles from the convenience store at midnight. A classic.'],
  truck: ['I plan my day around where the food truck is parked.', 'Whatever the food truck is selling today, I am having it.'],
  coffee: ['The coffee stand knows my name, my order and my timetable.', 'One coffee from the stand and I am ready for a nine o clock lecture.'],
};

export const THOUGHTS = {
  walkGood: [
    'Class is {m} from my bed. Best thing about this place.',
    'Door to desk in {m}. I checked twice.',
  ],
  walkLong: [
    'It takes me {m} to walk to class. I need a closer lecture hall or a shortcut.',
    '{m} from my dorm to class. A path that cuts across would save my mornings.',
  ],
  walkNone: [
    'There is no path from my dorm to class. I cut across the grass and hope.',
  ],
  greenGood: [
    'There is a lawn right outside my dorm. I basically live on it.',
    'I can see trees from my room. My parents think I chose well.',
  ],
  greenLow: [
    'All I can see from my dorm window is more buildings. A quad nearby would fix that.',
    'Not one tree near my dorm. I would settle for a single bench on some grass.',
  ],
  commuterGreenGood: [
    'The lawn by my lecture hall is the best part of the drive in.',
  ],
  commuterGreenLow: [
    'Nowhere green to sit near my lecture hall. I eat lunch in my car.',
    'Between classes I stand on pavement. A quad by the lecture halls would help.',
  ],
  diningGood: [
    'Hot food on campus whenever I want it. I may never learn to cook.',
    'The food here is the best part of my week.',
  ],
  /** Nowhere on the campus to eat (DESIGN.md 83.3). */
  diningLow: [
    'There is nowhere to eat on campus. It has been cereal for three days.',
    'No dining hall on campus. Even a coffee stand would do.',
  ],
  /** Every place to eat was full when they came: {w} is the wait. */
  diningCrowded: [
    'Every place to eat was full at dinner, {w} in line. The campus needs another place to eat.',
    'Gave up on lunch after {w} in line. One more place to eat would do it.',
  ],
  commuterDiningGood: ['I can always get lunch on campus between classes.'],
  commuterDiningLow: ['Nowhere to eat on campus. I pack two lunches.'],
  commuterDiningCrowded: ['Gave up on lunch between classes after {w} in line. The campus needs another place to eat.'],
  /** Something they do for fun, with room for them (DESIGN.md 83.2): {verb} is what they do, {place} where. */
  recreationGood: [
    'I {verb} most days. Best part of being here.',
    'There is always room at {place} when I want it.',
  ],
  /** Nothing they do for fun on the campus at all. */
  recreationLow: [
    'Nothing much to do on campus but homework. A court or a field would help.',
    'I would join a game if the campus had anywhere to play one.',
  ],
  /** Something they do that the campus has no place for: {verb} is what they do, {place} what it needs. */
  recreationMissing: [
    'I would {verb} if the campus had {place}.',
    'I used to {verb} back home. This campus has nowhere to do it.',
  ],
  /** Turned away from a full place at the busiest hour: {Place} or {place} is where. */
  recreationFull: [
    '{Place} was full at the busy hour again. I gave up and went home.',
    'Could not get into {place} tonight. One more like it would do it.',
  ],
  /** Meets friends at the Student Union. */
  unionGood: ['Everyone I know is at the Student Union at some point. I love it.'],
  commuterRecreationGood: ['I {verb} between classes. It keeps me sane.'],
  commuterRecreationLow: ['Nothing to do between classes. A field on campus would help.'],
  commuterRecreationMissing: ['I would {verb} between classes if the campus had {place}.'],
  commuterRecreationFull: ['{Place} was full between classes. I gave up.'],
  safetyGood: [
    'Help is two minutes away if I ever need it. I sleep well.',
    'Somebody always turns up when things go sideways around here.',
  ],
  safetyLow: [
    'If I twisted an ankle here I am not sure who would come. A Medical Center nearby would help.',
    'Nobody ever comes when something goes wrong by my dorm. Campus Safety should be closer.',
  ],
  commuterSafetyGood: ['Somebody always turns up when things go sideways near my lecture hall.'],
  commuterSafetyLow: ['Nobody would come if something went wrong by my lecture hall. It needs a Medical Center or Campus Safety in reach.'],
  cleanGood: ['The paths by my dorm are spotless. Somebody clearly cares.', 'Not a wrapper in sight. I like that about this place.'],
  cleanLow: ['So much trash by where we eat. A bin and somebody to empty it would fix it.', 'The bins near my dorm are overflowing again. It needs workers nearby.'],
  commuterCleanGood: ['The walk to my lecture hall is always clean.'],
  commuterCleanLow: ['So much trash on the way to class. It needs bins, and workers to empty them.'],
  noiseGood: ['Game days are a distant hum from my dorm. Just right.'],
  noiseLow: ['The stadium is so close my windows rattle on game days. Dorms further off would sleep better.', 'I live in the shadow of the stadium. Every home game is in my room with me.'],
  seatingGood: ['Love eating lunch out here. There is always somewhere to sit.', 'A bench in the sun between classes. Perfect.'],
  seatingLow: ['Nowhere to sit outside near my dorm. A few benches would do it.', 'I ate lunch standing up again. A picnic table nearby would help.'],
  commuterSeatingGood: ['There is always a bench free by my lecture hall.'],
  commuterSeatingLow: ['Nowhere to sit between classes. A bench or a picnic table by the lecture halls would help.'],
} as const;
