/**
 * The tone guide's banned words (DESIGN.md section 16): nothing about drink,
 * smoking, drugs or gambling, nothing that harms a person, and no insults.
 * Every written line that reaches the player is checked against it, in the
 * tests and in the long-run script.
 */
export const BANNED_WORDS =
  /\b(beer|wine|drunk|alcohol|pub|vodka|smok\w*|cigar\w*|vape|drugs?|weed|bets?|betting|gambl\w*|casino|poker|kill\w*|dead|die[sd]?|blood\w*|crime|arrest\w*|weapon\w*|vomit\w*|vandal\w*|stupid|idiot|ugly|fat|hate\w*)\b/i;

/** Words the interface retired: how students feel is called Happiness everywhere (16.2). */
export const RETIRED_WORDS = /\b(approval|satisfaction)\b/i;

/** The first banned or retired word in a line, or null when the line is clean. */
export function toneProblem(line: string): string | null {
  const banned = BANNED_WORDS.exec(line);
  if (banned) return banned[0];
  const retired = RETIRED_WORDS.exec(line);
  return retired ? retired[0] : null;
}
