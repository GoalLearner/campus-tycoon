"""
Draws the props the packs lack for the living campus (DESIGN.md 64): our own drawings, in the people pack's style (a
thick plum outline, flat fills with one shade and one light), so they sit beside its figures. The packs' own props
(room.book, room.cup, room.apple, room.bread, room.basket, room.blanket, room.lute, room.ball, room.soccerBall,
room.speaker) are used as they are; these are only what they do not have.

    frisbee   a flying disc, seen from a little above
    phone     a phone in a case, held up
    tray      a dining tray with a plate and a cup
    dog       a small dog, side on, facing left (south-west); mirrored for the other way
    bag       a backpack, side on, carried on one shoulder (DESIGN.md 64.3)
    umbrella  an open umbrella on its handle, held over the head in the rain (DESIGN.md 64.3)
    partyhat-0, -1, -2   a striped party cone with a pom-pom, worn at a party night (L6): red and yellow, teal and
              white, violet and pink

    art/source/_rendered/ours/props/<name>.png    256 by 256, the thing standing on the bottom middle

Ours, so they may go in the public atlas.

Usage:  python tools/make_props.py
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'ours', 'props')
SIZE = 256
BIG = 4 * SIZE  # drawn large and scaled down, for the pack's smooth line
PLUM = (52, 1, 41, 255)
LINE = 40       # the outline at the large size: about the pack's, once scaled to a prop's size in the game


def canvas():
    return Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))


def outlined_ellipse(d, box, fill, line=LINE):
    x0, y0, x1, y1 = box
    d.ellipse((x0 - line, y0 - line, x1 + line, y1 + line), fill=PLUM)
    d.ellipse(box, fill=fill)


def outlined_round(d, box, radius, fill, line=LINE):
    x0, y0, x1, y1 = box
    d.rounded_rectangle((x0 - line, y0 - line, x1 + line, y1 + line), radius + line, fill=PLUM)
    d.rounded_rectangle(box, radius, fill=fill)


def frisbee():
    c = canvas()
    d = ImageDraw.Draw(c)
    outlined_ellipse(d, (190, 520, 834, 820), (236, 92, 64, 255))
    d.ellipse((330, 590, 694, 730), fill=(255, 150, 112, 255))
    d.ellipse((420, 625, 604, 700), fill=(236, 92, 64, 255))
    return c


def phone():
    c = canvas()
    d = ImageDraw.Draw(c)
    outlined_round(d, (360, 260, 664, 860), 70, (70, 64, 110, 255))
    d.rounded_rectangle((400, 320, 624, 760), 30, fill=(150, 214, 240, 255))
    d.ellipse((488, 780, 536, 828), fill=(40, 34, 70, 255))
    return c


def tray():
    c = canvas()
    d = ImageDraw.Draw(c)
    outlined_round(d, (150, 560, 874, 860), 60, (196, 150, 98, 255))
    outlined_ellipse(d, (230, 590, 560, 800), (248, 246, 236, 255), 24)
    d.ellipse((300, 640, 490, 750), fill=(232, 166, 80, 255))
    outlined_round(d, (630, 470, 790, 760), 30, (240, 240, 232, 255), 24)
    d.rectangle((650, 500, 770, 560), fill=(150, 98, 64, 255))
    return c


def dog():
    c = canvas()
    d = ImageDraw.Draw(c)
    fur = (214, 160, 96, 255)
    dark = (150, 98, 54, 255)
    # Legs first, under the body.
    for x in (330, 420, 600, 690):
        outlined_round(d, (x, 640, x + 70, 880), 30, fur, 30)
    # Tail, up at the back (the right: the dog faces left).
    d.line([(760, 560), (880, 420)], fill=PLUM, width=110)
    d.line([(760, 560), (880, 420)], fill=fur, width=50)
    outlined_ellipse(d, (300, 480, 800, 720), fur)
    # Head at the front, an ear, an eye, a nose.
    outlined_ellipse(d, (130, 330, 450, 610), fur)
    outlined_ellipse(d, (300, 290, 420, 470), dark, 30)
    d.ellipse((215, 420, 265, 470), fill=PLUM)
    outlined_ellipse(d, (110, 500, 190, 560), PLUM, 0)
    return c


def bag():
    c = canvas()
    d = ImageDraw.Draw(c)
    cloth = (60, 120, 196, 255)
    dark = (36, 78, 140, 255)
    # The body, the loop on its top, a front pocket and its zip.
    outlined_round(d, (290, 260, 734, 860), 150, cloth)
    d.arc((410, 120, 614, 330), 180, 360, fill=PLUM, width=90)
    d.arc((410, 120, 614, 330), 180, 360, fill=cloth, width=36)
    outlined_round(d, (360, 560, 664, 820), 70, dark, 30)
    d.line([(400, 600), (624, 600)], fill=PLUM, width=24)
    d.ellipse((330, 330, 410, 410), fill=(130, 180, 240, 255))
    return c


def umbrella():
    c = canvas()
    d = ImageDraw.Draw(c)
    wood = (120, 96, 80, 255)
    # The canopy: a dome in panels of two colours over a flat lower edge, then the shaft and its hooked handle.
    colours = [(236, 72, 92, 255), (255, 228, 120, 255)]
    d.pieslice((60 - LINE, 120 - LINE, 964 + LINE, 1000 + LINE), 180, 360, fill=PLUM)
    for k in range(6):
        d.pieslice((60, 120, 964, 1000), 180 + k * 30, 180 + (k + 1) * 30, fill=colours[k % 2])
    for x in range(60, 964, 151):
        d.arc((x, 500, x + 151, 620), 0, 180, fill=PLUM, width=LINE // 2)
    d.line([(512, 560), (512, 900)], fill=PLUM, width=70)
    d.line([(512, 560), (512, 900)], fill=wood, width=26)
    d.arc((512, 840, 640, 990), 0, 180, fill=PLUM, width=70)
    d.arc((512, 840, 640, 990), 0, 180, fill=wood, width=26)
    outlined_ellipse(d, (487, 70, 537, 120), PLUM, 0)
    return c


PARTY_HATS = (
    ((236, 72, 92, 255), (255, 228, 120, 255)),
    ((84, 196, 206, 255), (255, 255, 255, 255)),
    ((126, 104, 232, 255), (255, 180, 220, 255)),
)


def partyhat(colours):
    """A party cone in two colours of stripe, darker on the side away from the light, with a yellow pom-pom."""
    c = canvas()
    d = ImageDraw.Draw(c)
    tip, left, right = (512, 180), (300, 880), (724, 880)
    d.polygon([(tip[0], tip[1] - 60), (left[0] - 50, left[1] + 40), (right[0] + 50, right[1] + 40)], fill=PLUM)
    cone = Image.new('L', (BIG, BIG), 0)
    ImageDraw.Draw(cone).polygon([tip, left, right], fill=255)
    stripes = Image.new('RGBA', (BIG, BIG), colours[0])
    sd = ImageDraw.Draw(stripes)
    for k in range(-6, 10):
        y = 260 + k * 130
        sd.polygon([(0, y), (BIG, y - 260), (BIG, y - 190), (0, y + 70)], fill=colours[1])
    c.paste(stripes, (0, 0), cone)
    shade = Image.new('L', (BIG, BIG), 0)
    ImageDraw.Draw(shade).polygon([tip, (612, 880), right], fill=90)
    c.paste(Image.new('RGBA', (BIG, BIG), (40, 0, 30, 255)), (0, 0), shade)
    d.ellipse((512 - 110, 180 - 150, 512 + 110, 180 + 70), fill=PLUM)
    d.ellipse((512 - 72, 180 - 112, 512 + 72, 180 + 32), fill=(255, 236, 120, 255))
    return c


# The chaos sandbox, C3 (DESIGN.md 77): a couch dragged into the street after a big game (dragged, never burned), in
# two fabrics, and a goalpost carried off after a field storming, held up over the heads of those carrying it.
COUCHES = ((214, 150, 60, 255), (70, 150, 150, 255))


def couch(fabric):
    c = canvas()
    d = ImageDraw.Draw(c)
    dark = tuple(max(0, int(v * 0.72)) for v in fabric[:3]) + (255,)
    light = tuple(min(255, int(v * 1.15)) for v in fabric[:3]) + (255,)
    # The back, the seat in three cushions, an arm at each end, and two stubby feet.
    for x in (210, 790):
        outlined_round(d, (x - 40, 760, x + 40, 880), 16, (90, 60, 40, 255), 26)
    outlined_round(d, (150, 380, 874, 640), 60, dark)
    outlined_round(d, (150, 560, 874, 800), 50, fabric)
    for k in range(3):
        x0 = 230 + k * 190
        d.rounded_rectangle((x0, 590, x0 + 170, 690), 30, fill=light)
    for x0 in (90, 794):
        outlined_round(d, (x0, 470, x0 + 140, 820), 50, fabric)
    return c


def goalpost():
    c = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    yellow = (255, 214, 64, 255)
    shade = (220, 160, 20, 255)
    # Two uprights and the crossbar, the post below and its curve, tilted a little as it is carried.
    parts = [((180, 140), (180, 560)), ((844, 140), (844, 560)), ((180, 560), (844, 560)), ((512, 560), (512, 760)), ((512, 760), (430, 900))]
    for a, b in parts:
        d.line([a, b], fill=PLUM, width=110)
    for a, b in parts:
        d.line([a, b], fill=shade, width=60)
        d.line([(a[0] - 8, a[1] - 8), (b[0] - 8, b[1] - 8)], fill=yellow, width=36)
    for x, y in ((180, 140), (844, 140)):
        d.ellipse((x - 55, y - 55, x + 55, y + 55), fill=PLUM)
        d.ellipse((x - 26, y - 26, x + 26, y + 26), fill=yellow)
    return c.rotate(-12, resample=Image.BICUBIC, center=(512, 560))


def main():
    os.makedirs(OUT, exist_ok=True)
    hats = tuple((f'partyhat-{n}', (lambda colours=colours: partyhat(colours))) for n, colours in enumerate(PARTY_HATS))
    couches = tuple((f'couch-{n}', (lambda fabric=fabric: couch(fabric))) for n, fabric in enumerate(COUCHES))
    for name, draw in (('frisbee', frisbee), ('phone', phone), ('tray', tray), ('dog', dog), ('bag', bag), ('umbrella', umbrella), ('goalpost', goalpost)) + hats + couches:
        im = draw()
        box = im.getbbox()
        # Standing on the bottom middle of the picture, as the art build expects a prop to.
        piece = im.crop(box)
        out = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
        out.alpha_composite(piece, ((BIG - piece.width) // 2, BIG - piece.height - 8))
        out.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{name}.png'))
    print('drawn', OUT)


if __name__ == '__main__':
    main()
