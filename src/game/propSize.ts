import type Phaser from 'phaser';

/**
 * How big a room's things are when they are out on the map (DESIGN.md 64): the longest side in pixels, beside a
 * figure 36 high. The rooms draw them close up, so a book or a speaker cut for a room would be the size of a person
 * on the lawn. Things drawn for the map (scene.*, prop.*) are left as they are.
 */
const ON_MAP: Readonly<Record<string, number>> = {
  'room.rug': 40,
  'scene.rug': 58,
  'room.basket': 9,
  'scene.basket': 10,
  'room.bread': 7,
  'room.book': 7,
  'room.notes': 7,
  'room.lute': 15,
  'room.ball': 6,
  'room.soccerBall': 7,
  'room.speaker': 10,
  'room.cup': 6,
};

/** Scale a sprite showing one of a room's things down to its size on the map. */
export function fitOnMap(sprite: Phaser.GameObjects.Image, key: string): void {
  const size = ON_MAP[key];
  if (size === undefined) return;
  const long = Math.max(sprite.frame.width, sprite.frame.height);
  if (long > 0) sprite.setScale(size / long);
}
