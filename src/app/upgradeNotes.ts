/**
 * What to tell a player whose save was made by an older version of the game:
 * one line for each rule that is new to them. Shown once, with the away list,
 * on the load that upgrades the save.
 */
export function upgradeNotes(fromVersion: number): string[] {
  const notes: string[] = [];
  if (fromVersion < 4) {
    notes.push(
      'New: a dorm needs a Dining hall or a Coffee stand in reach to grow past its first stage. Tap a dorm that says "no dining nearby" and it offers to place one beside it.',
    );
    notes.push('New: clearing gives money back. All of it within a minute of building, half after that.');
  }
  return notes;
}
