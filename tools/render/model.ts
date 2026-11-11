import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Turns one 3D model into one sprite, drawn the way the hand-drawn pack is:
 * flat colours, a dark outline, and the pack's own camera angle. It is the
 * stand-in for buildings the pack does not have, until drawn art arrives.
 *
 * Open it from the dev server, for example:
 *   /tools/render/model.html?out=fallback&name=stadium
 *     &file=/art/source/_candidates/polypizza-ccby-campus-models/football-stadium.glb
 *     &turn=0&size=1024&outline=0.006
 *
 * The sprite is posted to the dev server, which writes it to
 * art/source/_rendered/<out>/<name>.png.
 */

const params = new URLSearchParams(window.location.search);
const out = params.get('out') ?? 'fallback';
const name = params.get('name') ?? 'model';
const file = params.get('file') ?? '';
/** Quarter turns of the model about its upright axis, to choose which side faces the camera. */
const turn = Number(params.get('turn') ?? 0);
const size = Number(params.get('size') ?? 1024);
/** Stretch upward: 1.4 makes the same building 40 percent taller. */
const tall = Number(params.get('tall') ?? 1);
const outline = Number(params.get('outline') ?? 0.005);
/** Names of nodes to hide, separated by commas: lettering, for instance. */
const hide = (params.get('hide') ?? '').split(',').filter(Boolean);
/** Names of materials to leave out, separated by commas: the slab a model stands on, for instance. */
const hideMaterials = (params.get('hidemat') ?? '').split(',').filter(Boolean);
/** Name of the material that marks the building itself. Anything reaching outside its outline on the ground is cut away: the slab and road a model stands on. */
const keep = params.get('keep') ?? '';
/** Colour of a floor laid inside that outline, where the slab used to show through. */
const floor = params.get('floor') ?? '';
/** Name of a material the floor lies just under: the pitch markings, for instance. Without it the floor lies at the foot of the walls. */
const under = params.get('under') ?? '';
/** Materials to repaint in the pack's colours, as name:hex pairs separated by commas. */
const paint = new Map(
  (params.get('paint') ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => pair.split(':') as [string, string]),
);

// The pack's ground diamonds are 512 wide and 292 tall, which is a camera 34.8 degrees above the ground.
const ELEVATION = Math.asin(292 / 512);
const MARGIN = 10;

const status = document.getElementById('status') as HTMLElement;

async function main(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.append(renderer.domElement);

  // Dark plum lines, like the pack's (#340129, given here as linear light).
  const effect = new OutlineEffect(renderer, { defaultThickness: outline, defaultColor: [0.0343, 0.0003, 0.0222], defaultAlpha: 1 });

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(-3, 6, 2);
  scene.add(sun);

  const gltf = await new GLTFLoader().loadAsync(file);
  const model = gltf.scene;
  model.rotation.y = (turn * Math.PI) / 2;
  model.scale.y *= tall;

  // Two flat tones per colour, no gloss: closer to drawn art than smooth shading.
  const steps = new THREE.DataTexture(new Uint8Array([170, 170, 170, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
  steps.minFilter = THREE.NearestFilter;
  steps.magFilter = THREE.NearestFilter;
  steps.needsUpdate = true;
  model.traverse((node) => {
    if (hide.includes(node.name)) node.visible = false;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const convert = (material: THREE.Material): THREE.Material => {
      const from = material as THREE.MeshStandardMaterial;
      const repaint = paint.get(material.name);
      const color = repaint ? new THREE.Color(`#${repaint}`) : from.color;
      return new THREE.MeshToonMaterial({ name: material.name, color, map: from.map ?? null, gradientMap: steps, side: THREE.FrontSide });
    };
    const first = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (first && hideMaterials.includes(first.name)) mesh.visible = false;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });

  const holder = new THREE.Group();
  holder.add(model);
  scene.add(holder);

  // The floor joins the holder, so everything below moves the holder's contents together.
  if (keep) trimTo(model, keep, floor, under);

  // Stand the model on the ground with its middle over the origin.
  const box = new THREE.Box3().setFromObject(holder);
  const middle = box.getCenter(new THREE.Vector3());
  holder.position.set(-middle.x, -box.min.y, -middle.z);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  const far = 200;
  camera.position.set(far * Math.cos(ELEVATION) * Math.SQRT1_2, far * Math.sin(ELEVATION), far * Math.cos(ELEVATION) * Math.SQRT1_2);
  camera.lookAt(0, 0, 0);

  const frame = (unitsPerPixel: number, shiftX: number, shiftY: number): void => {
    const half = (size / 2) * unitsPerPixel;
    camera.left = -half + shiftX * unitsPerPixel;
    camera.right = half + shiftX * unitsPerPixel;
    camera.top = half - shiftY * unitsPerPixel;
    camera.bottom = -half - shiftY * unitsPerPixel;
    camera.updateProjectionMatrix();
  };

  const probe = document.createElement('canvas');
  probe.width = size;
  probe.height = size;
  const pen = probe.getContext('2d', { willReadFrequently: true });
  if (!pen) throw new Error('No 2D canvas.');

  /** The drawn pixels' box: [left, top, right, bottom], or null when they touch an edge. */
  const drawnBox = (): [number, number, number, number] | null => {
    effect.render(scene, camera);
    pen.clearRect(0, 0, size, size);
    pen.drawImage(renderer.domElement, 0, 0);
    const data = pen.getImageData(0, 0, size, size).data;
    let left = size;
    let top = size;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[(y * size + x) * 4 + 3]! < 8) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < 0 || left === 0 || top === 0 || right === size - 1 || bottom === size - 1) return null;
    return [left, top, right, bottom];
  };

  // Zoom out until it all fits, then zoom and slide so it fills the picture.
  const span = box.getSize(new THREE.Vector3()).length();
  let unitsPerPixel = span / size / 4;
  let found = null as [number, number, number, number] | null;
  for (let attempt = 0; attempt < 10 && !found; attempt++) {
    unitsPerPixel *= 1.6;
    frame(unitsPerPixel, 0, 0);
    found = drawnBox();
  }
  if (!found) throw new Error('The model did not fit in the frame.');
  const [left, top, right, bottom] = found;
  const grow = Math.min((size - MARGIN * 2) / (right - left + 1), (size - MARGIN * 2) / (bottom - top + 1));
  const centreX = (left + right) / 2 - size / 2;
  const centreY = (top + bottom) / 2 - size / 2;
  frame(unitsPerPixel / grow, centreX * grow, centreY * grow);
  effect.render(scene, camera);

  // Where the model's ground middle landed, so the art build can stand it on a cell.
  const ground = new THREE.Vector3(0, 0, 0).project(camera);
  const footprint = box.getSize(new THREE.Vector3());
  const meta = {
    size,
    groundMiddle: [Math.round(((ground.x + 1) / 2) * size), Math.round(((1 - ground.y) / 2) * size)],
    // Pixels across the picture for one unit of the model along the ground, for matching it to the cell grid.
    pixelsPerUnitAcross: grow / unitsPerPixel / Math.SQRT2,
    modelGroundSize: [footprint.x, footprint.z],
    file,
  };

  const blob = await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the sprite.');
  const save = async (fileName: string, body: Blob | string): Promise<void> => {
    const response = await fetch(`/__render/save?name=${encodeURIComponent(`${out}/${fileName}`)}`, { method: 'POST', body });
    if (!response.ok) throw new Error(`Could not save ${fileName}`);
  };
  await save(`${name}.png`, blob);
  await save(`${name}.json`, JSON.stringify(meta, null, 1));
  status.textContent = `Done: art/source/_rendered/${out}/${name}.png`;
  document.title = 'done';
}

/** Cuts away every triangle that reaches outside the ground outline of the named material, then lays a floor inside it. */
function trimTo(model: THREE.Object3D, materialName: string, floorColour: string, underName: string): void {
  model.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  const body = meshes.find((mesh) => (mesh.material as THREE.Material).name === materialName);
  if (!body) throw new Error(`No material called ${materialName}.`);
  const outline = new THREE.Box3().setFromObject(body);
  const slack = (outline.max.x - outline.min.x) * 0.002;
  const inside = (point: THREE.Vector3): boolean =>
    point.x >= outline.min.x - slack && point.x <= outline.max.x + slack && point.z >= outline.min.z - slack && point.z <= outline.max.z + slack;

  const corner = new THREE.Vector3();
  for (const mesh of meshes) {
    const flat = mesh.geometry.toNonIndexed();
    const position = flat.getAttribute('position');
    const kept: number[] = [];
    for (let triangle = 0; triangle < position.count; triangle += 3) {
      let all = true;
      for (let k = 0; k < 3; k++) {
        corner.fromBufferAttribute(position, triangle + k).applyMatrix4(mesh.matrixWorld);
        if (!inside(corner)) all = false;
      }
      if (all) kept.push(triangle, triangle + 1, triangle + 2);
    }
    const trimmed = new THREE.BufferGeometry();
    for (const name of Object.keys(flat.attributes)) {
      const from = flat.getAttribute(name);
      const values = new Float32Array(kept.length * from.itemSize);
      kept.forEach((vertex, at) => {
        for (let k = 0; k < from.itemSize; k++) values[at * from.itemSize + k] = from.getComponent(vertex, k);
      });
      trimmed.setAttribute(name, new THREE.BufferAttribute(values, from.itemSize));
    }
    mesh.geometry = trimmed;
    mesh.visible = mesh.visible && kept.length > 0;
  }

  if (!floorColour) return;
  const width = outline.max.x - outline.min.x;
  const depth = outline.max.z - outline.min.z;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.8, depth * 0.8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(`#${floorColour}`) }),
  );
  ground.material.userData.outlineParameters = { visible: false };
  ground.rotation.x = -Math.PI / 2;
  const above = meshes.find((mesh) => (mesh.material as THREE.Material).name === underName);
  const height = outline.max.y - outline.min.y;
  const level = above ? new THREE.Box3().setFromObject(above).min.y - height * 0.002 : outline.min.y + height * 0.004;
  ground.position.set((outline.min.x + outline.max.x) / 2, level, (outline.min.z + outline.max.z) / 2);
  // The outline was measured in the scene, so the floor joins the scene's holder, not the turned model.
  model.parent?.add(ground);
}

main().catch((err: unknown) => {
  status.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
  document.title = 'failed';
});
