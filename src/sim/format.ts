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

/** 1234567 becomes "$1,234,567". Negative amounts read "-$1,234". */
export function dollars(n: number): string {
  const rounded = Math.round(n);
  return (rounded < 0 ? '-$' : '$') + withCommas(Math.abs(rounded));
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
  return Math.abs(n) >= 100_000_000 ? dollarsShort(n) : dollars(n);
}

/** A short form for tight spaces: "$1.26B", "$259.1M", "$1.2M", "$34K", "$950". */
export function dollarsShort(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
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
