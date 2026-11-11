import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Turns animated 3D characters into walking sprite sheets for the map.
 *
 * Open it from the dev server, for example:
 *   /tools/render/people.html?out=kenney-people
 *     &base=/art/source/_candidates/kenney-mini-characters/Models/GLB%20format/
 *     &names=character-female-a,character-male-a
 *     &clip=walk
 *
 * For each character it renders the walk clip from the game's camera (looking
 * down at 30 degrees, turned 45) facing south-west and north-west. The other
 * two directions are mirror images, which the game draws by flipping. Each
 * sheet is posted to the dev server, which writes it to
 * art/source/_rendered/<out>/. tools/build_art.py shrinks the frames and packs
 * them into the atlas.
 */

const params = new URLSearchParams(window.location.search);
const out = params.get('out') ?? 'people';
const base = params.get('base') ?? '';
const names = (params.get('names') ?? '').split(',').filter(Boolean);
const clipName = params.get('clip') ?? 'walk';

/** Frames in one walk cycle. */
const FRAMES = 8;
/** Each frame is drawn this big and shrunk later, which keeps the small sprites clean. */
const CELL_W = 192;
const CELL_H = 256;
/** Where the character stands inside each cell, and the clear pixels kept around it. */
const FEET_X = CELL_W / 2;
const FEET_Y = 224;
const MARGIN = 8;
/** Rows of the sheet, and the turn that faces the model that way. Models face +Z, which is south-west on the map. */
const ROWS: Array<{ dir: string; turn: number }> = [
  { dir: 'sw', turn: 0 },
  { dir: 'nw', turn: -Math.PI / 2 },
];

const status = document.getElementById('status') as HTMLElement;
const say = (text: string): void => {
  status.textContent = text;
};

async function save(name: string, body: Blob | string): Promise<void> {
  const response = await fetch(`/__render/save?name=${encodeURIComponent(`${out}/${name}`)}`, { method: 'POST', body });
  if (!response.ok) throw new Error(`Could not save ${name}`);
}

async function main(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(CELL_W, CELL_H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Soft, even light with a little shape from the upper left, like the building tiles.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b8c8, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-2, 6, 4);
  scene.add(sun);

  const loader = new GLTFLoader();
  const sheet = document.createElement('canvas');
  sheet.width = CELL_W * FRAMES;
  sheet.height = CELL_H * ROWS.length;
  const pen = sheet.getContext('2d');
  if (!pen) throw new Error('No 2D canvas.');
  document.body.append(sheet);

  const feet: [number, number] = [FEET_X, FEET_Y];
  const done: string[] = [];

  for (const name of names) {
    say(`Rendering ${name} (${done.length + 1} of ${names.length})`);
    const gltf = await loader.loadAsync(`${base}${name}.glb`);
    const model = gltf.scene;
    const clip = gltf.animations.find((animation) => animation.name === clipName);
    if (!clip) throw new Error(`${name} has no clip called "${clipName}". It has: ${gltf.animations.map((a) => a.name).join(', ')}`);

    const holder = new THREE.Group();
    holder.add(model);
    scene.add(holder);

    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play();
    (window as unknown as Record<string, unknown>).__renderInfo = {
      clips: gltf.animations.map((animation) => animation.name),
      meshes: (() => {
        const found: string[] = [];
        model.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) found.push(`${node.name}${node.visible ? '' : ' (hidden)'}`);
        });
        return found;
      })(),
    };

    // The camera looks at the spot the character stands on. `unitsPerPixel` sets the zoom,
    // and the frustum is shifted so that spot lands on the feet pixel of the cell.
    const elevation = Math.PI / 6;
    const far = 20;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(far * Math.cos(elevation) * Math.SQRT1_2, far * Math.sin(elevation), far * Math.cos(elevation) * Math.SQRT1_2);
    camera.lookAt(0, 0, 0);
    const frame = (unitsPerPixel: number): void => {
      camera.left = -FEET_X * unitsPerPixel;
      camera.right = (CELL_W - FEET_X) * unitsPerPixel;
      camera.top = FEET_Y * unitsPerPixel;
      camera.bottom = -(CELL_H - FEET_Y) * unitsPerPixel;
      camera.updateProjectionMatrix();
    };

    const drawAll = (): void => {
      pen.clearRect(0, 0, sheet.width, sheet.height);
      ROWS.forEach((row, r) => {
        holder.rotation.y = row.turn;
        for (let f = 0; f < FRAMES; f++) {
          mixer.setTime((f / FRAMES) * clip.duration);
          renderer.render(scene, camera);
          pen.drawImage(renderer.domElement, f * CELL_W, r * CELL_H);
        }
      });
    };

    /** How far the drawn pixels reach from the feet pixel, over every frame: [up, down, sideways]. */
    const reach = (): [number, number, number] | null => {
      const data = pen.getImageData(0, 0, sheet.width, sheet.height).data;
      let up = 0;
      let down = 0;
      let side = 0;
      let touchesEdge = false;
      for (let y = 0; y < sheet.height; y++) {
        for (let x = 0; x < sheet.width; x++) {
          if (data[(y * sheet.width + x) * 4 + 3]! < 8) continue;
          const cx = x % CELL_W;
          const cy = y % CELL_H;
          if (cx === 0 || cy === 0 || cx === CELL_W - 1 || cy === CELL_H - 1) touchesEdge = true;
          up = Math.max(up, FEET_Y - cy);
          down = Math.max(down, cy - FEET_Y);
          side = Math.max(side, Math.abs(cx - FEET_X));
        }
      }
      return touchesEdge || up === 0 ? null : [up, down, side];
    };

    // Zoom out until the whole walk fits, measure it, then zoom to fill the cell.
    let unitsPerPixel = 0.004;
    let extent = null as [number, number, number] | null;
    for (let attempt = 0; attempt < 8 && !extent; attempt++) {
      unitsPerPixel *= 2;
      frame(unitsPerPixel);
      drawAll();
      extent = reach();
    }
    if (!extent) throw new Error(`${name} did not fit in the frame.`);
    const [up, down, side] = extent;
    const grow = Math.min((FEET_Y - MARGIN) / up, (CELL_W / 2 - MARGIN) / side, down > 0 ? (CELL_H - FEET_Y - 2) / down : Infinity);
    frame(unitsPerPixel / grow);
    drawAll();

    const blob = await new Promise<Blob | null>((resolve) => sheet.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the sheet.');
    const short = name.replace(/^character-/, '');
    await save(`${short}.png`, blob);
    done.push(short);
    scene.remove(holder);
  }

  await save(
    'sheets.json',
    JSON.stringify({ cell: [CELL_W, CELL_H], feet, frames: FRAMES, rows: ROWS.map((row) => row.dir), names: done, clip: clipName }, null, 1),
  );
  say(`Done: ${done.length} sheets saved to art/source/_rendered/${out}`);
  document.title = 'done';
}

main().catch((err: unknown) => {
  say(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  document.title = 'failed';
});
