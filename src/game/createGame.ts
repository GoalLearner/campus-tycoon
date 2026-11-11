import Phaser from 'phaser';
import { BootScene } from './BootScene';
import { CampusScene } from './CampusScene';

/**
 * Starts Phaser. The canvas is drawn at the screen's real pixel density and
 * shown at CSS size, so sprites stay crisp on phones. The atlas is a power of
 * two, which lets the browser build smaller copies for zoomed-out views.
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  const density = Math.min(window.devicePixelRatio || 1, 3);
  const size = (): { width: number; height: number } => ({
    width: Math.max(1, Math.round(window.innerWidth * density)),
    height: Math.max(1, Math.round(window.innerHeight * density)),
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#35523f',
    scale: { mode: Phaser.Scale.NONE, ...size(), zoom: 1 / density },
    render: {
      antialias: true,
      mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
      powerPreference: 'high-performance',
    },
    input: { activePointers: 3 },
    banner: false,
    disableContextMenu: true,
    scene: [BootScene, CampusScene],
  });

  const resize = (): void => {
    const { width, height } = size();
    game.scale.resize(width, height);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  return game;
}
