// The social web's costs (DESIGN.md 63.5): the 30-day catch-up in a worker, a game week, the record's size, and checks
// on roommates and names. Run: npx tsx scripts/web-measure.ts
import { gzipSync } from 'node:zlib';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { advance, newGame, serialize } from '../src/sim';
import { KIND, SLOTS, WEB_WEEK_TICKS } from '../src/sim/config/web';
import { gender } from '../src/sim/systems/identity';
import { firstNameOf } from '../src/sim/systems/students';
import { catchUp, census, encodeWeb, newWeb, refAt, stepWeek, webWeekOf } from '../src/sim/systems/web';
import { packRecord } from '../src/app/webRecord';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 14, 15);
const state = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;

function thirtyDays(): { ms: number; lived: number; regrown: boolean } {
  // A web stepped up to date once, then left for thirty real days: 223 game weeks behind.
  const web = newWeb(state.seed, 1024);
  catchUp(web, state, 1000);
  web.placedFor = '';
  const t = performance.now();
  const done = catchUp(web, state, 1000 + Math.round((30 * 1440) / WEB_WEEK_TICKS));
  return { ms: performance.now() - t, ...done };
}

if (!isMainThread) {
  parentPort!.postMessage(thirtyDays());
} else {
  void workerData;
  const enrolled = state.cohorts.reduce((a, b) => a + b, 0);
  // On the main thread first, for the step and the record.
  const web = newWeb(state.seed, 1024);
  const t0 = performance.now();
  catchUp(web, state, webWeekOf(state));
  const first = performance.now() - t0;
  const t1 = performance.now();
  for (let w = 0; w < 10; w++) stepWeek(web);
  const week = (performance.now() - t1) / 10;
  const record = encodeWeb(web);
  const zipped = gzipSync(record);
  const tp = performance.now();
  const text = await packRecord(record);
  const packMs = performance.now() - tp;
  // Roommates of a gender, everywhere.
  let roommates = 0;
  let mixed = 0;
  for (let s = 0; s < web.n * SLOTS; s++) {
    const b = web.other[s]!;
    const a = Math.floor(s / SLOTS);
    if (b > a && web.kind[s] === KIND.roommate) {
      roommates += 1;
      if (gender(web.identity[a]!) !== gender(web.identity[b]!)) mixed += 1;
    }
  }
  // First names on each dorm floor: how often a name repeats.
  const floors = web.groups[0]!;
  let worst = 0;
  let floorsWithRepeat = 0;
  let floorCount = 0;
  for (let key = 0; key + 1 < floors.start.length; key++) {
    const from = floors.start[key]!;
    const to = floors.start[key + 1]!;
    if (to - from < 10) continue;
    floorCount += 1;
    const seen = new Map<string, number>();
    for (let i = from; i < to; i++) {
      const name = firstNameOf(state, refAt(web, floors.members[i]!));
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    const most = Math.max(...seen.values());
    worst = Math.max(worst, most);
    if (most > 1) floorsWithRepeat += 1;
  }
  const kinds = census(web);
  const save = serialize(state, T0 + DAY).length;
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: {}, execArgv: ['--import', 'tsx'] });
  let longest = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last - 10);
    last = now;
  }, 10);
  const inWorker = await new Promise<{ ms: number; lived: number; regrown: boolean }>((done) => worker.on('message', done));
  clearInterval(timer);
  await worker.terminate();
  console.log(JSON.stringify({
    enrolled,
    firstCatchUpMs: Math.round(first),
    weekMs: Math.round(week * 10) / 10,
    thirtyDaysInWorker: { ms: Math.round(inWorker.ms), lived: inWorker.lived, regrown: inWorker.regrown, mainThreadLongestPauseMs: Math.round(longest) },
    recordBytes: record.byteLength,
    recordGzipBytes: zipped.byteLength,
    recordStoredChars: text.length,
    packMs: Math.round(packMs),
    everydaySaveChars: save,
    ties: Object.fromEntries(['', 'acquaintance', 'friend', 'best', 'crush', 'dating', 'exclusive', 'long-term', 'ex', 'rival', 'enemy', 'roommate'].map((k, i) => [k || 'none', kinds[i]])),
    roommatePairs: roommates,
    mixedGenderRoommates: mixed,
    floors: floorCount,
    floorsWithARepeatedName: floorsWithRepeat,
    mostOfOneNameOnAFloor: worst,
  }, null, 1));
}
