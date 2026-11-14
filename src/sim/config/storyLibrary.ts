import type { Choice, Odds, OddsPart, OddsRead, Outcome, StoryEffect, StorySpec } from './stories';
import type { LifeNeed } from './mc';

/**
 * The library to ship first (DESIGN.md 53.6): 26 arcs and 60 events, every
 * category of the owner's list. A new story is one more entry. `{name}` is the
 * Main Character's first name; `{roommate}`, `{friend}`, `{friend2}`,
 * `{crush}` and `{partner}` the people around them; `{club}`, `{major}`,
 * `{chapter}` and `{team}` what they are part of.
 *
 * Out of the library whatever a story asks (52.1): sexual content, assault,
 * self-harm, suicide, eating disorders, drug addiction, serious violence.
 * Hazing is light and never hurts anyone; drinking is for those of 21 and
 * over and always costs something.
 */

// ---------------------------------------------------------------- helpers --

const P = (read: OddsRead, weight: number, up: string, down: string): OddsPart => ({ read, weight, up, down });
const odds = (base: number, ...parts: OddsPart[]): Odds => ({ base, parts });
const O = (title: string, text: string, effects: StoryEffect[] = [], more: Partial<Outcome> = {}): Outcome => ({ title, text, effects, ...more });
const need = (n: LifeNeed, by: number): StoryEffect => ({ t: 'need', need: n, by });
const mood = (by: number): StoryEffect => ({ t: 'mood', by });
const stress = (by: number): StoryEffect => ({ t: 'stress', by });
const gpa = (by: number): StoryEffect => ({ t: 'gpa', by });
const money = (by: number): StoryEffect => ({ t: 'money', by });
const close = (role: 'roommate' | 'friend' | 'crush' | 'partner', by: number): StoryEffect => ({ t: 'close', role, by });
const choice = (label: string, chance: Odds | null, good: Outcome, bad?: Outcome, lean?: Choice['lean']): Choice => ({ label, odds: chance, good, ...(bad ? { bad } : {}), ...(lean ? { lean } : {}) });

// The parts the odds are made of: what the player can change is named, and so is what the character did.
const STUDY = P('effort.study', 0.5, 'hours at the library', 'too few hours of study');
const NEAR_LIBRARY = P('campus.library', 0.25, 'a library in reach', 'no library in reach');
const CLASSES = P('campus.classes', 0.25, 'room in the classes', 'crowded classes');
const TEACHING = P('campus.teaching', 0.2, 'good teaching', 'thin teaching');
const GRADES = P('gpa', 0.4, 'good grades so far', 'shaky grades so far');
const TRAINING = P('effort.workout', 0.55, 'weeks of training', 'too little training');
const REC = P('campus.recreation', 0.25, 'the rec center in reach', 'nowhere to train nearby');
const MEETING = P('campus.social', 0.3, 'places on campus to meet people', 'nowhere on campus to meet people');
const OUT = P('effort.friends', 0.3, 'time spent with friends', 'too little time with friends');
const RA = P('campus.ra', 0.3, 'an RA on their floor', 'no RA on their floor');
const ROOMIE = P('close.roommate', 0.45, 'getting on with {roommate}', 'a frosty room');
const FRIEND = P('close.friend', 0.4, 'a good friend in {friend}', 'a friendship that has cooled');
const PARTNER = P('close.partner', 0.5, 'a close relationship', 'growing apart');
const CRUSH = P('close.crush', 0.5, 'getting to know {crush}', 'barely knowing {crush}');
const SAFE = P('campus.safety', 0.25, 'Campus Safety nearby', 'no Campus Safety nearby');
const PARTIES = P('campus.parties', 0.3, 'registered parties and alcohol education', 'parties with no rules');
const OVERSIGHT = P('campus.oversight', 0.45, 'the rules against hazing', 'nobody watching the chapters');
const JOBS = P('campus.jobs', 0.35, 'the campus jobs program', 'few campus jobs');
const AID = P('campus.aid', 0.4, 'need-based scholarships', 'no scholarships to apply for');
const DINING = P('campus.dining', 0.25, 'cheaper dining plans', 'the price of meals');
const TEAM = P('campus.team', 0.15, 'a winning football program', 'a losing football program');
const CLUB = P('effort.club', 0.3, 'time at the {club}', 'little time at the {club}');
const RESTED = P('need.energy', 0.3, 'a good night’s sleep', 'too little sleep');
const STEADY = P('need.study', 0.3, 'keeping up with the work', 'falling behind');
const WORK = P('effort.job', 0.3, 'shifts worked', 'few shifts worked');

const ARC = (spec: Omit<StorySpec, 'kind'>): StorySpec => ({ ...spec, kind: 'arc' });
const EVENT = (spec: Omit<StorySpec, 'kind' | 'stages'> & { text: string; choices: Choice[] }): StorySpec => ({
  id: spec.id,
  category: spec.category,
  title: spec.title,
  kind: 'event',
  weight: spec.weight,
  ...(spec.heavy ? { heavy: spec.heavy } : {}),
  ...(spec.good ? { good: spec.good } : {}),
  ...(spec.needs ? { needs: spec.needs } : {}),
  ...(spec.calendar ? { calendar: spec.calendar } : {}),
  stages: [{ text: spec.text, hours: 0, choices: spec.choices }],
});

// ------------------------------------------------------------------- arcs --

export const ARCS: readonly StorySpec[] = [
  // Roommates
  ARC({
    id: 'roommateMatch',
    category: 'roommates',
    title: 'The roommate',
    weight: 3,
    needs: ['roommate'],
    stages: [
      {
        text: 'A month into the year, {name} and {roommate} are still feeling each other out.',
        hours: 2,
        choices: [
          choice('suggests a night out together', odds(0.55, ROOMIE, MEETING, RA), O('Hit it off', 'A long dinner, a terrible film, and an inside joke that will last four years.', [close('roommate', 20), mood(3)]), O('Polite, nothing more', 'They are fine. Just fine. They split the room down the middle, more or less.', [close('roommate', 5)])),
          choice('keeps to their side of the room', odds(0.45, ROOMIE, RA), O('Easy to live with', 'Quiet, steady, no trouble. Not best friends, but good roommates.', [close('roommate', 8)]), O('Two strangers', 'They talk mostly in sticky notes.', [mood(-2)]), { natures: ['scholar', 'stressed', 'slacker'] }),
        ],
      },
      {
        text: '{roommate} has started a habit: {name} notices it every single day.',
        hours: 14,
        choices: [
          choice('talks it through over breakfast', odds(0.6, ROOMIE, RA), O('Worked out', 'A two-minute talk, a deal about the trash, and that is that.', [close('roommate', 10), mood(2)]), O('It went sideways', 'The talk turns into a list of grievances on both sides.', [close('roommate', -15), stress(4)], { next: 'roomSwap' })),
          choice('says nothing and stews', odds(0.3, ROOMIE), O('It passed', 'The habit fades on its own. Lucky.', [close('roommate', 2)]), O('The cold war', 'Silence becomes the house style.', [close('roommate', -12), stress(5), mood(-3)], { next: 'roomSwap' }), { natures: ['stressed', 'scholar'] }),
        ],
      },
    ],
  }),
  ARC({
    id: 'oppositeSchedules',
    category: 'roommates',
    title: 'Opposite schedules',
    weight: 2,
    needs: ['roommate'],
    stages: [
      {
        text: '{roommate} is up at two in the morning and {name} is up at seven. Sleep is getting short.',
        hours: 2,
        choices: [
          choice('buys earplugs and a sleep mask', odds(0.55, RESTED, RA), O('Sleeping again', 'Earplugs, a mask and a fan. It works.', [need('energy', 10), money(-25)]), O('Still awake', 'The keyboard clatters through the earplugs.', [need('energy', -10), stress(3)])),
          choice('asks for a quiet-hours deal', odds(0.5, ROOMIE, RA), O('A deal', 'Lights off at midnight on weeknights. Both keep it.', [close('roommate', 8), need('energy', 8)]), O('No deal', '{roommate} shrugs. Night owls are night owls.', [close('roommate', -8), need('energy', -6)])),
        ],
      },
      {
        text: 'A week later, the tired is showing in class.',
        hours: 24,
        choices: [
          choice('starts studying in the library at night', odds(0.6, NEAR_LIBRARY, STUDY), O('A rhythm', 'Evenings at the library, mornings in class. It suits them.', [need('study', 10), gpa(0.05)]), O('Still tired', 'The library closes, the room is still loud.', [need('energy', -8), gpa(-0.05)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'roomSwap',
    category: 'roommates',
    title: 'The room swap',
    weight: 1,
    needs: ['roommate'],
    stages: [
      {
        text: 'Things with {roommate} have not got better. {name} looks into a room swap.',
        hours: 3,
        choices: [
          choice('fills in the housing form', odds(0.5, RA, P('campus.ra', 0.2, 'a housing office with room to move people', 'full dorms')), O('A new room', 'A swap comes through for the next semester. A fresh start.', [{ t: 'cast', change: 'newRoommate' }, mood(4), stress(-4)], { big: true }), O('Waiting list', 'No rooms free. They stay put, and make the best of it.', [stress(3)])),
          choice('tries one more conversation first', odds(0.45, ROOMIE, RA), O('Made peace', 'They agree the year has been rough on both of them. It gets easier.', [close('roommate', 18), mood(3)]), O('Moving out anyway', 'The talk confirms it: time for a new room.', [{ t: 'cast', change: 'newRoommate' }, stress(2)])),
        ],
      },
    ],
  }),
  // Classes
  ARC({
    id: 'weedOut',
    category: 'classes',
    title: 'The make-or-break class',
    weight: 3,
    needs: ['term'],
    calendar: 'exams',
    stages: [
      {
        text: 'The first problem set in the big intro course for {major} comes back with a 54 on it.',
        hours: 1,
        choices: [
          choice('starts going to office hours', odds(0.6, TEACHING, CLASSES), O('A way in', 'The professor turns out to be kind, and the problem sets start to make sense.', [need('study', 10), gpa(0.05)]), O('Lost in the crowd', 'Forty students at office hours. {name} waits an hour and gets two minutes.', [stress(4)])),
          choice('forms a study group', odds(0.55, MEETING, STUDY, NEAR_LIBRARY), O('The group works', 'Four of them, a whiteboard, and a lot of snacks.', [need('social', 8), need('study', 8), gpa(0.05)]), O('The group drifts', 'The group meets twice and then becomes a group chat about lunch.', [need('social', 5)]), { natures: ['butterfly', 'charmer'] }),
        ],
      },
      {
        text: 'The midterm for the make-or-break class is tomorrow.',
        hours: 30,
        cliff: '{name} has the make-or-break midterm tomorrow. Has the studying been enough?',
        choices: [
          choice('studies late, then sleeps', odds(0.5, STUDY, STEADY, NEAR_LIBRARY, CLASSES), O('Passed', '{name} passed the midterm with a B. The class is staying.', [gpa(0.15), mood(6), stress(-6)], { big: true }), O('Failed the midterm', 'A 41. The class is not lost yet, but it is close.', [gpa(-0.15), stress(8), mood(-5)], { next: 'failingMidterm', big: true })),
        ],
      },
    ],
  }),
  ARC({
    id: 'groupProject',
    category: 'classes',
    title: 'The group project',
    weight: 2,
    needs: ['term'],
    stages: [
      {
        text: '{name} is put in a group of four for a project worth a third of the grade. One of them has not replied in a week.',
        hours: 1,
        choices: [
          choice('takes charge of the plan', odds(0.55, MEETING, STEADY), O('Organised', 'A shared document, deadlines, and a group that finally answers.', [need('study', 6), stress(-2)]), O('Doing it alone', 'The plan is perfect. {name} is the only one following it.', [stress(6), need('energy', -8)]), { natures: ['scholar', 'stressed', 'ra'] }),
          choice('waits for someone else to start', odds(0.35, STEADY), O('Someone did', 'Another member steps up. Lucky.', []), O('Nobody did', 'Three days before the deadline, nothing exists.', [stress(8)])),
        ],
      },
      {
        text: 'Presentation day.',
        hours: 30,
        choices: [
          choice('presents the group’s work', odds(0.55, STUDY, CLASSES, TEACHING), O('A good grade', 'An A minus, and a professor who says it was the best of the day.', [gpa(0.1), mood(5)], { big: true }), O('A rough presentation', 'The slides were late and it showed. A C.', [gpa(-0.08), mood(-3)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'failingMidterm',
    category: 'classes',
    title: 'Probation and the way back',
    weight: 1,
    heavy: true,
    needs: ['term'],
    stages: [
      {
        text: 'After the failed midterm, {name} gets an email from the academic advisor: they are on track for academic probation.',
        hours: 2,
        choices: [
          choice('meets the advisor and makes a plan', odds(0.65, TEACHING, NEAR_LIBRARY, CLASSES), O('A plan', 'Tutoring twice a week, a lighter club schedule, and a weekly check-in.', [need('study', 12), stress(-4)]), O('A plan on paper', 'The plan is good. Keeping to it is harder.', [stress(4)])),
          choice('decides to fix it alone', odds(0.4, STUDY, STEADY), O('Head down', 'Long nights and short weekends. It is working.', [need('study', 10), need('fun', -10)]), O('Behind still', 'Alone, it is too much at once.', [stress(8), need('energy', -10)]), { natures: ['stressed', 'scholar'] }),
        ],
      },
      {
        text: 'The final exam decides it.',
        hours: 36,
        cliff: 'The final that decides {name}’s probation is tomorrow.',
        choices: [
          choice('sits the final', odds(0.55, STUDY, STEADY, NEAR_LIBRARY, TEACHING), O('Off probation', '{name} passed the final and the class. Off probation, and proud of it.', [gpa(0.25), mood(10), stress(-10)], { big: true }), O('On probation', '{name} failed the class and is on academic probation next semester. It is a setback, not the end: retaking it is allowed.', [gpa(-0.2), mood(-8), stress(8)], { big: true })),
        ],
      },
    ],
  }),
  ARC({
    id: 'majorCrisis',
    category: 'classes',
    title: 'The major crisis',
    weight: 2,
    stages: [
      {
        text: '{name} sits in a {major} lecture and wonders, for the first time, whether this is the right major at all.',
        hours: 2,
        choices: [
          choice('takes a class in something new', odds(0.55, TEACHING, CLASSES), O('An inspiring professor', 'An elective, a brilliant professor, and a spark.', [mood(6), need('study', 6)]), O('Not that either', 'The elective is a slog. Maybe the old major was fine.', [stress(2)])),
          choice('calls home about it', odds(0.45, FRIEND), O('Support', 'Home says: do what you love. {name} feels lighter.', [mood(5), stress(-4)]), O('Pushback', 'Home has opinions, all of them about the old major.', [stress(6), mood(-3)]), { natures: ['homesick', 'stressed', 'commuter'] }),
        ],
      },
      {
        text: 'The deadline to declare is this week.',
        hours: 20,
        choices: [
          choice('switches majors', odds(0.6, TEACHING, GRADES), O('A new major', '{name} switched majors. It feels right, and a little terrifying.', [mood(8), stress(-6), gpa(0.05)], { big: true }), O('A late switch', 'The switch adds a semester. Worth it, probably.', [stress(5), mood(2)], { big: true })),
          choice('stays the course', odds(0.6, GRADES, STEADY), O('Recommitted', 'With the doubt said out loud, the major feels chosen again.', [mood(4)]), O('Still unsure', 'Staying is easier than deciding. For now.', [stress(3)]), { natures: ['scholar', 'broke'] }),
        ],
      },
    ],
  }),
  // Dating
  ARC({
    id: 'theCrush',
    category: 'dating',
    title: 'The crush',
    weight: 3,
    needs: ['crush'],
    stages: [
      {
        text: '{name} keeps noticing {crush} at the dining hall.',
        hours: 1,
        choices: [
          choice('finds a reason to sit nearby', odds(0.55, CRUSH, MEETING), O('A conversation', 'A shared table, a shared complaint about the food, a laugh.', [close('crush', 15), mood(4)]), O('Too shy', '{name} sits nearby and says nothing at all.', [close('crush', 2)])),
        ],
      },
      {
        text: '{name} has worked up the courage to ask {crush} out.',
        hours: 20,
        cliff: '{name} is going to ask {crush} out tomorrow.',
        choices: [
          choice('asks', odds(0.5, CRUSH, OUT, MEETING), O('A yes', '{crush} said yes. A coffee on Saturday.', [mood(10), close('crush', 15)], { big: true }), O('A kind no', '{crush} said no, kindly. It stings, and it will pass.', [mood(-8), { t: 'cast', change: 'newCrush' }], { big: true, next: 'end' })),
          choice('waits for a sign', odds(0.25, CRUSH), O('The sign', '{crush} asks first. Unbelievable.', [mood(12), close('crush', 20)], { big: true }), O('Missed it', 'The moment passes. {crush} is seeing someone else now.', [mood(-6), { t: 'cast', change: 'newCrush' }], { next: 'end' }), { natures: ['stressed', 'scholar'] }),
        ],
      },
      {
        text: 'The date.',
        hours: 30,
        choices: [
          choice('goes on the date', odds(0.6, CRUSH, MEETING, P('campus.dining', 0.15, 'somewhere good to eat nearby', 'nowhere good to eat nearby')), O('Falling for each other', 'Three hours that felt like ten minutes. {name} and {crush} are together now.', [{ t: 'cast', change: 'crushToPartner' }, mood(12), need('social', 15)], { big: true }), O('Just friends', 'Nice, but no spark. They agree to be friends, and mean it.', [{ t: 'cast', change: 'newFriend' }, mood(-2)], { big: true })),
        ],
      },
    ],
  }),
  ARC({
    id: 'longDistance',
    category: 'dating',
    title: 'Long distance',
    weight: 2,
    needs: ['partner'],
    stages: [
      {
        text: '{partner} lives four hours away. The calls are getting shorter.',
        hours: 3,
        choices: [
          choice('plans a visit', odds(0.55, PARTNER), O('A good weekend', 'A weekend together reminds them both why they bother.', [close('partner', 15), mood(6), money(-60)]), O('An awkward weekend', 'The visit is fine, and somehow that is worse.', [close('partner', -8), money(-60)])),
          choice('sets a nightly call', odds(0.5, PARTNER, RESTED), O('A routine', 'Ten minutes every night, no matter what.', [close('partner', 10)]), O('Missed calls', 'Classes, clubs, sleep: the calls slip.', [close('partner', -10), stress(3)])),
        ],
      },
      {
        text: 'A month later, they talk about where this is going.',
        hours: 40,
        choices: [
          choice('makes a plan for the summer', odds(0.55, PARTNER), O('Going strong', 'A plan, a countdown, and a framed photo on the desk.', [close('partner', 10), mood(6)], { big: true }), O('Over, kindly', 'They decide distance is too much. It is sad, and it is right.', [{ t: 'cast', change: 'breakup' }, mood(-10), stress(6)], { big: true, next: 'runningIntoEx' })),
        ],
      },
    ],
  }),
  ARC({
    id: 'jealousy',
    category: 'dating',
    title: 'Jealousy',
    weight: 1,
    heavy: true,
    needs: ['partner', 'friend'],
    stages: [
      {
        text: '{partner} does not like how much time {name} spends with {friend}.',
        hours: 2,
        choices: [
          choice('introduces them properly', odds(0.5, PARTNER, FRIEND, MEETING), O('They get on', 'A dinner for three. {partner} and {friend} trade embarrassing stories about {name}.', [close('partner', 8), close('friend', 5), mood(4)]), O('It got worse', 'The dinner is polite and tense.', [close('partner', -10), stress(5)])),
          choice('sees {friend} less', odds(0.45, PARTNER), O('Peace at home', '{partner} relaxes. {name} misses {friend} a little.', [close('partner', 6), close('friend', -10)]), O('Lonely', 'Seeing {friend} less makes {name} miserable, and {partner} no happier.', [close('friend', -12), mood(-5)])),
        ],
      },
      {
        text: 'It comes to a head.',
        hours: 30,
        choices: [
          choice('says what they need', odds(0.45, PARTNER, FRIEND), O('Stronger for it', 'A long talk, some tears, and a relationship that knows its rules now.', [close('partner', 12), mood(6)], { big: true }), O('The breakup', '{name} and {partner} broke up. Their friends bring ice cream.', [{ t: 'cast', change: 'breakup' }, mood(-12), stress(8), need('social', 8)], { big: true, next: 'runningIntoEx' })),
        ],
      },
    ],
  }),
  ARC({
    id: 'runningIntoEx',
    category: 'dating',
    title: 'Moving on',
    weight: 0,
    stages: [
      {
        text: 'Two weeks after the breakup, {name} sees their ex across the quad.',
        hours: 30,
        choices: [
          choice('waves and keeps walking', odds(0.6, OUT, MEETING), O('Moving on', 'A wave, a nod, and the rest of a good day. It is getting easier.', [mood(6), stress(-5)], { big: true }), O('Not yet', 'The rest of the day is quiet and heavy. Healing takes as long as it takes.', [mood(-4), need('social', -5)])),
          choice('spends the evening with friends', odds(0.65, FRIEND, MEETING), O('Good friends', '{friend} and a pizza make it a good night after all.', [close('friend', 10), mood(8)]), O('A long night', 'Even with friends, it is a long night.', [mood(-3)]), { natures: ['butterfly', 'charmer', 'party'] }),
        ],
      },
    ],
  }),
  // Partying
  ARC({
    id: 'partyBeforeExam',
    category: 'partying',
    title: 'The party before the exam',
    weight: 2,
    needs: ['term'],
    stages: [
      {
        text: 'The biggest party of the month is the night before {name}’s hardest exam.',
        hours: 2,
        choices: [
          choice('goes for one hour, then home', odds(0.5, RESTED, PARTIES), O('One hour it was', 'One hour, a good time, home by eleven.', [need('fun', 15), need('social', 10)]), O('One hour became four', 'One hour became four. The alarm will be cruel.', [need('energy', -20), need('fun', 15)]), { natures: ['party', 'butterfly', 'clown'] }),
          choice('stays in and studies', odds(0.8, STUDY), O('Ready', 'A quiet night and a full night’s sleep.', [need('study', 12), need('fun', -8)]), O('Too wired to sleep', 'The bass from the party carries across the quad.', [need('energy', -10)]), { natures: ['scholar', 'stressed'] }),
        ],
      },
      {
        text: 'Exam morning.',
        hours: 12,
        choices: [
          choice('sits the exam', odds(0.5, STUDY, RESTED, CLASSES), O('Made it through', 'Tired, but the answers were there.', [gpa(0.08), mood(4)]), O('A bad exam', 'Half the exam was a blur. That one will hurt the grade.', [gpa(-0.12), stress(6), mood(-4)], { big: true })),
        ],
      },
    ],
  }),
  ARC({
    id: 'partyScene',
    category: 'partying',
    title: 'The party scene',
    weight: 2,
    stages: [
      {
        text: 'Everyone on {name}’s floor seems to be out every weekend.',
        hours: 2,
        choices: [
          choice('starts going out every weekend', odds(0.45, RESTED, PARTIES, STEADY), O('Having a great time', 'Friday, Saturday, sometimes Thursday. The best stories of the year.', [need('fun', 20), need('social', 15)]), O('Burning out', 'Every weekend, every week. Grades and sleep are paying for it.', [need('energy', -20), gpa(-0.1), stress(5)], { big: true }), { natures: ['party', 'butterfly', 'attention'] }),
          choice('finds their own kind of night out', odds(0.55, MEETING, CLUB), O('Their own scene', 'Board games, open mic nights, late diner runs. Their people.', [need('social', 15), mood(5)]), O('Left out', 'Every Monday the stories are about parties {name} was not at.', [need('social', -10), mood(-5)]), { natures: ['scholar', 'stressed', 'slacker'] }),
        ],
      },
    ],
  }),
  ARC({
    id: 'partyBrokenUp',
    category: 'partying',
    title: 'The party that got broken up',
    weight: 1,
    needs: ['friend'],
    stages: [
      {
        text: '{friend} is throwing a party in their dorm. It is getting big.',
        hours: 2,
        choices: [
          choice('helps keep it small and registered', odds(0.6, PARTIES, SAFE, RA), O('A good party', 'A registered party, a host who stayed sober, and no trouble at all.', [need('fun', 15), close('friend', 8)]), O('Too big anyway', 'Word got out. Campus Safety came at one and sent everyone home.', [need('fun', 5), stress(3)])),
          choice('lets it grow', odds(0.3, SAFE), O('Legendary', 'Somehow nothing went wrong. People will talk about it for weeks.', [need('fun', 20), need('social', 10)]), O('Broken up', 'Campus Safety broke it up at midnight. {friend} meets the Dean on Monday.', [close('friend', 5), stress(6), mood(-3)], { big: true })),
        ],
      },
    ],
  }),
  // Social
  ARC({
    id: 'findingPeople',
    category: 'social',
    title: 'Finding their people',
    weight: 3,
    stages: [
      {
        text: '{name} has acquaintances, but nobody they would call at midnight.',
        hours: 2,
        choices: [
          choice('goes to the club fair', odds(0.6, MEETING, CLUB), O('A club', 'A sign-up sheet, a free T-shirt, and a group that meets Thursdays.', [need('social', 10), mood(4)]), O('Too many tables', 'Twenty clubs, twenty sign-ups, no follow-up.', [])),
          choice('says yes to every invitation', odds(0.55, OUT, MEETING), O('A crowd', 'Dinners, study groups, a road trip. A crowd of new faces.', [need('social', 15), need('energy', -8)]), O('Exhausted', 'Every invitation, every night. {name} is tired of people.', [need('energy', -15)]), { natures: ['butterfly', 'charmer', 'clown'] }),
        ],
      },
      {
        text: 'A few weeks in, one of the new faces keeps turning up.',
        hours: 30,
        choices: [
          choice('invites them for a long walk', odds(0.6, MEETING, OUT), O('A best friend', 'Somewhere on that walk, {name} found a best friend.', [{ t: 'cast', change: 'newFriend' }, mood(10), need('social', 15)], { big: true }), O('Not quite', 'Nice, but not a match. The search goes on.', [need('social', 4)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'friendGroupSplits',
    category: 'social',
    title: 'The friend group splits',
    weight: 1,
    needs: ['friend'],
    stages: [
      {
        text: '{friend} and {friend2} have fallen out, and both want {name} on their side.',
        hours: 2,
        choices: [
          choice('stays friends with both', odds(0.45, FRIEND, OUT), O('The bridge', '{name} holds the group together. It takes some doing.', [close('friend', 6), stress(3)]), O('Caught in the middle', 'Both are cross with {name} now.', [close('friend', -12), stress(6), mood(-4)])),
          choice('sides with {friend}', odds(0.6, FRIEND), O('Loyal', '{friend} will not forget it.', [close('friend', 12)]), O('Smaller group', 'The group is smaller now. That is how it goes sometimes.', [need('social', -10), mood(-3)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'homesickness',
    category: 'social',
    title: 'Homesick',
    weight: 2,
    needs: ['freshman'],
    stages: [
      {
        text: 'Three weeks in, {name} misses home more than they expected.',
        hours: 1,
        choices: [
          choice('calls home every evening', odds(0.45, FRIEND, MEETING), O('A lifeline', 'A call a day keeps the worst of it away.', [mood(4)]), O('Worse after the calls', 'Every call makes the room feel further from home.', [mood(-5)])),
          choice('makes the dorm feel like home', odds(0.6, MEETING, RA, ROOMIE), O('Settling in', 'Photos on the wall, a floor movie night, a roommate who makes tea.', [mood(6), need('social', 10)]), O('Still strange', 'The posters are up. It still does not feel like home.', [mood(-2)])),
        ],
      },
      {
        text: 'Fall break.',
        hours: 48,
        choices: [
          choice('goes home for the break', null, O('Coming back different', 'Home is lovely, and on the drive back {name} realises campus feels like home too now.', [mood(10), stress(-8)], { big: true })),
        ],
      },
    ],
  }),
  // Money and life
  ARC({
    id: 'brokeToJob',
    category: 'money',
    title: 'Broke before the end of the month',
    weight: 2,
    needs: ['noJob'],
    stages: [
      {
        text: '{name} checks their bank account. It is the 20th, and there is almost nothing left.',
        hours: 1,
        choices: [
          choice('looks for a campus job', odds(0.5, JOBS, P('campus.dining', 0.15, 'cheap meals in the meantime', 'the price of meals')), O('A campus job', '{name} got a job at the library desk: ten hours a week.', [{ t: 'job', job: 'Library desk' }, money(120), stress(-4)], { big: true }), O('No openings', 'Every campus job is taken. Ramen it is.', [stress(6), need('fun', -10)], { next: 'jobVsClasses' })),
          choice('cuts back until next month', odds(0.55, DINING), O('Made it', 'A careful two weeks, and the account survives.', [need('fun', -8)]), O('Overdrawn', 'An overdraft fee and a lesson learned.', [money(-35), stress(5)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'jobVsClasses',
    category: 'money',
    title: 'The job and the classes',
    weight: 1,
    needs: ['term'],
    stages: [
      {
        text: '{name} has taken an off-campus job with long shifts. Classes are starting to slip.',
        hours: 2,
        choices: [
          choice('asks for fewer shifts', odds(0.5, JOBS, AID), O('Balance', 'Fewer shifts, a little less money, and grades back on track.', [gpa(0.05), stress(-4), money(-40)]), O('All or nothing', 'The manager says it is all the shifts or none.', [stress(6)])),
          choice('keeps every shift', odds(0.35, STEADY, RESTED), O('Getting by', 'Tired, but the rent is paid and the grades are holding.', [money(150), need('energy', -12)]), O('Sliding', 'The money is good. The midterm is not.', [money(150), gpa(-0.15), stress(8)], { big: true })),
        ],
      },
    ],
  }),
  ARC({
    id: 'scholarshipOnLine',
    category: 'money',
    title: 'A scholarship on the line',
    weight: 1,
    needs: ['term'],
    stages: [
      {
        text: '{name}’s scholarship needs a 3.0 this semester. It is going to be close.',
        hours: 2,
        cliff: '{name} needs a 3.0 this semester to keep their scholarship.',
        choices: [
          choice('drops a club to make time', odds(0.55, STUDY, NEAR_LIBRARY, AID), O('On track', 'More time, better notes, and a 3.0 in sight.', [need('study', 12), need('social', -8)]), O('Still short', 'The time is there. The grades are not, yet.', [stress(6)])),
        ],
      },
      {
        text: 'Grades are out.',
        hours: 40,
        choices: [
          choice('opens the grades', odds(0.55, GRADES, STUDY, CLASSES, AID), O('Kept it', 'A 3.1. The scholarship is safe for another year.', [mood(10), stress(-10)], { big: true }), O('Lost it', 'A 2.8. The scholarship is gone, but an appeal and a part-time job are possible.', [mood(-8), stress(8), money(-200)], { big: true, next: 'brokeToJob' })),
        ],
      },
    ],
  }),
  // Greek life and teams
  ARC({
    id: 'rushBidDay',
    category: 'greek',
    title: 'Rush and bid day',
    weight: 3,
    needs: ['greekRow', 'notMember'],
    calendar: 'rush',
    stages: [
      {
        text: 'It is rush week. {name} walks Greek Row with a name tag and a nervous smile.',
        hours: 1,
        choices: [
          choice('rushes the chapter that feels right', odds(0.55, OUT, MEETING, P('campus.oversight', 0.1, 'chapters that run a fair rush', 'chapters that pick favourites')), O('A bid', '{name} got a bid from {chapter}. Bid day is loud, happy and slightly overwhelming.', [{ t: 'greek', join: true }, mood(10), need('social', 15)], { big: true, next: 'pledging' }), O('No bid', 'No bid this time. It hurts, and there are other ways to find a home.', [mood(-8)], { big: true, next: 'findingPeople' }), { natures: ['butterfly', 'party', 'charmer', 'attention'] }),
          choice('decides Greek life is not for them', null, O('Not for them', '{name} walked the Row, ate the free food, and decided against it. No regrets.', [need('fun', 5)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'pledging',
    category: 'greek',
    title: 'Pledging',
    weight: 0,
    heavy: true,
    needs: ['member'],
    stages: [
      {
        text: 'Pledging at {chapter} has begun. Tonight the pledges are told to be on the lawn at five in the morning, in matching bathrobes, to recite the chapter’s history.',
        hours: 20,
        choices: [
          choice('goes along with it', odds(0.6, OVERSIGHT), O('Silly, and over', 'Embarrassing and early, but harmless. The pledge class bonds over it.', [need('energy', -10), need('social', 10)]), O('More of it', 'The early mornings keep coming, and grades are paying.', [need('energy', -15), gpa(-0.08), stress(5)]), { natures: ['party', 'butterfly', 'clown', 'attention'] }),
          choice('pushes back, politely', odds(0.5, OVERSIGHT, FRIEND), O('Heard', 'The chapter president agrees: no more five o’clock mornings.', [mood(5), stress(-3)], { big: true }), O('Frozen out', 'Pushing back makes {name} unpopular with the older members.', [need('social', -10), mood(-5)])),
          choice('reports it to the Dean of Students', odds(0.6, OVERSIGHT), O('Handled', 'The Dean steps in quietly. The tasks stop, and nobody is in trouble but the chapter.', [stress(-4), mood(4)], { big: true }), O('Awkward', 'The chapter is put on probation, and everyone knows who reported it.', [need('social', -12), stress(6)], { big: true }), { natures: ['ra', 'scholar', 'stressed'] }),
        ],
      },
      {
        text: 'Initiation night.',
        hours: 40,
        choices: [
          choice('is initiated', odds(0.75, OVERSIGHT, OUT), O('A member', '{name} is a full member of {chapter}: candles, a secret handshake, and lifelong friends.', [mood(8), need('social', 12)], { big: true }), O('Walked away', '{name} decided the chapter was not worth it, and left. They still have their pledge-class friends.', [{ t: 'greek', join: false }, mood(-3), { t: 'cast', change: 'newFriend' }], { big: true })),
        ],
      },
    ],
  }),
  ARC({
    id: 'tryouts',
    category: 'teams',
    title: 'Tryouts',
    weight: 2,
    needs: ['notTeam'],
    calendar: 'season',
    stages: [
      {
        text: 'Tryouts for {team} are in two weeks. {name} has been thinking about it all summer.',
        hours: 1,
        choices: [
          choice('trains every day', odds(0.6, REC, TRAINING), O('In shape', 'Two weeks of early runs. {name} is faster than they have ever been.', [need('fitness', 20), need('energy', -8)]), O('Sore', 'Too much too soon. Sore legs and a slower time.', [need('fitness', 5), need('energy', -12)]), { natures: ['athlete', 'superfan'], goals: ['fit'] }),
          choice('trusts their talent', odds(0.35, TRAINING), O('Ready anyway', 'Natural speed is a real thing.', []), O('Rusty', 'The first practice run is a shock.', [stress(4)])),
        ],
      },
      {
        text: 'Tryout day.',
        hours: 30,
        cliff: 'Tryouts for {team} are tomorrow.',
        choices: [
          choice('runs their best', odds(0.45, TRAINING, REC, TEAM, RESTED), O('Made the team', '{name} made {team}!', [{ t: 'team', join: true }, mood(12), need('fitness', 10)], { big: true }), O('Cut', '{name} was cut from {team}. The coach says try again next year, and means it.', [mood(-8), stress(4)], { big: true, next: 'end' })),
        ],
      },
      {
        text: 'Half a season on the bench.',
        hours: 72,
        choices: [
          choice('stays late at every practice', odds(0.5, TRAINING, REC), O('A starter', 'The coach notices. {name} starts the next meet.', [mood(10), need('fitness', 10)], { big: true }), O('Still on the bench', 'Not yet. The coach says next season.', [mood(-3)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'injuryComeback',
    category: 'teams',
    title: 'The comeback',
    weight: 1,
    needs: ['team'],
    stages: [
      {
        text: '{name} rolls an ankle at practice. Six weeks out, the trainer says.',
        hours: 1,
        choices: [
          choice('does every rehab session', odds(0.65, REC, P('campus.safety', 0.2, 'the Medical Center nearby', 'no Medical Center nearby')), O('On schedule', 'Ice, bands, and boring exercises that work.', [need('fitness', 8), stress(-2)]), O('Slow going', 'The ankle is slow to heal.', [stress(5), mood(-4)])),
        ],
      },
      {
        text: 'Cleared to run.',
        hours: 60,
        choices: [
          choice('comes back for the last meet', odds(0.55, TRAINING, REC), O('Back', '{name} ran the last meet of the season and finished strong.', [mood(12), need('fitness', 10)], { big: true }), O('Next season', 'Not ready for this season. Next year, then.', [mood(-4)])),
        ],
      },
    ],
  }),
  // Good arcs
  ARC({
    id: 'deansListRun',
    category: 'good',
    title: 'The Dean’s list run',
    weight: 2,
    good: true,
    needs: ['term'],
    stages: [
      {
        text: '{name} has an A in three classes and a shot at the Dean’s list.',
        hours: 2,
        choices: [
          choice('builds a study routine', odds(0.65, NEAR_LIBRARY, STUDY, TEACHING), O('A routine', 'Library at four, dinner at seven, review at nine. It works.', [need('study', 15), gpa(0.08)]), O('A messy routine', 'The routine lasts a week. Still, the grades are good.', [need('study', 5)]), { goals: ['deansList'] }),
        ],
      },
      {
        text: 'Finals.',
        hours: 40,
        choices: [
          choice('sits the finals', odds(0.6, STUDY, GRADES, CLASSES, TEACHING), O('The Dean’s list', '{name} made the Dean’s list. Home is getting a copy of the letter.', [gpa(0.15), mood(12)], { big: true }), O('Close', 'One B plus kept them off the list. Next semester.', [gpa(0.05), mood(-2)])),
        ],
      },
    ],
  }),
  ARC({
    id: 'studentGovernment',
    category: 'good',
    title: 'Running for student government',
    weight: 1,
    good: true,
    stages: [
      {
        text: '{name} decides to run for the student senate.',
        hours: 2,
        choices: [
          choice('campaigns door to door', odds(0.55, MEETING, OUT), O('Known on campus', 'Three hundred doors, three hundred names. People wave now.', [need('social', 15), need('energy', -10)]), O('Few doors open', 'Most doors stay shut. Campaigns are hard.', [need('energy', -10)])),
          choice('runs on one big idea', odds(0.5, MEETING, CLUB), O('A real platform', 'Late-night dining hours. Everyone loves it.', [mood(5)]), O('One idea, one voter', 'The big idea turns out to matter mostly to {name}.', [])),
        ],
      },
      {
        text: 'Election day.',
        hours: 40,
        cliff: 'Election day for {name} is tomorrow.',
        choices: [
          choice('waits for the count', odds(0.45, MEETING, OUT, GRADES), O('Elected', '{name} won a seat in the student senate by forty votes.', [mood(14), need('social', 10)], { big: true }), O('Lost', '{name} lost by forty votes. They are already thinking about next year’s run.', [mood(-6)], { big: true })),
        ],
      },
    ],
  }),
];

// ------------------------------------------------------------------ events --

/** Small one-stage problems and pleasures (53.6). */
export const EVENTS: readonly StorySpec[] = [
  // Roommates (8)
  EVENT({ id: 'messyRoommate', category: 'roommates', title: 'A messy room', weight: 2, needs: ['roommate'], text: '{roommate}’s laundry has reached {name}’s side of the room.', choices: [choice('asks for a cleaning rota', odds(0.55, ROOMIE, RA), O('A rota', 'A rota on the door. It mostly holds.', [close('roommate', 4)]), O('Ignored', 'The rota is ignored. The laundry advances.', [stress(3)]))] }),
  EVENT({ id: 'loudRoommate', category: 'roommates', title: 'A loud room', weight: 2, needs: ['roommate'], text: '{roommate} has friends over until one in the morning, again.', choices: [choice('asks them to keep it down', odds(0.55, ROOMIE, RA), O('Quieter', 'A sheepish apology, and a quieter night.', [need('energy', 5)]), O('Louder', 'Somehow it gets louder.', [need('energy', -10), close('roommate', -6)]))] }),
  EVENT({ id: 'borrowedThings', category: 'roommates', title: 'Borrowed things', weight: 1, needs: ['roommate'], text: '{name}’s favourite hoodie is on {roommate}. Again.', choices: [choice('laughs it off', null, O('Shared wardrobe', 'It is a good hoodie. They share it now.', [close('roommate', 4)]))] }),
  EVENT({ id: 'eatenFood', category: 'roommates', title: 'The missing leftovers', weight: 1, needs: ['roommate'], text: 'Someone ate {name}’s leftovers from the fridge.', choices: [choice('labels everything', odds(0.6, ROOMIE), O('Labels work', 'Nothing has gone missing since.', []), O('Labels ignored', 'Labels do not stop a hungry roommate.', [money(-8), close('roommate', -4)]))] }),
  EVENT({ id: 'passiveNotes', category: 'roommates', title: 'Notes on the door', weight: 1, needs: ['roommate'], text: 'A sticky note appears on the mirror: "Some of us have class at eight :)"', choices: [choice('talks face to face', odds(0.6, ROOMIE, RA), O('Cleared the air', 'Talking beats notes. Lesson learned.', [close('roommate', 8)]), O('A note back', 'The notes multiply.', [close('roommate', -8), stress(3)]))] }),
  EVENT({ id: 'silentTreatment', category: 'roommates', title: 'The silent treatment', weight: 1, needs: ['roommate'], text: '{roommate} has not said a word in three days. {name} has no idea why.', choices: [choice('asks what is wrong', odds(0.55, ROOMIE, RA), O('A misunderstanding', 'A misheard comment, sorted in five minutes.', [close('roommate', 10)]), O('Nothing is wrong', '"Nothing is wrong," says {roommate}, wrongly.', [stress(4)]))] }),
  EVENT({ id: 'partnerMovesIn', category: 'roommates', title: 'A third roommate', weight: 1, needs: ['roommate'], text: '{roommate}’s partner is here every night now. The room is very full.', choices: [choice('asks for a few nights a week alone', odds(0.55, ROOMIE, RA), O('A schedule', 'Three nights at their place, four at this one. Fair.', [close('roommate', 4), need('energy', 5)]), O('Still crowded', 'The schedule lasts one week.', [stress(4), need('energy', -6)]))] }),
  EVENT({ id: 'roommateBestFriend', category: 'roommates', title: 'Best friends', weight: 1, good: true, needs: ['roommate'], text: '{name} and {roommate} stay up until three talking about everything.', choices: [choice('keeps talking', null, O('Best friends', '{roommate} is not just a roommate any more.', [close('roommate', 20), mood(6)], { big: true }))] }),
  // Classes (8)
  EVENT({ id: 'overloaded', category: 'classes', title: 'Too many classes', weight: 2, needs: ['term'], text: '{name} signed up for six classes. It is a lot.', choices: [choice('drops one before the deadline', odds(0.7, CLASSES), O('Lighter', 'Five is plenty.', [stress(-6)]), O('Too late to drop', 'The deadline was yesterday.', [stress(6)])), choice('keeps all six', odds(0.4, STUDY, STEADY), O('Coping', 'Busy, but coping.', [need('study', 5)]), O('Swamped', 'Six classes is too many. Everything slips a little.', [gpa(-0.08), stress(6)]), { natures: ['scholar', 'stressed'] })] }),
  EVENT({ id: 'backToBackExams', category: 'classes', title: 'Three exams in two days', weight: 2, needs: ['term'], calendar: 'exams', text: '{name} has three exams in two days.', choices: [choice('makes a schedule and sticks to it', odds(0.55, STUDY, NEAR_LIBRARY, RESTED), O('Got through', 'Three exams, three passes.', [gpa(0.05)]), O('One went badly', 'Two good exams and one blur.', [gpa(-0.05), stress(5)]))] }),
  EVENT({ id: 'brutalProfessor', category: 'classes', title: 'A hard grader', weight: 1, needs: ['term'], text: 'A professor returns essays with more red ink than black.', choices: [choice('rewrites and resubmits', odds(0.55, TEACHING, STUDY), O('Better', 'The rewrite earns a B plus and a nod.', [gpa(0.05)]), O('Still red', 'More red ink. Some professors are like that.', [stress(4)]))] }),
  EVENT({ id: 'allNighter', category: 'classes', title: 'The all-nighter', weight: 2, needs: ['term'], calendar: 'exams', text: 'A paper is due at nine. It is midnight and {name} has the title.', choices: [choice('pulls an all-nighter', odds(0.5, STUDY, NEAR_LIBRARY), O('Done at dawn', 'Done at six, handed in at nine, asleep by ten.', [need('energy', -25)]), O('A rough paper', 'The paper is in. It is not their best.', [need('energy', -25), gpa(-0.05)]))] }),
  EVENT({ id: 'registrationClosed', category: 'classes', title: 'Registration closed', weight: 1, needs: ['term'], text: 'The class {name} needs for {major} is full.', choices: [choice('emails the department', odds(0.5, CLASSES, TEACHING), O('A seat', 'A seat opens. Persistence works.', [stress(-3)]), O('Next semester', 'No seats. It will have to wait.', [stress(4)]))] }),
  EVENT({ id: 'retakeClass', category: 'classes', title: 'Retaking a class', weight: 1, needs: ['term', 'notFreshman'], text: '{name} is retaking the class they failed last year.', choices: [choice('sits in the front row', odds(0.65, TEACHING, STUDY), O('Second time lucky', 'It makes sense the second time. A solid B.', [gpa(0.1), mood(5)], { big: true }), O('Still hard', 'Still hard, but a pass is a pass.', [gpa(0.02)]))] }),
  EVENT({ id: 'greatLecture', category: 'classes', title: 'A great lecture', weight: 1, good: true, needs: ['term'], text: 'A guest lecture in {major} changes how {name} sees the whole subject.', choices: [choice('stays to ask a question', null, O('Inspired', 'A question, an answer, and a reading list.', [mood(5), need('study', 8)]))] }),
  EVENT({ id: 'tutorHelps', category: 'classes', title: 'A tutor', weight: 1, needs: ['term'], text: '{name} is stuck on the same chapter for a week.', choices: [choice('books a tutor', odds(0.6, NEAR_LIBRARY, TEACHING), O('Unstuck', 'One hour with a tutor and it clicks.', [gpa(0.05), stress(-3)]), O('No slots', 'Every tutor is booked until next week.', [stress(3)]))] }),
  // Dating (8)
  EVENT({ id: 'leftOnRead', category: 'dating', title: 'Left on read', weight: 2, needs: ['crush'], text: '{name} texted {crush} two days ago. Nothing.', choices: [choice('waits it out', odds(0.5, CRUSH), O('A reply', '"Sorry, exams!" A reply, finally.', [close('crush', 5), mood(4)]), O('Still nothing', 'Still nothing. Time to let it go.', [mood(-4), { t: 'cast', change: 'newCrush' }]))] }),
  EVENT({ id: 'mixedSignals', category: 'dating', title: 'Mixed signals', weight: 1, needs: ['crush'], text: 'One day {crush} is warm, the next distant.', choices: [choice('asks a friend for advice', odds(0.55, FRIEND, CRUSH), O('Clearer', '{friend} says: just ask. Good advice.', [close('friend', 5)]), O('More confused', 'Three friends, three theories.', [stress(3)]))] }),
  EVENT({ id: 'ghosted', category: 'dating', title: 'Ghosted', weight: 1, heavy: true, needs: ['crush'], text: 'After two good dates, {crush} has gone quiet for good.', choices: [choice('moves on', odds(0.6, FRIEND, OUT), O('Moving on', 'It stings for a week, then it does not.', [mood(-4), { t: 'cast', change: 'newCrush' }]), O('A slow week', 'A slow, sad week. It passes.', [mood(-8), { t: 'cast', change: 'newCrush' }]))] }),
  EVENT({ id: 'dislikesFriends', category: 'dating', title: 'Partner meets friends', weight: 1, needs: ['partner', 'friend'], text: '{partner} and {friend} do not get on.', choices: [choice('keeps them apart', odds(0.5, PARTNER, FRIEND), O('Two worlds', 'Separate worlds, both happy.', []), O('Tension', 'Keeping them apart is exhausting.', [stress(4)]))] }),
  EVENT({ id: 'datingFriendsEx', category: 'dating', title: 'A friend’s ex', weight: 1, needs: ['single', 'friend'], text: '{friend}’s ex asks {name} out.', choices: [choice('checks with {friend} first', odds(0.55, FRIEND), O('Blessing given', '{friend} says go for it. It is fine.', [close('friend', 5)]), O('Not fine', '{friend} is not fine with it. {name} says no.', [close('friend', 3), mood(-2)]))] }),
  EVENT({ id: 'relationshipGrades', category: 'dating', title: 'Love and grades', weight: 1, needs: ['partner', 'term'], text: '{name} has spent every evening with {partner} and the work is piling up.', choices: [choice('sets study nights', odds(0.6, PARTNER, STUDY), O('Study dates', 'Study dates at the library. Both pass.', [gpa(0.05), close('partner', 4)]), O('Behind', 'The work is still behind.', [gpa(-0.06), stress(4)]))] }),
  EVENT({ id: 'cheatingRumour', category: 'dating', title: 'A rumour', weight: 1, heavy: true, needs: ['partner'], text: '{name} hears a rumour that {partner} has been cheating.', choices: [choice('asks {partner} straight out', odds(0.6, PARTNER), O('Just a rumour', 'It was a mix-up about a lab partner. They laugh about it, eventually.', [close('partner', 6), stress(-3)]), O('True', 'It was true. {name} ends it.', [{ t: 'cast', change: 'breakup' }, mood(-12), stress(8)], { big: true, next: 'runningIntoEx' }))] }),
  EVENT({ id: 'fallingInLove', category: 'dating', title: 'Falling in love', weight: 1, good: true, needs: ['partner'], text: 'On a walk home, {name} realises they are in love with {partner}.', choices: [choice('says so', odds(0.7, PARTNER), O('Said it back', '{partner} said it back.', [close('partner', 15), mood(12)], { big: true }), O('Not yet', '{partner} needs a little longer. That is all right.', [close('partner', 4)]))] }),
  // Partying (4)
  EVENT({ id: 'hangoverClass', category: 'partying', title: 'The morning after', weight: 1, needs: ['over21', 'term'], text: 'A late night out, a few drinks, and an 8 o’clock class.', choices: [choice('drags themselves to class', odds(0.5, RESTED), O('Made it', 'In class, upright, mostly awake.', [need('energy', -10)]), O('Slept through it', 'Slept through the class, and the quiz in it.', [gpa(-0.05), stress(3)]))] }),
  EVENT({ id: 'embarrassingPhotos', category: 'partying', title: 'The photos', weight: 1, text: 'Photos from Saturday are online. {name} is in most of them, dancing badly.', choices: [choice('laughs along', null, O('Owned it', 'The photos become a running joke. A good one.', [need('social', 5)]))] }),
  EVENT({ id: 'overspending', category: 'partying', title: 'An expensive weekend', weight: 1, text: 'A weekend of going out has cost more than expected.', choices: [choice('has a quiet week', null, O('A quiet week', 'Movie nights in and cheap dinners.', [money(-40), need('fun', -5)]))] }),
  EVENT({ id: 'designatedFriend', category: 'partying', title: 'Looking out', weight: 1, needs: ['friend'], text: 'At a party, {friend} has had too much to drink.', choices: [choice('walks {friend} home', odds(0.7, SAFE, PARTIES), O('Home safe', '{name} walks {friend} home and makes sure they are fine.', [close('friend', 12)], { big: true }), O('Called for help', 'Campus Safety helps get {friend} home. All fine by morning.', [close('friend', 8), stress(3)]))] }),
  // Social (6)
  EVENT({ id: 'leftOutOfPlans', category: 'social', title: 'Left out', weight: 2, needs: ['friend'], text: 'Everyone went to the lake on Saturday. Nobody asked {name}.', choices: [choice('says it hurt', odds(0.6, FRIEND), O('An apology', 'An honest mistake, and a promise to ask next time.', [close('friend', 6)]), O('Shrugs', 'Shrugs all round. It still hurts.', [mood(-5)]))] }),
  EVENT({ id: 'oneSidedFriend', category: 'social', title: 'A one-sided friendship', weight: 1, needs: ['friend'], text: '{name} realises they always text {friend} first.', choices: [choice('waits for {friend} to reach out', odds(0.45, FRIEND), O('{friend} calls', '{friend} calls on Thursday. Relief.', [close('friend', 6)]), O('Silence', 'A week of silence. Some friendships fade.', [close('friend', -12), mood(-3)]))] }),
  EVENT({ id: 'comparing', category: 'social', title: 'Comparing', weight: 1, text: 'Everyone else seems to have a perfect life online.', choices: [choice('logs off for a week', null, O('A better week', 'A week offline is a week of feeling fine.', [mood(4), stress(-3)]))] }),
  EVENT({ id: 'newBestFriend', category: 'social', title: 'A new friend', weight: 1, good: true, text: '{name} meets someone at the {club} who laughs at all the same things.', choices: [choice('swaps numbers', odds(0.7, CLUB, MEETING), O('A new friend', 'A new friend, already.', [{ t: 'cast', change: 'newFriend' }, mood(6)], { big: true }), O('Lost the number', 'Lost the number. They will meet again.', []))] }),
  EVENT({ id: 'floorMovieNight', category: 'social', title: 'Movie night', weight: 1, good: true, text: 'The floor is having a movie night.', choices: [choice('brings popcorn', null, O('A good night', 'Popcorn, a bad film, a good night.', [need('social', 10), need('fun', 10)]))] }),
  EVENT({ id: 'clubTrip', category: 'social', title: 'The club trip', weight: 1, needs: ['club'], text: 'The {club} is going on a weekend trip.', choices: [choice('signs up', odds(0.65, CLUB, MEETING), O('A great trip', 'A weekend of new friends and old jokes.', [need('social', 15), money(-40)]), O('Rained out', 'It rained all weekend. Still, the cards were good.', [need('social', 6), money(-40)]))] }),
  // Money and life (6)
  EVENT({ id: 'textbooks', category: 'money', title: 'Textbooks', weight: 2, needs: ['term'], text: 'The textbooks for this semester cost $280.', choices: [choice('buys them used', odds(0.6, AID), O('Used and fine', 'Used copies, someone else’s highlights, half the price.', [money(-140)]), O('Full price', 'No used copies left.', [money(-280), stress(3)]))] }),
  EVENT({ id: 'parkingTicket', category: 'money', title: 'A parking ticket', weight: 1, text: 'A parking ticket on the car: $40.', choices: [choice('pays it', null, O('Paid', 'Paid, with feeling.', [money(-40)]))] }),
  EVENT({ id: 'brokenLaptop', category: 'money', title: 'The laptop', weight: 1, text: '{name}’s laptop will not turn on, two days before a paper is due.', choices: [choice('uses the library computers', odds(0.65, NEAR_LIBRARY), O('Saved', 'The library computers save the paper.', [money(-90)]), O('A late paper', 'The paper is late, and so is the repair.', [money(-200), gpa(-0.04), stress(5)]))] }),
  EVENT({ id: 'sickFinals', category: 'money', title: 'Sick for finals', weight: 1, needs: ['term'], calendar: 'exams', text: '{name} wakes up with a fever in finals week.', choices: [choice('goes to the Medical Center', odds(0.65, SAFE), O('A note and a makeup', 'A doctor’s note and a makeup exam next week.', [need('energy', -10)]), O('Sits it sick', 'No note in time. They sit the exam with a fever.', [gpa(-0.06), need('energy', -15)]))] }),
  EVENT({ id: 'mealPlanRunsOut', category: 'money', title: 'The meal plan', weight: 1, text: 'The meal plan is running low with three weeks to go.', choices: [choice('cooks in the dorm kitchen', odds(0.6, DINING), O('Getting by', 'Pasta, mostly. It works.', [money(-20)]), O('Eating out', 'Eating out adds up fast.', [money(-70)]))] }),
  EVENT({ id: 'bonusShift', category: 'money', title: 'An extra shift', weight: 1, needs: ['job'], text: 'The manager offers {name} an extra shift on Saturday.', choices: [choice('takes it', odds(0.7, WORK), O('Extra money', 'An extra $60.', [money(60), need('fun', -5)]), O('A long day', 'A long day for $60.', [money(60), need('energy', -10)]))] }),
  // Greek life and teams (6)
  EVENT({ id: 'chapterDrama', category: 'greek', title: 'Chapter drama', weight: 1, needs: ['member'], text: 'Two seniors at {chapter} are fighting over who runs the spring formal.', choices: [choice('stays out of it', null, O('Out of it', 'Wise.', []))] }),
  EVENT({ id: 'philanthropyWeek', category: 'greek', title: 'Philanthropy week', weight: 1, good: true, needs: ['member'], text: '{chapter} is washing cars for the food bank.', choices: [choice('signs up for two shifts', null, O('Gave back', 'Wet, tired and proud of it.', [mood(5), need('social', 8)]))] }),
  EVENT({ id: 'lostSpot', category: 'teams', title: 'A freshman’s spot', weight: 1, needs: ['team'], text: 'A freshman has taken {name}’s spot in the lineup.', choices: [choice('trains harder', odds(0.5, TRAINING, REC), O('Spot back', 'Two weeks later, the spot is theirs again.', [mood(6)]), O('Bench for now', 'The freshman is just faster. For now.', [mood(-4)]))] }),
  EVENT({ id: 'practiceVsClass', category: 'teams', title: 'Practice and class', weight: 1, needs: ['team', 'term'], text: 'Practice and a lab now meet at the same hour.', choices: [choice('asks the coach to move it', odds(0.55, CLASSES, TEACHING), O('Sorted', 'The coach moves practice by an hour.', [stress(-3)]), O('Chose the lab', 'The lab wins. The coach is not pleased.', [stress(4)]))] }),
  EVENT({ id: 'bigMeet', category: 'teams', title: 'The big meet', weight: 1, good: true, needs: ['team'], calendar: 'season', text: 'The conference meet is on Saturday.', choices: [choice('runs their race', odds(0.5, TRAINING, REC, TEAM), O('A personal best', '{name} ran a personal best.', [mood(10)], { big: true }), O('A slow day', 'A slow day. There will be others.', [mood(-3)]))] }),
  // The game's own result is the paper's: the scene is the afternoon, whatever the score.
  EVENT({ id: 'gameDay', category: 'teams', title: 'Game day', weight: 1, good: true, calendar: 'season', text: 'A home football game, and the whole floor is going.', choices: [choice('goes with the floor', null, O('Game day', 'Face paint, the band, a hoarse voice by the fourth quarter.', [need('fun', 12), need('social', 10)]))] }),
  // Good things (6)
  EVENT({ id: 'bigWin', category: 'good', title: 'A good grade', weight: 1, good: true, needs: ['term'], text: 'A paper comes back with an A and a note: "Excellent work."', choices: [choice('frames the note', null, O('Proud', 'The note goes on the wall.', [mood(8), gpa(0.04)], { big: true }))] }),
  EVENT({ id: 'sunnyDay', category: 'good', title: 'A perfect day', weight: 1, good: true, text: 'The first warm day of spring. Everyone is on the quad.', choices: [choice('skips the library for the quad', null, O('A perfect afternoon', 'Frisbee, sunshine and nobody talking about exams.', [need('fun', 12), mood(5)]))] }),
  EVENT({ id: 'letterFromHome', category: 'good', title: 'A package from home', weight: 1, good: true, text: 'A package from home: cookies, socks and a letter.', choices: [choice('shares the cookies', null, O('Popular', 'The cookies last eleven minutes.', [mood(6), need('social', 5)]))] }),
  EVENT({ id: 'scholarshipWin', category: 'good', title: 'A small award', weight: 1, good: true, needs: ['term'], text: 'The {major} department has a small award for good work.', choices: [choice('applies', odds(0.45, GRADES, AID), O('Won it', '{name} won $250 and a handshake.', [money(250), mood(8)], { big: true }), O('Next year', 'Not this year.', []))] }),
  EVENT({ id: 'kindStranger', category: 'good', title: 'A kind stranger', weight: 1, good: true, text: 'A stranger at the coffee stand pays for {name}’s coffee.', choices: [choice('pays it forward', null, O('Paid forward', 'The next person in line gets a coffee too.', [mood(4)]))] }),
  EVENT({ id: 'mentor', category: 'good', title: 'A mentor', weight: 1, good: true, needs: ['term'], text: 'A professor offers {name} a spot helping in their research.', choices: [choice('says yes', odds(0.7, TEACHING, GRADES), O('A mentor', 'A mentor, a project, and a reference letter one day.', [mood(8), need('study', 8)], { big: true }), O('Too busy', 'The schedule cannot fit it this semester.', []))] }),
  // Everyday life (8)
  EVENT({ id: 'fireDrill', category: 'social', title: 'The 3 a.m. fire drill', weight: 1, text: 'A fire alarm at three in the morning. Burnt popcorn on the second floor.', choices: [choice('stands outside in a blanket', null, O('Floor bonding', 'Forty people in blankets, laughing. It was the popcorn.', [need('energy', -8), need('social', 5)]))] }),
  EVENT({ id: 'lostKeys', category: 'roommates', title: 'Locked out', weight: 1, text: '{name} locked their keys in the room.', choices: [choice('calls the RA', odds(0.65, RA), O('Let in', 'The RA lets them in with a sigh.', []), O('Waited an hour', 'An hour on the hallway floor.', [stress(3)]))] }),
  EVENT({ id: 'rainyWalk', category: 'social', title: 'Caught in the rain', weight: 1, text: 'A downpour on the walk to class.', choices: [choice('runs for it', null, O('Soaked', 'Soaked, and laughing about it.', [need('fun', 3)]))] }),
  EVENT({ id: 'gymCrowd', category: 'teams', title: 'A crowded gym', weight: 1, text: 'Every machine at the gym is taken.', choices: [choice('waits for one', odds(0.5, REC), O('Got a turn', 'A turn, eventually.', [need('fitness', 5)]), O('Gave up', 'Gave up and went for a run instead.', [need('fitness', 3)]))] }),
  EVENT({ id: 'diningSurprise', category: 'good', title: 'Taco night', weight: 1, good: true, text: 'It is taco night at the dining hall.', choices: [choice('gets in line early', odds(0.6, DINING), O('Tacos', 'Three tacos, no regrets.', [mood(4)]), O('Sold out', 'Sold out by seven.', [mood(-1)]))] }),
  EVENT({ id: 'clubElection', category: 'social', title: 'Club officer', weight: 1, good: true, needs: ['club'], text: 'The {club} needs a new treasurer.', choices: [choice('volunteers', odds(0.6, CLUB, OUT), O('Treasurer', '{name} is the new treasurer of the {club}.', [mood(6)], { big: true }), O('Someone else', 'Someone else got it.', []))] }),
  EVENT({ id: 'studyBuddy', category: 'classes', title: 'A study buddy', weight: 1, good: true, needs: ['term'], text: 'Someone in {name}’s class asks to study together.', choices: [choice('says yes', odds(0.65, NEAR_LIBRARY, MEETING), O('A study buddy', 'A study buddy, and maybe a friend.', [need('study', 8), need('social', 6)]), O('Wrong fit', 'They study very differently.', []))] }),
  EVENT({ id: 'homeVisit', category: 'social', title: 'A visit from home', weight: 1, good: true, text: 'Family visits for the weekend.', choices: [choice('shows them the campus', null, O('A proud tour', 'A tour of every favourite spot, and dinner out.', [mood(8), money(40)]))] }),
];

export const LIBRARY: readonly StorySpec[] = [...ARCS, ...EVENTS];
