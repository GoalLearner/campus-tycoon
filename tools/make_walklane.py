"""
Draws the bike lane painted on a footpath (life-7c): a band of the bike path's red with our white edge lines, laid over
the footpath as it joins up (16 ways, by which sides join more footpath with a lane), and the bike symbol on a straight
piece. Two looks for the owner to pick from:

    a   the lane down one side of the walk: the west half of a walk running north-south, the north half of one running
        east-west, so a lane turning a corner or meeting a junction stays on one side
    b   the lane down the middle of the walk

Each piece is an overlay, drawn over the footpath's own tile:

    m<0-15>     the lane, as the walk joins
    sym5 sym10  a straight piece with the bike symbol on the lane, north-south (5) or east-west (10)

Two sets, one for each pack:

    art/source/_rendered/fallback/walklane/<look>-<piece>.png   on the drawn pack's 512 canvas, from its own sidewalk tile
                                                                (a paid part: the private atlas only)
    art/source/_rendered/ours/walklane/<look>-<piece>.png       on the free pack's 132 tile, from its plain slab, inside its
                                                                walk's paving (free to use: the public atlas)

The markings and the band are ours. Usage:  python tools/make_walklane.py
"""
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_bikelane as bike  # noqa: E402  the lane's colour, the faces and the painted lines are the bike path's

ROOT = bike.ROOT
SRC = bike.SRC
SUPER = bike.SUPER

# Where the band runs across the walk, in cells: its centre line and half its width. The drawn pack's walk is paved
# from edge to edge; the free pack's between its kerbs, about 0.2 to 0.8 of the cell.
LOOKS = {
    'drawn': {'a': (0.26, 0.19), 'b': (0.5, 0.18)},
    'free': {'a': (0.33, 0.11), 'b': (0.5, 0.11)},
}
EDGE = 0.032    # the white edge line's width, of a cell


def band_mask(face, mask, centre, half, grow=0.0):
    """The lane band for a piece, at SUPER scale: from the cell's lane hub out to each joined side, as wide as `half`."""
    w, h = face['size'][0] * SUPER, face['size'][1] * SUPER
    out = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(out)
    hx = hy = centre
    hw = half + grow
    reach = 0.25  # past the cell's side, so a joined side has no cap

    def quad(x0, y0, x1, y1):
        d.polygon([bike.point(face, x0, y0, SUPER), bike.point(face, x1, y0, SUPER), bike.point(face, x1, y1, SUPER), bike.point(face, x0, y1, SUPER)], fill=255)

    # The hub, and a run to each joined side: north and south runs follow x = hx, east and west runs y = hy.
    quad(hx - hw, hy - hw, hx + hw, hy + hw)
    if mask & 1:
        quad(hx - hw, -reach, hx + hw, hy)
    if mask & 4:
        quad(hx - hw, hy, hx + hw, 1 + reach)
    if mask & 8:
        quad(-reach, hy - hw, hx, hy + hw)
    if mask & 2:
        quad(hx, hy - hw, 1 + reach, hy + hw)
    # With no join at all, a short run north-south, so a lone cell still reads as a lane.
    if mask == 0:
        quad(hx - hw, 0.18, hx + hw, 0.82)
    return out


def diamond(face):
    out = Image.new('L', (face['size'][0] * SUPER, face['size'][1] * SUPER), 0)
    ImageDraw.Draw(out).polygon([bike.point(face, 0, 0, SUPER), bike.point(face, 1, 0, SUPER), bike.point(face, 1, 1, SUPER), bike.point(face, 0, 1, SUPER)], fill=255)
    return out


def piece(red, face, mask, centre, half, symbol=None):
    """The overlay for one piece: the red band, its white edges, and the bike symbol when asked."""
    inner = band_mask(face, mask, centre, half)
    outer = band_mask(face, mask, centre, half, grow=EDGE)
    cell = diamond(face)
    inner = ImageChops.multiply(inner, cell)
    outer = ImageChops.multiply(outer, cell)
    size = face['size']
    layer = Image.new('RGBA', (size[0] * SUPER, size[1] * SUPER), (0, 0, 0, 0))
    white = Image.new('RGBA', layer.size, bike.WHITE)
    layer.paste(white, (0, 0), outer)
    big_red = red.resize(layer.size, Image.LANCZOS)
    layer.paste(big_red, (0, 0), inner)
    if symbol is not None:
        sym = symbol_layer(face, centre, half, symbol)
        sym_a = ImageChops.multiply(sym.getchannel('A'), inner)
        layer.paste(sym, (0, 0), sym_a)
    return layer.resize(size, Image.LANCZOS)


def symbol_layer(face, centre, half, along_y):
    """The bike symbol, shrunk to sit inside the band, centred on its line, lying along it."""
    # The bike path's symbol spans 0.42 of a cell across; squeezed to eight tenths of the band, about its line.
    k = (half * 2 * 0.8) / 0.42
    sym = Image.new('RGBA', (face['size'][0] * SUPER, face['size'][1] * SUPER), (0, 0, 0, 0))
    d = ImageDraw.Draw(sym)

    def at(across, along):
        a = centre + (across - 0.5) * k
        return (a, along) if along_y else (along, a)

    lw = bike.LINE * 0.7

    def circle(ca, cl, r, n=36):
        return [at(ca + r * math.cos(2 * math.pi * i / n), cl + r * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]

    back, front, r = 0.32, 0.68, 0.12
    bike.paint_line(d, face, circle(0.5, back, r), lw)
    bike.paint_line(d, face, circle(0.5, front, r), lw)
    hub_b, pedal, saddle, head, hub_f = (0.5, back), (0.5, 0.48), (0.36, 0.44), (0.38, 0.6), (0.5, front)
    bike.paint_line(d, face, [at(*hub_b), at(*pedal), at(*head)], lw)
    bike.paint_line(d, face, [at(*hub_b), at(*saddle), at(*head), at(*hub_f)], lw)
    bike.paint_line(d, face, [at(*pedal), at(*saddle)], lw)
    return sym


def red_of(base, face):
    """The pack's own paving turned to the bike path's red, the whole top face."""
    return bike.lane_colour(base, 'red', face)


def write():
    for folder, src, face_name in (('fallback', bike.SIDEWALK, 'drawn'), ('ours', bike.SLAB, 'free')):
        face = bike.FACES[face_name]
        red = red_of(Image.open(src).convert('RGBA'), face)
        out = os.path.join(SRC, '_rendered', folder, 'walklane')
        os.makedirs(out, exist_ok=True)
        for look, (centre, half) in LOOKS[face_name].items():
            for mask in range(16):
                piece(red, face, mask, centre, half).save(os.path.join(out, f'{look}-m{mask}.png'))
            piece(red, face, 5, centre, half, symbol=True).save(os.path.join(out, f'{look}-sym5.png'))
            piece(red, face, 10, centre, half, symbol=False).save(os.path.join(out, f'{look}-sym10.png'))
        print('wrote', os.path.relpath(out, ROOT))


if __name__ == '__main__':
    write()
