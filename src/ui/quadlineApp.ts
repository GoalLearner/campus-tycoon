import { shownHour } from '../app/daylight';
import { EMOTION_EMOTE, EMOTION_NAMES, feelingOf } from '../app/emotion';
import {
  classWord,
  commentsFor,
  feedOf,
  followersOf,
  followingOf,
  handleOf,
  postAge,
  postCounts,
  postsBy,
  postWords,
  trendingOf,
  type Post,
} from '../app/quadline';
import { session } from '../app/session';
import { socialWeb } from '../app/socialWeb';
import { studentCard, studentFigure, studentKey, type GameState, type StudentRef } from '../sim';
import { POST_EMOTES } from '../sim/config/quadline';
import { socialProfile, studentName } from '../sim/systems/students';
import { drawSprite, loadAtlas, type Atlas } from './atlas';
import { drawPostScene } from './postScene';

/**
 * Quadline, the campus app (DESIGN.md 63.13), opened from its button on the top bar: a phone-style feed of what
 * students post about their lives in the game, what is trending, and each student's profile. Every word is from the
 * templates; tapping a name opens their profile, a tag the feed of it, a post's comments its comments.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

const postKey = (post: Post): string => `${post.week}:${post.minute}:${studentKey(post.author)}:${post.kind}`;
/** Posts drawn at first, and how many more each "Show more" adds. */
const PAGE = 25;

export function mountQuadline(): { node: HTMLElement; render: (state: GameState | null) => void } {
  const node = el('div', 'quad-app');
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', 'Quadline');
  const head = el('div', 'quad-head');
  const back = button('‹', 'quad-back', () => {
    const quad = session.quad;
    if (!quad) return;
    if (quad.page === 'profile' || quad.tag) session.openQuad('feed');
  });
  back.setAttribute('aria-label', 'Back');
  const brand = el('div', 'quad-brand');
  const wordmark = el('span', 'quad-wordmark', 'Quadline');
  const campus = el('span', 'quad-campus');
  brand.append(wordmark, campus);
  const done = button('Done', 'quad-done', () => session.closeQuad());
  head.append(back, brand, done);
  const tabs = el('div', 'quad-tabs');
  const feedTab = button('Feed', 'quad-tab', () => session.openQuad('feed'));
  const trendTab = button('Trending', 'quad-tab', () => session.openQuad('trending'));
  tabs.append(feedTab, trendTab);
  const body = el('div', 'quad-body');
  node.append(head, tabs, body);

  let atlas: Atlas | null = null;
  void loadAtlas().then((loaded) => {
    atlas = loaded;
    drawn = '';
  });
  let drawn = '';
  let shown = PAGE;
  let showFor = '';
  const open = new Set<string>();
  let last: GameState | null = null;

  function face(ref: StudentRef, state: GameState, big = false): HTMLCanvasElement {
    const canvas = el('canvas', big ? 'quad-avatar big' : 'quad-avatar');
    canvas.width = 96;
    canvas.height = 112;
    const pack = atlas?.people;
    if (atlas && pack) drawSprite(canvas, atlas, `person.${studentFigure(state, ref, Math.min(pack.looks, pack.crowd ?? pack.looks), pack.roles?.athlete)}.${pack.flip?.sw ?? 'sw'}.0`);
    return canvas;
  }

  /** A line of a post or a comment, its emotes drawn and its tag a button. */
  function rich(text: string, tag: string | null): HTMLElement {
    const out = el('p', 'quad-text');
    for (const part of text.split(/(\[\w+\])/)) {
      const token = /^\[(\w+)\]$/.exec(part);
      const key = token ? POST_EMOTES[token[1]!] : undefined;
      if (key) {
        const canvas = el('canvas', 'quad-emote');
        canvas.width = 48;
        canvas.height = 48;
        if (!drawSprite(canvas, atlas, key)) canvas.hidden = true;
        out.append(canvas);
      } else if (part) out.append(document.createTextNode(part));
    }
    if (tag) {
      out.append(document.createTextNode(' '));
      out.append(button(`#${tag}`, 'quad-tag', () => session.openQuad('feed', null, tag)));
    }
    return out;
  }

  function nameButton(ref: StudentRef, state: GameState, className = 'quad-name'): HTMLButtonElement {
    return button(studentName(state, ref), className, () => session.openQuad('profile', ref));
  }

  function postNode(state: GameState, post: Post, label = ''): HTMLElement {
    const view = socialWeb.view!;
    const card = el('article', post.viral ? 'quad-post viral' : 'quad-post');
    if (label) card.append(el('div', 'quad-label', label));
    const top = el('div', 'quad-top');
    const avatar = el('button', 'quad-avatar-button');
    avatar.type = 'button';
    avatar.setAttribute('aria-label', `${studentName(state, post.author)}: their profile`);
    avatar.append(face(post.author, state));
    avatar.addEventListener('click', () => session.openQuad('profile', post.author));
    const who = el('div', 'quad-who');
    who.append(nameButton(post.author, state), el('span', 'quad-meta', [classWord(state, post.author), postAge(state, post)].filter(Boolean).join(' · ')));
    top.append(avatar, who);
    if (post.viral) top.append(el('span', 'quad-viral', 'VIRAL'));
    const { text, tag } = postWords(state, post);
    card.append(top, rich(text, tag));
    if (post.scene) {
      const canvas = el('canvas', 'quad-scene');
      if (drawPostScene(canvas, atlas, view, state, post)) card.append(canvas);
    }
    const { likes, comments } = postCounts(view, post);
    const foot = el('div', 'quad-foot');
    const likeLine = el('span', 'quad-count');
    const heart = el('canvas', 'quad-emote');
    heart.width = 48;
    heart.height = 48;
    drawSprite(heart, atlas, 'emote.heart');
    likeLine.append(heart, document.createTextNode(likes.toLocaleString('en-US')));
    const key = postKey(post);
    const talk = button('', 'quad-count quad-comments-button', () => {
      if (open.has(key)) open.delete(key);
      else open.add(key);
      drawn = '';
      if (last) render(last);
    });
    const bubble = el('canvas', 'quad-emote');
    bubble.width = 48;
    bubble.height = 48;
    drawSprite(bubble, atlas, 'emote.speech');
    talk.append(bubble, document.createTextNode(comments.toLocaleString('en-US')));
    talk.setAttribute('aria-label', `${comments} comments: ${open.has(key) ? 'hide' : 'show'} them`);
    foot.append(likeLine, talk);
    card.append(foot);
    if (open.has(key)) {
      const list = el('div', 'quad-comments');
      for (const comment of commentsFor(view, state, post)) {
        const row = el('div', comment.shade ? 'quad-comment shade' : 'quad-comment');
        const line = rich(comment.text, null);
        line.prepend(nameButton(comment.who, state, 'quad-name small'), document.createTextNode(' '));
        row.append(line);
        list.append(row);
      }
      if (comments > list.childElementCount) list.append(el('div', 'quad-more-comments', `and ${(comments - list.childElementCount).toLocaleString('en-US')} more`));
      card.append(list);
    }
    return card;
  }

  function drawFeed(state: GameState, posts: Post[], tag: string | null): void {
    let list = posts;
    if (tag) {
      list = posts.filter((post) => postWords(state, post).tag === tag);
      body.append(el('div', 'quad-filter', `#${tag} · ${list.length} ${list.length === 1 ? 'post' : 'posts'}`));
    }
    // The Main Character first, featured (decision: the main character is featured).
    const main = state.story?.mc?.ref ?? null;
    const featured = !tag && main ? postsBy(list, main).slice(0, 2) : [];
    for (const post of featured) body.append(postNode(state, post, 'Your main character'));
    const rest = list.filter((post) => !featured.includes(post));
    for (const post of rest.slice(0, shown)) body.append(postNode(state, post));
    if (rest.length > shown) {
      body.append(
        button('Show more', 'quad-more', () => {
          shown += PAGE;
          drawn = '';
          render(state);
        }),
      );
    }
    if (list.length === 0) body.append(el('p', 'quad-empty', tag ? 'Nothing with this tag lately.' : 'Nobody has posted yet. Check back after a game week.'));
  }

  function drawTrending(state: GameState, posts: Post[]): void {
    const view = socialWeb.view!;
    const trending = trendingOf(state, view, posts, 8);
    body.append(el('div', 'quad-section', 'Trending this week'));
    trending.forEach((one, i) => {
      const row = button('', 'quad-trend', () => session.openQuad('feed', null, one.tag));
      row.append(el('span', 'quad-rank', String(i + 1)), el('span', 'quad-trend-tag', `#${one.tag}`), el('span', 'quad-trend-count', `${one.count} ${one.count === 1 ? 'post' : 'posts'}`));
      body.append(row);
    });
    if (trending.length === 0) body.append(el('p', 'quad-empty', 'Nothing trending yet.'));
  }

  function drawProfile(state: GameState, posts: Post[], ref: StudentRef): void {
    const view = socialWeb.view!;
    const top = el('div', 'quad-profile');
    const words = el('div', 'quad-profile-words');
    const profile = socialProfile(state, ref);
    words.append(el('div', 'quad-profile-name', studentName(state, ref)), el('div', 'quad-meta', `@${handleOf(state, ref)}`), el('div', 'quad-meta', [classWord(state, ref), profile?.major].filter(Boolean).join(' · ')));
    top.append(face(ref, state, true), words);
    const counts = el('div', 'quad-profile-counts');
    const theirs = postsBy(posts, ref);
    for (const [value, label] of [
      [followersOf(view, ref), 'followers'],
      [followingOf(view, ref), 'following'],
      [theirs.length, theirs.length === 1 ? 'post' : 'posts'],
    ] as const) {
      const box = el('div', 'quad-stat');
      box.append(el('b', '', value.toLocaleString('en-US')), el('span', '', label));
      counts.append(box);
    }
    body.append(top, counts);
    // How they feel, as their card says it.
    const card = studentCard(state, ref);
    if (card) {
      const feeling = feelingOf(view, state, ref, card, shownHour());
      const line = el('div', 'quad-feeling');
      const emote = EMOTION_EMOTE[feeling.emotion];
      if (emote) {
        const canvas = el('canvas', 'quad-emote');
        canvas.width = 48;
        canvas.height = 48;
        drawSprite(canvas, atlas, `emote.${emote}`);
        line.append(canvas);
      }
      line.append(document.createTextNode(`${EMOTION_NAMES[feeling.emotion]} feeling`));
      body.append(line);
    }
    body.append(
      button('Open their card', 'quad-card-button', () => {
        session.closeQuad();
        session.openStudent(ref);
      }),
    );
    body.append(el('div', 'quad-section', 'Posts'));
    for (const post of theirs.slice(0, 12)) body.append(postNode(state, post));
    if (theirs.length === 0) body.append(el('p', 'quad-empty', 'No posts lately.'));
  }

  function render(state: GameState | null): void {
    last = state;
    const quad = session.quad;
    if (!state || !quad) {
      node.classList.remove('show');
      drawn = '';
      open.clear();
      return;
    }
    node.classList.add('show');
    const view = socialWeb.view;
    const where = `${quad.page}|${quad.ref ? studentKey(quad.ref) : ''}|${quad.tag ?? ''}`;
    if (where !== showFor) {
      showFor = where;
      shown = PAGE;
      body.scrollTop = 0;
    }
    // Drawn again when the page or the feed changes, and every ten minutes for the posts' ages.
    const stamp = `${where}|${view?.week ?? -1}|${view?.posts.length ?? 0}|${Math.floor(state.clock.tick / 10)}|${shown}|${atlas ? 1 : 0}|${[...open].join(',')}`;
    if (stamp === drawn) return;
    drawn = stamp;
    campus.textContent = state.school.name;
    back.hidden = !(quad.page === 'profile' || quad.tag);
    tabs.hidden = quad.page === 'profile';
    feedTab.classList.toggle('on', quad.page === 'feed');
    trendTab.classList.toggle('on', quad.page === 'trending');
    const scroll = body.scrollTop;
    body.textContent = '';
    if (!view) {
      body.append(el('p', 'quad-empty', 'Loading the campus…'));
      return;
    }
    const posts = feedOf(view, state);
    if (quad.page === 'trending') drawTrending(state, posts);
    else if (quad.page === 'profile' && quad.ref) drawProfile(state, posts, quad.ref);
    else drawFeed(state, posts, quad.tag);
    body.scrollTop = scroll;
  }

  return { node, render };
}
