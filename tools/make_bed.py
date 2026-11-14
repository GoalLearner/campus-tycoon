"""
Makes the bed of a student's room (DESIGN.md section 60) and the faces of
students asleep in it, from the drawn packs' own pixels:

    art/source/_rendered/fallback/bed/bed.png       the frame, the mattress and the pillow
    art/source/_rendered/fallback/bed/blanket.png   the blanket, drawn over the sleeper
    art/source/_rendered/fallback/bed/sleep-<look>.png
                                                    a student's figure facing out, eyes shut

The packs have no bed. This one is put together from their pieces, each as
drawn and only scaled, laid down or turned a quarter on the ground:

  - the frame is two of the Medieval pack's benches pushed together;
  - the mattress is the sheet off its laundry line, laid flat on them;
  - the pillow is its cream sack;
  - the blanket is its rug, turned a quarter and drawn longer, so the fringe
    is at the head and the foot.

A piece made bigger than the pack drew it would have a thicker outline than
everything round it, so its outer edge is trimmed back to the pack's own
outline width.

A sleeper is the student's own figure, as the people pack draws it facing
out, with the pack's own shut eyes (NPC/Face/EyesBlink) in place of their
open ones. The open eyes are covered with the face round them first.

The bed lies along the room's x, its head at x = 0. Its picture sits on the
pack's own grid, so the art build lines its back corner up with the corner of
a cell like any tile, and the room puts it down by that corner. Mirrored, it
lies along y.

Every output lives under art/source, which is never committed: it is the
pack's own pixels.

Usage:  python tools/make_bed.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, 'art', 'source', 'penzilla')
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'fallback', 'bed')
OLD = os.path.join(PACK, 'Medieval', 'Decor')
NPC = os.path.join(PACK, 'NPC')

# The pack's ground grid in its own pixels: a cell is 512 wide and 292 tall.
U = np.array([256.0, 146.0])   # one cell along x
V = np.array([-256.0, 146.0])  # one cell along y
# The picture: as wide as two cells and tall enough for the bed, with the cell's top corner where the art build looks
# for it on a one-cell tile (the pack's 152 pixels of earth under a cell, and the cell itself, up from the bottom).
SIZE = (1024, 800)
CORNER = np.array([256.0, SIZE[1] - 152 - 292])
# The bed, in cells: its length along x, its width along y, and how high its top stands, in the pack's pixels.
LENGTH = 1.05
WIDTH = 0.5
TOP = 64
# The pack's outline is about this many of its pixels wide.
OUTLINE = 9


def load(name):
    return Image.open(os.path.join(OLD, name)).convert('RGBA')


def point(gx, gy, lift=0.0):
    """Where a spot of the ground falls in the picture, raised `lift` pack pixels."""
    return CORNER + gx * U + gy * V - np.array([0.0, lift])


def extreme(im, which):
    alpha = np.array(im)[..., 3] > 128
    ys, xs = np.nonzero(alpha)
    i = {'left': xs.argmin(), 'right': xs.argmax(), 'top': ys.argmin(), 'bottom': ys.argmax()}[which]
    return np.array([float(xs[i]), float(ys[i])])


def lay(canvas, im, matrix, source, target, grow):
    """Draw im onto canvas through a 2 by 2 matrix, with its point `source` on `target`. `grow` is how much bigger it
    was made, so its outer edge can be trimmed back to the pack's own outline width."""
    matrix = np.array(matrix, dtype=float)
    inverse = np.linalg.inv(matrix)
    shift = np.array(source, dtype=float) - inverse @ np.array(target, dtype=float)
    coeffs = (inverse[0, 0], inverse[0, 1], shift[0], inverse[1, 0], inverse[1, 1], shift[1])
    piece = im.transform(canvas.size, Image.AFFINE, coeffs, resample=Image.BICUBIC)
    trim = int(round(OUTLINE * (grow - 1) * 0.5))
    if trim > 0:
        r, g, b, a = piece.split()
        a = a.filter(ImageFilter.MinFilter(trim * 2 + 1))
        piece = Image.merge('RGBA', (r, g, b, a))
    canvas.alpha_composite(piece)


def onto(edges, sizes):
    """The matrix that takes two edges of a picture onto two lengths of ground: edges[0] onto sizes[0], edges[1]
    onto sizes[1]."""
    return np.column_stack(sizes) @ np.linalg.inv(np.column_stack(edges))


def bed():
    canvas = Image.new('RGBA', SIZE, (0, 0, 0, 0))
    # The frame: two benches, the back one first. A bench's top is its long side along x and its short side along y.
    bench = load('Bench.png')
    long_edge = extreme(bench, 'right') - extreme(bench, 'top')
    grow = LENGTH * U[0] / long_edge[0]
    across = 0.137 * grow
    for gy in (0.0, WIDTH - across):
        lay(canvas, bench, [[grow, 0], [0, grow]], extreme(bench, 'top'), point(0, gy, TOP - 8), grow)
    # The mattress: the laundry sheet, laid flat on the frame. Its top edge (along the line) goes along the bed, and
    # its side (hanging down) goes across it.
    sheet = load('LaundryLine3.png')
    corner = np.array([32.0, 30.0])
    along = np.array([62.0, 33.0])
    down = np.array([1.0, 80.0])
    matrix = onto([along, down], [LENGTH * 0.96 * U, WIDTH * 0.94 * V])
    crop = sheet.crop((24, 20, 101, 158))
    lay(canvas, crop, matrix, corner - np.array([24.0, 20.0]), point(0.02, 0.03, TOP), 2.4)
    # The pillow, across the head of the bed.
    sack = load('Sack3.png')
    side = extreme(sack, 'top') - extreme(sack, 'left')
    grow = WIDTH * 0.84 * U[0] / side[0]
    lay(canvas, sack, [[grow, 0], [0, grow]], extreme(sack, 'top'), point(0.03, 0.04, TOP + 18), grow)
    return canvas


def blanket():
    canvas = Image.new('RGBA', SIZE, (0, 0, 0, 0))
    rug = load('Rug.png')
    top = extreme(rug, 'top')
    # Turned a quarter: the rug's fringed edges go across the bed, its plain edges along it.
    to_right = extreme(rug, 'right') - top
    to_left = extreme(rug, 'left') - top
    start = 0.24
    matrix = onto([to_right, to_left], [(WIDTH + 0.06) * V, (LENGTH - start + 0.02) * U])
    lay(canvas, rug, matrix, top, point(start, -0.03, TOP + 12), 2.2)
    return canvas


def sleeper(name):
    """A student's figure facing out, with the pack's shut eyes for their open ones."""
    sheet = Image.open(os.path.join(NPC, f'NpcReadymade_{name}.png')).convert('RGBA')
    cell = np.array(sheet.crop((0, 0, 220, 220))).astype(float)
    dark = (cell[..., 3] > 128) & (cell[..., :3].max(axis=-1) < 90)
    # Which of the pack's eyes this figure has: the one whose dark pixels it shares most.
    best, score = None, -1.0
    for eyes in ('Eyes1', 'Eyes2', 'Eyes3', 'Eyes4', 'Eyes5', 'Eyes6', 'EyesGlasses'):
        mask = np.array(Image.open(os.path.join(NPC, 'Face', f'{eyes}.png')).convert('RGBA').crop((0, 0, 220, 220)))[..., 3] > 60
        share = (dark & mask).sum() / max(1, mask.sum())
        if share > score:
            best, score = mask, share
    # Cover them with the face round them: each covered pixel takes the mean of its uncovered neighbours, working in.
    cover = np.array(Image.fromarray((best * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    cover &= cell[..., 3] > 128
    known = ~cover
    for _ in range(40):
        if not cover.any():
            break
        total = np.zeros(cell.shape[:2] + (3,))
        count = np.zeros(cell.shape[:2])
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                shifted = np.roll(np.roll(cell[..., :3], dy, axis=0), dx, axis=1)
                ok = np.roll(np.roll(known & ~dark | (known & ~cover & (cell[..., :3].max(axis=-1) >= 90)), dy, axis=0), dx, axis=1)
                total += shifted * ok[..., None]
                count += ok
        fill = cover & (count > 0)
        cell[fill, :3] = total[fill] / count[fill, None]
        known = known | fill
        dark = dark & ~fill
        cover = cover & ~fill
    face = Image.fromarray(cell.clip(0, 255).astype(np.uint8), 'RGBA')
    shut = Image.open(os.path.join(NPC, 'Face', 'EyesBlink.png')).convert('RGBA').crop((0, 0, 220, 220))
    face.alpha_composite(shut)
    return face


def main():
    os.makedirs(OUT, exist_ok=True)
    bed().save(os.path.join(OUT, 'bed.png'))
    blanket().save(os.path.join(OUT, 'blanket.png'))
    # The student crowd, as tools/make_penzilla_recipe.py lists it.
    plain = [n for n in range(1, 17) if n not in (1, 4, 5, 6)]
    for name in [f'Character{n}' for n in plain] + [f'SportsPlayer{n}' for n in range(1, 5)]:
        sleeper(name).save(os.path.join(OUT, f'sleep-{name}.png'))
    print(f'wrote {os.path.relpath(OUT, ROOT)}: bed, blanket and {len(plain) + 4} sleepers')


if __name__ == '__main__':
    main()
