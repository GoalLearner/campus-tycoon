"""
The rival's mascot (the chaos sandbox, C3, DESIGN.md 77; the owner's decision 10, "Compose the rival mascot"): the
people pack's costume-like figure, its Alien readymade, recoloured in the rival school's colour. Made from the paid
pack, so it goes in the pack's own atlas only, never the public one.

    art/source/_rendered/fallback/mascot/<look>-<colour>.png    a full sheet, 8 frames by 5 rows, as the pack's own

Looks:
    costume   the big head in the colour, the suit a shade darker; the face and outline as drawn
    helmet    the same, wearing the pack's football helmet recoloured to match
    tinted    the figure as drawn, multiplied by the colour, as the fans on game day are

Usage:  python tools/make_mascot.py [--looks costume,helmet,tinted] [--sheet out.png]
"""
import colorsys
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NPC = os.path.join(os.path.expanduser('~'), 'Downloads', 'NPC', 'NPC')
SOURCE = os.path.join(ROOT, 'art', 'source', 'penzilla', 'NPC')
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'fallback', 'mascot')

# The school colours of src/sim/config/football.ts, by id.
COLOURS = {
    'crimson': 0xc0392b, 'navy': 0x2c4a8a, 'forest': 0x2e7d4f, 'gold': 0xe0a82e,
    'purple': 0x7b4bb0, 'orange': 0xe07a2e, 'teal': 0x1f8f8f, 'maroon': 0x7a2238,
}
# The Alien's own two greens: the head and the suit.
HEAD = (166, 173, 54)
SUIT = (142, 152, 64)


def pack_file(name):
    for base in (SOURCE, NPC):
        path = os.path.join(base, name)
        if os.path.exists(path):
            return path
    raise FileNotFoundError(name)


def rgb(hex_colour):
    return ((hex_colour >> 16) & 255, (hex_colour >> 8) & 255, hex_colour & 255)


def shade(colour, by):
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in colour))
    return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s, max(0.0, min(1.0, v * by))))


def recolour(im, pairs, within=26):
    """Each pixel near one of the `pairs`' from-colours takes its to-colour, keeping how much lighter or darker it was."""
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            for src, dst in pairs:
                d = abs(r - src[0]) + abs(g - src[1]) + abs(b - src[2])
                if d <= within:
                    lift = ((r + g + b) - sum(src)) / 3
                    px[x, y] = tuple(max(0, min(255, round(c + lift))) for c in dst) + (a,)
                    break
    return out


def costume(colour):
    base = Image.open(pack_file('NpcReadymade_Alien.png')).convert('RGBA')
    light = shade(colour, 1.18) if sum(colour) < 330 else colour
    return recolour(base, [(HEAD, light), (SUIT, shade(colour, 0.78))])


def helmet(colour):
    figure = costume(colour)
    hat = Image.open(pack_file(os.path.join('Headwear', 'Helmet2_Red.png'))).convert('RGBA')
    # The pack's red helmet, turned the rival's colour; it sits on the head as on any figure, lifted to the big head.
    from collections import Counter
    reds = Counter(p[:3] for p in hat.getdata() if p[3] > 200 and p[0] > 150 and p[1] < 110)
    pairs = [(c, shade(colour, (sum(c) / 3) / 120)) for c, _ in reds.most_common(6)]
    hat = recolour(hat, pairs, within=10)
    lifted = Image.new('RGBA', hat.size)
    lifted.paste(hat, (0, -18))
    return Image.alpha_composite(figure, lifted)


def tinted(colour):
    base = Image.open(pack_file('NpcReadymade_Alien.png')).convert('RGBA')
    layer = Image.new('RGBA', base.size, colour + (255,))
    from PIL import ImageChops
    mult = ImageChops.multiply(base, layer)
    mult.putalpha(base.getchannel('A'))
    return mult


LOOKS = {'costume': costume, 'helmet': helmet, 'tinted': tinted}


def main():
    looks = sys.argv[sys.argv.index('--looks') + 1].split(',') if '--looks' in sys.argv else ['costume']
    os.makedirs(OUT, exist_ok=True)
    made = {}
    for look in looks:
        for name, hex_colour in COLOURS.items():
            im = LOOKS[look](rgb(hex_colour))
            im.save(os.path.join(OUT, f'{look}-{name}.png'))
            made[(look, name)] = im
    print(f'wrote {len(made)} mascot sheets into {os.path.relpath(OUT, ROOT)}')
    if '--sheet' in sys.argv:
        out = sys.argv[sys.argv.index('--sheet') + 1]
        cell = 220
        cols = list(COLOURS)
        sheet = Image.new('RGBA', (len(cols) * cell * 2 + 40, len(looks) * (cell + 40) + 20), (241, 232, 211, 255))
        for r, look in enumerate(looks):
            for c, name in enumerate(cols):
                im = made[(look, name)]
                for k, row in enumerate((0, 2)):
                    frame = im.crop((0, row * cell, cell, row * cell + cell))
                    sheet.alpha_composite(frame, (20 + (c * 2 + k) * cell, 20 + r * (cell + 40)))
        sheet.save(out)


if __name__ == '__main__':
    main()
