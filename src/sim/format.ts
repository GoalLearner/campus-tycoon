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

/** A short form for tight spaces: "$1.2M", "$34K", "$950". */
export function dollarsShort(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
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
