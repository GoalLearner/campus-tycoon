import { describe, expect, it } from 'vitest';
import { commentsFor, feedOf, postSubject, postWords } from '../src/app/quadline';
import { happeningLine, happeningsOf, viewOf } from '../src/app/socialView';
import { advance, newGame, toneProblem } from '../src/sim';
import { BULLYING_LINES, bullyingTemplates } from '../src/sim/config/bullying';
import { HARD_LINES, hardLineProblem, NAME_CALLING } from '../src/sim/config/hardLines';
import { POLICIES } from '../src/sim/config/policies';
import { quadlineTemplates } from '../src/sim/config/quadline';
import { FAVOURITES } from '../src/sim/config/students';
import { DRINK_WORDS, HEAVY_WORDS } from '../src/sim/config/tone';
import { EVENT } from '../src/sim/config/web';
import { studentName } from '../src/sim/systems/students';
import { catchUp, newWeb, webWeekOf } from '../src/sim/systems/web';
import { DAY, T0 } from './helpers';

/**
 * The hard lines (DESIGN.md 63.11, 52.2): whatever the rating, nothing that picks on someone is about race, religion,
 * ethnicity, sexuality, gender identity, disability, or body and weight, nothing sexual, no threats, nothing about
 * self-harm or suicide, and no slurs: the only names anyone is called are a short fixed list. Every bullying template
 * is read here, and since stop 9 every Quadline template, post and comment (DESIGN.md 63.13).
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

  it('keep the word psycho out, and not a major whose name starts with it (R4c, DESIGN.md 82.4)', () => {
    for (const line of ['called them a psycho', 'a pair of psychos', 'said they were psychotic', 'called them a psychopath']) expect(hardLineProblem(line)?.id, line).toBe('disability');
    for (const line of ['Psychology', 'PSYC 101 Introduction to Psychology', 'a psychology major', 'psychological']) expect(hardLineProblem(line), line).toBeNull();
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
    // A model campus's web grown and lived: several seconds on a quiet PC, more when it is busy.
  }, 60_000);

  it('hold for every Quadline template, and for every post and comment written on a lived campus, names and all', () => {
    // Every line the app can write: the posts by kind, the complaints and praise, the comments, the tags, and the
    // cards' favourite meals that a meal post reuses. None about drinking, none of the heavy words.
    const lines = [...quadlineTemplates(), ...Object.values(FAVOURITES).flat()];
    expect(lines.length).toBeGreaterThan(200);
    for (const line of lines) {
      expect(hardLineProblem(line!), line).toBeNull();
      expect(toneProblem(line!), line).toBeNull();
      expect(DRINK_WORDS.test(line!), line).toBe(false);
      expect(HEAVY_WORDS.test(line!), line).toBe(false);
      expect(line, line).not.toMatch(/["“”]/);
    }
    // Only the names on the list are ever used to call anyone anything: the shade's mild ones.
    for (const line of quadlineTemplates()) {
      for (const word of ['try-hard', 'show-off']) if (line.includes(word)) expect(NAME_CALLING as readonly string[]).toContain(word);
    }
    const model = advance(newGame({ seed: 35, name: 'Test University', now: T0, campus: 'model' }), T0, T0 + DAY).state;
    const web = newWeb(model.seed, 1024);
    catchUp(web, model, webWeekOf(model));
    for (let w = 1; w <= 8; w++) catchUp(web, model, webWeekOf(model) + w);
    const view = viewOf(web, false);
    const posts = feedOf(view, model);
    expect(posts.length).toBeGreaterThan(200);
    const mask = (text: string, names: string[]): string => names.reduce((line, name) => line.split(name).join('{name}'), text);
    const names = (refs: Array<{ entryYear: number; index: number }>): string[] => refs.flatMap((ref) => studentName(model, ref).split(' '));
    for (const post of posts) {
      // Whoever the post is about, whatever its kind: a post picking on someone names them too (a name such as Beatrice).
      const about = postSubject(post);
      const subject = about ? [about] : [];
      const { text, tag } = postWords(model, post);
      // Buildings are named from the game's own name pools, as students are: masked too.
      const line = mask(text, names([post.author, ...subject])).replace(/[A-Z][a-z]+ Hall/g, '{place}');
      expect(hardLineProblem(line), line).toBeNull();
      expect(toneProblem(line), line).toBeNull();
      expect(hardLineProblem(tag), tag).toBeNull();
      for (const comment of commentsFor(view, model, post).slice(0, 3)) {
        const said = mask(comment.text, names([post.author, ...(comment.who ? [comment.who] : [])]));
        expect(hardLineProblem(said), said).toBeNull();
        expect(toneProblem(said), said).toBeNull();
      }
    }
  }, 120_000);
});
