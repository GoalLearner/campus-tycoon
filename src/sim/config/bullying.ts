/**
 * Every line the game says about someone picking on someone (DESIGN.md 63.11), in one place so that
 * `tests/hardLines.test.ts` reads each against the hard lines (`hardLines.ts`). `{a}`, `{b}` and `{c}` are the
 * students' names, `{name}` one first name. The paper's own voice reports what happened and never mocks anyone (16.1):
 * the meanness is the students', said plainly.
 */

/** What the paper and the cards say happened, by kind; one is picked by the happening's own luck. */
export const BULLYING_LINES = {
  /** {a} picked on {b}. */
  bullying: [
    '{a} called {b} a try-hard in front of their whole class.',
    "{a} keeps calling {b} a teacher's pet.",
    '{a} has been telling everyone {b} is fake.',
    '{a} started a rumour about {b}, and it got around.',
    "{a} laughed out loud at {b}'s answer in seminar.",
    '{a} named and shamed {b} in a group chat for missing a study session.',
    '{a} called {b} a know-it-all, again.',
    '{a} keeps rolling their eyes whenever {b} speaks up.',
    "{a} called {b} a show-off for making the Dean's list.",
    "{a} mocked {b}'s club in front of the whole dining hall line.",
  ],
  /** {a}'s clique shut {b} out. */
  shutOut: [
    "{a}'s group stopped saving {b} a seat at lunch.",
    "{a} left {b} out of the group's plans, on purpose.",
    "{a}'s friends went quiet whenever {b} sat down.",
    '{a} made sure {b} was not invited this weekend.',
  ],
  /** Roommates {a} and {b}, petty. */
  pettiness: [
    "{a} hid {b}'s phone charger, again.",
    '{a} and {b} are down to notes on the fridge.',
    "{a} keeps eating {b}'s food and denying it.",
    "{a} turned the music up the night before {b}'s exam.",
    '{a} called {b} a suck-up for asking for quiet hours.',
  ],
  /** {c} joined in when {a} picked on {b}. */
  pileOn: [
    '{c} joined in when {a} went after {b}.',
    "{a} and {c} are both on {b}'s case now.",
    '{c} laughed along when {a} called {b} a try-hard.',
  ],
  /** {a} stood up for {b}. */
  stoodUp: ['{a} stood up for {b}.', "{a} told {b}'s critics to knock it off.", '{a} sat with {b} at lunch when nobody else would.', '{a} backed {b} up in front of everyone.'],
  /** {a} was reported for picking on {b}. */
  reported: ['{a} was reported to the conduct office for picking on {b}.', 'The conduct office has had a word with {a} about how they treat {b}.'],
} as const;

/** The people row's words for each end of it. */
export const BULLYING_ROLES = { bully: 'Picks on', bullied: 'Picks on them' } as const;

/** A card's feeling (63.7), and its Friends row (63.10), for someone picked on. */
export const BULLIED_REASON = 'Picked on by {name}';
export const BULLIED_TIE = '{name} picks on them';

/** What the map remembers for a regular (63.9) who passes the one who picks on them, or the one they pick on. */
export const BULLYING_PASSING = { bullied: 'Passed {name}, who picks on them', bully: 'Made a comment as {name} walked past' } as const;

/** Every line above, for the test that reads them against the hard lines. */
export function bullyingTemplates(): string[] {
  return [...Object.values(BULLYING_LINES).flat(), ...Object.values(BULLYING_ROLES), BULLIED_REASON, BULLIED_TIE, ...Object.values(BULLYING_PASSING)];
}
