import { describe, expect, it } from 'vitest';
import { happeningLine, happeningsOf, viewOf } from '../src/app/socialView';
import { advance, newGame, toneProblem } from '../src/sim';
import { BULLYING_LINES, bullyingTemplates } from '../src/sim/config/bullying';
import { HARD_LINES, hardLineProblem, NAME_CALLING } from '../src/sim/config/hardLines';
import { POLICIES } from '../src/sim/config/policies';
import { EVENT } from '../src/sim/config/web';
import { studentName } from '../src/sim/systems/students';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * The hard lines (DESIGN.md 63.11, 52.2): whatever the rating, nothing that picks on someone is about race, religion,
 * ethnicity, sexuality, gender identity, disability, or body and weight, nothing sexual, no threats, nothing about
 * self-harm or suicide, and no slurs: the only names anyone is called are a short fixed list. Every bullying template
 * is read here; every post template joins them when the campus app comes (stops 9 and 10).
 */

const TEMPLATES = bullyingTemplates();

describe('the hard lines', () => {
  it('catch each kind of line they keep out', () => {
    const crossing: Record<string, string> = {
      identity: 'said something about their religion',
      disability: 'laughed at their wheelchair',
      body: 'made a comment about their weight',
      sexual: 'sent them something sexual',
      threat: 'said they would hurt them',
      selfHarm: 'told them to die',
    };
    for (const line of HARD_LINES) expect(hardLineProblem(crossing[line.id]!)?.id, line.id).toBe(line.id);
    expect(hardLineProblem('called them a try-hard in front of the class')).toBeNull();
  });

  it('hold for every template that says how someone picks on someone, and for the names anyone is called', () => {
    expect(TEMPLATES.length).toBeGreaterThan(25);
    for (const template of TEMPLATES) {
      expect(hardLineProblem(template), template).toBeNull();
      expect(toneProblem(template), template).toBeNull();
    }
    for (const name of NAME_CALLING) expect(hardLineProblem(name), name).toBeNull();
    // The anti-bullying program says what it does within them too.
    const program = POLICIES.find((spec) => spec.id === 'antiBullying')!;
    for (const words of [program.name, program.gives, program.takes, program.begins, program.ends]) expect(hardLineProblem(words), words).toBeNull();
  });

  it('call nobody anything but the names on the list: no slur is ever written', () => {
    // Every "calls them a ..." names one of the list, and nothing else is quoted or called.
    for (const template of TEMPLATES) {
      const called = /\bcall(?:s|ed|ing)? \{?\w+\}? an? ([a-z' -]+?)(?: for| in| again|[.,])/i.exec(template);
      if (called) expect(NAME_CALLING as readonly string[], template).toContain(called[1]!.trim());
      expect(template, template).not.toMatch(/["“”]/);
    }
    // Each name on the list is used somewhere, so the list is the whole of it.
    for (const name of NAME_CALLING) expect(TEMPLATES.some((template) => template.includes(name)), name).toBe(true);
  });

  it('hold for every line the paper and the cards wrote on a lived campus, names and all', () => {
    const model = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
    const web = newWeb(model.seed, 1024);
    catchUp(web, model, webWeekOf(model));
    for (let w = 1; w <= 6; w++) catchUp(web, model, webWeekOf(model) + w);
    const kinds = [EVENT.bullying, EVENT.shutOut, EVENT.pettiness, EVENT.pileOn, EVENT.stoodUp, EVENT.reported];
    // The students' names are masked: they come from the game's fixed lists of names, and a name such as Beatrice is
    // not a threat however it is spelled. What is read is everything the line says about them.
    const lines = happeningsOf(viewOf(web, false))
      .filter((one) => kinds.includes(one.event as (typeof kinds)[number]))
      .map((one) => {
        const line = happeningLine(model, one);
        return line === null ? null : one.people.reduce((text, ref) => text.split(studentName(model, ref)).join('{name}'), line);
      })
      .filter((line): line is string => line !== null);
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines) {
      expect(hardLineProblem(line), line).toBeNull();
      expect(toneProblem(line), line).toBeNull();
    }
    expect(Object.keys(BULLYING_LINES)).toHaveLength(6);
  });
});
