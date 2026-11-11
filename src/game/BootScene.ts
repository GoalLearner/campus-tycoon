import Phaser from 'phaser';
import { ASSET_DIR, ATLAS_KEY, MANIFEST_KEY, type ArtManifest } from './art';

/**
 * Loads the art manifest, then the atlas it names. If either is missing the
 * game still starts: the map draws labelled placeholders instead.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.json(MANIFEST_KEY, ASSET_DIR + 'manifest.json');
  }

  create(): void {
    const manifest = (this.cache.json.get(MANIFEST_KEY) ?? null) as ArtManifest | null;
    const start = (): void => {
      this.scene.start('campus');
    };
    if (!manifest?.atlas) {
      start();
      return;
    }
    this.load.atlas(ATLAS_KEY, ASSET_DIR + manifest.atlas.image, ASSET_DIR + manifest.atlas.data);
    this.load.once(Phaser.Loader.Events.COMPLETE, start);
    this.load.start();
  }
}
