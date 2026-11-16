"""
Draws the bike path (DESIGN.md 71): the pack's path tile recoloured to a bike lane, with our painted edge lines, our
bike symbol and our crossing bars, as the map joins its pieces up (16 ways, by which sides join more bike path).

    m<0-15>     the lane, an edge line along every side that does not join more lane
    sym5 sym10  a straight piece with the bike symbol painted on it, running north-south (5) or east-west (10)
    cross5      where a footpath crosses a lane running north-south: bars across it, for the walkers
    cross10     the same on a lane running east-west

Two sets, one for each pack:

    art/source/_rendered/fallback/bikelane/<piece>.png    on the drawn pack's 512 canvas, from its own sidewalk tile
                                                           (a paid part: the private atlas only)
    art/source/_rendered/ours/bikelane/<piece>.png        on the free pack's 132 tile, from its plain slab (free to
                                                           use: the public atlas)

in the colour the game uses (CHOSEN), and each colour as <colour>-<piece>.png for a look sheet.

The markings are ours. Usage:  python tools/make_bikelane.py [--colour red|green] [--sheet out.png]
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source')
SIDEWALK = os.path.join(SRC, 'penzilla', 'GiantCityBuilder', 'Tiles', 'Sidewalk_Tile9.png')
GRASS = os.path.join(SRC, 'penzilla', 'GiantCityBuilder', 'Tiles', 'Grass.png')
SLAB = os.path.join(SRC, 'kenney-isometric-landscape', 'PNG', 'landscapeTiles_081.png')

# Bike-lane colours: the hue the slabs take, how much more saturated and how much brighter.
COLOURS = {
    'red': {'hue': 4.0, 'sat': 0.58, 'val': 0.80},
    'green': {'hue': 142.0, 'sat': 0.50, 'val': 0.72},
}

WHITE = (246, 244, 240, 255)
PLUM = (52, 1, 41, 255)

# The top face of each pack's tile, in its own pixels: top, right and left corners.
FACES = {
    'drawn': {'T': (256, 61), 'R': (512, 207), 'L': (0, 207), 'size': (512, 512)},
    'free': {'T': (66, 0), 'R': (132, 33), 'L': (0, 33), 'size': (132, 99)},
}

INSET = 0.09     # how far in from the side an edge line runs, of a cell
LINE = 0.045     # how wide a painted line is, of a cell
SUPER = 4        # drawn this many times larger, then shrunk, for smooth edges


def point(face, cx, cy, k=1):
    """Where a spot of the cell lies on the tile: cx east, cy south, each 0 to 1."""
    tx, ty = face['T']
    rx, ry = face['R']
    lx, ly = face['L']
    return ((tx + cx * (rx - tx) + cy * (lx - tx)) * k, (ty + cx * (ry - ty) + cy * (ly - ty)) * k)


def lane_colour(im, colour, face):
    """The slabs of the top face turned to the lane's colour; the rest of the tile is left alone."""
    rule = COLOURS[colour]
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255.0
    rgb = a[..., :3]
    mx = rgb.max(axis=-1)
    # The new colour at the same lightness as the slab, so the pack's own shading and joints stay.
    h = rule['hue'] / 60.0
    c = rule['sat']
    x = c * (1 - abs(h % 2 - 1))
    base = {0: (c, x, 0), 1: (x, c, 0), 2: (0, c, x), 3: (0, x, c), 4: (x, 0, c), 5: (c, 0, x)}[int(h) % 6]
    tint = np.array(base) + (1 - c)
    v = np.clip(mx * rule['val'] / 0.52, 0, 1)[..., None]
    out = np.clip(tint[None, None, :] * v, 0, 1)
    # Only the top face: inside the diamond.
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).polygon([point(face, 0, 0), point(face, 1, 0), point(face, 1, 1), point(face, 0, 1)], fill=255)
    m = (np.asarray(mask) > 0)[..., None] & (a[..., 3:4] > 0)
    rgb_new = np.where(m, out, rgb)
    res = np.concatenate([rgb_new, a[..., 3:4]], axis=-1)
    return Image.fromarray((res * 255).astype(np.uint8), 'RGBA')


def marks_layer(face):
    return Image.new('RGBA', (face['size'][0] * SUPER, face['size'][1] * SUPER), (0, 0, 0, 0))


def paint_line(d, face, pts, width):
    """A painted line through cell spots: the plum edge, then white over it, as the pack paints its road marks."""
    px = [point(face, cx, cy, SUPER) for cx, cy in pts]
    w = width * (face['R'][0] - face['L'][0]) * SUPER * 0.5
    edge = max(2.0, w * 0.35)
    for colour, grow in ((PLUM, edge), (WHITE, 0)):
        d.line(px, fill=colour, width=round(w + grow), joint='curve')
        for p in (px[0], px[-1]):
            r = (w + grow) / 2
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=colour)


def edge_lines(face, mask):
    """An edge line along each side that does not join more lane, and a small turn where two joined sides meet."""
    layer = marks_layer(face)
    d = ImageDraw.Draw(layer)
    e = INSET
    north, east, south, west = bool(mask & 1), bool(mask & 2), bool(mask & 4), bool(mask & 8)
    # Each closed side: along it, out to the edge where the side beyond is open, to the corner line where it is not.
    if not north:
        paint_line(d, face, [(0 if west else e, e), (1 if east else 1 - e, e)], LINE)
    if not south:
        paint_line(d, face, [(0 if west else e, 1 - e), (1 if east else 1 - e, 1 - e)], LINE)
    if not west:
        paint_line(d, face, [(e, 0 if north else e), (e, 1 if south else 1 - e)], LINE)
    if not east:
        paint_line(d, face, [(1 - e, 0 if north else e), (1 - e, 1 if south else 1 - e)], LINE)
    # Two open sides meeting at a corner: the lines of the pieces beyond turn there.
    if north and east:
        paint_line(d, face, [(1 - e, 0), (1 - e, e), (1, e)], LINE)
    if east and south:
        paint_line(d, face, [(1, 1 - e), (1 - e, 1 - e), (1 - e, 1)], LINE)
    if south and west:
        paint_line(d, face, [(e, 1), (e, 1 - e), (0, 1 - e)], LINE)
    if west and north:
        paint_line(d, face, [(0, e), (e, e), (e, 0)], LINE)
    return layer


def bike_symbol(face, along_y):
    """The bike symbol painted on the lane, lying along it: two wheels, the frame, a saddle and the bars."""
    layer = marks_layer(face)
    d = ImageDraw.Draw(layer)

    def at(across, along):
        return (across, along) if along_y else (along, across)

    def circle(ca, cl, r, n=36):
        return [at(ca + r * math.cos(2 * math.pi * k / n), cl + r * math.sin(2 * math.pi * k / n)) for k in range(n + 1)]

    w = LINE * 0.85
    back, front, r = 0.29, 0.71, 0.135
    paint_line(d, face, circle(0.5, back, r), w)
    paint_line(d, face, circle(0.5, front, r), w)
    # The frame, lying on the lane: back wheel to the pedals and up to the saddle, the top tube to the bars, the fork
    # down to the front wheel, and the stay from the back wheel to the saddle.
    hub_b, pedal, saddle, head, hub_f = (0.5, back), (0.5, 0.47), (0.35, 0.42), (0.37, 0.63), (0.5, front)
    paint_line(d, face, [at(*hub_b), at(*pedal), at(*head)], w)
    paint_line(d, face, [at(*hub_b), at(*saddle), at(*head), at(*hub_f)], w)
    paint_line(d, face, [at(*pedal), at(*saddle)], w)
    # The saddle and the bars, short strokes across their tubes.
    paint_line(d, face, [at(0.31, 0.38), at(0.31, 0.46)], w)
    paint_line(d, face, [at(0.31, 0.60), at(0.43, 0.60)], w)
    return layer


def crossing_bars(face, along_y):
    """Bars for the walkers where a footpath crosses the lane: each along the lane, set side by side across it."""
    layer = marks_layer(face)
    d = ImageDraw.Draw(layer)
    for across in (0.2, 0.4, 0.6, 0.8):
        a, b = (across, 0.14), (across, 0.86)
        pts = [a, b] if along_y else [(a[1], a[0]), (b[1], b[0])]
        paint_line(d, face, pts, 0.09)
    return layer


def shrink(layer, face):
    return layer.resize(face['size'], Image.LANCZOS)


def pieces(base, face):
    """Every piece of the lane, by name."""
    out = {}
    for mask in range(16):
        im = base.copy()
        im.alpha_composite(shrink(edge_lines(face, mask), face))
        out[f'm{mask}'] = im
    for mask, along_y in ((5, True), (10, False)):
        im = out[f'm{mask}'].copy()
        im.alpha_composite(shrink(bike_symbol(face, along_y), face))
        out[f'sym{mask}'] = im
        im = base.copy()
        im.alpha_composite(shrink(crossing_bars(face, along_y), face))
        out[f'cross{mask}'] = im
    return out


def drawn_base(colour):
    return lane_colour(Image.open(SIDEWALK).convert('RGBA'), colour, FACES['drawn'])


def free_base(colour):
    return lane_colour(Image.open(SLAB).convert('RGBA'), colour, FACES['free'])


# The colour the game uses: the recipes read the pieces without a colour in their names.
CHOSEN = 'red'


def write(colour):
    for folder, base, face in (('fallback', drawn_base(colour), FACES['drawn']), ('ours', free_base(colour), FACES['free'])):
        out = os.path.join(SRC, '_rendered', folder, 'bikelane')
        os.makedirs(out, exist_ok=True)
        for name, im in pieces(base, face).items():
            im.save(os.path.join(out, f'{colour}-{name}.png'))
            if colour == CHOSEN:
                im.save(os.path.join(out, f'{name}.png'))
        print('wrote', os.path.relpath(out, ROOT), colour, '(the game uses it)' if colour == CHOSEN else '')


if __name__ == '__main__':
    args = sys.argv[1:]
    colours = [args[args.index('--colour') + 1]] if '--colour' in args else list(COLOURS)
    for colour in colours:
        write(colour)
