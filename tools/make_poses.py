"""
Makes the poses the people pack lacks (DESIGN.md 64, the living campus, L1) from each figure's own cells, as the
sleepers of tools/make_bed.py and the faces of tools/make_faces.py are made: the pack's own pixels, only moved,
cut, turned or laid down, with the pack's plum outline where a new edge shows.

    sit-sw-<look>.png    sitting on the ground, facing south-west: the body stub shortened, legs folded in front
    sit-nw-<look>.png    sitting, facing north-west (away): the folded legs behind the body
    lie-<look>.png       lying on the back in the sun, head to the left, along the ground's slope
    nap-<look>.png       the same with the pack's own shut eyes (the bed's sleeper)

Each is a picture 220 by 220 like one cell of the figure's sheet, standing on the same ground point (110, 208), so
the art build cuts and scales it as it does the figure's steps.

The figures are big heads on a short stub of a body with no arms or legs, so a seated figure is the same figure lower
down with its stub folded into a lap: a rounded shape of the body's own colour in front, outlined in the pack's plum.
Every output lives under art/source, which is never committed: it is the pack's own pixels.

Usage:  python tools/make_poses.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'art', 'source')
OUT = os.path.join(SOURCE, '_rendered', 'fallback', 'poses')
RECIPE = os.path.join(ROOT, 'art', 'recipes', 'penzilla.json')
CELL = 220
GROUND = 208          # the feet line in a cell
PLUM = (52, 1, 41, 255)
LINE = 6              # the pack's outline, in a cell's pixels
STUB_TOP = 184        # where the body stub begins under the chin, in a cell
SQUASH = 0.46         # a seated stub's height, of its standing height
WIDEN = 1.38          # and its width


def cell(sheet, row, col=0):
    return sheet.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def stub(im):
    """The body stub: its left and right at the waist, its centre, and its colour (the middle of it)."""
    a = np.array(im)
    rows = a[GROUND - 22:GROUND - 4, :, 3] > 128
    xs = np.nonzero(rows.any(axis=0))[0]
    left, right = int(xs.min()), int(xs.max())
    mid = (left + right) // 2
    # The colour inside the outline, a little in from the middle: the most common bright pixel there.
    patch = a[GROUND - 18:GROUND - 8, mid - 6:mid + 6].reshape(-1, 4)
    patch = patch[(patch[:, 3] > 200) & (patch[:, :3].max(axis=1) > 70)]
    colour = tuple(int(v) for v in np.median(patch[:, :3], axis=0)) + (255,) if len(patch) else (200, 160, 60, 255)
    return left, right, mid, colour


def lap(size, box, colour):
    """A rounded lap: the body's colour inside the pack's plum line."""
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = box
    d.ellipse((x0 - LINE, y0 - LINE, x1 + LINE, y1 + LINE), fill=PLUM)
    d.ellipse((x0, y0, x1, y1), fill=colour)
    return im


def seated(im, facing):
    """
    The figure seated: its own body stub squashed shorter and wider into a seated shape (its clothes and outline
    kept, as drawn), and its head lowered onto it. Facing south-west the seat bulges a little to the front-left; facing
    north-west, to the back-left.
    """
    a = np.array(im)
    top = STUB_TOP
    body = Image.fromarray(a[top:GROUND + 1].copy())
    head = a.copy()
    head[top + 6:, :, 3] = 0   # the head and the top of the stub, which the head's chin overlaps
    head = Image.fromarray(head)
    left, right, mid, _ = stub(im)
    height = GROUND + 1 - top
    squat = max(6, int(height * SQUASH))
    wide = body.resize((int(body.width * WIDEN), squat), Image.LANCZOS)
    out = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    shift = -6 if facing == 'sw' else -3
    bx = int(mid - mid * WIDEN) + shift
    out.alpha_composite(wide, (bx, GROUND + 1 - squat))
    # The head comes down by what the stub lost, so it sits on the seat.
    out.alpha_composite(head, (0, height - squat))
    return out


def lying(im):
    """The figure laid on its back along the ground's slope: turned a quarter, head to the left, a little foreshortened."""
    a = np.array(im)
    ys, xs = np.nonzero(a[..., 3] > 20)
    figure = im.crop((int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3))
    # A quarter turn puts the head on the left; the ground runs up to the right at about half a pixel a pixel, so
    # the figure is turned a little further, and the view from above shortens it across.
    turned = figure.rotate(90, expand=True, resample=Image.BICUBIC)
    turned = turned.resize((turned.width, int(turned.height * 0.78)), Image.LANCZOS)
    turned = turned.rotate(-14, expand=True, resample=Image.BICUBIC)
    # Shrunk a little so a lying figure is no longer than a standing one is tall.
    scale = min(1.0, 170 / turned.width)
    turned = turned.resize((int(turned.width * scale), int(turned.height * scale)), Image.LANCZOS)
    out = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(turned, ((CELL - turned.width) // 2, GROUND - turned.height + 4))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    people = json.load(open(RECIPE))['people']
    made = 0
    for look, relative in enumerate(people['looks']):
        sheet = Image.open(os.path.join(SOURCE, relative)).convert('RGBA')
        name = os.path.splitext(os.path.basename(relative))[0].replace('NpcReadymade_', '')
        seated(cell(sheet, 1), 'sw').save(os.path.join(OUT, f'sit-sw-{name}.png'))
        seated(cell(sheet, 3), 'nw').save(os.path.join(OUT, f'sit-nw-{name}.png'))
        lying(cell(sheet, 0)).save(os.path.join(OUT, f'lie-{name}.png'))
        sleep = people.get('sleep', [])
        if look < len(sleep):
            napper = Image.open(os.path.join(SOURCE, sleep[look])).convert('RGBA')
            lying(napper).save(os.path.join(OUT, f'nap-{name}.png'))
        made += 1
    print(f'{made} figures posed in {OUT}')


if __name__ == '__main__':
    main()
