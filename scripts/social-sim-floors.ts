import { advance, newGame } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';
import { makeWorld, placeStudents } from './social-sim-proto';
const T0 = Date.UTC(2026, 0, 5, 15);
const base = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + 86_400_000).state;
const world = makeWorld(base, base.cohorts);
placeStudents(world, base, calendarAt(base.clock).year, base.cohorts);
const g = world.groups[0]!;
const sizes: number[] = [];
for (let k = 0; k + 1 < g.start.length; k++) { const n = g.start[k + 1]! - g.start[k]!; if (n > 0) sizes.push(n); }
sizes.sort((a, b) => a - b);
console.log('floors', sizes.length, 'min', sizes[0], 'median', sizes[sizes.length >> 1], 'max', sizes[sizes.length - 1]);
for (const p of [1, 2, 3, 4, 5]) { const gp = world.groups[p]!; const s: number[] = []; for (let k = 0; k + 1 < gp.start.length; k++) { const n = gp.start[k + 1]! - gp.start[k]!; if (n > 0) s.push(n); } s.sort((a, b) => a - b); console.log('place', p, 'groups', s.length, 'median', s[s.length >> 1], 'max', s[s.length - 1]); }
