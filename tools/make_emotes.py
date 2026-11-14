"""
Draws the emotes and bubbles of the social campus (DESIGN.md 63.7): the icons over a student's head and on their
card. Drawn for this game in the people pack's way: flat colours, a thick dark plum outline (the pack's own, 52 1 41),
a darker rim on the side away from the light and a white highlight, so they sit with the pack's figures. They are ours,
credited as made for this game in CREDITS.md, and swappable: each is one file named in the art recipes.

    art/source/_rendered/ours/emotes/<name>.png    256 by 256, the picture standing on its bottom middle

Drawn four times larger and shrunk, so the edges are smooth as the pack's are. The art build shrinks them again to
about 32 pixels for the card, and the map shows them at half that over a head.

Usage:  python tools/make_emotes.py [--sheet out.png]
"""
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'ours', 'emotes')

BIG = 1024           # drawn at this size
SIZE = 256           # saved at this size
LINE = 58            # the outline, in drawn pixels: about 2 pixels at the size the card shows
RIM = 46             # the darker rim inside the outline

PLUM = (52, 1, 41, 255)
WHITE = (255, 255, 255, 255)
PAPER = (246, 241, 250, 255)
PAPER_RIM = (204, 194, 218, 255)
RED = (233, 52, 71, 255)
RED_RIM = (160, 24, 45, 255)
GOLD = (255, 205, 62, 255)
GOLD_RIM = (233, 150, 0, 255)
SKY = (156, 176, 208, 255)
SKY_RIM = (104, 118, 156, 255)
RAIN = (96, 168, 236, 255)
VIOLET = (126, 104, 232, 255)
VIOLET_RIM = (82, 62, 168, 255)
CUP = (214, 52, 24, 255)
CUP_RIM = (140, 26, 10, 255)
TEAL = (84, 196, 206, 255)
TEAL_RIM = (40, 132, 150, 255)
ORANGE = (255, 146, 46, 255)
ORANGE_RIM = (210, 86, 10, 255)
DROP = (132, 208, 255, 255)
DROP_RIM = (70, 150, 220, 255)


def blank(mode='L'):
    return Image.new(mode, (BIG, BIG), 0)


def grow(mask, by):
    """The mask grown by `by` pixels all round: the shape shifted round a circle, laid together."""
    out = mask.copy()
    steps = 32
    for i in range(steps):
        a = 2 * math.pi * i / steps
        out = ImageChops.lighter(out, ImageChops.offset(mask, round(by * math.cos(a)), round(by * math.sin(a))))
    return out


def shrink(mask, by):
    """The mask shrunk by `by` pixels all round."""
    return ImageChops.invert(grow(ImageChops.invert(mask), by))


def rim(mask, by):
    """The part of the mask along its lower right edge: the shape less itself moved up and to the left, kept to the
    outer edge, so a fold inside the shape (a heart's cleft) draws no line."""
    moved = ImageChops.offset(mask, -by, -by)
    edge = ImageChops.subtract(mask, shrink(mask, round(by * 1.6)))
    return ImageChops.multiply(ImageChops.subtract(mask, moved), edge)


def paint(canvas, mask, colour):
    layer = Image.new('RGBA', canvas.size, colour)
    canvas.paste(layer, (0, 0), mask)


def body(canvas, mask, fill, shade, light=None):
    """A shape as the pack draws one: outlined, filled, a darker rim, and a highlight if one is given."""
    paint(canvas, grow(mask, LINE), PLUM)
    paint(canvas, mask, fill)
    paint(canvas, rim(mask, RIM), shade)
    if light:
        spot = blank()
        ImageDraw.Draw(spot).ellipse(light, fill=255)
        paint(canvas, ImageChops.multiply(spot, mask), WHITE)


def ellipse(box):
    m = blank()
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m


def polygon(points):
    m = blank()
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m


def rounded(box, radius):
    m = blank()
    ImageDraw.Draw(m).rounded_rectangle(box, radius, fill=255)
    return m


def union(*masks):
    out = masks[0]
    for m in masks[1:]:
        out = ImageChops.lighter(out, m)
    return out


def heart_mask(cx, cy, r):
    """A heart: two circles and the point below them."""
    # The lobes overlap, so the cleft between them is a shallow dip the outline does not fill.
    left = ellipse((cx - 1.8 * r, cy - r, cx + 0.2 * r, cy + r))
    right = ellipse((cx - 0.2 * r, cy - r, cx + 1.8 * r, cy + r))
    point = polygon([(cx - 1.8 * r + r * 0.1, cy + r * 0.3), (cx + 1.8 * r - r * 0.1, cy + r * 0.3), (cx, cy + 2.3 * r)])
    return union(left, right, point)


def dots(canvas, cx, cy, gap, r):
    d = ImageDraw.Draw(canvas)
    for k in (-1, 0, 1):
        d.ellipse((cx + k * gap - r, cy - r, cx + k * gap + r, cy + r), fill=PLUM)


# --------------------------------------------------------------- the emotes --

def speech():
    c = blank('RGBA')
    m = union(rounded((150, 200, 874, 700), 150), polygon([(300, 640), (470, 640), (250, 860)]))
    body(c, m, PAPER, PAPER_RIM, (230, 260, 380, 360))
    dots(c, 512, 450, 150, 52)
    return c


def thought():
    c = blank('RGBA')
    puffs = [(170, 300, 470, 600), (330, 180, 650, 500), (540, 210, 860, 530), (590, 380, 880, 680), (330, 420, 700, 720), (150, 420, 450, 700)]
    m = union(*[ellipse(b) for b in puffs], ellipse((210, 760, 330, 880)), ellipse((110, 880, 180, 950)))
    body(c, m, PAPER, PAPER_RIM, (260, 260, 420, 360))
    dots(c, 520, 470, 140, 46)
    return c


def heart():
    c = blank('RGBA')
    body(c, heart_mask(512, 380, 210), RED, RED_RIM, (360, 230, 470, 330))
    return c


def heartbreak():
    c = blank('RGBA')
    whole = heart_mask(512, 380, 210)
    crack = [(512, 230), (470, 360), (560, 470), (480, 600), (540, 720), (512, 900)]
    left_side = polygon([(0, 0), (512, 0)] + crack + [(512, BIG), (0, BIG)])
    right_side = polygon([(512, 0), (BIG, 0), (BIG, BIG), (512, BIG)] + list(reversed(crack)))
    gap = 26
    left = ImageChops.offset(ImageChops.multiply(whole, left_side), -gap, 14)
    right = ImageChops.offset(ImageChops.multiply(whole, right_side), gap, -10)
    body(c, left, RED, RED_RIM, (330, 240, 430, 330))
    body(c, right, RED, RED_RIM)
    return c


def star_points(cx, cy, outer, inner, n=4, turn=0.0):
    pts = []
    for i in range(n * 2):
        a = turn + math.pi * i / n - math.pi / 2
        r = outer if i % 2 == 0 else inner
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def sparkle():
    c = blank('RGBA')
    big = polygon(star_points(470, 520, 380, 110))
    small = polygon(star_points(790, 230, 150, 46))
    tiny = polygon(star_points(780, 760, 110, 34))
    body(c, union(big, small, tiny), GOLD, GOLD_RIM, (400, 360, 470, 450))
    return c


def laugh():
    c = blank('RGBA')
    m = ellipse((150, 150, 874, 874))
    body(c, m, GOLD, GOLD_RIM, (260, 240, 400, 340))
    d = ImageDraw.Draw(c)
    # Shut, smiling eyes and an open mouth with a tongue.
    for x in (370, 654):
        d.arc((x - 90, 330, x + 90, 500), 200, 340, fill=PLUM, width=48)
    d.chord((300, 470, 724, 780), 0, 180, fill=PLUM)
    d.ellipse((420, 640, 604, 760), fill=(214, 70, 92, 255))
    return c


def sadcloud():
    c = blank('RGBA')
    puffs = [(120, 280, 440, 600), (300, 160, 640, 500), (520, 220, 880, 560), (200, 380, 820, 640)]
    body(c, union(*[ellipse(b) for b in puffs]), SKY, SKY_RIM, (260, 260, 400, 350))
    for x, y in ((300, 760), (512, 820), (724, 760)):
        drop = union(ellipse((x - 46, y - 10, x + 46, y + 82)), polygon([(x - 40, y + 20), (x + 40, y + 20), (x, y - 80)]))
        body(c, drop, RAIN, (60, 120, 200, 255))
    return c


def anger():
    c = blank('RGBA')
    # The vein mark: four thick curved strokes, one in each corner, each bowed in towards the middle.
    marks = []
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        ux, uy = math.cos(a), math.sin(a)
        far = 470
        cx, cy = 512 + ux * far, 512 + uy * far
        r = 270
        towards = math.degrees(math.atan2(-uy, -ux))
        m = blank()
        ImageDraw.Draw(m).arc((cx - r, cy - r, cx + r, cy + r), towards - 30, towards + 30, fill=255, width=104)
        marks.append(m)
    body(c, union(*marks), RED, RED_RIM)
    return c


def music():
    c = blank('RGBA')
    heads = union(ellipse((180, 640, 420, 830)), ellipse((560, 560, 800, 750)))
    stems = union(polygon([(360, 720), (420, 720), (420, 250), (360, 250)]), polygon([(740, 640), (800, 640), (800, 170), (740, 170)]))
    beam = polygon([(360, 250), (800, 170), (800, 300), (360, 380)])
    body(c, union(heads, stems, beam), VIOLET, VIOLET_RIM, (230, 670, 310, 720))
    return c


def partycup():
    c = blank('RGBA')
    cup = polygon([(250, 190), (774, 190), (690, 900), (334, 900)])
    body(c, cup, CUP, CUP_RIM, (320, 260, 400, 520))
    band = ImageChops.multiply(cup, polygon([(0, 190), (BIG, 190), (BIG, 300), (0, 300)]))
    paint(c, band, PAPER)
    ImageDraw.Draw(c).line([(258, 300), (766, 300)], fill=PLUM, width=24)
    return c


def sodacup():
    c = blank('RGBA')
    straw = polygon([(560, 60), (630, 60), (560, 280), (500, 280)])
    lid = rounded((230, 250, 794, 360), 50)
    cup = polygon([(270, 330), (754, 330), (680, 900), (344, 900)])
    body(c, straw, PAPER, (220, 60, 60, 255))
    body(c, cup, TEAL, TEAL_RIM, (330, 400, 400, 640))
    body(c, lid, PAPER, PAPER_RIM)
    return c


def exclaim():
    c = blank('RGBA')
    bar = polygon([(420, 120), (604, 120), (566, 640), (458, 640)])
    dot = ellipse((420, 720, 604, 900))
    body(c, union(bar, dot), ORANGE, ORANGE_RIM, (450, 170, 510, 330))
    return c


def sweat():
    c = blank('RGBA')
    drop = union(ellipse((300, 380, 724, 860)), polygon([(330, 560), (694, 560), (512, 110)]))
    body(c, drop, DROP, DROP_RIM, (400, 480, 480, 620))
    return c


EMOTES = {
    'speech': speech,
    'thought': thought,
    'heart': heart,
    'heartbreak': heartbreak,
    'sparkle': sparkle,
    'laugh': laugh,
    'sadcloud': sadcloud,
    'anger': anger,
    'music': music,
    'partycup': partycup,
    'sodacup': sodacup,
    'exclaim': exclaim,
    'sweat': sweat,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    pictures = {}
    for name, draw in EMOTES.items():
        im = draw().resize((SIZE, SIZE), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}.png'))
        pictures[name] = im
    print(f'wrote {len(pictures)} emotes into {os.path.relpath(OUT, ROOT)}')
    if '--sheet' in sys.argv:
        out = sys.argv[sys.argv.index('--sheet') + 1]
        sheet = Image.new('RGBA', (len(pictures) * 140, 300), (241, 232, 211, 255))
        for i, im in enumerate(pictures.values()):
            sheet.alpha_composite(im.resize((128, 128), Image.LANCZOS), (i * 140 + 6, 10))
            small = im.resize((32, 32), Image.LANCZOS).resize((128, 128), Image.NEAREST)
            sheet.alpha_composite(small, (i * 140 + 6, 160))
        sheet.save(out)


if __name__ == '__main__':
    main()
