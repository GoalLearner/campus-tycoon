import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advance, budget, newGame, parseSave, sampleStudents, serialize, studentCard } from '../src/sim';
import { ROOM_AND_BOARD_TODAY, ROOM_FEE_PER_BED_PER_YEAR, TUITION_ESTABLISHED_PER_YEAR, TUITION_PER_STUDENT_PER_YEAR } from '../src/sim/config/money';
import { RENT_PER_BED_MONTH } from '../src/sim/config/studentMoney';
import { dollars, dollarsShort, dollarsTop, perHundred, PRICE_LEVEL, shownAmount, studentDollars } from '../src/sim/format';
import { moneyView } from '../src/ui/buildUi';
import { upgradeNotes } from '../src/app/upgradeNotes';
import { DAY, T0 } from './helpers';

/**
 * The price level (R3, DESIGN.md 67.1): every amount of the campus's money the player sees is shown at today's prices
 * through one formatter, a student's own money in today's dollars as it is, and a share of every $100 as it is. Saves
 * keep their numbers.
 */

const SRC = join(__dirname, '..', 'src');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}
/** The code of a file without its comments, line by line. */
function code(path: string): Array<{ line: number; text: string }> {
  const text = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
  return text.split('\n').map((one, i) => ({ line: i + 1, text: one.replace(/(^|\s)\/\/.*$/, '') }));
}

describe('the price level, R3', () => {
  it('shows every amount of the campus through one formatter: no code builds a dollar amount of its own', () => {
    const found: string[] = [];
    for (const path of files(SRC)) {
      if (path.endsWith(join('sim', 'format.ts'))) continue;
      for (const { line, text } of code(path)) {
        // "$" then a number written in, or a template's value: "$${x}", "'$' + x", "$5,000". "of every $100" is a share.
        if (/\$\$\{/.test(text) || /['"`]\$['"`]\s*\+/.test(text) || /\$(?!100\b)\d/.test(text.replace(/\/[^/\n]*\$[^/\n]*\//g, '')) || /currency/i.test(text)) found.push(`${path.slice(SRC.length + 1)}:${line}: ${text.trim().slice(0, 120)}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('reads tuition at $12,290 on a model campus, every amount at the same level, and leaves shares and a student alone', () => {
    expect(PRICE_LEVEL).toBeCloseTo(12_290 / 8_750, 12);
    expect(dollars(TUITION_ESTABLISHED_PER_YEAR)).toBe('$12,290');
    expect(dollars(TUITION_PER_STUDENT_PER_YEAR)).toBe('$11,517');
    expect(dollars(-1_000)).toBe('-$1,405');
    expect(dollarsShort(100_000_000)).toBe('$140.5M');
    expect(dollarsTop(80_000_000)).toBe('$112.4M');
    expect(dollarsTop(70_000_000)).toBe(dollars(70_000_000));
    expect(shownAmount(1_000)).toBeCloseTo(1_404.571, 3);
    expect(perHundred(13.4)).toBe('$13');
    expect(perHundred(13.456, 2)).toBe('$13.46');
    expect(studentDollars(928)).toBe('$928');
    expect(studentDollars(14.5, true)).toBe('$14.50');
    expect(studentDollars(15, true)).toBe('$15');
  });

  it('shows the model campus at today’s prices on the Money panel, room and board at $13,300 netting to the room fee', () => {
    const state = advance(newGame({ seed: 4, name: 'Prices', now: T0, campus: 'model' }), T0, T0 + DAY).state;
    const books = budget(state);
    const tuition = books.income.find((line) => line.id === 'tuition')!;
    expect(tuition.detail).toMatch(/ at \$12,290$/);
    const rooms = books.income.find((line) => line.id === 'rooms')!;
    expect(rooms.name).toBe('Room and board');
    expect(rooms.detail).toContain(`at ${studentDollars(ROOM_AND_BOARD_TODAY)} a year`);
    expect(rooms.detail).toContain(`Housing and dining operations take ${dollars(ROOM_AND_BOARD_TODAY / PRICE_LEVEL - ROOM_FEE_PER_BED_PER_YEAR)} of each, so ${dollars(ROOM_FEE_PER_BED_PER_YEAR)} a bed comes in`);
    // What comes in is the room fee as it always was, so the share kept of every $100 does not move.
    const beds = Number(rooms.detail.split(' ')[0]!.replace(/,/g, ''));
    expect(rooms.amount).toBe(beds * ROOM_FEE_PER_BED_PER_YEAR);
    const view = moneyView(state);
    expect(view.lead).toBe(`You keep ${perHundred(Math.round(books.kept))} of every $100 that comes in.`);
    expect(view.incomeTotal).toBe(dollarsShort(books.incomeTotal));
  });

  it('shows a student’s money in today’s dollars as it is, never at the level', () => {
    const state = advance(newGame({ seed: 4, name: 'Prices', now: T0, campus: 'model' }), T0, T0 + DAY).state;
    const rents: number[] = [];
    for (const ref of sampleStudents(state, 600)) {
      const card = studentCard(state, ref);
      if (card?.money.rent) rents.push(card.money.rent);
      for (const line of card?.money.lines ?? []) {
        const rent = /^Rent \$([\d,]+) a month in town$/.exec(line);
        if (rent) expect(Number(rent[1]!.replace(/,/g, ''))).toBe(card!.money.rent);
      }
    }
    const mean = rents.reduce((sum, x) => sum + x, 0) / rents.length;
    expect(Math.abs(mean / RENT_PER_BED_MONTH - 1)).toBeLessThan(0.05);
  });

  it('keeps a save’s every number, and tells the player once why amounts read higher', () => {
    const state = advance(newGame({ seed: 4, name: 'Prices', now: T0, campus: 'model' }), T0, T0 + DAY).state;
    const old = JSON.parse(serialize(state, T0 + DAY));
    old.v = 31;
    old.state.version = 31;
    const loaded = parseSave(JSON.stringify(old));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.money).toEqual(state.money);
    expect({ ...loaded.state, version: 0 }).toEqual({ ...state, version: 0 });
    expect(upgradeNotes(31)[0]).toBe(`Prices now read in today's dollars: tuition is ${dollars(TUITION_ESTABLISHED_PER_YEAR)} a year. Nothing about your campus changed.`);
  });
});
