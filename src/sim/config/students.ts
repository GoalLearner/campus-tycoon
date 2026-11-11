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

export const CLASS_YEAR_NAMES = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const;

/** The eight departments of the building catalog (section 23). A club leans toward some of them. */
export type MajorGroup = 'engineering' | 'sciences' | 'letters' | 'business' | 'education' | 'music' | 'arts' | 'health';

export const MAJORS: ReadonlyArray<{ name: string; group: MajorGroup }> = [
  { name: 'Mechanical Engineering', group: 'engineering' },
  { name: 'Civil Engineering', group: 'engineering' },
  { name: 'Computer Science', group: 'engineering' },
  { name: 'Biology', group: 'sciences' },
  { name: 'Chemistry', group: 'sciences' },
  { name: 'Physics', group: 'sciences' },
  { name: 'Mathematics', group: 'sciences' },
  { name: 'English', group: 'letters' },
  { name: 'History', group: 'letters' },
  { name: 'Psychology', group: 'letters' },
  { name: 'Political Science', group: 'letters' },
  { name: 'Business', group: 'business' },
  { name: 'Economics', group: 'business' },
  { name: 'Marketing', group: 'business' },
  { name: 'Education', group: 'education' },
  { name: 'Music', group: 'music' },
  { name: 'Studio Art', group: 'arts' },
  { name: 'Film', group: 'arts' },
  { name: 'Nursing', group: 'health' },
  { name: 'Kinesiology', group: 'health' },
];

/**
 * The archetypes whose campus stat exists today. Superfan, Varsity Athlete,
 * Greek Loyalist and Pledge wait for football and Greek Row.
 */
export type ArchetypeId =
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
  | 'attention';

export const ARCHETYPE_NAMES: Record<ArchetypeId, string> = {
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

/** [T] Share of freshmen who read as Lost Freshman or Homesick: first in the fall, then for the rest of the year. */
export const LOST_SHARE = { fall: 0.3, later: 0.12 };
export const HOMESICK_SHARE = { fall: 0.12, later: 0.05 };
/** [T] Share of seniors who read as Super Senior: normally, and when Academic seats capped the last class. */
export const SUPER_SENIOR_SHARE = { normal: 0.1, seatsShort: 0.3 };

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

/**
 * [T] Grades. The campus average sits between these two, by how good the
 * teaching side of campus is. A student sits within SPREAD of that average,
 * and some natures study more than others.
 */
export const GPA_FLOOR = 2.3;
export const GPA_SPAN = 1.1;
export const GPA_SPREAD = 0.6;
export const GPA_TILT: Partial<Record<ArchetypeId, number>> = {
  scholar: 0.5,
  stressed: 0.2,
  lost: -0.1,
  clown: -0.2,
  party: -0.3,
  superSenior: -0.3,
  slacker: -0.5,
};
/** Classes feel crowded once this share of seats is taken. A full campus loses the whole crowding share. */
export const SEATS_COMFORTABLE = 0.7;
export const TEACHING_WEIGHTS = { lots: 0.55, room: 0.45 };
/** GPA is on a 4.0 scale and shown to one decimal. Nobody on a card is failing. */
export const GPA_MIN = 1.5;
export const GPA_MAX = 4.0;
/** [T] A little lower in the first year, a little higher by the last. */
export const GPA_BY_CLASS_YEAR: readonly number[] = [-0.1, 0, 0.05, 0.1];

/**
 * Happiness is approval, read at one student's spot: the dorm for a resident,
 * the lecture hall for a commuter. Each cause is scored from 0 to 1 and they
 * are averaged by weight. Dining, noise, recreation and safety join this list
 * when those systems are built; nothing else has to change.
 */
export type CauseId = 'walk' | 'green';
export const CAUSE_WEIGHTS: Record<CauseId, number> = { walk: 1, green: 1 };
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
/** [T] How a new student arrives: plenty still have someone back home. */
export const KIND_AT_ENTRY: ReadonlyArray<readonly [RelationshipKind, number]> = [
  ['single', 55],
  ['together', 12],
  ['distance', 33],
];
/** [T] At each intake most students stay as they are. */
export const KIND_STAYS = 0.6;
/** [T] Where the others go. */
export const KIND_MOVES: Record<RelationshipKind, ReadonlyArray<readonly [RelationshipKind, number]>> = {
  single: [['together', 85], ['distance', 15]],
  together: [['single', 70], ['distance', 30]],
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
 * Thoughts. `{m}` is the walk in minutes. Each names something the player can
 * change, and tapping it jumps to the building it is about.
 */
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
} as const;
