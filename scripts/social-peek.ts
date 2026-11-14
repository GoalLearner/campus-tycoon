// A look at the social campus after a few real days (DESIGN.md 62). Not part of the build: run with
//   npx tsx scripts/social-peek.ts
import { advance, newGame } from '../src/sim';
import { friendGroups, peopleOf } from '../src/sim/systems/social';
import { socialProfile } from '../src/sim/systems/students';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 5, 15);
const campus = (process.argv[2] ?? 'model') as 'model';
let state = newGame({ seed: 35, name: 'Test University', now: T0, campus });
const started = performance.now();
state = advance(state, T0, T0 + 3 * DAY).state;
console.log('3 days in', Math.round(performance.now() - started), 'ms');
const s = state.social;
console.log('regulars', s.regulars.length, 'ties', s.ties.length, 'level', s.level);
const kinds = new Map<string, number>();
for (const tie of s.ties) kinds.set(tie.kind, (kinds.get(tie.kind) ?? 0) + 1);
console.log('kinds', Object.fromEntries(kinds));
for (const group of friendGroups(state)) console.log('group', group.name, group.members.map((one) => socialProfile(state, one)?.firstName).join(', '));
const first = s.regulars[0]!;
console.log('first', socialProfile(state, first.ref)?.name, peopleOf(state, first.ref).map((one) => `${one.name} ${one.kind} ${Math.round(one.strength)}${one.best ? ' best' : ''}`));
console.log('talks', first.talks.map((one) => `${one.tone} ${socialProfile(state, one.with)?.firstName}${one.about ? ' about ' + one.about : ''}`));
console.log('news', s.news.slice(-12).map((one) => one.text));
const t1 = performance.now();
const later = advance(state, T0 + 3 * DAY, T0 + 33 * DAY).state;
console.log('30 days catch-up', Math.round(performance.now() - t1), 'ms', 'regulars', later.social.regulars.length, 'ties', later.social.ties.length);
// The same thirty days with no social campus, to see what it costs.
const bare = structuredClone(state) as unknown as Record<string, unknown>;
delete bare.social;
const t2 = performance.now();
advance(bare as unknown as typeof state, T0 + 3 * DAY, T0 + 33 * DAY);
console.log('30 days without the social campus', Math.round(performance.now() - t2), 'ms');
