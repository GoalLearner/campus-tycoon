/**
 * Hard lines, whatever the rating (DESIGN.md 16.1, 52.2 and 63.11; App Store Guideline 1.1.1). Students may be mean to
 * each other in the simulation since the owner's 16+ ("allow bullying and drama"), but never like this: no slurs;
 * never about race, religion, ethnicity, sexuality, gender identity, disability, or body and weight; nothing sexual;
 * no threats; nothing about self-harm or suicide. Every template that says how someone picks on someone, and every
 * post when the campus app comes (stops 9 and 10), is scanned for these by `tests/hardLines.test.ts`.
 *
 * No slur is written here or anywhere in the game: the only names anyone is ever called are `NAME_CALLING`, mild and
 * about how someone acts, and the test fails on any other.
 */

/** The only names anyone is called: about how they act, never who they are. */
export const NAME_CALLING = ['try-hard', "teacher's pet", 'fake', 'know-it-all', 'show-off', 'suck-up'] as const;

export interface HardLine {
  id: 'identity' | 'disability' | 'body' | 'sexual' | 'threat' | 'selfHarm';
  /** What it keeps out, in plain words. */
  why: string;
  pattern: RegExp;
}

export const HARD_LINES: readonly HardLine[] = [
  {
    id: 'identity',
    why: 'race, religion, ethnicity, sexuality or gender identity',
    pattern:
      /\b(race|racial|races|black|white|brown|asian|latin[oax]?|hispanic|arab|jew\w*|muslim|christian|catholic|hindu|buddhist|atheist|religio\w*|church|mosque|temple|synagogue|faith|pray\w*|ethnic\w*|immigra\w*|foreign\w*|accent|native|gay|lesbian|bisexual|queer|trans\w*|straight|sexuality|gender\w*|pronoun\w*|girly|manly|girl|boy|woman|women|man|men)\b/i,
  },
  {
    id: 'disability',
    why: 'disability',
    pattern: /\b(disab\w*|handicap\w*|wheelchair|blind|deaf|mute|autis\w*|adhd|retard\w*|crippl\w*|lame|dumb|stupid|idiot\w*|moron\w*|mental\w*|crazy|insane|psycho\w*|spaz\w*)\b/i,
  },
  {
    id: 'body',
    why: 'body or weight',
    pattern: /\b(fat|fatty|skinny|weigh\w*|ugly|bod(y|ies)|chubby|obese|short|tall|looks|face|acne|zits?|hair|nose|teeth|skin|height)\b/i,
  },
  {
    id: 'sexual',
    why: 'anything sexual',
    pattern: /\b(sex\w*|hook(ed|ing)? up|naked|nude\w*|grop\w*|touch\w*|kiss\w*|harass\w*|flirt\w*|hot|sexy|bed)\b/i,
  },
  {
    id: 'threat',
    why: 'threats',
    pattern: /\b(kill\w*|hurt\w*|beat\w*|punch\w*|hit|hits|stab\w*|shoot\w*|gun|knife|weapon\w*|threat\w*|or else|watch (your|their|his|her) back|destroy\w*|fight\w*|attack\w*|wreck\w*)\b/i,
  },
  {
    id: 'selfHarm',
    why: 'self-harm or suicide',
    pattern: /\b(suicid\w*|self-harm\w*|cutting|kys|die|dies|died|dying|dead|death|end it|overdos\w*|starv\w*)\b/i,
  },
];

/** The first hard line a line crosses, or null. */
export function hardLineProblem(text: string): HardLine | null {
  for (const line of HARD_LINES) if (line.pattern.test(text)) return line;
  return null;
}
