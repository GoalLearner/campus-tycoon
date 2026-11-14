"""
Makes the sidewalk along the town's streets and the campus roads (DESIGN.md
section 59): art/source/_rendered/fallback/kerb/kerb-<edges>-<corners>.png,
and the paved pad of a house's driveway: .../kerb/drive.png.

The houses of the drawn pack fill their whole cell, so a sidewalk laid on the
lots beside a street would be hidden under them. It is laid inside the
street's own cell instead: a narrow strip of slabs along each side of the road
that meets no more road, and a small square slab on an inside corner where a
side street opens off. The slabs are drawn in the pack's own sidewalk colours
and outline (GiantCityBuilder/Tiles/Sidewalk_Tile1-9: the same raised slab,
its fill, its outline and its edge), only narrower: a quarter-cell slab is half
a cell deep, which would leave no road.

Edges count as the road pieces do: 1 the side toward y - 1, 2 toward x + 1,
4 toward y + 1, 8 toward x - 1. Corners: 1 between the first two, 2 between
the second and third, and so on round. A quarter turn of the view moves each
bit to the next, as it does for the roads.

The driveway is a flat pad in the colours of the pack's concrete tile
(Tiles/Concreet.png), with grass either side, from the street to the back of
the lot. It is the same both ways round, so it needs no turning of its own.

Each picture sits on the same 512-wide canvas as the pack's tiles, so the art
build lines it up with the ground like any other tile.

Usage:  python tools/make_sidewalk.py
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'fallback', 'kerb')

# How deep the sidewalk is, as a share of the cell. The game's walkers keep to its middle (KERB_WIDTH in
# src/app/traffic.ts), and the two numbers must agree.
DEPTH = 0.16
# The pack's canvas: a top face 512 wide and 292 tall, its top corner 68 pixels down.
TOP = (256, 68)
HALF_W, HALF_H = 256, 146
# The pack's slab: raised a little above the ground, with an edge showing on its near sides.
LIFT = 7
EDGE = 12
FILL = (119, 110, 133, 255)
SIDE = (103, 83, 111, 255)
LINE = (86, 57, 88, 255)
LINE_WIDTH = 9
CONCRETE = (129, 127, 148, 255)
# The driveway pad: its sides, as shares of the cell across it.
DRIVE = (0.17, 0.83)

# The four sides of a cell, in its own (u along x, v along y) and the corners at their ends.
# A side is a line from one corner of the cell to the next, going round.
CORNERS = {'n': (0, 0), 'e': (1, 0), 's': (1, 1), 'w': (0, 1)}  # top, right, bottom and left corners as drawn
SIDES = [(1, 'n', 'e'), (2, 'e', 's'), (4, 's', 'w'), (8, 'w', 'n')]  # bit, from corner, to corner
# The corner bits, each the corner shared by two sides: 1 the right corner, 2 the bottom, 4 the left, 8 the top.
CORNER_BITS = [(1, 'e', 1, 2), (2, 's', 2, 4), (4, 'w', 4, 8), (8, 'n', 8, 1)]  # bit, corner, side, side


def screen(u, v, drop=0.0):
    return (TOP[0] + (u - v) * HALF_W, TOP[1] + (u + v) * HALF_H + drop)


def inward(corner):
    """From a corner of the cell, the two directions along its sides, into the cell."""
    u, v = CORNERS[corner]
    return (1 - 2 * u, 1 - 2 * v)


def slab(draw, quad):
    """One raised slab whose top face is the four points `quad` in the cell's own terms."""
    top = [screen(u, v, -LIFT) for u, v in quad]
    low = [screen(u, v, EDGE - LIFT) for u, v in quad]
    # Its near edge: everything between the top face and the same face dropped to the ground.
    hull = sorted(top + low)
    draw.polygon(_hull(hull), fill=SIDE, outline=LINE, width=LINE_WIDTH)
    draw.polygon(top, fill=FILL, outline=LINE, width=LINE_WIDTH)


def _hull(points):
    """The outline round a set of points (Andrew's monotone chain)."""
    points = sorted(set(points))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def square_at(corner):
    """A slab DEPTH by DEPTH in a corner of the cell."""
    u, v = CORNERS[corner]
    du, dv = inward(corner)
    u1, v1 = u + du * DEPTH, v + dv * DEPTH
    return [(u, v), (u1, v), (u1, v1), (u, v1)]


def strip(bit, start, end):
    """Slabs along one side, from `start` to `end` of its length (0 to 1), in two even pieces."""
    _, a, b = next(side for side in SIDES if side[0] == bit)
    ua, va = CORNERS[a]
    ub, vb = CORNERS[b]
    # Into the cell from this side: the direction across it.
    mid_u, mid_v = (ua + ub) / 2, (va + vb) / 2
    iu, iv = 0.5 - mid_u, 0.5 - mid_v
    norm = max(abs(iu), abs(iv))
    iu, iv = iu / norm * DEPTH, iv / norm * DEPTH
    pieces = []
    for n in range(2):
        t0 = start + (end - start) * n / 2
        t1 = start + (end - start) * (n + 1) / 2
        p0 = (ua + (ub - ua) * t0, va + (vb - va) * t0)
        p1 = (ua + (ub - ua) * t1, va + (vb - va) * t1)
        pieces.append([p0, p1, (p1[0] + iu, p1[1] + iv), (p0[0] + iu, p0[1] + iv)])
    return pieces


def kerb(edges, corners):
    """Every slab for one cell: the strips along `edges`, and the squares in `corners`."""
    slabs = []
    for bit, a, b in SIDES:
        if not edges & bit:
            continue
        # Where the next side round is kerbed too, the square in that corner is drawn once, apart.
        before = SIDES[(SIDES.index((bit, a, b)) - 1) % 4][0]
        after = SIDES[(SIDES.index((bit, a, b)) + 1) % 4][0]
        start = DEPTH if edges & before else 0.0
        end = 1 - DEPTH if edges & after else 1.0
        slabs += strip(bit, start, end)
        if edges & after:
            slabs.append(square_at(b))
    for bit, corner, side_a, side_b in CORNER_BITS:
        if corners & bit:
            slabs.append(square_at(corner))
    return slabs


def allowed(edges, corners):
    """A corner square only where neither side at that corner has a strip."""
    if edges == 0 and corners == 0:
        return False
    return all(not (corners & bit) or not (edges & (side_a | side_b)) for bit, _, side_a, side_b in CORNER_BITS)


def draw_kerb(edges, corners):
    image = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Back to front, so a near slab's edge is drawn over the slab behind it.
    for quad in sorted(kerb(edges, corners), key=lambda q: sum(u + v for u, v in q)):
        slab(draw, quad)
    return image


def draw_drive():
    image = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    a, b = DRIVE
    ImageDraw.Draw(image).polygon([screen(a, 0), screen(b, 0), screen(b, 1), screen(a, 1)], fill=CONCRETE, outline=LINE, width=LINE_WIDTH)
    return image


def combinations():
    return [(edges, corners) for edges in range(16) for corners in range(16) if allowed(edges, corners)]


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    made = 0
    for edges, corners in combinations():
        draw_kerb(edges, corners).save(os.path.join(OUT, f'kerb-{edges}-{corners}.png'))
        made += 1
    draw_drive().save(os.path.join(OUT, 'drive.png'))
    print('wrote', made, 'sidewalk pieces to', os.path.relpath(OUT, ROOT))
