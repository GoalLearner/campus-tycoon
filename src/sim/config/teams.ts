/**
 * The varsity teams (DESIGN.md 65.7): football and the others a big public university fields, each with its roster,
 * the men's and the women's squads together, and the kind of building it practises and plays in. A team exists while
 * the campus has one; football plays in the stadium. About 1 to 2 in 100 students at a big campus are varsity athletes
 * (about 4 in 100 at the average Division I school, fewer at the biggest: NCAA, 2024-25; weaker). Rosters are typical
 * counts, by judgement.
 */
export interface VarsityTeam {
  id: string;
  name: string;
  roster: number;
  /** Where it practises: a kind of placed building, or the stadium for football. */
  needs: 'stadium' | 'field' | 'track' | 'pool' | 'courts' | 'gym';
}

export const VARSITY_TEAMS: readonly VarsityTeam[] = [
  { id: 'football', name: 'Football', roster: 90, needs: 'stadium' },
  { id: 'soccer', name: 'Soccer', roster: 60, needs: 'field' },
  { id: 'lacrosse', name: 'Lacrosse', roster: 90, needs: 'field' },
  { id: 'baseball', name: 'Baseball and softball', roster: 60, needs: 'field' },
  { id: 'track', name: 'Track and field', roster: 120, needs: 'track' },
  { id: 'swimming', name: 'Swimming and diving', roster: 60, needs: 'pool' },
  { id: 'basketball', name: 'Basketball', roster: 30, needs: 'courts' },
  { id: 'volleyball', name: 'Volleyball', roster: 18, needs: 'courts' },
  { id: 'tennis', name: 'Tennis', roster: 20, needs: 'courts' },
  { id: 'gymnastics', name: 'Gymnastics', roster: 18, needs: 'gym' },
  { id: 'wrestling', name: 'Wrestling', roster: 32, needs: 'gym' },
];

/** No more than this share of a small campus is on a varsity roster, however many teams it fields. */
export const ATHLETES_MOST = 0.15;

/**
 * [T] In the web (DESIGN.md 65.7), where an athlete's new people come from: a team practises most days and travels
 * together, so a varsity athlete meets more of their teammates than of their floor or their classes. The order is the
 * web's places: floor, class section, club table, team, chapter, district.
 */
export const ATHLETE_WHERE = [0.18, 0.16, 0.08, 0.36, 0.04, 0.18] as const;

/** [T] A season's games, and how far a team's record leans with the academic rank's standing in the field. */
export const SEASON_GAMES = 20;
export const RECORD_LEAN = 0.25;
