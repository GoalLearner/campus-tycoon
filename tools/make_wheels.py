"""
Draws the wheels of the living campus, L5 (DESIGN.md 64.6): what students ride, and the bike rack they park at. The
packs have no bikes or boards, so these are ours, drawn in code in the people pack's way: a thick plum outline, flat
fills with one shade and one light, smooth edges from drawing large and shrinking. Each is drawn facing two ways on the
map's grid, towards the viewer (south-west) and away (north-west), and mirrored by the game for the other two.

    bike          a bicycle
    skateboard    a skateboard
    longboard     a longer board
    kick          a kick scooter
    escooter      an electric scooter
    skates        a pair of inline skates

    art/source/_rendered/ours/wheels/<name>-<sw|nw>.png    256 by 256, standing on its bottom middle, where it meets the ground
    art/source/_rendered/ours/wheels/rack.png              a bike rack for a cell: three hoops in a row

Ours, so they may go in the public atlas. Usage:  python tools/make_wheels.py [--sheet out.png]
"""
import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'ours', 'wheels')
SIZE = 256
BIG = 4 * SIZE
PLUM = (52, 1, 41, 255)
LINE = 34          # the outline round a part, at the large size
GROUND = 900       # where the wheels meet the ground, at the large size

# The map's two drawn ways: towards the viewer and to the left (south-west), away and to the left (north-west).
WAYS = {'sw': (-2 / math.sqrt(5), 1 / math.sqrt(5)), 'nw': (-2 / math.sqrt(5), -1 / math.sqrt(5))}

TYRE = (60, 52, 70, 255)
HUB = (196, 196, 210, 255)
METAL = (186, 190, 204, 255)
DARK = (74, 70, 92, 255)


def canvas():
    return Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))


def stroke(d, a, b, colour, width):
    """A part drawn as the pack draws one: the plum outline, then its colour over it."""
    d.line([a, b], fill=PLUM, width=width + LINE)
    for p in (a, b):
        r = (width + LINE) / 2
        d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=PLUM)
    d.line([a, b], fill=colour, width=width)
    for p in (a, b):
        r = width / 2
        d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=colour)


def blob(d, box, colour, line=LINE):
    x0, y0, x1, y1 = box
    d.ellipse((x0 - line / 2, y0 - line / 2, x1 + line / 2, y1 + line / 2), fill=PLUM)
    d.ellipse(box, fill=colour)


def wheel(d, at, r, tyre=TYRE, hub=HUB):
    """A wheel seen from the map's angle: an upright ellipse, a tyre round a lighter hub."""
    x, y = at
    blob(d, (x - r * 0.62, y - r, x + r * 0.62, y + r), tyre)
    d.ellipse((x - r * 0.3, y - r * 0.5, x + r * 0.3, y + r * 0.5), fill=hub)


def along(c, u, t, up=0.0):
    return (c[0] + u[0] * t, c[1] + u[1] * t - up)


def bike(way, paint=(214, 58, 72, 255)):
    c = canvas()
    d = ImageDraw.Draw(c)
    u = WAYS[way]
    r = 150
    mid = (512, GROUND - r)
    rear = along(mid, u, -250)
    front = along(mid, u, 250)
    # The far wheel first when the bike goes away from us: then the near one covers it.
    first, second = (rear, front) if way == 'sw' else (front, rear)
    wheel(d, first, r)
    seat = along(mid, u, -70, 230)
    crank = along(mid, u, -10, 10)
    stem = along(mid, u, 190, 250)
    stroke(d, rear, crank, paint, 30)
    stroke(d, rear, seat, paint, 30)
    stroke(d, seat, stem, paint, 34)
    stroke(d, crank, stem, paint, 34)
    stroke(d, crank, seat, paint, 30)
    stroke(d, stem, front, METAL, 26)
    # The saddle, and the handlebar across the way it goes.
    blob(d, (seat[0] - 60, seat[1] - 34, seat[0] + 60, seat[1] + 10), DARK)
    across = (u[1] * 70, -u[0] * 35)
    stroke(d, (stem[0] - across[0], stem[1] - across[1] - 30), (stem[0] + across[0], stem[1] + across[1] - 30), DARK, 22)
    wheel(d, second, r)
    return c


def board(way, length, deck, wheels_colour=(250, 220, 120, 255)):
    c = canvas()
    d = ImageDraw.Draw(c)
    u = WAYS[way]
    mid = (512, GROUND - 50)
    a = along(mid, u, -length / 2)
    b = along(mid, u, length / 2)
    for t in (-length * 0.36, length * 0.36):
        for side in (-1, 1):
            p = along(mid, u, t)
            p = (p[0] + side * 26, p[1] + 34)
            blob(d, (p[0] - 22, p[1] - 22, p[0] + 22, p[1] + 22), wheels_colour, LINE * 0.7)
    stroke(d, a, b, deck, 74)
    # The grip tape's light edge.
    d.line([along(mid, u, -length / 2 + 30, 18), along(mid, u, length / 2 - 30, 18)], fill=(255, 255, 255, 120), width=10)
    return c


def scooter(way, deck=(210, 214, 226, 255), stem_colour=(214, 58, 72, 255), wheel_r=52, electric=False):
    c = canvas()
    d = ImageDraw.Draw(c)
    u = WAYS[way]
    mid = (512, GROUND - wheel_r)
    rear = along(mid, u, -190)
    front = along(mid, u, 190)
    first, second = (rear, front) if way == 'sw' else (front, rear)
    wheel(d, first, wheel_r)
    stroke(d, along(mid, u, -200, -6), along(mid, u, 170, -6), deck, 64 if electric else 46)
    top = along(mid, u, 205, 470)
    stroke(d, front, top, stem_colour, 34 if electric else 28)
    across = (u[1] * 80, -u[0] * 40)
    stroke(d, (top[0] - across[0], top[1] - across[1]), (top[0] + across[0], top[1] + across[1]), DARK, 26)
    if electric:
        # The battery under the deck and a lamp on the stem.
        blob(d, (mid[0] - 70, mid[1] + 6, mid[0] + 70, mid[1] + 50), DARK, LINE * 0.7)
        lamp = along(mid, u, 200, 330)
        blob(d, (lamp[0] - 22, lamp[1] - 22, lamp[0] + 22, lamp[1] + 22), (255, 240, 170, 255), LINE * 0.7)
    wheel(d, second, wheel_r)
    return c


def skates(way, boot=(126, 104, 232, 255)):
    c = canvas()
    d = ImageDraw.Draw(c)
    u = WAYS[way]
    for side in (-1, 1):
        mid = (512 + side * 70, GROUND - 40 + side * 18)
        for t in (-70, -24, 24, 70):
            p = along(mid, u, t)
            blob(d, (p[0] - 18, p[1] + 14, p[0] + 18, p[1] + 50), (60, 52, 70, 255), LINE * 0.6)
        stroke(d, along(mid, u, -90), along(mid, u, 90), boot, 54)
        top = along(mid, u, -40, 90)
        stroke(d, along(mid, u, -60), top, boot, 60)
    return c


def rack():
    """Three hoops in a row along the cell, on their rail: the map's ground shows through."""
    c = canvas()
    d = ImageDraw.Draw(c)
    row = (2 / math.sqrt(5), 1 / math.sqrt(5))
    mid = (512, 640)
    a = along(mid, row, -330)
    b = along(mid, row, 330)
    stroke(d, (a[0], a[1] + 6), (b[0], b[1] + 6), METAL, 26)
    for t in (-220, 0, 220):
        foot = along(mid, row, t)
        left = (foot[0] - 70, foot[1] + 30)
        right = (foot[0] + 70, foot[1] - 30)
        # An upright hoop seen from the map's angle: two legs and an arch over them.
        top_l = (left[0], left[1] - 140)
        top_r = (right[0], right[1] - 140)
        stroke(d, left, top_l, METAL, 28)
        stroke(d, right, top_r, METAL, 28)
        box = (top_l[0], min(top_l[1], top_r[1]) - 80, top_r[0], max(top_l[1], top_r[1]) + 40)
        d.arc((box[0] - LINE / 2, box[1] - LINE / 2, box[2] + LINE / 2, box[3] + LINE / 2), 180, 360, fill=PLUM, width=28 + LINE)
        d.arc(box, 180, 360, fill=METAL, width=28)
    return c


def saved(im, name):
    box = im.getbbox()
    piece = im.crop(box)
    out = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    out.alpha_composite(piece, ((BIG - piece.width) // 2, BIG - piece.height - 8))
    small = out.resize((SIZE, SIZE), Image.LANCZOS)
    small.save(os.path.join(OUT, f'{name}.png'))
    return small


DRAWN = {
    'bike': lambda way: bike(way),
    'skateboard': lambda way: board(way, 360, (226, 120, 60, 255)),
    'longboard': lambda way: board(way, 470, (84, 196, 206, 255), (255, 255, 255, 255)),
    'kick': lambda way: scooter(way),
    'escooter': lambda way: scooter(way, (60, 64, 80, 255), (84, 196, 206, 255), 62, True),
    'skates': lambda way: skates(way),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    pictures = []
    for name, draw in DRAWN.items():
        for way in WAYS:
            pictures.append(saved(draw(way), f'{name}-{way}'))
    pictures.append(saved(rack(), 'rack'))
    print(f'drew {len(pictures)} pictures into {os.path.relpath(OUT, ROOT)}')
    if '--sheet' in sys.argv:
        out = sys.argv[sys.argv.index('--sheet') + 1]
        sheet = Image.new('RGBA', (len(pictures) * 136, 140), (241, 232, 211, 255))
        for i, im in enumerate(pictures):
            sheet.alpha_composite(im.resize((128, 128), Image.LANCZOS), (i * 136 + 4, 6))
        sheet.save(out)


if __name__ == '__main__':
    main()
