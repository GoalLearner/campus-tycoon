// PROTOTYPE (social-sim-measure): the web of one dorm floor after a game year, for the design page.
import { writeFileSync } from 'node:fs';
import { advance, newGame } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';
import { socialProfile } from '../src/sim/systems/students';
import { FEEL_NAMES, KIND, KIND_NAMES, makeWorld, pairRoommates, placeStudents, SLOTS, weekBatch } from './social-sim-proto';
const T0 = Date.UTC(2026, 0, 5, 15);
const base = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + 86_400_000).state;
const year = calendarAt(base.clock).year;
const world = makeWorld(base, base.cohorts);
placeStudents(world, base, year, base.cohorts);
pairRoommates(world);
for (let w = 0; w < 52; w++) weekBatch(world, 4);
// The floor whose residents hold the most ties among themselves, of 24 to 40 people.
const group = world.groups[0]!;
let best = -1;
let bestScore = -1;
for (let key = 0; key + 1 < group.start.length; key++) {
  const size = group.start[key + 1]! - group.start[key]!;
  if (size < 18 || size > 34) continue;
  const ids = new Set(Array.from(group.members.subarray(group.start[key]!, group.start[key + 1]!)));
  let inside = 0;
  let romance = 0;
  for (const id of ids) for (let k = 0; k < SLOTS; k++) {
    const o = world.other[id * SLOTS + k]!;
    if (o >= 0 && ids.has(o)) {
      inside += 1;
      const kd = world.kind[id * SLOTS + k]!;
      if (kd >= KIND.crush && kd <= KIND.enemy) romance += 4;
    }
  }
  if (inside + romance > bestScore) {
    bestScore = inside + romance;
    best = key;
  }
}
const ids = Array.from(group.members.subarray(group.start[best]!, group.start[best + 1]!));
const inFloor = new Set(ids);
const refOf = (id: number): { entryYear: number; index: number } => {
  const ring = Math.floor(id / world.classSlot);
  const classYear = [0, 1, 2, 3].find((cy) => ((((year - cy) % 4) + 4) % 4) === ring)!;
  return { entryYear: year - classYear, index: id % world.classSlot };
};
const people = ids.map((id) => {
  const p = socialProfile(base, refOf(id));
  const bits = world.identity[id]!;
  return { id, name: p?.name ?? '?', year: p?.classYear ?? 0, nature: p?.nature ?? '', gender: ['woman', 'man', 'nonbinary'][bits & 3] };
});
const edges: Array<{ a: number; b: number; kind: string; strength: number; feeling: string }> = [];
for (const id of ids) for (let k = 0; k < SLOTS; k++) {
  const s = id * SLOTS + k;
  const o = world.other[s]!;
  if (o < 0 || o < id || !inFloor.has(o)) continue;
  const back = world.back[s]!;
  const mine = world.kind[s] === KIND.crush;
  const theirs = back >= 0 && world.kind[back] === KIND.crush;
  const kind = mine && theirs ? 'crush, mutual' : mine || theirs ? 'crush, one-sided' : KIND_NAMES[world.kind[s]!]!;
  edges.push({ a: mine || !theirs ? id : o, b: mine || !theirs ? o : id, kind, strength: world.strength[s]!, feeling: FEEL_NAMES[world.feeling[s]!]! });
}
writeFileSync(process.argv[2] ?? 'sample.json', JSON.stringify({ floor: best, people, edges }, null, 1));
console.log('floor', best, 'people', people.length, 'edges', edges.length);
