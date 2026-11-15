/** Text formatting that gives the same result on every device. */

/** 1234567 becomes "1,234,567". */
export function withCommas(n: number): string {
  const whole = Math.round(Math.abs(n)).toString();
  let out = '';
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) out += ',';
    out += whole.charAt(i);
  }
  return (n < 0 && out !== '0' ? '-' : '') + out;
}

/**
 * The price level (DESIGN.md 67.1). The game counts the campus's money at the prices it was first tuned on, and every
 * figure the player sees is shown at today's: tuition on a model campus, counted as $8,750, reads $12,290, the real
 * in-state figure at public four-year schools (College Board 2026). Everything is shown at the same level, so every
 * share and ratio stays as it was, and saves keep their numbers. A student's own money is set in today's dollars and is
 * never shown through it (`studentDollars`).
 */
export const PRICE_LEVEL = 12_290 / 8_750;

/** An amount the campus counts, as it reads on screen at today's prices. */
export function shownAmount(n: number): number {
  return n * PRICE_LEVEL;
}

/** Whole dollars with commas and the sign: "$1,234,567", "-$1,234". */
function wholeDollars(n: number): string {
  const rounded = Math.round(n);
  return (rounded < 0 ? '-$' : '$') + withCommas(Math.abs(rounded));
}

/** The campus's money in full, at today's prices: 1234567 counted reads "$1,733,973". Negative amounts read "-$1,234". */
export function dollars(n: number): string {
  return wholeDollars(shownAmount(n));
}

/**
 * A student's own money (R3, DESIGN.md 67.2): their aid, loans, rent, books, a job's pay, a story's small sums. Set in
 * today's dollars to begin with, so shown as it is, with cents for a pay an hour. Never added to the campus's.
 */
export function studentDollars(n: number, cents = false): string {
  if (!cents || Number.isInteger(Math.round(n * 100) / 100)) return wholeDollars(n);
  const whole = Math.floor(Math.abs(n));
  return `${wholeDollars(n < 0 ? -whole : whole)}.${String(Math.round((Math.abs(n) - whole) * 100)).padStart(2, '0')}`;
}

/** Of every $100 that comes in: a share, not an amount, so the price level leaves it alone. 13.4 reads "$13", or "$13.40". */
export function perHundred(n: number, places = 0): string {
  return `$${places > 0 ? n.toFixed(places) : String(Math.round(n))}`;
}

/** A head count as it is written everywhere: "46,000". */
export function headCount(n: number): string {
  return withCommas(Math.round(n));
}

/**
 * Cash on the top bar. In full while it fits, and short once it would not:
 * a campus that stands for 46,000 students holds hundreds of millions
 * (DESIGN.md 35.7).
 */
export function dollarsTop(n: number): string {
  return Math.abs(shownAmount(n)) >= 100_000_000 ? dollarsShort(n) : dollars(n);
}

/** A short form for tight spaces, at today's prices: "$1.26B", "$259.1M", "$1.2M", "$34K", "$950". */
export function dollarsShort(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(shownAmount(n));
  if (a >= 1_000_000_000) return `${sign}$${(a / 1_000_000_000).toFixed(2)}B`;
  if (a >= 100_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1_000)}K`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** A span of ticks, which are real minutes, as "2 d 3 h", "4 h 10 m" or "12 m". */
export function duration(ticks: number): string {
  const t = Math.max(0, Math.round(ticks));
  const d = Math.floor(t / 1440);
  const h = Math.floor((t % 1440) / 60);
  const m = t % 60;
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} m` : `${h} h`;
  return `${m} m`;
}

/** A school's short name: "Larkspur" from "Larkspur University", "Tansycroft" from "University of Tansycroft". */
export function shortName(name: string): string {
  const short = name
    .trim()
    .replace(/^(the\s+)?university\s+of\s+/i, '')
    .replace(/\s+(state\s+university|university|college|institute|academy|tech|state)$/i, '')
    .trim();
  return short === '' ? name.trim() : short;
}
