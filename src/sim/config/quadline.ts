/**
 * Quadline, the campus app (DESIGN.md 63.13): its sizes and every word it writes. Students post about what really
 * happens to them in the game, written from these templates on the phone: no AI service and no free text anywhere.
 * A post is kept as a few numbers (who, which kind, which line, about whom or what, when) and its words are rebuilt
 * from here when it is shown, so every line the app can ever say is in this file, and `tests/hardLines.test.ts`
 * reads all of it against the hard lines and the tone guide.
 *
 * Slots in a line: {name} the other student's first name; {place} a building's name; {team}
 * the school's team, {opp} the other school, {us} and {them} the score; {tradition}, {club}, {chapter} by name.
 * Tokens in square brackets are the game's own emotes (decision 9, "Ours"): [heart] is drawn as the heart emote.
 * No line names a real brand or a real person; none is about drinking; none mocks anyone for who they are.
 */

import { FAVOURITES } from './students';

/** The newest posts kept, and room for the viral ones the campus remembers longer (stop 10). */
export const POSTS_KEPT = 400;
export const VIRAL_KEPT = 30;
/** A post's numbers: week, minute, author (entry year, index), kind, line luck, about (two numbers), tone, picture. */
export const POST_FIELDS = 10;

/**
 * How busy the feed is (decision 4, "Normal"): posts from across the campus each game week, sampled, about 250 to 350
 * a real day; the Main Character, followed students and named regulars post on top of these, every post of theirs.
 */
export const CAMPUS_POSTS_A_WEEK = 22;
/**
 * The share of the week's named happenings that one of the two posts about, by kind: news of a new couple or a new
 * best friend often, an ending now and then, so the feed is mostly the campus's life and not its breakups.
 */
export const HAPPENING_POSTS: Partial<Record<number, number>> = { 0: 0.5, 1: 0.4, 2: 0.2, 3: 0.15, 4: 0.15, 5: 0.25 }; // by POST kind: couple, best, long-term, split, messy split, back together
/** How often an ex or a rival answers a couple's post with a post of their own, naming them (decision 5, "Named"). */
export const SHADE_POSTS = 0.3;
/** How many posts a featured student makes a game week, at most: the Main Character, the followed, named regulars. */
export const FEATURED_POSTS = { main: 3, followed: 2, named: 1 } as const;
/**
 * How likely each kind of student posts when their turn comes (decision: personality sets how often), before how
 * outgoing they are: the shy post rarely, the game's Wallflowers (the owner's spec), the most outgoing a little more.
 */
export const OUTGOING_POSTS = [0.3, 0.8, 1, 1.15] as const;
/** How likely each kind of student posts when their turn comes (decision: personality sets how often). */
export const POST_RATE: Record<string, number> = {
  attention: 1,
  party: 0.75,
  clown: 0.75,
  charmer: 0.6,
  superfan: 0.6,
  butterfly: 0.35,
  athlete: 0.5,
  pledge: 0.55,
  greekLoyalist: 0.55,
  ra: 0.4,
  slacker: 0.35,
  broke: 0.35,
  superSenior: 0.35,
  commuter: 0.25,
  scholar: 0.25,
  stressed: 0.4,
  allNighter: 0.4,
  heartbroken: 0.3,
  homesick: 0.15,
  lost: 0.15,
};
/** A Social Butterfly mostly comments: how much likelier they are to be among a post's commenters. */
export const COMMENTER_LEAN: Record<string, number> = { butterfly: 3, charmer: 2, attention: 2, clown: 2 };

/** The kinds of post, by number, as a post keeps them. */
export const POST = {
  couple: 0,
  best: 1,
  longterm: 2,
  split: 3,
  splitMessy: 4,
  backTogether: 5,
  shade: 6,
  roommate: 7,
  moveIn: 8,
  firstWeek: 9,
  midterms: 10,
  finals: 11,
  studyGroup: 12,
  breakHome: 13,
  commencement: 14,
  eightAm: 15,
  snow: 16,
  rain: 17,
  warm: 18,
  gameDay: 19,
  gameWon: 20,
  gameLost: 21,
  tradition: 22,
  bidDay: 23,
  newBuilding: 24,
  complaint: 25,
  praise: 26,
  party: 27,
  club: 28,
  food: 29,
  gym: 30,
  /** A meme about a class or a kind of professor: never a named one (the owner's spec, 2026-11-14). */
  professor: 31,
  /** Greek Row news: philanthropy day, probation, house life (63.13). */
  greekNews: 32,
  /** Team news from varsity athletes: practice, a trip away, new recruits. */
  teamNews: 33,
  /** A rumour about someone, named (stop 10, decision 6): it spreads through the web and may start drama. */
  rumour: 34,
  /** Picking on someone on the app (63.11, stop 10): by the one who does it, about the one picked on. */
  bullyPost: 35,
} as const;
export type PostKind = (typeof POST)[keyof typeof POST];

/** A post's mood (decision: mood colours the tone): the good lines or the rough ones, where a kind has both. */
export const TONE = { good: 0, rough: 1 } as const;

/** The small pictures some posts carry, drawn from the game's own sprites (decision 3, "Scenes"). 0 is none. */
export const SCENE = { none: 0, couple: 1, friends: 2, party: 3, game: 4, building: 5, snow: 6, study: 7, tradition: 8, grad: 9 } as const;
export type SceneKind = (typeof SCENE)[keyof typeof SCENE];

/** The game's emotes a line may use, each an `emote.` sprite. */
export const POST_EMOTES: Record<string, string> = {
  heart: 'emote.heart',
  sparkle: 'emote.sparkle',
  laugh: 'emote.laugh',
  sad: 'emote.sadcloud',
  music: 'emote.music',
  sweat: 'emote.sweat',
  wow: 'emote.exclaim',
  party: 'emote.chat-partying',
  book: 'emote.chat-studying',
  ball: 'emote.chat-sports',
  wave: 'emote.wave',
  hug: 'emote.hug',
  high: 'emote.highfive',
};

export interface PostWords {
  /** The hashtags it may carry, one chosen. `{nick}` is the team's name. */
  tags: readonly string[];
  /** Its lines when the author is in a good mood, or its only lines. */
  good: readonly string[];
  /** Its lines when the author is having a rough time, where the kind has both. */
  rough?: readonly string[];
  /** The picture it may carry, and how often. */
  scene?: SceneKind;
  sceneShare?: number;
}

/** Every post, kind by kind. */
export const POST_WORDS: Record<PostKind, PostWords> = {
  [POST.couple]: {
    tags: ['NewCouple'],
    good: [
      'officially off the market [heart]',
      '{name} and me. that is the post [heart]',
      '{name} asked me to the dining hall and now we are a thing [heart]',
      'not me smiling at my phone through a whole lecture. thanks {name} [heart]',
      'took us a whole semester but here we are [sparkle]',
    ],
    scene: SCENE.couple,
    sceneShare: 0.6,
  },
  [POST.best]: {
    tags: ['BestFriends'],
    good: [
      'found my person. {name} is stuck with me now [sparkle]',
      'shout out to {name} for answering every 2 AM text [hug]',
      '{name} knows my coffee order and my whole timetable. best friend status [sparkle]',
      'me and {name}, the duo nobody asked for [laugh]',
    ],
    scene: SCENE.friends,
    sceneShare: 0.5,
  },
  [POST.longterm]: {
    tags: ['Couple'],
    good: ['still my favourite person. {name} [heart]', 'another semester with {name}. lucky me [heart]', '{name} made me soup during midterms. keeper [heart]'],
    scene: SCENE.couple,
    sceneShare: 0.5,
  },
  [POST.split]: {
    tags: ['NewChapter', 'SingleAgain'],
    good: [
      'we were good for a while. that counts for something',
      'some chapters end kindly. this one did',
      'single again. the dining hall and I are going steady [laugh]',
      'quiet night, slow songs, it is fine, it is fine [music]',
    ],
  },
  [POST.splitMessy]: {
    tags: ['MovingOn'],
    good: ['deleting the photos. all of them', 'well. that happened [sad]', 'new semester energy starts now. do not text me', 'phone off for a week [sad]'],
  },
  [POST.backTogether]: {
    tags: ['BackTogether'],
    good: ['okay so {name} and I are trying again. do not say it [heart]', 'yes we are back. yes I know what I said [laugh]'],
    scene: SCENE.couple,
    sceneShare: 0.4,
  },
  [POST.shade]: {
    tags: ['JustSaying'],
    good: [
      '{name} moved on fast. good for them I guess',
      'funny how {name} has time to post but not to text back',
      'saw {name} in the dining hall acting brand new',
      '{name} really thinks the whole campus is watching. we are not',
      'not naming names but {name} knows',
      'classic {name}. such a show-off',
    ],
  },
  [POST.roommate]: {
    tags: ['RoommateRants'],
    good: [
      'roommate microwaved fish at 2 AM. we need to talk',
      'roommate set the thermostat to arctic again [sweat]',
      'whose dishes are these. asking for a friend. the friend is me',
      'roommate alarm went off six times. I was awake for all six',
      'roommate has a group call at midnight every night. every. night.',
    ],
  },
  [POST.moveIn]: {
    tags: ['MoveInDay', 'NewHere'],
    good: [
      'move-in day. carried a mini fridge up four flights [sweat]',
      'first night in {place}. it smells like new paint and nerves',
      'my parents just left and I already miss the car snacks',
      'met my whole floor in one afternoon [wave]',
    ],
  },
  [POST.firstWeek]: {
    tags: ['FirstWeek', 'BackOnCampus'],
    good: ['back on campus. same bench, new semester [sparkle]', 'bought every textbook. read zero. classic start [laugh]', 'new semester, new planner, new me. for about a week'],
    rough: ['first week of classes and I already lost my timetable [sweat]', 'syllabus week said four essays. four. [sweat]'],
  },
  [POST.midterms]: {
    tags: ['MidtermWeek'],
    good: ['midterms? so ready. probably [book]', 'study playlist on, snacks out, let us go [music]', 'one midterm down. we are so back [sparkle]'],
    rough: ['midterm week. my sleep schedule has left the building [sweat]', 'read the same page four times. it did not help [sweat]', 'my notes from week two were written by a stranger, apparently'],
  },
  [POST.finals]: {
    tags: ['FinalsWeek'],
    good: ['last final done. I am free [sparkle]', 'flashcards finished. we ride at dawn [book]', 'finals week but make it organised [book]'],
    rough: ['4 hours of sleep and a 9 AM final [sweat]', 'the library at 3 AM has a whole crowd. we are a community now', 'if you see me in {place} talking to my notes, no you did not [sweat]'],
    scene: SCENE.study,
    sceneShare: 0.25,
  },
  [POST.studyGroup]: {
    tags: ['StudyGroup'],
    good: [
      'study group in {place} tonight. bring snacks [book]',
      'whoever left the colour-coded notes in {place}, thank you [sparkle]',
      'study group became snack group within an hour. no regrets [laugh]',
    ],
    scene: SCENE.study,
    sceneShare: 0.4,
  },
  [POST.breakHome]: {
    tags: ['BreakTime', 'HomeForBreak'],
    good: ['home for the break. my old room is a guest room now [laugh]', 'break mode on. alarm off', 'my family asked what my major is for. I said vibes [laugh]'],
  },
  [POST.commencement]: {
    tags: ['Commencement', 'Graduated'],
    good: ['walked across that stage. we did it [sparkle]', 'four years, one diploma, a hundred dining hall dinners [heart]', 'cap decorated, tissues ready. thank you for everything [heart]'],
    scene: SCENE.grad,
    sceneShare: 0.6,
  },
  [POST.eightAm]: {
    tags: ['EightAM'],
    good: ['8 AM lecture and I made it. on time. somebody tell my family [sparkle]', 'early class, sunrise walk, honestly not bad'],
    rough: ['who decided 8 AM lectures were a good idea [sweat]', 'the 8 AM lecture hall is so quiet you can hear us all yawning', 'my 8 AM and I are not on speaking terms'],
  },
  [POST.snow]: {
    tags: ['SnowDay'],
    good: ['snow on the quad! [sparkle]', 'walked to class in the snow. both ways. uphill [laugh]', 'snowball match outside {place} after class. be there'],
    scene: SCENE.snow,
    sceneShare: 0.6,
  },
  [POST.rain]: {
    tags: ['RainyDay'],
    good: ['rain on the windows and a mug of tea. study mood [music]'],
    rough: ['forgot my umbrella. again [sweat]', 'my shoes are still wet from this morning [sweat]'],
  },
  [POST.warm]: {
    tags: ['FirstWarmDay'],
    good: ['first warm day and the whole campus is on the quad [sparkle]', 'sunglasses weather. finally', 'class outside today. best professor ever [sparkle]'],
  },
  [POST.gameDay]: {
    tags: ['GameDay', 'Go{nick}'],
    good: ['game day. {team} all the way [ball]', 'who is going to the game against {opp}? [wow]', 'game day outfit: ready. voice: ready [ball]'],
    scene: SCENE.game,
    sceneShare: 0.5,
  },
  [POST.gameWon]: {
    tags: ['Go{nick}', 'GameDay'],
    good: ['WE WON. {us} to {them} [wow]', 'still shaking from that last quarter. what a game [sparkle]', '{opp} came all this way for that? [laugh]'],
    scene: SCENE.game,
    sceneShare: 0.5,
  },
  [POST.gameLost]: {
    tags: ['NextTime'],
    good: ['tough one against {opp}. we go again next week', '{them} to {us}. still proud of this team [heart]'],
  },
  [POST.tradition]: {
    tags: ['Tradition'],
    good: ['who is going to the {tradition}? [sparkle]', '{tradition} tonight. best night of the year [heart]', 'first {tradition} and I finally get it [sparkle]'],
    scene: SCENE.tradition,
    sceneShare: 0.5,
  },
  [POST.bidDay]: {
    tags: ['BidDay'],
    good: ['bid day! {chapter}, here I come [sparkle]', 'new family, same campus. {chapter} [heart]'],
    scene: SCENE.friends,
    sceneShare: 0.4,
  },
  [POST.newBuilding]: {
    tags: ['NewOnCampus'],
    good: ['the new {place} is open and honestly it is beautiful [sparkle]', 'checked out the new {place}. ten out of ten [wow]', 'new building smell at {place}. I live here now'],
    scene: SCENE.building,
    sceneShare: 0.85,
  },
  // A complaint or praise: the lines come from `CAUSE_POSTS` by what it is about; these are the general ones.
  [POST.complaint]: { tags: ['CampusLife'], good: ['this campus needs a little work, honestly'] },
  [POST.praise]: { tags: ['CampusLife'], good: ['love this campus more every week [heart]'] },
  [POST.party]: {
    tags: ['WeekendVibes', 'PartyNight'],
    good: ['best night of the semester [party]', 'the playlist tonight was perfect [music]', 'danced until they turned the lights on [music]', 'party on the lawn. bring snacks [party]'],
    scene: SCENE.party,
    sceneShare: 0.6,
  },
  [POST.club]: {
    tags: ['ClubLife'],
    good: ['{club} meeting tonight. new members welcome [wave]', 'joined {club} and I already have six new friends [sparkle]', '{club} is the best part of my week'],
  },
  // A favourite place to eat: the lines are the cards' own favourites (FAVOURITES in config/students.ts).
  [POST.food]: { tags: ['FoodReview'], good: ['lunch was actually good today [sparkle]'] },
  [POST.gym]: {
    tags: ['GymTime'],
    good: ['leg day done. the stairs and I are not friends now', 'new personal best at the rec center [ball]', 'gym at 6 AM. who even am I [sweat]'],
  },
  [POST.professor]: {
    tags: ['LectureLife', 'ProfessorMoments'],
    good: [
      'my professor ends every lecture with one more thing. it is never one thing [laugh]',
      'the professor who posts the slides ten minutes before class. a hero',
      'the professor who knows everyone by name in week one. how [wow]',
      'professor said this will not be on the exam. writing it down anyway [book]',
    ],
    rough: [
      'the professor who says we are almost done with forty slides to go [sweat]',
      'my professor answered a question with another question. now I have two questions',
      'the reading list for this class is longer than the class [sweat]',
    ],
  },
  // Greek Row news: the lines come from `GREEK_POSTS` by what is going on at the chapter.
  [POST.greekNews]: { tags: ['GreekRow'], good: ['house dinner tonight. best cooks on Greek Row [heart]'], scene: SCENE.friends, sceneShare: 0.3 },
  // Team news: the lines come from `TEAM_POSTS` by what the team is doing.
  [POST.teamNews]: { tags: ['TeamLife', 'Go{nick}'], good: ['practice at 6 AM. the coach does not believe in sleep [sweat]'] },
  // A rumour: the lines come from `RUMOUR_POSTS` by what it says.
  [POST.rumour]: { tags: ['JustSaying', 'Allegedly'], good: ['heard something about {name}. allegedly'] },
  [POST.bullyPost]: {
    tags: ['JustSaying'],
    good: [
      '{name} acting like a know-it-all in every seminar. we get it',
      'imagine being {name} and thinking everyone wants your opinion. such a show-off',
      'not inviting {name}. that is the post',
      '{name} is such a suck-up. every lecture. every single one',
      'try-hard alert: {name} again',
      '{name} is so fake. everyone knows',
      '{name} asked for extra homework. teacher\'s pet behaviour',
    ],
  },
};

/**
 * Rumours (stop 10, decision 6, "Drama"): what is said, by what it may do. Seen with someone may make a partner
 * jealous; taking the credit sours a friendship; loose talk only gets around. None is sexual, none is about who
 * anyone is: a rumour is about what someone did, or is said to have done.
 */
export const RUMOUR_KINDS = ['seen', 'credit', 'talk'] as const;
export type RumourKind = (typeof RUMOUR_KINDS)[number];
export const RUMOUR_POSTS: Record<RumourKind, readonly string[]> = {
  seen: [
    '{name} and someone from the study group at the diner at 2 AM? interesting',
    'who was {name} laughing with outside the library for an hour. asking for a friend',
    'saw {name} at the movies with someone who is very much not their partner. just saying',
  ],
  credit: [
    'heard {name} skipped the whole group project and took the credit. allegedly',
    '{name} presented our slides like they made them. we all know who made them',
  ],
  talk: [
    'word is {name} told the whole floor they are moving off campus. their roommate has no idea',
    'heard {name} applied for the same internship as their best friend. awkward',
    '{name} said the dining hall is better at home. bold',
  ],
};

/** Every rumour's line in one list, kind after kind: a rumour post keeps its line, which says which kind it was. */
export const RUMOUR_LINES: readonly string[] = RUMOUR_KINDS.flatMap((kind) => RUMOUR_POSTS[kind]);
/** The first line of a kind of rumour in RUMOUR_LINES, and how many it has. */
export function rumourLines(kind: RumourKind): { from: number; count: number } {
  let from = 0;
  for (const one of RUMOUR_KINDS) {
    if (one === kind) return { from, count: RUMOUR_POSTS[one].length };
    from += RUMOUR_POSTS[one].length;
  }
  return { from: 0, count: RUMOUR_LINES.length };
}

/** A viral post's sign on the school's reach (main's decision of 2026-11-14): good news widens it, bad narrows it. */
export const VIRAL_SIGN: Partial<Record<PostKind, 1 | -1>> = {
  [POST.newBuilding]: 1,
  [POST.gameWon]: 1,
  [POST.tradition]: 1,
  [POST.commencement]: 1,
  [POST.praise]: 1,
  [POST.complaint]: -1,
  [POST.bullyPost]: -1,
};
/**
 * Going viral (decision 7, "Light"): a few posts a week, chosen by how far they would spread; one seen beyond campus
 * moves the school's reach, at most 3% of applicants either way across all of them, fading over two game weeks.
 */
export const VIRAL_A_WEEK = 2;
/** How much of a following sees and likes each kind of post: its likes, and how far it could spread. */
export const POST_ENGAGE: Partial<Record<PostKind, number>> = {
  [POST.couple]: 0.45,
  [POST.backTogether]: 0.35,
  [POST.splitMessy]: 0.3,
  [POST.best]: 0.3,
  [POST.longterm]: 0.3,
  [POST.split]: 0.25,
  [POST.newBuilding]: 0.4,
  [POST.commencement]: 0.5,
  [POST.gameWon]: 0.4,
  [POST.gameDay]: 0.3,
  [POST.party]: 0.3,
  [POST.tradition]: 0.3,
  [POST.complaint]: 0.3,
  [POST.praise]: 0.25,
  [POST.roommate]: 0.25,
  [POST.shade]: 0.15,
  [POST.rumour]: 0.3,
  [POST.bullyPost]: 0.2,
};
/** The share of the week's acts of picking on someone by name that are posted on the app, before the levers. */
export const BULLY_POSTS = 0.15;
export const VIRAL_REACH_EACH = 0.015;
export const VIRAL_REACH_MOST = 0.03;
export const VIRAL_FADE_WEEKS = 2;
/** Shares at which a viral post is seen beyond campus, and the most it is shared. */
export const VIRAL_BEYOND = 4000;
export const VIRAL_SHARES_MOST = 12000;

/**
 * The paper's headline for a big viral moment (one a day at most), by what it was about. The paper's own voice never
 * mocks a student: it tells what went around, not who.
 */
export const VIRAL_HEADLINES: Record<string, readonly string[]> = {
  newBuilding: ['Photos of the New {place} Go Around the State', 'New {place} Draws a Crowd Online'],
  gameWon: ['Game Day Post Seen Across the State', 'Win Over {opp} Lights Up the Campus App'],
  tradition: ['The {tradition} Goes Viral', 'Campus Tradition Shared Thousands of Times'],
  commencement: ['Commencement Post Shared Far Beyond Campus'],
  praise: ['Campus Praise Thread Goes Around the State', 'Students Share Their Favourite Spots, and the State Notices'],
  complaint: ['Student Thread on {topic} Spreads Beyond Campus', 'Complaints About {topic} Seen Across the State'],
  bullyPost: ['Unkind Post Spreads; Students Push Back'],
  other: ['A Student Post Goes Around the State'],
};
/** What each complaint or praise topic is called in a headline. */
export const TOPIC_HEADLINE: Record<CauseTopic, string> = {
  walk: 'the Long Walk to Class',
  green: 'Green Space',
  clean: 'Litter',
  seating: 'Benches',
  noise: 'Noise',
  dining: 'Dining',
  recreation: 'Places to Play',
  safety: 'Campus Safety',
  beds: 'Housing',
  seats: 'Crowded Lectures',
  racks: 'Bike Parking',
};

/**
 * Comments on picking on someone (stop 10): those who join in, those who stand up for the one picked on, the RAs and
 * the counselling center when the anti-bullying program is on. {name} is the one picked on.
 */
export const BULLY_COMMENTS = {
  join: ['facts', 'said it before', 'every time', 'not wrong'],
  defend: ['not cool. leave {name} alone', 'this is not funny', 'reported. be better', '{name} is great and you know it'],
  ra: ['this is not okay. talk to your RA, any time', 'the counselling center is open late this week. anyone can go'],
} as const;

/** The university's official account (decision 8, "Templates"): five kinds, up to three posts a real day. */
export const OFFICIAL_KINDS = ['announce', 'celebrate', 'apologise', 'welcome', 'respond'] as const;
export type OfficialKind = (typeof OFFICIAL_KINDS)[number];
export const OFFICIAL_A_DAY = 3;
export const OFFICIAL_NAMES: Record<OfficialKind, string> = {
  announce: 'Announce an event',
  celebrate: 'Celebrate a win',
  apologise: 'Apologise for a problem',
  welcome: 'Welcome a new class',
  respond: 'Respond to a viral post',
};
/** What the account says, by kind and by what it is about. {place}, {tradition}, {nick}, {topic} as above. */
export const OFFICIAL_LINES = {
  announce: {
    tradition: 'The {tradition} is coming up. See you there!',
    game: 'Game day! Cheer on the {nick} this weekend.',
    kindness: 'Kindness week starts Monday. Talk to your RA or the counselling center any time.',
    fair: 'Club fair on the quad this week. Find your people.',
  },
  celebrate: {
    win: 'What a win! Congratulations, {nick}!',
    semester: 'Proud of every one of you. What a semester.',
    graduates: 'Congratulations, graduates! You did it.',
  },
  apologise: {
    walk: 'The walk to class is too long. We are working on it.',
    green: 'You asked for more green space. It is coming.',
    clean: 'The campus should be cleaner. We are on it.',
    seating: 'More benches are on the way.',
    noise: 'We hear you about the noise.',
    dining: 'We hear you about the food. New menus are on the way.',
    recreation: 'You need more places to play. We are on it.',
    safety: 'Campus safety comes first. More help is on the way.',
    beds: 'We know rooms are tight. More beds are coming.',
    seats: 'Lectures are too full. We are adding seats.',
    racks: 'More bike racks are on the way.',
  },
  welcome: {
    fall: 'Welcome to campus, new students! We are so glad you are here.',
    spring: 'Welcome, new students! The spring semester starts now.',
  },
  respond: {
    good: 'We saw this too. Proud of you!',
    bad: 'We hear you, and we are on it.',
  },
} as const;
/** Students' replies to the account, by how the post lands: in tune with the campus, or not. {topic} is the weak spot. */
export const OFFICIAL_REPLIES = {
  cheer: ['love this', 'proud to be here [heart]', 'best campus [sparkle]', 'yes!'],
  thanks: ['finally', 'thank you for listening', 'we will see', 'about time'],
  fixed: ['okay it really is better now [wow]', 'credit where it is due. it got better'],
  welcome: ['welcome! [wave]', 'you are going to love it here', 'find the good bench early'],
  offKey: {
    walk: 'cool. the walk to class is still a hike though',
    green: 'cool. now plant a tree?',
    clean: 'cool. the bins though',
    seating: 'cool. a bench would be nice',
    noise: 'cool. it is still so loud',
    dining: 'cool. now fix the food',
    recreation: 'cool. a court would be nice too',
    safety: 'cool. the paths are still dark at night',
    beds: 'where are the beds tho',
    seats: 'and the seats?',
    racks: 'cool. a bike rack would be nice',
  },
} as const;

/** Greek Row news by what is going on at the chapter: its philanthropy day, probation, or everyday house life. */
export const GREEK_NEWS = ['philanthropy', 'probation', 'house'] as const;
export const GREEK_POSTS: Record<(typeof GREEK_NEWS)[number], readonly string[]> = {
  philanthropy: [
    'philanthropy day at {chapter}. every dollar goes to a good cause [heart]',
    'pancakes for charity at the {chapter} house this weekend [sparkle]',
    'we raised more than last year. so proud of {chapter} [heart]',
  ],
  probation: [
    'on probation. no socials until further notice [sad]',
    'quiet weekend at the {chapter} house. the dean says hi',
    'probation means study nights now. {chapter} has never been so organised [book]',
  ],
  house: [
    'house dinner at {chapter}. best cooks on Greek Row [heart]',
    'chapter meeting ran long. we planned three socials and a car wash',
    'new letters, same campus. {chapter} forever [sparkle]',
  ],
};

/** Team news by what the team is doing: practice, a game away, new recruits. {opp} is the school they go to. */
export const TEAM_NEWS = ['practice', 'away', 'recruits'] as const;
export const TEAM_POSTS: Record<(typeof TEAM_NEWS)[number], readonly string[]> = {
  practice: [
    'practice at 6 AM. the coach does not believe in sleep [sweat]',
    'film session ran two hours. we watched one play forty times',
    'early practice, ice bath, lecture. student athlete life [ball]',
  ],
  away: ['bus to {opp} this weekend. ready [ball]', 'road trip to {opp}. study notes packed, cleats packed [book]'],
  recruits: ['new recruits on campus today. the future is bright [sparkle]', 'showed the new recruits around. they are fast. really fast [wow]'],
};

/** What a complaint or praise is about: each part of Happiness, and beds and seats. */
// 'racks' (DESIGN.md 64.6) is the app's own: no cause leads to it, so the web never posts it; the app shows bike-parking
// complaints from it while racks are short, and they move nothing.
export const CAUSE_TOPICS = ['walk', 'green', 'clean', 'seating', 'noise', 'dining', 'recreation', 'safety', 'beds', 'seats', 'racks'] as const;
export type CauseTopic = (typeof CAUSE_TOPICS)[number];

/** A complaint (rough) and praise (good) for each, aimed at the place itself, never at a person. */
export const CAUSE_POSTS: Record<CauseTopic, { tag: string; good: readonly string[]; rough: readonly string[] }> = {
  walk: {
    tag: 'LongWalk',
    good: ['class is right outside my door. best thing about this place [sparkle]', 'rolled out of my room and into my seat in four minutes. elite'],
    rough: [
      'the walk from my door to class is a whole workout [sweat]',
      'my step count is up and my mood is down. the walk to class is so long',
      'left early and still late. this campus needs a shortcut',
    ],
  },
  green: {
    tag: 'NeedSomeGreen',
    good: ['the lawn outside {place} in the afternoon. that is the post [sparkle]', 'read on the grass by {place} today. ten out of ten'],
    rough: [
      'not one tree near {place}. I would settle for one patch of grass',
      'all I can see from my window is more buildings',
      'is there grass on this campus? asking from {place}',
    ],
  },
  clean: {
    tag: 'CleanUp',
    good: ['campus is so tidy today. whoever does this, thank you [heart]', 'the paths by {place} are spotless. who is the hero'],
    rough: ['the litter by {place} has its own postcode at this point', 'someone please empty the bins by {place}', 'stepped over three cups on the way to class. come on, everyone'],
  },
  seating: {
    tag: 'NoBenches',
    good: ['found the best bench on campus. not telling anyone where', 'lunch on a bench by {place}. small joys'],
    rough: ['nowhere to sit outside {place}. ate lunch standing up again', 'we need a bench by {place}. even one. I am begging', 'sat on the steps of {place} because there is nowhere else'],
  },
  noise: {
    tag: 'TooLoud',
    good: ['so quiet by {place} I can hear the birds', 'quiet hours at {place} actually work. thank you'],
    rough: ['studied with a pillow over my ears again. so loud by {place}', 'the stadium crowd made my notes vibrate', 'game night noise reached my room in {place}. again'],
  },
  dining: {
    tag: 'DiningDrama',
    good: ['the dining hall is so close I go in my slippers', 'the food near {place} is actually good now. who did this [wow]'],
    rough: ['nowhere to eat near {place}. it has been cereal for three days', 'mystery casserole is back. it knows what it did', 'the line for lunch near {place} went out the door'],
  },
  recreation: {
    tag: 'NothingToDo',
    good: ['pickup game by {place} every night. come through [ball]', 'the rec center is so close I have no excuses left'],
    rough: [
      'nothing to do near {place} but homework. please give us a court',
      'tried to find a game by {place}. found a parking space and a sad bin',
      'bored in {place} on a Friday. the campus needs somewhere to play',
    ],
  },
  safety: {
    tag: 'CampusSafety',
    good: ['walked home late and felt totally fine. campus feels safe [heart]', 'campus safety walked me back to {place}. legends'],
    rough: ['nobody came when the lights went out by {place}. a little help?', 'the path by {place} is so gloomy at night. more help nearby please'],
  },
  beds: {
    tag: 'HousingWoes',
    good: ['got a single in {place}. a whole closet to myself [sparkle]', 'my room in {place} has space for a plant. living the dream'],
    rough: ['three to a room in {place}. we have one closet', 'still on the waitlist for a room. couch life [sweat]', 'my room in {place} is a closet with a window'],
  },
  racks: {
    tag: 'BikeRacks',
    good: ['new bike rack outside my hall. my bike says thank you', 'parked my bike in an actual rack today. growth'],
    rough: [
      'where am i meant to lock my bike. a tree?? [sweat]',
      'bike rack count on this campus: basically zero',
      'my bike has been leaning on the wall of my hall all week. we need racks',
      'locked my scooter to a lamp post again. please build bike racks',
      'there are more bikes leaning on trees here than leaves on them',
      'bike parking here is a free for all. one rack would change my life',
      'tripped over three bikes on the way to class. racks please',
      'my bike lives against a wall now. it deserves better',
    ],
  },
  seats: {
    tag: 'NoSeats',
    good: ['actual seats in every lecture this semester. spoiled', 'got my favourite seat in {place} again [sparkle]'],
    rough: ['no seats in {place} again. sat on the floor the whole lecture', 'lecture so full people were standing in the doorway', 'arrived ten minutes early to {place}. still no seat'],
  },
};

/** Comments, made when a post is opened, by who writes them. {name} in shade is the post's author. */
export const COMMENT_LINES = {
  /** A friend or partner on good news about a couple or a friendship. */
  cheer: ['FINALLY. told you so', 'you two [heart]', 'love this for you', 'called it [laugh]', 'my favourite pair on campus', 'so happy for you two [heart]', 'took you long enough [laugh]', 'this made my day', 'cutest news on campus'],
  /** The one the post is about, answering. */
  reply: ['stuck with you forever [heart]', 'the duo [sparkle]', 'okay this is so sweet', 'right back at you [sparkle]', 'okay stop, I am blushing'],
  /** A friend on sad news. */
  comfort: ['here if you need me [hug]', 'dinner on me this week', 'you deserve better days [heart]', 'sending a hug [hug]', 'snacks are on their way [hug]', 'you know where my room is', 'call me later', 'proud of you for getting through it'],
  /** Anyone on a complaint, exams, the 8 AM, the weather, a roommate. */
  relate: ['so real', 'same [sweat]', 'this is my whole week', 'saving this', 'felt this', 'the most real post on here', 'not just you', 'every single week', 'why is this so true'],
  /** Anyone on a game, a party, a tradition, a club, a new building. */
  hype: ['lets go [wow]', 'see you there', 'save me a spot', 'best night [sparkle]', 'I am in', 'count me in', 'would not miss it', 'bringing the whole floor', 'already counting the hours'],
  /** Anyone, on anything light. */
  laugh: ['[laugh] [laugh]', 'not you posting this', 'okay this one got me [laugh]', 'this is too good [laugh]', 'sending this to everyone', 'the way I laughed [laugh]'],
  /** An ex or a rival, naming the author (decision 5, "Named"): petty, never an insult beyond the mild names allowed. */
  shade: ['sure, {name}. sure.', 'bold post, {name}', '{name} said the same thing last semester', 'classic {name}', 'okay show-off', 'okay try-hard', 'we get it, {name}'],
  /** Anyone on a rumour (stop 10). */
  rumour: ['no way', 'source?', 'allegedly being the key word', 'this is not our business', 'wait what [wow]', 'who is telling you all this', 'need more details. for science'],
  /** A friend of the one a rumour is about. {name} is them. */
  cover: ['leave {name} out of this', 'that is not what happened', 'ask {name} before you post', 'we were there. it was nothing', '{name} would never'],
} as const;
export type CommentKind = keyof typeof COMMENT_LINES;

/** A kind's lines as a post of it reads them: by its mood, and for a complaint, praise or meal by what it is about. */
export function postLines(kind: PostKind, tone: number, a: number): readonly string[] {
  if (kind === POST.complaint || kind === POST.praise) {
    const topic = CAUSE_POSTS[CAUSE_TOPICS[a] ?? 'walk'];
    return kind === POST.complaint ? topic.rough : topic.good;
  }
  if (kind === POST.food) {
    const kinds = Object.keys(FAVOURITES);
    const lines = FAVOURITES[kinds[((a % kinds.length) + kinds.length) % kinds.length]!];
    if (lines) return lines;
  }
  if (kind === POST.greekNews) return GREEK_POSTS[GREEK_NEWS[a] ?? 'house'];
  if (kind === POST.rumour) return RUMOUR_LINES;
  if (kind === POST.teamNews) return TEAM_POSTS[TEAM_NEWS[a] ?? 'practice'];
  const words = POST_WORDS[kind] ?? POST_WORDS[POST.praise];
  return tone === TONE.rough && words.rough ? words.rough : words.good;
}

/** Every line Quadline can write, for the hard-lines scan. */
export function quadlineTemplates(): string[] {
  const out: string[] = [];
  for (const words of Object.values(POST_WORDS)) out.push(...words.tags, ...words.good, ...(words.rough ?? []));
  for (const topic of Object.values(CAUSE_POSTS)) out.push(topic.tag, ...topic.good, ...topic.rough);
  for (const lines of [...Object.values(GREEK_POSTS), ...Object.values(TEAM_POSTS), ...Object.values(RUMOUR_POSTS)]) out.push(...lines);
  for (const lines of Object.values(COMMENT_LINES)) out.push(...lines);
  for (const lines of Object.values(BULLY_COMMENTS)) out.push(...lines);
  for (const lines of Object.values(VIRAL_HEADLINES)) out.push(...lines);
  out.push(...Object.values(TOPIC_HEADLINE), ...Object.values(OFFICIAL_NAMES));
  for (const group of Object.values(OFFICIAL_LINES)) out.push(...Object.values(group));
  const { offKey, ...replies } = OFFICIAL_REPLIES;
  for (const lines of Object.values(replies)) out.push(...lines);
  out.push(...Object.values(offKey));
  return out;
}
