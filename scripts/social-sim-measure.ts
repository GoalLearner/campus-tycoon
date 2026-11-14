// PROTOTYPE measure (branch social-sim-measure, never merged): memory, catch-up, save size and a sample web for the
// whole-campus social sim the owner asked about. Run: npx tsx scripts/social-sim-measure.ts [out.json]
import { writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { advance, newGame } from '../src/sim';
import { calendarAt } from '../src/sim/calendar';
import { socialProfile } from '../src/sim/systems/students';
import {
  bytes,
  EVENTS,
  FEEL_NAMES,
  graduate,
  idOf,
  KIND,
  KIND_NAMES,
  makeWorld,
  pairRoommates,
  placeStudents,
  savedTies,
  seedWeb,
  SLOTS,
  weekBatch,
  type World,
} from './social-sim-proto';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 5, 15);
const WEEKS = 223; // thirty real days of game weeks: a game year is a real week
const PER = 4; // encounters a student a week, before their outgoingness

const base = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
const year = calendarAt(base.clock).year;

function scaled(total: number): number[] {
  const sum = base.cohorts.reduce((a, b) => a + b, 0);
  return base.cohorts.map((one) => Math.round((one * total) / sum));
}

/** The catch-up: `weeks` game weeks with a new class each 52 and places read each 26, `per` encounters, `step` weeks a batch. */
function catchUp(world: World, cohorts: number[], weeks: number, step = 1): { ms: number; placing: number } {
  const t0 = performance.now();
  let placing = 0;
  let y = year;
  for (let w = 0; w < weeks; w += step) {
    if (w > 0 && w % 52 < step) {
      graduate(world, y - 3);
      y += 1;
    }
    if (w % 26 < step) placing += placeStudents(world, base, y, cohorts);
    if (w % 52 < step) pairRoommates(world);
    weekBatch(world, PER);
  }
  return { ms: performance.now() - t0, placing };
}

if (!isMainThread) {
  // In a worker: the same catch-up, off the main thread.
  const { total } = workerData as { total: number };
  const cohorts = scaled(total);
  const world = makeWorld(base, cohorts);
  const t = catchUp(world, cohorts, WEEKS);
  parentPort!.postMessage(t);
} else {
  const out: Record<string, unknown> = {};
  for (const total of [base.cohorts.reduce((a, b) => a + b, 0), 50_000, 100_000]) {
    const cohorts = scaled(total);
    const heap0 = process.memoryUsage();
    const world = makeWorld(base, cohorts);
    const place0 = placeStudents(world, base, year, cohorts);
    pairRoommates(world);
    // A game year first, so the web is grown.
    const warm = performance.now();
    for (let w = 0; w < 52; w++) weekBatch(world, PER);
    const warmMs = performance.now() - warm;
    const heap1 = process.memoryUsage();
    const size = bytes(world);
    const saved = savedTies(world);
    let enrolled = 0;
    for (let i = 0; i < world.n; i++) if (world.year[i]! >= 0) enrolled += 1;
    let ties = 0;
    const kinds = new Array(12).fill(0);
    for (let s = 0; s < world.n * SLOTS; s++) if (world.other[s]! >= 0) {
      ties += 1;
      kinds[world.kind[s]!] += 1;
    }
    // The full catch-up, the coarse one, and only the last half year.
    const full = catchUp(makeWorldWarm(cohorts), cohorts, WEEKS);
    const coarse4 = catchUp(makeWorldWarm(cohorts), cohorts, WEEKS, 4);
    const coarse8 = catchUp(makeWorldWarm(cohorts), cohorts, WEEKS, 8);
    const last26 = catchUp(makeWorldWarm(cohorts), cohorts, 26);
    // A long absence: the web regrown from the seed, then the last eight weeks lived in full.
    const regrowWorld = makeWorldWarm(cohorts);
    const r0 = performance.now();
    placeStudents(regrowWorld, base, year + 4, cohorts);
    seedWeb(regrowWorld);
    for (let w = 0; w < 8; w++) weekBatch(regrowWorld, PER);
    const regrow = performance.now() - r0;
    const row = {
      enrolled,
      placeMs: Math.round(place0),
      warmYearMs: Math.round(warmMs),
      oneWeekMs: Math.round((warmMs / 52) * 10) / 10,
      bytes: size,
      bytesPerStudent: Math.round(Object.values(size).reduce((a, b) => a + b, 0) / enrolled),
      heapGrowthMB: Math.round(((heap1.heapUsed + heap1.arrayBuffers - heap0.heapUsed - heap0.arrayBuffers) / 1e6) * 10) / 10,
      tieEnds: ties,
      tiesPerStudent: Math.round((ties / enrolled) * 10) / 10,
      kinds: Object.fromEntries(KIND_NAMES.map((k, i) => [k || 'none', kinds[i]])),
      saved,
      events: Object.fromEntries(EVENTS.map((name, i) => [name, world.events[i]])),
      catchUp: { full: Math.round(full.ms), fullPlacing: Math.round(full.placing), coarse4: Math.round(coarse4.ms), coarse8: Math.round(coarse8.ms), last26: Math.round(last26.ms), regrow8: Math.round(regrow) },
    };
    console.log(total, JSON.stringify(row));
    out[String(total)] = row;
    if (total < 50_000) out.sample = sampleDorm(world);
  }
  // The worker: the main thread stays free while the full catch-up runs.
  const started = performance.now();
  let blocked = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    blocked = Math.max(blocked, now - last - 10);
    last = now;
  }, 10);
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { total: 46_000 }, execArgv: ['--import', 'tsx'] });
  const result = await new Promise<{ ms: number }>((done) => worker.on('message', done));
  clearInterval(timer);
  out.worker = { ms: Math.round(result.ms), wallMs: Math.round(performance.now() - started), mainThreadLongestStallMs: Math.round(blocked) };
  console.log('worker', JSON.stringify(out.worker));
  writeFileSync(process.argv[2] ?? 'social-sim-measure.json', JSON.stringify(out, null, 1));
}

function makeWorldWarm(cohorts: number[]): World {
  const world = makeWorld(base, cohorts);
  placeStudents(world, base, year, cohorts);
  pairRoommates(world);
  for (let w = 0; w < 4; w++) weekBatch(world, PER);
  return world;
}

/** One dorm: its residents and every tie among them, with the kind and the feeling. */
function sampleDorm(world: World): unknown {
  const residents = new Map<number, { entryYear: number; index: number }>();
  // The dorm with the most residents in the first 120 of each class, so names are the game's own.
  const byHome = new Map<number, number[]>();
  for (let classYear = 0; classYear < 4; classYear++) {
    const entryYear = year - classYear;
    for (let index = 0; index < Math.min(400, base.cohorts[classYear]!); index++) {
      const id = idOf(world, entryYear, index);
      const key = world.place[0]![id]!;
      if (key < 0) continue;
      const home = key >> 5;
      if (!byHome.has(home)) byHome.set(home, []);
      byHome.get(home)!.push(id);
      residents.set(id, { entryYear, index });
    }
  }
  const [home, ids] = [...byHome.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  const inDorm = new Set(ids);
  const people = ids.map((id) => {
    const ref = residents.get(id)!;
    const p = socialProfile(base, ref);
    const bits = world.identity[id]!;
    return { id, name: p?.name ?? '?', year: p?.classYear ?? 0, nature: p?.nature ?? '', gender: ['woman', 'man', 'nonbinary'][bits & 3] };
  });
  const edges: Array<{ a: number; b: number; kind: string; strength: number; feeling: string }> = [];
  for (const id of ids) {
    for (let k = 0; k < SLOTS; k++) {
      const s = id * SLOTS + k;
      const o = world.other[s]!;
      if (o < 0 || o < id || !inDorm.has(o)) continue;
      // A crush is one's own: show it from whichever end has it.
      const back = (() => {
        for (let j = 0; j < SLOTS; j++) if (world.other[o * SLOTS + j] === id) return o * SLOTS + j;
        return -1;
      })();
      const kind = world.kind[s] === KIND.crush || (back >= 0 && world.kind[back] === KIND.crush) ? (world.kind[s] === KIND.crush && back >= 0 && world.kind[back] === KIND.crush ? 'crush, mutual' : 'crush, one-sided') : KIND_NAMES[world.kind[s]!]!;
      edges.push({ a: id, b: o, kind, strength: world.strength[s]!, feeling: FEEL_NAMES[world.feeling[s]!]! });
    }
  }
  return { home, people, edges };
}
