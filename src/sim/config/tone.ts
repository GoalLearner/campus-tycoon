/**
 * The tone guide's banned words (DESIGN.md section 16, as changed by 52.1):
 * nothing about smoking, vaping, drugs or gambling, nothing that harms a
 * person badly, nothing graphic, and no insults. Alcohol left this list on
 * 2026-11-13: it is allowed, plainly and with its costs, and kept infrequent
 * by the long run's budget below. Every written line that reaches the player
 * is checked against it, in the tests and in the long-run script.
 */
export const BANNED_WORDS =
  /\b(smok\w*|cigar\w*|vape|vaping|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?|blood\w*|crime|arrest\w*|weapon\w*|vomit\w*|vandal\w*|stupid|idiot|ugly|fat|hate\w*)\b/i;

/** Words the interface retired: how students feel is called Happiness everywhere (16.2). */
export const RETIRED_WORDS = /\b(approval|satisfaction)\b/i;

/** The first banned or retired word in a line, or null when the line is clean. */
export function toneProblem(line: string): string | null {
  const banned = BANNED_WORDS.exec(line);
  if (banned) return banned[0];
  const retired = RETIRED_WORDS.exec(line);
  return retired ? retired[0] : null;
}

/**
 * A line about drinking (DESIGN.md 52.2, point 1): the long run counts them and holds them to a budget, so alcohol
 * stays infrequent and the rating stays 13+. Every line the game writes about it uses one of these words.
 */
export const DRINK_WORDS = /\b(alcohol|beer|wine|drunk|drinking|drank|drinks|a drink|dry campus|hangover|hungover)\b/i;

/** A line about a heavy theme (52.2, point 2): hazing, a suspension, a breakup, cheating. Held to a budget too. */
export const HEAVY_WORDS = /\b(hazing|hazed|suspended|suspension|breakup|broke up|heartbr\w*|cheat\w*)\b/i;

/** The share of the lines the player reads that may be about each, at most: infrequent, not on most screens. */
export const DRINK_BUDGET = 0.04;
export const HEAVY_BUDGET = 0.04;
