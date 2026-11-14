// PROTOTYPE quick look (social-sim-measure branch): one game year of the whole-campus web at 46,000.
import { advance, newGame } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';
import { EVENTS, KIND_NAMES, makeWorld, pairRoommates, placeStudents, SLOTS, weekBatch } from './social-sim-proto';
const T0 = Date.UTC(2026, 0, 5, 15);
const base = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + 86_400_000).state;
const year = calendarAt(base.clock).year;
const world = makeWorld(base, base.cohorts);
placeStudents(world, base, year, base.cohorts);
pairRoommates(world);
const t = performance.now();
for (let w = 0; w < 52; w++) weekBatch(world, 4);
console.log('week ms', ((performance.now() - t) / 52).toFixed(1));
const kinds = new Array(12).fill(0);
let enrolled = 0;
for (let i = 0; i < world.n; i++) if (world.year[i]! >= 0) enrolled += 1;
for (let s = 0; s < world.n * SLOTS; s++) if (world.other[s]! >= 0) kinds[world.kind[s]!] += 1;
console.log('enrolled', enrolled, 'tie ends by kind', Object.fromEntries(KIND_NAMES.map((k, i) => [k || 'none', kinds[i]])));
console.log('events in a year', Object.fromEntries(EVENTS.map((e, i) => [e, world.events[i]])));
