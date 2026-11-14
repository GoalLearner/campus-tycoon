// PROTOTYPE (social-sim-measure): how big a model campus save is today, for comparison with the ties.
import { advance, newGame, serialize } from '../src/sim';
const T0 = Date.UTC(2026, 0, 5, 15);
const s = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + 3 * 86_400_000).state;
const text = serialize(s, T0 + 3 * 86_400_000);
console.log('model campus save', text.length, 'characters;', 'enrolled', s.cohorts.reduce((a, b) => a + b, 0));
