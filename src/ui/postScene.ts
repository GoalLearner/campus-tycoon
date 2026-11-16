import { idIn, refIn, type WebView } from '../app/socialView';
import type { GameState, StudentRef } from '../sim';
import { SCENE } from '../sim/config/quadline';
import { KIND, SLOTS } from '../sim/config/web';
import { hashInts } from '../sim/rng';
import type { Post } from '../sim/systems/quadline';
import { classYearOf, studentFigure } from '../sim/systems/students';
import type { Atlas } from './atlas';

/**
 * A post's picture (DESIGN.md 63.13, decision 3, "Scenes"): a small scene drawn from the game's own sprites, as the
 * room view is. A couple with a heart over them, friends on the lawn, a party with hats and music (never a cup), a
 * game-day crowd, the new building itself, a snow day, a study table, a tradition's night, commencement. The people
 * in it are the post's: the author, the one it is about, their friends from the web.
 */

const W = 300;
const H = 150;

interface Look {
  sky: [string, string];
  ground: string;
  emotes: string[];
  crowd: number;
}

const LOOKS: Record<number, Look> = {
  [SCENE.couple]: { sky: ['#f6b18a', '#f7d9a8'], ground: '#7fb35a', emotes: ['heart'], crowd: 0 },
  [SCENE.friends]: { sky: ['#8fd0f2', '#d6f0fb'], ground: '#7fb35a', emotes: ['sparkle', 'laugh'], crowd: 1 },
  [SCENE.party]: { sky: ['#3b2a63', '#7a4f9c'], ground: '#4f7a3c', emotes: ['music', 'chat-partying', 'laugh'], crowd: 3 },
  [SCENE.game]: { sky: ['#7cc3ef', '#c7e9fb'], ground: '#5d9b45', emotes: ['exclaim', 'chat-sports'], crowd: 4 },
  [SCENE.building]: { sky: ['#8fd0f2', '#e1f4fc'], ground: '#7fb35a', emotes: ['sparkle'], crowd: 0 },
  [SCENE.snow]: { sky: ['#b9cfe2', '#e9f1f8'], ground: '#f4f8fb', emotes: ['sparkle'], crowd: 1 },
  [SCENE.study]: { sky: ['#e9dcc0', '#f6eedd'], ground: '#b89c74', emotes: ['chat-studying', 'sweat'], crowd: 2 },
  [SCENE.tradition]: { sky: ['#1f2b55', '#3d4d86'], ground: '#3f6a37', emotes: ['sparkle', 'music'], crowd: 3 },
  [SCENE.grad]: { sky: ['#8fd0f2', '#d6f0fb'], ground: '#7fb35a', emotes: ['sparkle', 'heart'], crowd: 2 },
};

/** Who is in the picture: the author, the one it is about, then their friends, the closest first. */
function peopleIn(view: WebView, state: GameState, post: Post, crowd: number): StudentRef[] {
  const out: StudentRef[] = [post.author];
  const enrolled = (ref: StudentRef): boolean => classYearOf(state, ref) !== null;
  if (post.scene === SCENE.couple) {
    const other = { entryYear: post.a, index: post.b };
    if (enrolled(other)) out.push(other);
    return out;
  }
  const id = idIn(view, post.author);
  if (id < 0) return out;
  const friends: Array<{ id: number; strength: number }> = [];
  for (let k = 0; k < SLOTS; k++) {
    const s = id * SLOTS + k;
    const b = view.other[s]!;
    const kind = view.kind[s]!;
    if (b >= 0 && (kind === KIND.friend || kind === KIND.best || kind === KIND.roommate)) friends.push({ id: b, strength: view.strength[s]! });
  }
  friends.sort((x, y) => y.strength - x.strength);
  for (const friend of friends) {
    if (out.length > crowd) break;
    const ref = refIn(view, friend.id);
    if (enrolled(ref)) out.push(ref);
  }
  return out;
}

function drawFrame(pen: CanvasRenderingContext2D, atlas: Atlas, key: string, x: number, bottom: number, height: number): void {
  const rect = atlas.frames[key]?.frame;
  if (!rect) return;
  const scale = height / rect.h;
  pen.drawImage(atlas.sheet, rect.x, rect.y, rect.w, rect.h, x - (rect.w * scale) / 2, bottom - rect.h * scale, rect.w * scale, rect.h * scale);
}

/** The building on a cell's sprite, as the map draws it. */
function buildingKey(atlas: Atlas, state: GameState, cell: number): string | null {
  const id = state.map.cells[cell]?.buildingId ?? -1;
  const building = id >= 0 ? state.map.buildings[id] : null;
  if (!building || building.stage < 1) return null;
  const prefix = `${building.zone}.${building.stage}`;
  const count = Object.keys(atlas.frames).filter((key) => key.startsWith(`${prefix}.`)).length;
  return count > 0 ? `${prefix}.${building.variant % count}` : null;
}

/** Draw a post's picture on its canvas. False when it has none. */
export function drawPostScene(canvas: HTMLCanvasElement, atlas: Atlas | null, view: WebView, state: GameState, post: Post): boolean {
  const look = LOOKS[post.scene];
  const pen = canvas.getContext('2d');
  if (!look || !pen) return false;
  canvas.width = W * 2;
  canvas.height = H * 2;
  pen.setTransform(2, 0, 0, 2, 0, 0);
  pen.imageSmoothingEnabled = false;
  const sky = pen.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, look.sky[0]);
  sky.addColorStop(1, look.sky[1]);
  pen.fillStyle = sky;
  pen.fillRect(0, 0, W, H);
  // The night's lanterns, the snow falling: small dots, from the post's own luck.
  if (post.scene === SCENE.tradition || post.scene === SCENE.party || post.scene === SCENE.snow) {
    pen.fillStyle = post.scene === SCENE.snow ? 'rgba(255,255,255,0.9)' : post.scene === SCENE.party ? 'rgba(255,214,102,0.85)' : 'rgba(255,200,120,0.9)';
    for (let i = 0; i < 26; i++) {
      const h = hashInts(post.luck, 61, i);
      pen.beginPath();
      pen.arc(h % W, (h >>> 9) % Math.round(H * 0.6), post.scene === SCENE.snow ? 1.6 : 1.3, 0, Math.PI * 2);
      pen.fill();
    }
  }
  pen.fillStyle = look.ground;
  pen.fillRect(0, H * 0.68, W, H * 0.32);
  if (!atlas) return true;
  // The new building, standing on the ground behind everyone.
  if (post.scene === SCENE.building) {
    const key = buildingKey(atlas, state, post.a);
    if (key) drawFrame(pen, atlas, key, W / 2, H * 0.92, H * 0.85);
  } else if (post.scene === SCENE.game || post.scene === SCENE.study) {
    // A hall behind a crowd or a study group: the lecture halls' first look.
    const key = Object.keys(atlas.frames).find((one) => one.startsWith('academic.'));
    if (key && post.scene === SCENE.study) drawFrame(pen, atlas, key, W * 0.78, H * 0.78, H * 0.62);
  } else {
    const tree = atlas.frames['tree.0'] ? 'tree.0' : null;
    if (tree) {
      drawFrame(pen, atlas, tree, W * 0.12, H * 0.8, H * 0.55);
      drawFrame(pen, atlas, 'tree.2', W * 0.9, H * 0.82, H * 0.5);
    }
  }
  if (post.scene === SCENE.building) return true;
  const pack = atlas.people;
  if (!pack) return true;
  const people = peopleIn(view, state, post, look.crowd);
  const gap = Math.min(54, (W * 0.7) / Math.max(1, people.length));
  const first = W / 2 - (gap * (people.length - 1)) / 2;
  people.forEach((ref, i) => {
    const dir = i < people.length / 2 ? pack.flip?.se ?? 'se' : pack.flip?.sw ?? 'sw';
    drawFrame(pen, atlas, `person.${studentFigure(state, ref, pack)}.${dir}.0`, first + i * gap, H * 0.93, H * 0.5);
  });
  // The scene's emotes over their heads.
  look.emotes.forEach((emote, i) => {
    if (i >= people.length + 1) return;
    const x = people.length === 1 ? W / 2 + (i === 0 ? -22 : 22) : first + (Math.min(i, people.length - 1) * gap) + (people.length === 2 && i === 0 ? gap / 2 : 0);
    drawFrame(pen, atlas, `emote.${emote}`, x, H * 0.42, H * 0.26);
  });
  return true;
}
