import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Architecture guard. The simulation must stay pure: no engine, no platform,
 * no wall clock, no global randomness. See CLAUDE.md, architecture rules 1 to 3.
 */

const SIM_DIR = join(__dirname, '..', 'src', 'sim');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : full.endsWith('.ts') ? [full] : [];
  });
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bDate\.now\s*\(/, 'reads the wall clock'],
  [/\bnew Date\s*\(/, 'reads the wall clock'],
  [/\bMath\.random\s*\(/, 'uses global randomness'],
  [/\bperformance\.now\s*\(/, 'reads a timer'],
  [/\bsetTimeout\s*\(|\bsetInterval\s*\(|\brequestAnimationFrame\s*\(/, 'schedules on real time'],
  [/from\s+['"]phaser['"]/, 'imports the engine'],
  [/from\s+['"]@capacitor\//, 'imports the platform'],
  [/from\s+['"](\.\.\/)+(game|ui|app)\//, 'imports from outside the sim'],
  [/\b(window|document|localStorage|indexedDB|navigator)\./, 'touches the browser'],
];

describe('sim purity', () => {
  const files = filesUnder(SIM_DIR);

  it('finds the sim sources', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('keeps every sim file free of engine, platform, clock and global randomness', () => {
    const problems: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const [pattern, why] of FORBIDDEN) {
        if (pattern.test(text)) problems.push(`${relative(SIM_DIR, file)} ${why}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
