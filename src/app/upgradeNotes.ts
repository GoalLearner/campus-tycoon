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
  if (fromVersion < 6) {
    notes.push(
      'New: a town now stands along the east edge of campus. Locals in new classes live there and need a way in: a path to Lantern Avenue to walk, or parking with a road to drive. Without one they need a bed. Students already enrolled are not affected.',
    );
  }
  if (fromVersion < 7) {
    notes.push(
      'New: students now drop litter where they eat and play. A Trash bin beside each such place catches most of it, and workers from a Facilities Yard empty the bins and sweep. Nothing falls for the first day and a half.',
    );
  }
  if (fromVersion === 7) {
    notes.push('Changed: a Facilities Yard now reaches 12 cells instead of 8, and its workers mend a broken bin before they sweep. Tap a broken street lamp to see what broke it and when it will be fixed.');
  }
  if (fromVersion < 10) {
    notes.push('New: a court, a field, a pool, the track and the gym each hold so many students at once. Where one is crowded, students wait their turn and Happiness there can dip a little. Tap it to see how busy it is. A second one nearby clears the line.');
  }
  if (fromVersion < 11) {
    notes.push('New: eight more places to eat and three Academics buildings are in the Build menu. Three different kinds of food in reach lift Food & fun a little. Every place to eat, your dining halls and coffee stands too, now earns a little from the students in reach: the Money panel shows it.');
  }
  if (fromVersion < 12) {
    notes.push(
      'New: the campus has a football team, in a conference of twelve. Its first season opens with the next fall. Each spring brings a few decisions, in a list on the top bar. Each has a default that happens by itself, so nothing is lost if you miss one.',
    );
    notes.push(
      'New: the year has a calendar. Holidays, breaks and exam weeks come and go, and what happened while you were away is listed by date. Exams raise Stress, which costs a little Happiness until they end. Recreation, quads, a library and a Medical Center ease it.',
    );
  }
  if (fromVersion < 14) {
    notes.push(
      'New: a campus newspaper greets you after an hour or more away, with what matters most first. Your four advisors now send petitions, deals and events to an inbox on the top bar. Each stays open at least a day and a half, shows an advisor\'s pick, and has a default that happens by itself.',
    );
  }
  if (fromVersion < 15) {
    notes.push(
      "New: tap the student count to see this fall's applicants and what makes them. A game begun on the model campus has its goals there, kept for good once reached. The main street is Lantern Avenue.",
    );
  }
  if (fromVersion < 16) {
    notes.push(
      'New: tap the student count for the Capacity page. It lists every need of a student, from beds to faculty, as what you have against what your students ask. Faculty and staff now arrive a semester after they are hired, and the Instruction slider there sets how many students each member of faculty has.',
    );
    notes.push('New: a campus that opened whole is full at 50,000 students. Applicants past that are turned away, which makes it more selective, and the rank goals are the long climb. No student is asked to leave.');
  }
  if (fromVersion < 17) {
    notes.push(
      'New: the eras now open something. On a game begun on the model campus, the Growth era at the Top 125 opens a Policies page: switches with one gain and one cost each, all off until you turn one on. Tap the student count to see what the next era will open.',
    );
  }
  return notes;
}
