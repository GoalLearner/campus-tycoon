/**
 * The research labs (DESIGN.md 42.6, as built in section 49): the first true
 * making chain. A lab is bought from the Build menu, one for each field, and
 * the field is picked by which lab is built. Findings bank up on their own and
 * wait to be collected; now and then the lab makes a named discovery by
 * itself, which the paper reports. Every number is a tuning target [T].
 */
import type { PlacedType } from '../types';

export type LabField = 'sciences' | 'engineering' | 'health';

/** One discovery: who made it, the verb, and what. "Larp chemists find a greener glue." */
export type DiscoveryLine = readonly [who: string, verb: string, what: string];

export interface LabSpec {
  field: LabField;
  type: PlacedType;
  /** As the Build menu and the panel say it. */
  name: string;
  /** The field, in a word. */
  subject: string;
  /** What it may find, in its own words. Fictional, cheerful, and nothing real. */
  discoveries: readonly DiscoveryLine[];
}

export const LABS: readonly LabSpec[] = [
  {
    field: 'sciences',
    type: 'labSciences',
    name: 'Sciences lab',
    subject: 'Sciences',
    discoveries: [
      ['chemists', 'find', 'a greener glue'],
      ['chemists', 'make', 'a paint that dries in a minute'],
      ['chemists', 'make', 'a soap that smells of rain'],
      ['physicists', 'find', 'a quieter way to boil a kettle'],
      ['physicists', 'blow', 'a bubble that lasts an hour'],
      ['physicists', 'make', 'an ice cube that melts at half the speed'],
      ['biologists', 'grow', 'a moss that glows softly at night'],
      ['biologists', 'grow', 'a bean that thrives in the shade'],
      ['biologists', 'learn', 'why the campus squirrels bury acorns in rows'],
      ['astronomers', 'spot', 'a comet with a curly tail'],
      ['geologists', 'find', 'a rock that rings like a bell'],
      ['chemists', 'make', 'an ink that washes out of anything'],
    ],
  },
  {
    field: 'engineering',
    type: 'labEngineering',
    name: 'Engineering lab',
    subject: 'Engineering',
    discoveries: [
      ['engineers', 'build', 'a paper bridge that holds a bicycle'],
      ['engineers', 'build', 'a bench that charges a phone in the sun'],
      ['engineers', 'design', 'a quieter leaf blower'],
      ['robotics students', 'build', 'a robot that waters the quad'],
      ['robotics students', 'teach', 'a robot to fold a shirt'],
      ['engineers', 'make', 'a bike lock that opens to a whistle'],
      ['engineers', 'design', 'a lunch tray that never tips'],
      ['civil engineers', 'lay', 'a path that never gathers puddles'],
      ['engineers', 'build', 'a kite that flies in the lightest breeze'],
      ['designers', 'make', 'a chair that folds into a backpack'],
      ['engineers', 'build', 'a machine that hands out apples'],
      ['robotics students', 'build', 'a robot that sorts the recycling'],
    ],
  },
  {
    field: 'health',
    type: 'labHealth',
    name: 'Health lab',
    subject: 'Health',
    discoveries: [
      ['sleep researchers', 'find', 'the best hour for a nap'],
      ['nutrition students', 'make', 'a salad people ask for twice'],
      ['sports scientists', 'find', 'a stretch that eases a desk-sore back'],
      ['health researchers', 'find', 'that a walk after lunch brightens the afternoon'],
      ['nursing students', 'design', 'a calmer waiting room'],
      ['sleep researchers', 'find', 'a gentler alarm tone'],
      ['nutrition students', 'find', 'a breakfast that lasts until noon'],
      ['sports scientists', 'design', 'a warm-up that takes four minutes'],
      ['health researchers', 'find', 'that houseplants cheer up a study room'],
      ['nursing students', 'make', 'a first-aid kit that fits in a pocket'],
      ['health researchers', 'learn', 'why students drink more water from blue bottles'],
      ['sports scientists', 'find', 'the comfiest way to tie a running shoe'],
    ],
  },
];

/** Findings a lab makes in an hour at a rate of one: about six a day. */
export const FINDINGS_PER_HOUR = 0.25;
/** A lab holds this many hours' worth and no more, as every building that fills (42.4). Nothing spoils. */
export const LAB_HOURS = 36;
/** Its marker shows once it holds this many. */
export const LAB_READY = 3;
/** Hours between discoveries at a rate of one: about three a week. */
export const DISCOVERY_HOURS = 60;

/** Cells from its wall within which lecture-hall seats count, and the seats (on the small campus's count) that make it whole. */
export const LAB_SEAT_REACH = 8;
export const LAB_SEATS_FULL = 300;
/** With no seats in reach a lab works at this share; with all it wants, at the whole. */
export const LAB_SEATS_FLOOR = 0.5;
/** Faculty funding: the Instruction slider at its middle is a rate of one, and each step up or down moves it this much. */
export const LAB_FUNDING_STEP = 0.05;

/** What a finding pays when collected: experience, and a small grant on the small campus's count. */
export const FINDING_XP = 2;
export const FINDING_CASH = 25;
/** What a discovery pays, by itself, as it is made. */
export const DISCOVERY_XP = 20;
export const DISCOVERY_CASH = 500;
/**
 * The labs' grants come out of the same yearly allowance as the orders', the gift's and the moments' (42.3, 44), so
 * the money target holds; and they take at most this share of it, so the others keep most.
 */
export const LAB_CASH_SHARE = 0.25;

/** Points the Reputation input of the academic rating reads higher for each lab that stands: the one number labs move. */
export const LAB_REPUTATION = 1;

/** The paper's second half of a discovery's headline. */
export const DISCOVERY_QUIPS: readonly string[] = ['Committee Requests a Sample', 'Grant Office Unusually Cheerful', 'Dean Asks for It in Writing', 'Lab Coats Sell Out at the Bookstore'];
