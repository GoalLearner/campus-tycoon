import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Words the player must never read. The owner retired "approval" from the
 * interface on 2026-11-11: how students feel is called Happiness everywhere
 * on screen (DESIGN.md section 16.2). The code may still use the old name for
 * the number, so only quoted text is checked, not identifiers or comments.
 */

const ROOT = join(__dirname, '..', 'src');
/** Folders and files whose quoted text reaches the screen. */
const ON_SCREEN = ['ui', 'app', join('sim', 'config', 'students.ts'), join('sim', 'format.ts'), join('sim', 'digest.ts'), join('sim', 'systems')];
const RETIRED: ReadonlyArray<[RegExp, string]> = [[/approval/i, 'approval'], [/satisfaction/i, 'satisfaction']];

function filesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

/** Every quoted piece of text in a source file, with comments taken out first. */
function quoted(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((match) => match[0]);
}

describe('on-screen wording', () => {
  const files = ON_SCREEN.flatMap((part) => filesUnder(join(ROOT, part))).filter((file) => /\.(ts|css|html)$/.test(file));

  it('finds the files that hold on-screen text', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never shows the player a retired word', () => {
    const problems: string[] = [];
    for (const file of files) {
      for (const text of quoted(readFileSync(file, 'utf8'))) {
        // Import paths and the like are not shown to anyone.
        if (/^['"`]\.{0,2}\//.test(text)) continue;
        for (const [pattern, word] of RETIRED) {
          if (pattern.test(text)) problems.push(`${relative(ROOT, file)} says "${word}": ${text.slice(0, 60)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
