import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { session } from '../src/app/session';

/**
 * The student card put away to a strip while following (DESIGN.md 61): the
 * camera goes on following, the strip brings the card back, and anything that
 * ends the card ends the strip.
 */

const KENDALL = { entryYear: 2025, index: 7 };
const SASHA = { entryYear: 2026, index: 3 };

beforeEach(() => {
  session.closeStudent();
  session.setTool('look');
});

describe('the strip', () => {
  it('is the card put away while following, and the follow goes on', () => {
    session.openStudent(KENDALL);
    expect(session.tucked).toBe(false);
    session.setFollowing(true);
    session.tuckStudent();
    expect(session.tucked).toBe(true);
    expect(session.following).toBe(true);
    expect(session.student).toEqual(KENDALL);
    // Tapped: the card again, still following.
    session.untuckStudent();
    expect(session.tucked).toBe(false);
    expect(session.following).toBe(true);
  });

  it('stays when the follow ends, as one tap back to the card', () => {
    session.openStudent(KENDALL);
    session.setFollowing(true);
    session.tuckStudent();
    // They went indoors, or the map was dragged: the camera stops, the strip stays and says so.
    session.setFollowing(false);
    expect(session.tucked).toBe(true);
    expect(session.student).toEqual(KENDALL);
  });

  it('goes with its cross, which stops following', () => {
    session.openStudent(KENDALL);
    session.setFollowing(true);
    session.tuckStudent();
    session.closeStudent();
    expect(session.tucked).toBe(false);
    expect(session.following).toBe(false);
    expect(session.student).toBeNull();
  });

  it('gives way to anything that opens something else: another card, a building, a tool, the room', () => {
    const tucked = (): void => {
      session.openStudent(KENDALL);
      session.setFollowing(true);
      session.tuckStudent();
      expect(session.tucked).toBe(true);
    };
    tucked();
    session.openStudent(SASHA);
    expect(session.tucked).toBe(false);
    tucked();
    session.select(3, 4);
    expect(session.tucked).toBe(false);
    tucked();
    session.setTool('road');
    expect(session.tucked).toBe(false);
    session.setTool('look');
    tucked();
    session.untuckStudent();
    session.openRoom();
    expect(session.tucked).toBe(false);
  });

  it('needs a card to put away', () => {
    session.tuckStudent();
    expect(session.tucked).toBe(false);
  });
});

describe('the card', () => {
  it('reads Hide while following, and Close puts it away to the strip then', () => {
    const card = readFileSync(join(__dirname, '..', 'src', 'ui', 'studentCard.ts'), 'utf8');
    expect(card).toContain("session.following ? session.tuckStudent() : session.closeStudent()");
    expect(card).toContain("session.following ? 'Hide' : 'Close'");
  });

  it('keeps the strip clear of Build and above the toolbar', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'ui', 'ui.css'), 'utf8');
    const rule = css.slice(css.indexOf('.follow-strip {'), css.indexOf('}', css.indexOf('.follow-strip {')));
    expect(rule).toMatch(/right: calc\(var\(--safe-right\) \+ 108px\)/);
    expect(rule).toMatch(/bottom: calc\(var\(--safe-bottom\) \+ 76px\)/);
  });
});
