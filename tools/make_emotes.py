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


def body(canvas, mask, fill, shade, light=None, line=LINE, edge=RIM):
    """A shape as the pack draws one: outlined, filled, a darker rim, and a highlight if one is given. A smaller
    picture inside a bubble takes a thinner `line` and `edge`, so it reads at the bubble's size."""
    paint(canvas, grow(mask, line), PLUM)
    paint(canvas, mask, fill)
    paint(canvas, rim(mask, edge), shade)
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


SKIN = (255, 206, 160, 255)
SKIN_RIM = (214, 148, 104, 255)
ORANGE_BALL = (244, 128, 36, 255)
GREY = (150, 150, 170, 255)
GREY_RIM = (96, 96, 120, 255)
GREEN = (96, 196, 104, 255)
GREEN_RIM = (48, 136, 64, 255)
PINK = (246, 150, 186, 255)
PINK_RIM = (206, 92, 140, 255)
BLUE = (110, 168, 240, 255)
BLUE_RIM = (60, 110, 196, 255)
INNER = 30      # the outline of a picture inside a bubble
INNER_RIM = 22


def rotated(mask, degrees, about):
    return mask.rotate(degrees, resample=Image.BICUBIC, center=about)


def hand(cx, cy, scale=1.0, turn=0.0, fist=False):
    """An open hand, or a fist, as a mask: a palm, four fingers and a thumb."""
    k = scale
    parts = [rounded((cx - 120 * k, cy - 40 * k, cx + 120 * k, cy + 190 * k), 70 * k)]
    if fist:
        parts.append(rounded((cx - 130 * k, cy - 120 * k, cx + 130 * k, cy + 30 * k), 60 * k))
    else:
        for i, h in enumerate((150, 190, 180, 140)):
            x0 = cx - 118 * k + i * 60 * k
            parts.append(rounded((x0, cy - h * k - 30 * k, x0 + 52 * k, cy + 20 * k), 26 * k))
    parts.append(rotated(rounded((cx - 210 * k, cy + 10 * k, cx - 80 * k, cy + 70 * k), 30 * k), -35, (cx - 90 * k, cy + 40 * k)))
    m = union(*parts)
    return rotated(m, turn, (cx, cy)) if turn else m


def wave():
    c = blank('RGBA')
    body(c, hand(560, 560, 1.15, 12), SKIN, SKIN_RIM, (470, 300, 540, 380))
    d = ImageDraw.Draw(c)
    # The wave: two short arcs beside the hand.
    for r in (330, 410):
        d.arc((560 - r, 520 - r, 560 + r, 520 + r), 300, 340, fill=PLUM, width=40)
    return c


def highfive():
    c = blank('RGBA')
    body(c, hand(330, 620, 0.95, 28), SKIN, SKIN_RIM, (260, 420, 320, 480))
    body(c, hand(330, 620, 0.95, 28).transpose(Image.FLIP_LEFT_RIGHT), SKIN, SKIN_RIM)
    body(c, polygon(star_points(512, 210, 150, 60, n=6)), GOLD, GOLD_RIM)
    return c


def fistbump():
    c = blank('RGBA')
    left = rotated(hand(300, 560, 0.9, 0, fist=True), -90, (300, 560))
    right = rotated(hand(724, 560, 0.9, 0, fist=True), 90, (724, 560))
    body(c, left, SKIN, SKIN_RIM, (200, 470, 260, 530))
    body(c, right, (196, 140, 98, 255), (150, 98, 64, 255))
    body(c, polygon(star_points(512, 300, 120, 48, n=6)), GOLD, GOLD_RIM)
    return c


def hug():
    c = blank('RGBA')
    body(c, ellipse((150, 380, 530, 760)), PINK, PINK_RIM, (220, 440, 300, 500))
    body(c, ellipse((494, 380, 874, 760)), BLUE, BLUE_RIM, (560, 440, 640, 500))
    d = ImageDraw.Draw(c)
    for x in (300, 400, 624, 724):
        d.arc((x - 40, 520, x + 40, 600), 200, 340, fill=PLUM, width=30)
    body(c, heart_mask(512, 170, 105), RED, RED_RIM)
    return c


# A speech bubble with what they are talking about inside: a shared interest, or a heart between a couple.

def bubble_mask():
    return union(rounded((110, 120, 914, 760), 170), polygon([(270, 700), (470, 700), (220, 930)]))


def chat(draw_inside):
    def make():
        c = blank('RGBA')
        body(c, bubble_mask(), PAPER, PAPER_RIM, (190, 180, 330, 270))
        draw_inside(c)
        return c
    return make


def in_ball(c):
    body(c, ellipse((362, 290, 662, 590)), ORANGE_BALL, ORANGE_RIM, (420, 330, 470, 380), INNER, INNER_RIM)
    d = ImageDraw.Draw(c)
    d.line([(512, 290), (512, 590)], fill=PLUM, width=20)
    d.line([(362, 440), (662, 440)], fill=PLUM, width=20)
    d.arc((300, 300, 470, 580), 300, 60, fill=PLUM, width=20)
    d.arc((554, 300, 724, 580), 120, 240, fill=PLUM, width=20)


def in_pad(c):
    m = union(rounded((300, 340, 724, 560), 100), ellipse((290, 420, 420, 610)), ellipse((604, 420, 734, 610)))
    body(c, m, GREY, GREY_RIM, (360, 370, 420, 410), INNER, INNER_RIM)
    d = ImageDraw.Draw(c)
    d.rectangle((370, 430, 450, 456), fill=PLUM)
    d.rectangle((397, 403, 423, 483), fill=PLUM)
    for x, y, col in ((600, 420, RED), (650, 460, GOLD)):
        d.ellipse((x - 22, y - 22, x + 22, y + 22), fill=col, outline=PLUM, width=8)


def in_note(c):
    heads = union(ellipse((350, 500, 470, 590)), ellipse((560, 470, 680, 560)))
    stems = union(polygon([(440, 540), (470, 540), (470, 300), (440, 300)]), polygon([(650, 510), (680, 510), (680, 270), (650, 270)]))
    beam = polygon([(440, 300), (680, 270), (680, 330), (440, 360)])
    body(c, union(heads, stems, beam), VIOLET, VIOLET_RIM, None, INNER, INNER_RIM)


def in_dumbbell(c):
    m = union(rounded((330, 340, 400, 580), 20), rounded((624, 340, 694, 580), 20), rounded((300, 380, 340, 540), 14), rounded((684, 380, 724, 540), 14), rounded((390, 440, 634, 480), 10))
    body(c, m, GREY, GREY_RIM, None, INNER, INNER_RIM)


def in_hat(c):
    """A party hat: a striped cone with a pompom, and two bits of confetti. Parties, with no drink in it, since
    students of every age talk about them (the red cup is a 21+ student's own emote, DESIGN.md 63.9)."""
    cone = union(polygon([(512, 290), (690, 590), (334, 590)]), ellipse((334, 548, 690, 632)))
    body(c, cone, BLUE, BLUE_RIM, None, INNER, INNER_RIM)
    inside = shrink(cone, INNER_RIM)
    for y in (420, 540):
        band = polygon([(0, y + 160), (BIG, y - 160), (BIG, y - 90), (0, y + 230)])
        paint(c, ImageChops.multiply(inside, band), GOLD)
    body(c, ellipse((448, 206, 576, 334)), RED, RED_RIM, (474, 230, 510, 266), INNER, INNER_RIM)
    for box, colour, rim_colour, turn in (((268, 300, 360, 352), GREEN, GREEN_RIM, 30), ((664, 280, 756, 332), PINK, PINK_RIM, -35)):
        bit = rotated(rounded(box, 12), turn, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2))
        body(c, bit, colour, rim_colour, None, INNER, INNER_RIM)


def in_book(c):
    left = polygon([(300, 340), (505, 380), (505, 600), (300, 560)])
    right = polygon([(519, 380), (724, 340), (724, 560), (519, 600)])
    body(c, union(left, right), PAPER, PAPER_RIM, None, INNER, INNER_RIM)
    d = ImageDraw.Draw(c)
    for k in range(3):
        d.line([(340, 420 + k * 45), (470, 445 + k * 45)], fill=BLUE_RIM, width=14)
        d.line([(554, 445 + k * 45), (684, 420 + k * 45)], fill=BLUE_RIM, width=14)


def in_palette(c):
    m = ImageChops.subtract(ellipse((310, 300, 714, 610)), ellipse((560, 480, 640, 560)))
    body(c, m, (232, 196, 140, 255), (186, 140, 86, 255), None, INNER, INNER_RIM)
    d = ImageDraw.Draw(c)
    for x, y, col in ((400, 400, RED), (490, 350, GOLD), (590, 380, BLUE), (420, 500, GREEN)):
        d.ellipse((x - 34, y - 34, x + 34, y + 34), fill=col, outline=PLUM, width=8)


def in_shirt(c):
    m = polygon([(400, 300), (460, 300), (512, 340), (564, 300), (624, 300), (720, 380), (670, 440), (630, 410), (630, 600), (394, 600), (394, 410), (354, 440), (304, 380)])
    body(c, m, PINK, PINK_RIM, None, INNER, INNER_RIM)


def in_heart(c):
    body(c, heart_mask(512, 380, 110), RED, RED_RIM, (420, 300, 470, 350), INNER, INNER_RIM)


CHATS = {
    'chat-sports': in_ball,
    'chat-gaming': in_pad,
    'chat-music': in_note,
    'chat-fitness': in_dumbbell,
    'chat-partying': in_hat,
    'chat-studying': in_book,
    'chat-art': in_palette,
    'chat-fashion': in_shirt,
    'chat-love': in_heart,
}


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
    'wave': wave,
    'highfive': highfive,
    'fistbump': fistbump,
    'hug': hug,
    **{name: chat(inside) for name, inside in CHATS.items()},
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
