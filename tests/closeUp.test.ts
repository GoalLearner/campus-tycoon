import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { session } from '../src/app/session';

/**
 * The close-up while following (DESIGN.md 64.5): an option only while the camera follows someone, kept through
 * putting the card away and bringing it back, and ended by anything that ends the follow.
 */

const KENDALL = { entryYear: 2025, index: 7 };
const SASHA = { entryYear: 2026, index: 3 };

beforeEach(() => {
  session.closeStudent();
  session.setTool('look');
});

describe('the close-up', () => {
  it('is only for someone being followed', () => {
    session.openStudent(KENDALL);
    session.setCloseUp(true);
    expect(session.closeUp).toBe(false);
    session.setFollowing(true);
    session.setCloseUp(true);
    expect(session.closeUp).toBe(true);
    session.setCloseUp(false);
    expect(session.closeUp).toBe(false);
  });

  it('stays on with the card put away and brought back', () => {
    session.openStudent(KENDALL);
    session.setFollowing(true);
    session.setCloseUp(true);
    session.tuckStudent();
    expect(session.closeUp).toBe(true);
    session.untuckStudent();
    expect(session.closeUp).toBe(true);
  });

  it('ends with the follow: stopped, gone indoors, the card closed, or another student opened', () => {
    const on = (): void => {
      session.openStudent(KENDALL);
      session.setFollowing(true);
      session.setCloseUp(true);
      expect(session.closeUp).toBe(true);
    };
    on();
    session.setFollowing(false);
    expect(session.closeUp).toBe(false);
    on();
    session.closeStudent();
    expect(session.closeUp).toBe(false);
    on();
    session.openStudent(SASHA);
    expect(session.closeUp).toBe(false);
  });

  it('has a button on the strip and on the card, a 44-point tap, and the map zooms in no further than it allows', () => {
    const css = readFileSync(join(__dirname, '../src/ui/ui.css'), 'utf8');
    expect(css).toMatch(/\.follow-strip-close \{[^}]*width: 44px;[^}]*height: 44px;/);
    const card = readFileSync(join(__dirname, '../src/ui/studentCard.ts'), 'utf8');
    expect(card).toContain("session.setCloseUp(!session.closeUp)");
    const scene = readFileSync(join(__dirname, '../src/game/CampusScene.ts'), 'utf8');
    expect(scene).toContain('const CLOSE_UP_ZOOM = MAX_ZOOM_FACTOR;');
  });
});
