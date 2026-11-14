import {
  ACTIVITIES,
  CAST_TRAITS,
  goalStatus,
  mcHappiness,
  mcStress,
  NEED_LOW,
  NEED_NAMES,
  NEEDS,
  studentCard,
  suggestMain,
  dollars,
  type GameState,
} from '../sim';

/**
 * The Main Character on screen (DESIGN.md 53.2, as built in section 57): the
 * page the portrait on the top bar opens, worked out from the save when it is
 * open. With none chosen it suggests one from the newest class, and shows the
 * hall of fame.
 */

export interface McView {
  chosen: {
    name: string;
    about: string;
    ref: { entryYear: number; index: number };
    doing: string;
    rows: Array<[string, string]>;
    needs: Array<{ name: string; level: number; low: boolean }>;
    plan: Array<{ text: string; done: boolean }>;
    goals: Array<[string, string]>;
    people: Array<[string, string]>;
    timeline: string[];
    /** The Story tab (DESIGN.md 53.3): chapters, newest first, each told as scenes. */
    chapters: Array<{ title: string; open: boolean; scenes: Array<{ text: string; chose: string; outcome: string; odds: string; good: boolean }> }>;
  } | null;
  suggestion: { ref: { entryYear: number; index: number }; name: string; about: string } | null;
  fame: Array<{ name: string; line: string; story: string[] }>;
}

const ROLE: Record<string, string> = { roommate: 'Roommate', friend: 'Friend', crush: 'Crush', partner: 'Partner' };
const STATUS: Record<string, string> = { graduated: 'Graduated', transferred: 'Transferred', left: 'Left', setAside: 'Set aside' };

export function mcView(state: GameState): McView {
  const story = state.story;
  const fame = (story?.fame ?? [])
    .slice()
    .reverse()
    .map((one) => ({ name: one.name, line: `${STATUS[one.status] ?? one.status} · ${one.major} · ${one.years}${one.gpa !== null ? ` · GPA ${one.gpa.toFixed(2)}` : ''}`, story: one.story.map((entry) => entry.text) }));
  const mc = story?.mc ?? null;
  if (!mc) {
    const ref = suggestMain(state);
    const card = ref ? studentCard(state, ref) : null;
    return { chosen: null, suggestion: ref && card ? { ref, name: card.name, about: `${card.classYearName} · ${card.major} · ${card.archetypeName}` } : null, fame };
  }
  const card = studentCard(state, mc.ref);
  const spec = ACTIVITIES[mc.doing.activity];
  const rows: Array<[string, string]> = [
    ['Happiness', `${mcHappiness(state, mc)} of 100`],
    ['Stress', `${mcStress(state, mc)} of 100`],
    ['GPA', mc.gpa === null ? 'No grades yet' : mc.gpa.toFixed(2)],
    ['Money', dollars(mc.money)],
  ];
  if (mc.club) rows.push(['Club', mc.club]);
  if (mc.job) rows.push(['Job', mc.job]);
  return {
    chosen: {
      name: mc.name,
      about: `${card?.classYearName ?? 'Student'} · ${mc.major} · ${card?.archetypeName ?? ''}`.replace(/ · $/, ''),
      ref: mc.ref,
      doing: `${spec.doing}: ${mc.doing.why}`,
      rows,
      needs: NEEDS.map((need) => ({ name: NEED_NAMES[need], level: Math.round(mc.needs[need]), low: mc.needs[need] < NEED_LOW })),
      plan: (mc.plan?.items ?? []).map((item) => ({ text: `${ACTIVITIES[item.activity].name}: ${item.why}`, done: item.done })),
      goals: goalStatus(mc).map((goal) => [goal.name, goal.status]),
      people: mc.cast.map((one) => [`${ROLE[one.role] ?? one.role}`, `${one.name} · ${one.traits.map((trait) => CAST_TRAITS[trait].name.toLowerCase()).join(', ')} · ${Math.round(one.closeness)} of 100`]),
      timeline: mc.memory.slice(-10).reverse().map((entry) => entry.text),
      chapters: (story?.chapters ?? [])
        .filter((chapter) => chapter.name === mc.name && chapter.scenes.length > 0)
        .slice()
        .reverse()
        .map((chapter) => ({ title: chapter.title, open: chapter.ended < 0, scenes: chapter.scenes.map((scene) => ({ text: scene.text, chose: scene.chose, outcome: scene.outcome, odds: scene.odds, good: scene.good })) })),
    },
    suggestion: null,
    fame,
  };
}
