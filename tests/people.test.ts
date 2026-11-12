import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CROWD_STEPS, MAX_BOOSTERS, MAX_TOURS, OTHERS_SHARE, othersWanted, TOUR_SIZE, walkersWanted, type OthersFacts } from '../src/app/crowd';
import type { DayPeriod } from '../src/app/daylight';
import {
  acceptanceRate,
  advance,
  applyAction,
  enrollment,
  expectedClass,
  facultyCount,
  foodTrade,
  hallName,
  peopleCounts,
  PERSON_LINES,
  PERSON_ROLES,
  personCard,
  personKey,
  personName,
  PLACED,
  ROLE_NAMES,
  serialize,
  shortage,
  staffCount,
  storeIncomePerYear,
  storePassers,
  townLiving,
  workersAt,
  yardLine,
  yardStatus,
  ADVISOR_DOING,
  CHEF_DOING,
  CLERK_DOING,
  GUIDE_DOING,
  PROFESSOR_DOING,
  PROFESSOR_DOING_NO_LIBRARY,
  type Action,
  type GameState,
  type PersonRef,
  type Placed,
  type PlacedType,
} from '../src/sim';
import { FIRST_NAMES, SURNAME_ENDS, SURNAME_STARTS } from '../src/sim/config/students';
import { DAY, freshGame, MIN, T0 } from './helpers';

/**
 * People who are not students (DESIGN.md section 32.2 and 32.5): professors,
 * staff, maintenance workers, Campus Safety officers, medics and visitors.
 * Nobody is simulated. A card is made when it is opened, from the save's seed
 * and the campus's own numbers.
 */

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const place = (state: GameState, building: PlacedType, x: number, y: number): GameState => act(state, { type: 'place', building, x, y });
const first = (state: GameState, type: PlacedType): Placed => state.map.placed.find((placed) => placed?.type === type)!;

/**
 * A campus with one of everything a card can belong to: a taco stand, a store
 * on the walk, a yard with three workers, a Medical Center and Campus Safety.
 */
function campus(students = 1200, seed = 42): GameState {
  let state = structuredClone(advance(freshGame(seed), T0, T0 + 20 * MIN).state);
  state.money.cash = 10_000_000;
  state.cohorts = [students, 0, 0, 0];
  state.admissions.waitlist = 0;
  state = place(state, 'taco', 8, 15);
  state = place(state, 'store', 11, 15);
  state = place(state, 'yard', 4, 12);
  state = act(state, { type: 'staff', yard: first(state, 'yard').id, workers: 3 });
  state = place(state, 'medical', 3, 9);
  state = place(state, 'safety', 15, 9);
  return state;
}

/** One of each kind of person on that campus. */
function everyone(state: GameState): PersonRef[] {
  const hood = state.map.town.neighbourhoods[0]!;
  return [
    { role: 'professor', n: 3 },
    { role: 'advisor', n: 2 },
    { role: 'guide', n: 1 },
    { role: 'chef', n: 0, at: first(state, 'taco').id },
    { role: 'clerk', n: 0, at: first(state, 'store').id },
    { role: 'worker', n: 1, at: first(state, 'yard').id, job: first(state, 'taco').id },
    { role: 'officer', n: 0, at: first(state, 'safety').id },
    { role: 'medic', n: 0, at: first(state, 'medical').id },
    { role: 'parent', n: 7 },
    { role: 'booster', n: 4 },
    { role: 'townie', n: 9, at: hood.id },
    { role: 'driver', n: 5 },
  ];
}

const BANNED = /\b(beer|wine|drunk|alcohol|pub|vodka|smok\w*|cigar\w*|vape|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?|blood\w*|crime|arrest\w*|weapon\w*|vomit\w*|vandal\w*|stupid|idiot|ugly|fat|hate\w*)\b/i;

describe('a card for each kind of person', () => {
  it('covers every role the design lists', () => {
    const state = campus();
    const roles = everyone(state).map((ref) => ref.role);
    expect([...roles].sort()).toEqual([...PERSON_ROLES].sort());
    for (const ref of everyone(state)) {
      const card = personCard(state, ref);
      expect(card, ref.role).not.toBeNull();
      expect(card!.name.split(' ').length, ref.role).toBe(2);
      expect(card!.title.length, ref.role).toBeGreaterThan(3);
      expect(card!.line.length, ref.role).toBeGreaterThan(10);
      expect(card!.line, ref.role).not.toMatch(/\{\w+\}/);
      expect(card!.doing, ref.role).not.toMatch(/\{\w+\}/);
    }
  });

  it('says who they are: a department, a kitchen, a store, a yard, a street', () => {
    const state = campus();
    const card = (role: PersonRef['role']) => personCard(state, everyone(state).find((ref) => ref.role === role)!)!;
    expect(card('professor').title).toMatch(/^Professor of /);
    expect(card('advisor').title).toBe(ROLE_NAMES.advisor);
    expect(card('guide').title).toBe('Admissions guide');
    expect(card('chef').title).toBe('Dining worker at the Taco stand');
    expect(card('clerk').title).toBe('Clerk at the Campus store');
    expect(card('worker').title).toBe('Maintenance worker at the Facilities Yard');
    expect(card('officer').title).toBe('Officer at Campus Safety');
    expect(card('medic').title).toBe('Medic at the Medical Center');
    expect(card('townie').title).toBe(`Lives on ${state.map.town.neighbourhoods[0]!.name}`);
    // What they are doing. The four visitors get one line and nothing else.
    for (const role of ['professor', 'advisor', 'guide', 'chef', 'clerk', 'worker', 'officer', 'medic'] as const) expect(card(role).doing.length, role).toBeGreaterThan(5);
    for (const role of ['parent', 'booster', 'townie', 'driver'] as const) expect(card(role).doing, role).toBe('');
    expect(card('worker').doing).toBe('Sweeping up at the Taco stand');
    expect(card('officer').doing).toBe('On patrol');
    expect(card('chef').doing).toMatch(/the Taco stand$/);
  });

  it('is the same every time it is opened', () => {
    const state = campus();
    for (const ref of everyone(state)) {
      const once = JSON.stringify(personCard(state, ref));
      for (let n = 0; n < 5; n++) expect(JSON.stringify(personCard(state, { ...ref })), ref.role).toBe(once);
      // And after a save is read back.
      expect(JSON.stringify(personCard(structuredClone(state), ref)), ref.role).toBe(once);
    }
  });

  it('is somebody else in another save', () => {
    const here = campus(1200, 42);
    const there = campus(1200, 4242);
    let differ = 0;
    const refs: PersonRef[] = [];
    for (let n = 0; n < 30; n++) refs.push({ role: 'professor', n }, { role: 'advisor', n }, { role: 'booster', n }, { role: 'parent', n });
    for (const ref of refs) if (personCard(here, ref)!.name !== personCard(there, ref)!.name) differ += 1;
    expect(differ).toBeGreaterThan(refs.length * 0.9);
    // Within one save, thirty professors are not thirty copies of one.
    const names = new Set(Array.from({ length: 30 }, (_, n) => personName(here.seed, { role: 'professor', n })));
    expect(names.size).toBeGreaterThan(25);
    const subjects = new Set(Array.from({ length: 30 }, (_, n) => personCard(here, { role: 'professor', n })!.title));
    expect(subjects.size).toBeGreaterThan(6);
  });

  it('has one key for one person', () => {
    const state = campus();
    const keys = everyone(state).map(personKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(personKey({ role: 'chef', n: 0, at: 3 })).not.toBe(personKey({ role: 'chef', n: 0, at: 4 }));
    expect(personKey({ role: 'professor', n: 1 })).toBe(personKey({ role: 'professor', n: 1, job: 9 }));
  });

  it('takes names from the pools the student cards use, so nobody carries a real name', () => {
    const state = campus();
    for (const ref of everyone(state)) {
      const [given, family] = personCard(state, ref)!.name.split(' ');
      expect(FIRST_NAMES).toContain(given);
      expect(SURNAME_STARTS.some((start) => family!.startsWith(start) && SURNAME_ENDS.includes(family!.slice(start.length)))).toBe(true);
    }
    const cell = 18 * state.map.width + 19;
    expect(hallName(state, cell)).toMatch(/^[A-Z][a-z]+ Hall$/);
    expect(hallName(state, cell)).toBe(hallName(state, cell));
    expect(new Set([19, 20, 21].map((x) => hallName(state, 18 * state.map.width + x))).size).toBeGreaterThan(1);
  });
});

describe('the last line of every card quotes a number the simulation reports', () => {
  const state = campus();
  const card = (ref: PersonRef) => personCard(state, ref)!;
  const of = (role: PersonRef['role']): PersonRef => everyone(state).find((ref) => ref.role === role)!;
  const said = (n: number): string => Math.round(n).toLocaleString('en-US');

  it('professor: the class size, which is students for each member of faculty', () => {
    const c = card(of('professor'));
    const size = Math.round(enrollment(state) / facultyCount(state));
    expect(c.quotes).toEqual({ what: 'classSize', value: size });
    expect(c.line).toContain(`${said(size)} students to a class`);
    // The line goes to the hall they teach in.
    expect(state.map.cells[c.cell!]!.zone).toBe('academic');
    expect(c.doing.includes(hallName(state, c.cell!)) || c.doing.includes('library')).toBe(true);
  });

  it('advisor: students to each member of staff', () => {
    const c = card(of('advisor'));
    const each = Math.round(enrollment(state) / staffCount(state));
    expect(c.quotes).toEqual({ what: 'studentsPerStaff', value: each });
    expect(c.line).toContain(said(each));
    expect(state.map.placed[state.map.cells[c.cell!]!.placedId!]!.type).toBe('admin');
  });

  it('admissions guide: the acceptance rate, or the size of the next class before there is one', () => {
    const before = structuredClone(advance(freshGame(), T0, T0 + 5 * MIN).state);
    expect(acceptanceRate(before)).toBeNull();
    const early = personCard(before, { role: 'guide', n: 0 })!;
    expect(early.quotes).toEqual({ what: 'nextClass', value: expectedClass(before) });
    expect(early.line).toContain(said(expectedClass(before)));

    const rate = acceptanceRate(state)!;
    const c = card(of('guide'));
    expect(c.quotes).toEqual({ what: 'acceptancePercent', value: Math.round(rate * 100) });
    expect(c.line).toContain(`${Math.round(rate * 100)} of every 100`);
  });

  it('dining worker: the students their place feeds', () => {
    const c = card(of('chef'));
    const fed = Math.round(foodTrade(state, first(state, 'taco'))!.students);
    expect(fed).toBeGreaterThan(0);
    expect(c.quotes).toEqual({ what: 'studentsFed', value: fed });
    expect(c.line).toContain(said(fed));
    expect(c.cell).toBe(first(state, 'taco').y * state.map.width + first(state, 'taco').x);
    // With nobody enrolled the kitchen feeds nobody, and says so.
    const empty = structuredClone(state);
    empty.cohorts = [0, 0, 0, 0];
    expect(personCard(empty, of('chef'))!.quotes.value).toBe(0);
    expect(PERSON_LINES.chefNobody).toContain(personCard(empty, of('chef'))!.line);
  });

  it('store clerk: who passes the door, and what the store earns', () => {
    const c = card(of('clerk'));
    const store = first(state, 'store');
    const passers = storePassers(state, store);
    expect(passers).toBeGreaterThan(0);
    expect(c.quotes).toEqual({ what: 'storePassers', value: passers });
    expect(c.line).toContain(said(passers));
    expect(c.line).toContain(`$${said(storeIncomePerYear(state, store))}`);
  });

  it('maintenance worker: their yard, in the yard\'s own words', () => {
    const c = card(of('worker'));
    const yard = first(state, 'yard');
    expect(c.quotes).toEqual({ what: 'yardWorkers', value: workersAt(state, yard.id) });
    expect(c.line).toContain('3 of us at this yard');
    expect(c.line).toContain(yardLine(yardStatus(state, yard)));
    expect(c.cell).toBe(yard.y * state.map.width + yard.x);
    // A yard of one says so in the singular.
    const alone = act(state, { type: 'staff', yard: yard.id, workers: 1 });
    expect(personCard(alone, { role: 'worker', n: 0, at: yard.id })!.line).toMatch(/^Just me at this yard\./);
  });

  it('officer and medic: incidents handled and missed', () => {
    const busy = structuredClone(state);
    busy.incidents.handled = 380;
    busy.incidents.missed = 4;
    for (const role of ['officer', 'medic'] as const) {
      const c = personCard(busy, of(role))!;
      expect(c.quotes).toEqual({ what: 'incidentsHandled', value: 380 });
      expect(c.line).toContain('380');
      expect(c.line).toMatch(/missed 4\b|4 missed/);
    }
    // On a call, the card says which.
    busy.incidents.active.push({ id: 9, kind: 'injury', x: 9, y: 15, place: 'Outdoor courts', line: 1, startTick: busy.clock.tick, responder: first(busy, 'medical').id, endTick: busy.clock.tick + 5 });
    const onCall = personCard(busy, { role: 'medic', n: 0, at: first(busy, 'medical').id, job: 9 })!;
    expect(onCall.doing).toMatch(/^On a call\. .*Outdoor courts/);
  });

  it('visiting parent: the beds the campus is short, or the next class when it is not', () => {
    const short = Math.round(shortage(state, 'housing'));
    expect(short).toBeGreaterThan(0);
    const c = card(of('parent'));
    expect(c.quotes).toEqual({ what: 'bedsShort', value: short });
    expect(c.line).toContain(said(short));
    expect(state.map.cells[c.cell!]!.zone).toBe('housing');
    // A campus with room for everyone hears about the class to come.
    const roomy = structuredClone(advance(freshGame(), T0, T0 + 5 * MIN).state);
    roomy.cohorts = [10, 0, 0, 0];
    roomy.admissions.waitlist = 0;
    if (shortage(roomy, 'housing') <= 0) {
      const calm = personCard(roomy, { role: 'parent', n: 7 })!;
      expect(calm.quotes).toEqual({ what: 'nextClass', value: expectedClass(roomy) });
      expect(calm.line).toContain(said(expectedClass(roomy)));
    }
  });

  it('booster: the alumni so far', () => {
    expect(card(of('booster')).quotes).toEqual({ what: 'alumni', value: state.stats.graduates });
    const proud = structuredClone(state);
    proud.stats.graduates = 10_976;
    const c = personCard(proud, of('booster'))!;
    expect(c.quotes.value).toBe(10_976);
    expect(c.line).toContain('10,976');
  });

  it('neighbour: how many from their street are enrolled', () => {
    const c = card(of('townie'));
    const hood = townLiving(state).find((one) => one.id === of('townie').at)!;
    expect(c.quotes).toEqual({ what: 'localsEnrolled', value: hood.living });
    expect(c.line).toContain(hood.name);
    if (hood.living > 0) expect(c.line).toContain(said(hood.living));
    // The line goes to their street, in the town.
    expect(state.map.cells[c.cell!]!.kind).toBe('street');
  });

  it('delivery driver: the kitchens and stores they supply', () => {
    const c = card(of('driver'));
    const stops = state.map.placed.filter((placed) => placed && (PLACED[placed.type].family === 'dining' || PLACED[placed.type].family === 'store')).length;
    expect(stops).toBe(3);
    expect(c.quotes).toEqual({ what: 'placesSupplied', value: stops });
    expect(c.line).toContain('3 ');
  });
});

describe('a card goes when the job does', () => {
  it('has nobody beyond the faculty and staff the campus pays', () => {
    const state = campus(1200);
    const { faculty, staff } = peopleCounts(state);
    expect(faculty).toBe(60);
    expect(staff).toBe(30);
    expect(personCard(state, { role: 'professor', n: faculty - 1 })).not.toBeNull();
    expect(personCard(state, { role: 'professor', n: faculty })).toBeNull();
    expect(personCard(state, { role: 'advisor', n: staff })).toBeNull();
    // Before anyone is enrolled there is no faculty to meet.
    const empty = structuredClone(state);
    empty.cohorts = [0, 0, 0, 0];
    expect(personCard(empty, { role: 'professor', n: 0 })).toBeNull();
  });

  it('has no dining worker without their kitchen, no clerk without the store, no worker without a place at the yard', () => {
    const state = campus();
    const taco = first(state, 'taco');
    const cleared = act(state, { type: 'paint', tool: 'clear', cells: [[taco.x, taco.y]] });
    expect(personCard(cleared, { role: 'chef', n: 0, at: taco.id })).toBeNull();
    expect(personCard(state, { role: 'clerk', n: 0, at: taco.id })).toBeNull();
    expect(personCard(state, { role: 'chef', n: 0, at: first(state, 'store').id })).toBeNull();
    const yard = first(state, 'yard');
    expect(personCard(state, { role: 'worker', n: 3, at: yard.id })).toBeNull();
    expect(personCard(act(state, { type: 'staff', yard: yard.id, workers: 0 }), { role: 'worker', n: 0, at: yard.id })).toBeNull();
    expect(personCard(state, { role: 'medic', n: 0, at: first(state, 'safety').id })).toBeNull();
    expect(personCard(state, { role: 'townie', n: 0, at: 999 })).toBeNull();
  });
});

describe('the tone guide', () => {
  it('holds for every line a card can say', () => {
    const lines: string[] = [];
    for (const pool of Object.values(PERSON_LINES)) lines.push(...pool);
    lines.push(...PROFESSOR_DOING, PROFESSOR_DOING_NO_LIBRARY, ...ADVISOR_DOING, ...GUIDE_DOING, ...CHEF_DOING, ...CLERK_DOING, ...Object.values(ROLE_NAMES));
    expect(lines.length).toBeGreaterThan(40);
    for (const line of lines) expect(line, line).not.toMatch(BANNED);
    // And for the cards as they come out, with the campus's numbers in them.
    const state = campus();
    for (const ref of everyone(state)) {
      const card = personCard(state, ref)!;
      for (const text of [card.name, card.title, card.doing, card.line]) expect(text, text).not.toMatch(BANNED);
    }
  });

  it('never names a real school', () => {
    const source = readFileSync(join(__dirname, '..', 'src/sim/config/people.ts'), 'utf8');
    expect(source).not.toMatch(/\b(University of|State University|College of)\b/);
  });
});

describe('nobody is simulated', () => {
  it('opening cards changes nothing in the saved game', () => {
    const state = campus();
    const before = serialize(state, 0);
    for (let round = 0; round < 3; round++) {
      for (const ref of everyone(state)) personCard(state, ref);
      for (let n = 0; n < 40; n++) personCard(state, { role: 'professor', n });
      peopleCounts(state);
    }
    expect(serialize(state, 0)).toBe(before);
  });

  it('the same campus comes out of a day whether or not anyone was looked at', () => {
    const state = campus();
    const end = state.clock.lastSimulatedAt + DAY;
    const quiet = advance(state, state.clock.lastSimulatedAt, end).state;
    let looked = state;
    for (let at = state.clock.lastSimulatedAt + 60 * MIN; at <= end; at += 60 * MIN) {
      looked = advance(looked, looked.clock.lastSimulatedAt, at).state;
      for (const ref of everyone(looked)) personCard(looked, ref);
    }
    expect(JSON.stringify(looked)).toBe(JSON.stringify(quiet));
  });

  it('needs no new save version: nothing about a person is stored', () => {
    // The desk is left out: its four advisors are named once and stored, which is another thing (DESIGN.md 36).
    const state = { ...campus(), inbox: undefined };
    const text = JSON.stringify(state);
    for (const word of ['professor', 'advisor', 'booster', 'townie']) expect(text.toLowerCase().includes(`"${word}`), word).toBe(false);
  });

  it('the layers that draw them never reach for anything that changes, advances or saves the game', () => {
    const banned = ['applyAction', 'advance(', 'serialize', 'parseSave', "from '../app/store'", 'localStorage', 'state.rng', 'nextRandom'];
    for (const file of ['src/game/Walkers.ts', 'src/game/Cars.ts', 'src/game/GroundsWorkers.ts', 'src/ui/personCard.ts', 'src/sim/systems/people.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      for (const word of banned) expect(source.includes(word), `${file} uses ${word}`).toBe(false);
    }
  });
});

describe('students stay most of the crowd', () => {
  const PERIODS: DayPeriod[] = ['morning', 'afternoon', 'evening', 'night'];
  const facts = (over: Partial<OthersFacts> = {}): OthersFacts => ({ studentsInView: 120, students: 6000, faculty: 300, staff: 150, period: 'afternoon', weekend: false, ...over });

  it('everyone else is never more than a quarter of the people on screen, at any hour, any size and any setting', () => {
    expect(OTHERS_SHARE).toBe(0.25);
    for (const period of PERIODS) {
      for (const weekend of [false, true]) {
        for (const students of [30, 400, 2000, 8000, 30_000]) {
          for (let step = 0; step < CROWD_STEPS.length; step++) {
            for (const visible of [3, 10, 40, 200, 900]) {
              // The students on screen are whatever the crowd rule asks for at that setting.
              const crowd = walkersWanted({ students, pathCells: 900, visiblePathCells: visible, period, weekend, step });
              const others = othersWanted(facts({ studentsInView: crowd, students, faculty: Math.round(students / 20), staff: Math.round(students / 40), period, weekend }));
              expect(others.people).toBe(others.professors + others.staff + others.tours * TOUR_SIZE + others.boosters);
              expect(others.people / Math.max(1, others.people + crowd), `${period} ${students} step ${step} view ${visible}`).toBeLessThanOrEqual(OTHERS_SHARE + 1e-9);
            }
          }
        }
      }
    }
  });

  it('follows the payroll: as many professors and staff as the campus has for each student, seen a little more often', () => {
    const day = othersWanted(facts());
    // 120 students in view, one faculty member to twenty students, seen two and a half times as often: 15.
    expect(day.professors).toBe(15);
    expect(day.staff).toBe(8);
    expect(day.professors).toBeGreaterThan(day.staff);
    // A campus that employed twice the faculty would show twice the professors.
    expect(othersWanted(facts({ faculty: 600 })).professors).toBe(30);
    // Nobody is seen who is not on the books.
    expect(othersWanted(facts({ students: 40, faculty: 2, staff: 1, studentsInView: 40 })).professors).toBeLessThanOrEqual(2);
    expect(othersWanted(facts({ students: 40, faculty: 2, staff: 1, studentsInView: 40 })).staff).toBeLessThanOrEqual(1);
    expect(othersWanted(facts({ students: 0, faculty: 0, staff: 0 })).people).toBe(0);
    expect(othersWanted(facts({ studentsInView: 0 })).people).toBe(0);
  });

  it('shows more staff by day, and mostly students at night', () => {
    const at = (period: DayPeriod) => othersWanted(facts({ period }));
    expect(at('morning').professors).toBe(at('afternoon').professors);
    expect(at('evening').professors).toBeLessThan(at('afternoon').professors);
    expect(at('night').professors).toBeLessThanOrEqual(1);
    expect(at('night').staff).toBeLessThanOrEqual(1);
    expect(at('night').people).toBeLessThan(at('afternoon').people / 5);
  });

  it('brings visitors at weekends, by the date in the game, and never at night', () => {
    for (const period of PERIODS) {
      const weekday = othersWanted(facts({ period }));
      expect(weekday.tours).toBe(0);
      expect(weekday.boosters).toBe(0);
    }
    const saturday = othersWanted(facts({ weekend: true }));
    expect(saturday.tours).toBeGreaterThan(0);
    expect(saturday.tours).toBeLessThanOrEqual(MAX_TOURS);
    expect(saturday.boosters).toBeGreaterThan(0);
    expect(saturday.boosters).toBeLessThanOrEqual(MAX_BOOSTERS);
    // Fewer staff are in at a weekend.
    expect(saturday.professors).toBeLessThan(othersWanted(facts()).professors);
    expect(othersWanted(facts({ weekend: true, period: 'night' })).tours).toBe(0);
    expect(othersWanted(facts({ weekend: true, period: 'night' })).boosters).toBe(0);
  });

  it('gives way in order when the view is small: visitors first, then staff, then professors', () => {
    // Twelve students in view leave room for four others.
    const small = othersWanted(facts({ studentsInView: 12, weekend: true, period: 'afternoon' }));
    expect(small.people).toBeLessThanOrEqual(4);
    const tiny = othersWanted(facts({ studentsInView: 2 }));
    expect(tiny.people).toBe(0);
  });

  it('is a plain sum that reads no clock and no saved game', () => {
    const source = readFileSync(join(__dirname, '..', 'src/app/crowd.ts'), 'utf8');
    expect(source.includes('../sim')).toBe(false);
    expect(othersWanted(facts())).toEqual(othersWanted(facts()));
  });
});
