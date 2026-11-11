/** The simulation's public surface. Everything outside src/sim imports from here. */

export * from './types';
export * from './config/time';
export * from './config/buildings';
export * from './config/money';
export * from './config/map';
export { advance } from './advance';
export { newGame, type NewGameOptions } from './newGame';
export { calendarAt, eventsAt, nextMilestone, type CalendarEvent, type CalendarPos, type Phase } from './calendar';
export { parseSave, serialize, validate, migrate, SAVE_VERSION, type LoadResult, type SaveFile } from './save';
export * from './selectors';
export * from './format';
