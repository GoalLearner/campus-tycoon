import { facultyStress } from './season';
import {
  ADVISOR_DOING,
  CHEF_DOING,
  CLERK_DOING,
  GUIDE_DOING,
  PERSON_LINES,
  PROFESSOR_DOING,
  PROFESSOR_DOING_NO_LIBRARY,
  ROLE_NAMES,
  type PersonLineId,
  type PersonNumber,
  type PersonRole,
} from '../config/people';
import { PLACED } from '../config/placed';
import { FIRST_NAMES, MAJORS, SURNAME_ENDS, SURNAME_STARTS } from '../config/students';
import { TOWN_X } from '../config/town';
import { dollars } from '../format';
import { hashInts } from '../rng';
import { enrollment } from '../selectors';
import type { GameState, Placed } from '../types';
import { acceptanceRate } from './admissions';
import { classSizeNow, facultyCount, facultyNeed, facultyWorking, ratioTarget, staffCount, staffWorking } from './staffing';
import { expectedClass, shortage } from './demand';
import { foodTrade } from './food';
import { isBrokenThing, workersAt, yardLine, yardStatus } from './grounds';
import { incidentText } from './incidents';
import { storeIncomePerYear, storePassers } from './placed';
import { townLiving } from './town';

/**
 * People who are not students (DESIGN.md section 32.2): professors, staff,
 * maintenance workers, Campus Safety officers, medics and visitors.
 *
 * Nobody is simulated. Who a person is comes from the game's seed, as a
 * student's does, and what their card says comes from the campus's own
 * numbers at the moment it is opened. Nothing here is stored, nothing here
 * changes a number, and catch-up never calls it.
 */

/** One person, by what they are and which one. Everything on their card follows from this and the save. */
export interface PersonRef {
  role: PersonRole;
  /** Which one of them. It picks the name, so the same number is always the same person. */
  n: number;
  /** What they belong to: a food place, a store, a yard, a responder's building, or a neighbour's street. */
  at?: number;
  /** The job in hand, where the map knows it: the thing a worker is walking to, or the incident a responder is on. */
  job?: number;
}

export interface PersonCard {
  ref: PersonRef;
  name: string;
  /** "Professor of Biology", "Dining worker at the Taco stand", "Lives on Maple Street". */
  title: string;
  /** What they are doing. '' for the visitors, who get one line only. */
  doing: string;
  /** The last line: their own words, quoting a number the simulation reports now. */
  line: string;
  /** That number, and which it is, so a card can never say something the simulation does not. */
  quotes: { what: PersonNumber; value: number };
  /** The cell the line is about. Tapping the line goes there. null when there is nowhere to go. */
  cell: number | null;
}

/** A different number for each trait, so one person's name, department and words do not move together. */
const SALT = { first: 101, start: 102, end: 103, subject: 104, hall: 105, doing: 106, line: 107, hallName: 108, hallEnd: 109, stop: 110 } as const;
/** What they are doing changes this often, in ticks. It follows the game's own time, never the hour of the day. */
const DOING_EVERY_TICKS = 20;

const ROLE_SALT: Record<PersonRole, number> = { professor: 1, advisor: 2, guide: 3, chef: 4, clerk: 5, worker: 6, officer: 7, medic: 8, parent: 9, booster: 10, townie: 11, driver: 12 };

function roll(seed: number, ref: PersonRef, salt: number, extra = 0): number {
  return hashInts(seed, ROLE_SALT[ref.role], ref.n, ref.at ?? -1, salt, extra) / 4294967296;
}

function pickFrom<T>(items: readonly T[], at: number): T {
  return items[Math.min(items.length - 1, Math.floor(at * items.length))]!;
}

/** One key for one person: the same for the same card, different for everyone else. */
export function personKey(ref: PersonRef): string {
  return `${ref.role}:${ref.n}:${ref.at ?? ''}`;
}

/** A person's name, from the pools the student cards use. No card can carry the full name of a real person. */
export function personName(seed: number, ref: PersonRef): string {
  const first = pickFrom(FIRST_NAMES, roll(seed, ref, SALT.first));
  return `${first} ${pickFrom(SURNAME_STARTS, roll(seed, ref, SALT.start))}${pickFrom(SURNAME_ENDS, roll(seed, ref, SALT.end))}`;
}

/** The name of a lecture hall, made up from its place on the map: "Fernwick Hall". The same hall always has the same name. */
export function hallName(state: GameState, cell: number): string {
  const start = SURNAME_STARTS[hashInts(state.seed, cell, SALT.hallName) % SURNAME_STARTS.length]!;
  const end = SURNAME_ENDS[hashInts(state.seed, cell, SALT.hallEnd) % SURNAME_ENDS.length]!;
  return `${start}${end} Hall`;
}

/** The cells of the lecture halls that are open, in map order. */
function openHalls(state: GameState): number[] {
  const out: number[] = [];
  for (const building of state.map.buildings) {
    if (building && building.zone === 'academic' && building.stage >= 1) out.push(building.y * state.map.width + building.x);
  }
  return out;
}

const cellOf = (state: GameState, placed: Placed): number => placed.y * state.map.width + placed.x;
const first = (state: GameState, type: string): Placed | null => state.map.placed.find((placed) => placed?.type === type) ?? null;
const count = (n: number): string => Math.round(n).toLocaleString('en-US');

function say(id: PersonLineId, state: GameState, ref: PersonRef, fill: Record<string, string>): string {
  let line: string = pickFrom(PERSON_LINES[id], roll(state.seed, ref, SALT.line));
  for (const [key, value] of Object.entries(fill)) line = line.replace(`{${key}}`, value);
  return line;
}

/** How many of each kind there are to be seen: the payroll's own counts. */
export function peopleCounts(state: GameState): { faculty: number; staff: number } {
  return { faculty: facultyCount(state), staff: staffCount(state) };
}

/**
 * Everything a person's card shows, or null when there is no such person now:
 * a professor beyond the faculty the campus employs, a dining worker whose
 * kitchen has been cleared, a worker whose yard has nobody on its books.
 */
export function personCard(state: GameState, ref: PersonRef): PersonCard | null {
  const seed = state.seed;
  const students = enrollment(state);
  const name = personName(seed, ref);
  const moment = Math.floor(state.clock.tick / DOING_EVERY_TICKS);
  const admin = first(state, 'admin');
  const adminCell = admin ? cellOf(state, admin) : null;

  switch (ref.role) {
    case 'professor': {
      const faculty = facultyCount(state);
      if (ref.n < 0 || ref.n >= faculty) return null;
      const halls = openHalls(state);
      const hall = halls.length > 0 ? pickFrom(halls, roll(seed, ref, SALT.hall)) : null;
      const where = hall === null ? 'a lecture hall' : hallName(state, hall);
      const hasLibrary = state.map.placed.some((placed) => placed?.type === 'library');
      let doing: string = pickFrom(PROFESSOR_DOING, roll(seed, ref, SALT.doing, moment));
      if (!hasLibrary && doing.includes('library')) doing = PROFESSOR_DOING_NO_LIBRARY;
      // The ratio as classes are taught now. Short of the faculty the campus funds, they say so.
      const size = Math.round(classSizeNow(state));
      const short = facultyNeed(state) - facultyWorking(state);
      const funded = short > 0 && size > ratioTarget(state) ? ` We are ${count(short)} short of the one to every ${ratioTarget(state)} the campus funds.` : '';
      return {
        ref,
        name,
        title: `Professor of ${pickFrom(MAJORS, roll(seed, ref, SALT.subject)).name}`,
        doing: doing.replace('{hall}', where),
        // In exam season the faculty are stretched too, more so with crowded classes (DESIGN.md 27.1).
        line: say('professor', state, ref, { n: count(size) }) + funded + (facultyStress(state) >= 60 ? ` It is exam season, and faculty Stress is at ${facultyStress(state)}.` : ''),
        quotes: { what: 'classSize', value: size },
        cell: hall,
      };
    }
    case 'advisor': {
      const staff = staffCount(state);
      if (ref.n < 0 || ref.n >= staff) return null;
      const each = Math.round(students / Math.max(1, staffWorking(state)));
      return {
        ref,
        name,
        title: ROLE_NAMES.advisor,
        doing: pickFrom(ADVISOR_DOING, roll(seed, ref, SALT.doing, moment)),
        line: say('advisor', state, ref, { n: count(each) }),
        quotes: { what: 'studentsPerStaff', value: each },
        cell: adminCell,
      };
    }
    case 'guide': {
      const rate = acceptanceRate(state);
      const doing = pickFrom(GUIDE_DOING, roll(seed, ref, SALT.doing));
      if (rate !== null) {
        const percent = Math.round(rate * 100);
        return { ref, name, title: ROLE_NAMES.guide, doing, line: say('guideRate', state, ref, { n: count(percent) }), quotes: { what: 'acceptancePercent', value: percent }, cell: adminCell };
      }
      const next = expectedClass(state);
      return { ref, name, title: ROLE_NAMES.guide, doing, line: say('guideNext', state, ref, { n: count(next) }), quotes: { what: 'nextClass', value: next }, cell: adminCell };
    }
    case 'chef': {
      const place = ref.at === undefined ? null : (state.map.placed[ref.at] ?? null);
      const trade = place ? foodTrade(state, place) : null;
      if (!place || !trade) return null;
      const fed = Math.round(trade.students);
      const where = PLACED[place.type].name;
      return {
        ref,
        name,
        title: `Dining worker at the ${where}`,
        doing: pickFrom(CHEF_DOING, roll(seed, ref, SALT.doing, moment)).replace('{place}', where),
        line: fed > 0 ? say('chef', state, ref, { n: count(fed) }) : say('chefNobody', state, ref, {}),
        quotes: { what: 'studentsFed', value: fed },
        cell: cellOf(state, place),
      };
    }
    case 'clerk': {
      const store = ref.at === undefined ? null : (state.map.placed[ref.at] ?? null);
      if (!store || PLACED[store.type].family !== 'store') return null;
      const passers = storePassers(state, store);
      const where = PLACED[store.type].name;
      return {
        ref,
        name,
        title: `Clerk at the ${where}`,
        doing: pickFrom(CLERK_DOING, roll(seed, ref, SALT.doing, moment)).replace('{place}', where),
        line: passers > 0 ? say('clerk', state, ref, { n: count(passers), m: dollars(storeIncomePerYear(state, store)) }) : say('clerkNobody', state, ref, {}),
        quotes: { what: 'storePassers', value: passers },
        cell: cellOf(state, store),
      };
    }
    case 'worker': {
      const yard = ref.at === undefined ? null : (state.map.placed[ref.at] ?? null);
      if (!yard || yard.type !== 'yard') return null;
      const workers = workersAt(state, yard.id);
      if (workers <= 0 || ref.n < 0 || ref.n >= workers) return null;
      // The job in hand, as the map shows it: a bin, a place to sweep, or something to mend.
      const thing = ref.job === undefined ? null : (state.map.placed[ref.job] ?? null);
      let doing = 'On the way back to the yard';
      if (thing && isBrokenThing(state, thing.id)) doing = `Mending a ${thing.type === 'bin' ? 'trash bin' : PLACED[thing.type].name.toLowerCase()}`;
      else if (thing && thing.type === 'bin') doing = 'Emptying a trash bin';
      else if (thing) doing = `Sweeping up at the ${PLACED[thing.type].name}`;
      const words = yardLine(yardStatus(state, yard));
      return {
        ref,
        name,
        title: 'Maintenance worker at the Facilities Yard',
        doing,
        line: say(workers === 1 ? 'workerOne' : 'worker', state, ref, { n: count(workers), line: words }),
        quotes: { what: 'yardWorkers', value: workers },
        cell: cellOf(state, yard),
      };
    }
    case 'officer':
    case 'medic': {
      const home = ref.at === undefined ? null : (state.map.placed[ref.at] ?? null);
      if (!home || PLACED[home.type].family !== (ref.role === 'medic' ? 'medical' : 'safety')) return null;
      const call = ref.job === undefined ? null : (state.incidents.active.find((incident) => incident.id === ref.job) ?? null);
      const handled = state.incidents.handled;
      return {
        ref,
        name,
        title: ref.role === 'medic' ? `Medic at the ${PLACED[home.type].name}` : `Officer at ${PLACED[home.type].name}`,
        doing: call ? `On a call. ${incidentText(call)}` : ref.role === 'medic' ? 'On the way back to the Medical Center' : 'On patrol',
        line: say(ref.role, state, ref, { n: count(handled), m: count(state.incidents.missed) }),
        quotes: { what: 'incidentsHandled', value: handled },
        cell: cellOf(state, home),
      };
    }
    case 'parent': {
      const short = Math.round(shortage(state, 'housing'));
      if (short > 0) {
        // Somewhere to sleep is what they ask about: the line goes to a dorm.
        const dorm = state.map.buildings.find((building) => building && building.zone === 'housing');
        return { ref, name, title: ROLE_NAMES.parent, doing: '', line: say('parentBeds', state, ref, { n: count(short) }), quotes: { what: 'bedsShort', value: short }, cell: dorm ? dorm.y * state.map.width + dorm.x : adminCell };
      }
      const next = expectedClass(state);
      return { ref, name, title: ROLE_NAMES.parent, doing: '', line: say('parent', state, ref, { n: count(next) }), quotes: { what: 'nextClass', value: next }, cell: adminCell };
    }
    case 'booster': {
      const alumni = state.stats.graduates;
      return { ref, name, title: ROLE_NAMES.booster, doing: '', line: alumni > 0 ? say('booster', state, ref, { n: count(alumni) }) : say('boosterNone', state, ref, {}), quotes: { what: 'alumni', value: alumni }, cell: adminCell };
    }
    case 'townie': {
      const hood = ref.at === undefined ? null : (townLiving(state).find((one) => one.id === ref.at) ?? null);
      const street = ref.at === undefined ? null : (state.map.town.neighbourhoods.find((one) => one.id === ref.at) ?? null);
      if (!hood || !street) return null;
      return {
        ref,
        name,
        title: `Lives on ${hood.name}`,
        doing: '',
        line: hood.living > 0 ? say('townie', state, ref, { n: count(hood.living), street: hood.name }) : say('townieNone', state, ref, { street: hood.name }),
        quotes: { what: 'localsEnrolled', value: hood.living },
        // Their street, a cell east of the avenue: tapping it opens the neighbourhood's own panel.
        cell: street.row * state.map.width + Math.min(state.map.width - 1, TOWN_X + 2),
      };
    }
    case 'driver': {
      const stops = state.map.placed.filter((placed): placed is Placed => !!placed && (PLACED[placed.type].family === 'dining' || PLACED[placed.type].family === 'store'));
      const one = stops.length > 0 ? pickFrom(stops, roll(seed, ref, SALT.stop)) : null;
      return {
        ref,
        name,
        title: ROLE_NAMES.driver,
        doing: '',
        line: stops.length > 0 ? say('driver', state, ref, { n: count(stops.length) }) : say('driverNone', state, ref, {}),
        quotes: { what: 'placesSupplied', value: stops.length },
        cell: one ? cellOf(state, one) : null,
      };
    }
  }
}
