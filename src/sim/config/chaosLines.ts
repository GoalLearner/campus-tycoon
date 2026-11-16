import type { ChaosKind, ProtestTopic } from './chaos';

/**
 * Chaos's lines on the map (DESIGN.md 68.2), comic words as the owner chose (his answer 2): a dust-up, a shouting match,
 * a prank, graffiti, a rally. Nobody is hurt worse than a bruise; no weapons, no fire, nothing graphic; the paper never
 * mocks a student. `{place}` is "a dorm" or "the quad".
 */
export const CHAOS_LINES: Readonly<Record<Exclude<ChaosKind, 'party' | 'protest'>, readonly string[]>> = {
  dustUp: [
    'A dust-up outside {place}: a cloud, some stars, and two students who will laugh about it by Friday.',
    'Two rivals met on the path by {place}. A dust-up, a lot of noise, nobody worse than a bruise.',
    'An argument over the last dryer at {place} turned into a dust-up in the laundry room.',
    'A dust-up over a parking space outside {place}. Dust, stars, then apologies.',
  ],
  shouting: [
    'A shouting match in a hallway at {place}, about whose turn it was to take out the trash.',
    'Two floors at {place} are not speaking after a shouting match about the thermostat.',
    'A shouting match outside {place}, about a group project and who did none of it.',
  ],
  prank: [
    'Every door at {place} is covered in sticky notes.',
    'Someone filled the lobby of {place} with beach balls.',
    'The lounge furniture at {place} now hangs, carefully, from the ceiling.',
    'A fleet of rubber ducks has been launched in the fountain by {place}.',
  ],
  graffiti: [
    'Graffiti on the wall by {place}: a very large, very cheerful squirrel.',
    'Someone painted the statue by {place} in the rival’s colours.',
    'Chalk slogans cover the path outside {place}, in letters three feet tall.',
  ],
};

/** A protest's lines (the owner's answer 11: campus things only), by what it is about. */
export const PROTEST_LINES: Readonly<Record<ProtestTopic, readonly string[]>> = {
  beds: ['Students rally on {place} for more beds: signs, one chant, and a petition for the Dean.', 'A sit-in outside the housing office: students want more beds, and a room of their own.'],
  food: ['A sit-in at the dining hall: students want food in reach of every hall.', 'Students rally on {place} for better food, with signs drawn in ketchup.'],
  parking: ['A rally about parking: students circle {place} on foot, as they say they must.'],
  policy: ['Students rally on {place} against a policy they dislike, with signs and a petition.', 'A sit-in outside Administration about a campus policy: polite, loud, and well attended.'],
};
