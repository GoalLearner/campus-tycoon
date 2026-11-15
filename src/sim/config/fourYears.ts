/**
 * Four years, R2 of the realism pass (DESIGN.md 66, approved 2026-11-14, "Yes, all ten"): the figures for move-in and
 * welcome week, parents' weekend, the year's rhythm, birthdays and turning 21, where students live by class year, the
 * milestones of four years, what seniors go on to, and family. Each figure names its source in DESIGN.md 66.
 */

// ------------------------------------------------------------- the year --

/** Of students, the share whose family visits on parents' weekend. [T] */
export const PARENTS_VISITING = 0.4;

/**
 * The year's stretches as students feel them (the day line names them): of students, the share each is felt by, its
 * feeling and its weight among a card's feelings. Finals crunch weighs more with Stress.
 */
export const RHYTHM_FEELINGS: Readonly<Record<string, { share: number; emotion: 'happy' | 'excited' | 'sad' | 'tense'; label: string; weight: number }>> = {
  fallStartWeeks: { share: 0.7, emotion: 'excited', label: 'Fall energy', weight: 0.9 },
  midtermSlump: { share: 0.6, emotion: 'sad', label: 'Midterm slump', weight: 1 },
  fallCrunch: { share: 0.8, emotion: 'tense', label: 'Finals crunch', weight: 1.1 },
  springStartWeeks: { share: 0.6, emotion: 'happy', label: 'A new semester', weight: 0.8 },
  springFatigue: { share: 0.55, emotion: 'sad', label: 'Spring fatigue', weight: 0.9 },
  springFatigueLate: { share: 0.55, emotion: 'sad', label: 'Spring fatigue', weight: 0.9 },
  springCrunch: { share: 0.8, emotion: 'tense', label: 'Finals crunch', weight: 1.1 },
};
