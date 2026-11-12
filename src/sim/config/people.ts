/**
 * People who are not students: what their cards say. DESIGN.md section 32.2.
 *
 * Nobody here is simulated. A card is made when it is opened, from the save's
 * seed and the campus's own numbers. Every card ends on one line tied to a
 * number the simulation reports at that moment, and `{n}` in a line below is
 * where that number goes.
 *
 * Written under the tone guide (section 16): jokes aim at institutions and
 * at the job, never at a person, and nothing here mentions drink, smoking,
 * drugs or betting.
 */

export type PersonRole = 'professor' | 'advisor' | 'guide' | 'chef' | 'clerk' | 'worker' | 'officer' | 'medic' | 'parent' | 'booster' | 'townie' | 'driver';

/** Every role, in the order the design lists them. */
export const PERSON_ROLES: readonly PersonRole[] = ['professor', 'advisor', 'guide', 'chef', 'clerk', 'worker', 'officer', 'medic', 'parent', 'booster', 'townie', 'driver'];

/** The word for each role, for the card and for tests. */
export const ROLE_NAMES: Record<PersonRole, string> = {
  professor: 'Professor',
  advisor: 'Academic advisor',
  guide: 'Admissions guide',
  chef: 'Dining worker',
  clerk: 'Store clerk',
  worker: 'Maintenance worker',
  officer: 'Campus Safety officer',
  medic: 'Medic',
  parent: 'Visiting parent',
  booster: 'Booster',
  townie: 'Neighbour',
  driver: 'Delivery driver',
};

/**
 * What each card's last line quotes. The words are for tests and for anyone
 * reading the code: the card itself only shows the line.
 */
export type PersonNumber =
  | 'classSize'
  | 'studentsPerStaff'
  | 'acceptancePercent'
  | 'nextClass'
  | 'studentsFed'
  | 'storePassers'
  | 'yardWorkers'
  | 'incidentsHandled'
  | 'bedsShort'
  | 'alumni'
  | 'localsEnrolled'
  | 'placesSupplied';

/** What a professor is doing. `{hall}` is the lecture hall they teach in. */
export const PROFESSOR_DOING: readonly string[] = ['On the way to teach in {hall}', 'Heading to office hours in {hall}', 'Off to mark papers in the library'];
/** The same, on a campus with no library to mark in. */
export const PROFESSOR_DOING_NO_LIBRARY = 'Off to mark papers in {hall}';
export const ADVISOR_DOING: readonly string[] = ['On the way to meet a student', 'Between appointments', 'Carrying forms to the Administration building'];
export const GUIDE_DOING: readonly string[] = ['Leading a campus tour', 'Walking a tour group round the campus'];
/** `{place}` is their kitchen or their store, by its name. */
export const CHEF_DOING: readonly string[] = ['On a break from the {place}', 'Fetching supplies for the {place}'];
export const CLERK_DOING: readonly string[] = ['On a break from the {place}', 'Running an errand for the {place}'];

/**
 * The last line of each card, in the person's own words. `{n}` is the number
 * it quotes. `{m}` is a second figure where the line has one, `{street}` a
 * neighbour's street, and `{line}` the yard's own words on whether it is
 * keeping up.
 */
export const PERSON_LINES = {
  professor: ['I have {n} students to a class. I know most of their names.', '{n} students to a class this semester. The front row is always the same four.'],
  advisor: ['There is one of us for every {n} students. My diary is full until Thursday.', 'One member of staff to {n} students. Everyone wants the same Tuesday slot.'],
  guideRate: ['We took {n} of every 100 who applied last time. I tell every tour that.', '{n} of every 100 applicants got a place last time. The quad does half my job.'],
  guideNext: ['About {n} are expected in the next class. I have shown most of them the quad.', 'The next class looks like {n}. I have walked this route with every one of them.'],
  chef: ['We feed about {n} students from this kitchen. I can tell the time by the line.', 'About {n} students eat here. Tuesdays are the long ones.'],
  chefNobody: ['Nobody is in reach of this kitchen yet. I have cleaned the grill twice today.'],
  clerk: ['{n} students pass our door. The store takes {m} a year.', '{n} pass the door each day and the store takes {m} a year. Most of it is pens.'],
  clerkNobody: ['Nobody passes our door. A path that students use would change that.'],
  workerOne: ['Just me at this yard. {line}'],
  worker: ['{n} of us at this yard. {line}'],
  officer: ['The campus has handled {n} calls and missed {m}. Mostly traffic cones.', '{n} calls handled and {m} missed. I have a drawer of confiscated balloons.'],
  medic: ['The campus has handled {n} calls and missed {m}. Mostly ankles.', '{n} calls handled and {m} missed. Nobody ever warms up.'],
  parentBeds: ['Lovely quad. Where would she sleep? I hear you are {n} beds short.', 'It is a handsome campus. But {n} beds short, they tell me.'],
  parent: ['They say {n} are coming in the next class. It does look like a nice place.', 'About {n} in the next class, the guide said. We like the look of it.'],
  booster: ['{n} alumni out there now. I have shaken hands with most of them.', '{n} graduates and counting. I keep a list.'],
  boosterNone: ['No alumni yet. I am practising my handshake for the first.'],
  townie: ['{n} from {street} go to your school now. The street is quieter in term time.', '{n} students from {street}. You can hear them leave in the morning.'],
  townieNone: ['Nobody from {street} goes to your school yet. We can see it from the porch.'],
  driver: ['{n} stops on campus today, every kitchen and the store. The truck knows the way.', '{n} places to supply on this campus. I know every loading door.'],
  driverNone: ['Nothing to deliver on campus yet. I just like the drive.'],
} as const;

export type PersonLineId = keyof typeof PERSON_LINES;
