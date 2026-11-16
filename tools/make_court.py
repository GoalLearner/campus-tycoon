"""
Draws the basketball court (DESIGN.md 72): a flat court for a w by h block of cells, on the drawn pack's own grid
(512 pixels a cell, as its tiles are), and our hoop and backboard to stand at each end. The packs have no basketball
court and no hoop (the drawn pack's "BasketBallNet" is an icon of a ball in a net), so these are ours, drawn in the
pack's way: a thick plum outline, flat fills with one shade.

    court-<style>-<w>x<h>.png    the court, its ground block lined up with the pack's grid (footprint [w, h])
    hoop-<far|near>.png           a hoop for the far end (its back to the viewer) and the near end, standing on the
                                  middle of its bottom edge, where the pole meets the ground

    art/source/_rendered/ours/court/

Ours, so they may go in the public atlas. Usage:  python tools/make_court.py [--sheet]
"""
import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'ours', 'court')

CELL, RISE, BOTTOM = 512, 146, 152   # the drawn pack's grid: a cell is 512 across and 292 tall; 152 of earth below
TOP = 120                            # room above the ground block
THICK = 22                           # the slab's edge, as the pack's tiles have
SUPER = 2                            # drawn this many times larger, then shrunk

PLUM = (52, 1, 41, 255)
WHITE = (246, 244, 240, 255)
ORANGE = (236, 120, 42, 255)

STYLES = {
    # A painted outdoor court: blue, a green surround, orange keys.
    'blue': {'court': (38, 150, 214, 255), 'edge': (24, 108, 160, 255), 'surround': (92, 160, 86, 255), 'side': (62, 112, 60, 255), 'key': (232, 124, 52, 255)},
    # A wood court: honey boards, a school-colour key.
    'wood': {'court': (214, 160, 98, 255), 'edge': (176, 122, 70, 255), 'surround': (120, 84, 60, 255), 'side': (86, 58, 42, 255), 'key': (44, 74, 122, 255)},
}


def canvas_for(w, h):
    return Image.new('RGBA', (((w + h) * CELL // 2) * SUPER, ((w + h) * RISE + BOTTOM + TOP) * SUPER), (0, 0, 0, 0))


def grid(w, h):
    """Where a spot of the block lies on its canvas: cx east, cy south, in cells from the block's top corner."""
    height = (w + h) * RISE + BOTTOM + TOP
    tx, ty = h * CELL / 2, height - BOTTOM - (w + h) * RISE

    def at(cx, cy, lift=0.0):
        return ((tx + (cx - cy) * CELL / 2) * SUPER, (ty + (cx + cy) * RISE - lift) * SUPER)
    return at


def slab(w, h, s, m=0.14):
    """A w by h block's slab: its two front faces, the surround on top, and the playing surface inside it."""
    im = canvas_for(w, h)
    d = ImageDraw.Draw(im)
    at = grid(w, h)
    top = [at(0, 0), at(w, 0), at(w, h), at(0, h)]
    d.polygon([at(w, 0), at(w, h), (at(w, h)[0], at(w, h)[1] + THICK * SUPER), (at(w, 0)[0], at(w, 0)[1] + THICK * SUPER)], fill=s['side'], outline=PLUM)
    d.polygon([at(0, h), at(w, h), (at(w, h)[0], at(w, h)[1] + THICK * SUPER), (at(0, h)[0], at(0, h)[1] + THICK * SUPER)], fill=s['side'], outline=PLUM)
    d.polygon(top, fill=s['surround'], outline=PLUM)
    d.polygon([at(m, m), at(w - m, m), at(w - m, h - m), at(m, h - m)], fill=s['court'])
    return im, d, at, top


def painter(d, at):
    lw = 5 * SUPER

    def line(points, colour=WHITE, width=lw):
        d.line([at(x, y) for x, y in points], fill=colour, width=width, joint='curve')
    return line


def arc(cx, cy, r, a0, a1, n=48):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


def net(d, at, x0, x1, y, low, high):
    """A net across the court at `y`, from `x0` to `x1`: posts at its ends and a mesh from `low` to `high` above the ground."""
    a, b = at(x0, y), at(x1, y)
    for p in (a, b):
        d.line([p, (p[0], p[1] - high * SUPER)], fill=PLUM, width=9 * SUPER)
        d.line([p, (p[0], p[1] - high * SUPER)], fill=(214, 216, 226, 255), width=4 * SUPER)
    n = 14
    for k in range(n + 1):
        t = k / n
        x, yy = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        d.line([(x, yy - low * SUPER), (x, yy - high * SUPER)], fill=(40, 30, 50, 200), width=2 * SUPER)
    for hgt in [low + (high - low) * j / 4 for j in range(5)]:
        d.line([(a[0], a[1] - hgt * SUPER), (b[0], b[1] - hgt * SUPER)], fill=(40, 30, 50, 220), width=(5 if hgt == high else 2) * SUPER)
    d.line([(a[0], a[1] - high * SUPER), (b[0], b[1] - high * SUPER)], fill=WHITE, width=4 * SUPER)


def finish(im, d, top):
    d.polygon(top, outline=PLUM, width=3 * SUPER)
    return im.resize((im.width // SUPER, im.height // SUPER), Image.LANCZOS)


SPORTS = {
    'tennis': {'court': (38, 150, 214, 255), 'surround': (178, 98, 56, 255), 'side': (120, 62, 36, 255)},
    'volleyball': {'court': (230, 160, 82, 255), 'surround': (48, 122, 176, 255), 'side': (30, 82, 122, 255)},
    'soccer': {'court': (96, 170, 72, 255), 'surround': (74, 140, 58, 255), 'side': (52, 98, 42, 255)},
}


def tennis(w, h):
    """A tennis court: doubles and singles lines, the service boxes, and the net across the middle."""
    im, d, at, top = slab(w, h, SPORTS['tennis'], 0.18)
    line = painter(d, at)
    m, mid = 0.18, w / 2
    single = (w - 2 * m) * 0.13
    line([(m, m), (w - m, m), (w - m, h - m), (m, h - m), (m, m)])
    line([(m + single, m), (m + single, h - m)])
    line([(w - m - single, m), (w - m - single, h - m)])
    service = (h / 2 - m) * 0.54
    for y in (h / 2 - service, h / 2 + service):
        line([(m + single, y), (w - m - single, y)])
    line([(mid, h / 2 - service), (mid, h / 2 + service)])
    net(d, at, m - 0.06, w - m + 0.06, h / 2, 0, 30)
    return finish(im, d, top)


def volleyball(w, h):
    """A volleyball court: its outline, the centre line, the attack lines, and a high net."""
    im, d, at, top = slab(w, h, SPORTS['volleyball'], 0.22)
    line = painter(d, at)
    m = 0.22
    line([(m, m), (w - m, m), (w - m, h - m), (m, h - m), (m, m)])
    line([(m, h / 2), (w - m, h / 2)])
    third = (h / 2 - m) / 3
    line([(m, h / 2 - third), (w - m, h / 2 - third)])
    line([(m, h / 2 + third), (w - m, h / 2 + third)])
    net(d, at, m - 0.1, w - m + 0.1, h / 2, 38, 78)
    return finish(im, d, top)


def soccer(w, h):
    """A small-sided pitch: its outline, halfway line, centre circle, boxes, and a goal at each end."""
    im, d, at, top = slab(w, h, SPORTS['soccer'], 0.16)
    line = painter(d, at)
    m, mid = 0.16, w / 2
    # Mown stripes across the pitch.
    k = 0
    y0 = m
    while y0 < h - m:
        if k % 2 == 0:
            d.polygon([at(m, y0), at(w - m, y0), at(w - m, min(h - m, y0 + 0.3)), at(m, min(h - m, y0 + 0.3))], fill=(108, 182, 82, 255))
        y0 += 0.3
        k += 1
    line([(m, m), (w - m, m), (w - m, h - m), (m, h - m), (m, m)])
    line([(m, h / 2), (w - m, h / 2)])
    line(arc(mid, h / 2, 0.32, 0, 2 * math.pi))
    for end, sign in ((m, 1), (h - m, -1)):
        bw, bl = 0.62, 0.5
        line([(mid - bw, end), (mid - bw, end + sign * bl), (mid + bw, end + sign * bl), (mid + bw, end)])
        # The goal: two posts and a bar.
        gw = 0.3
        for x in (mid - gw, mid + gw):
            p = at(x, end)
            d.line([p, (p[0], p[1] - 52 * SUPER)], fill=PLUM, width=9 * SUPER)
            d.line([p, (p[0], p[1] - 52 * SUPER)], fill=WHITE, width=5 * SUPER)
        a, b = at(mid - gw, end), at(mid + gw, end)
        d.line([(a[0], a[1] - 52 * SUPER), (b[0], b[1] - 52 * SUPER)], fill=PLUM, width=9 * SUPER)
        d.line([(a[0], a[1] - 52 * SUPER), (b[0], b[1] - 52 * SUPER)], fill=WHITE, width=5 * SUPER)
    return finish(im, d, top)


def court(w, h, style):
    """The basketball court on a w by h block: the slab, the court, its lines and keys. Long side along h."""
    s = STYLES[style]
    im, d, at, top = slab(w, h, s)
    line = painter(d, at)
    m = 0.14
    mid = w / 2
    key_w, key_l = 0.34, 0.62
    for end, sign in ((m, 1), (h - m, -1)):
        # The key, painted, then its outline and the free-throw circle.
        k = [(mid - key_w, end), (mid + key_w, end), (mid + key_w, end + sign * key_l), (mid - key_w, end + sign * key_l)]
        d.polygon([at(x, y) for x, y in k], fill=s['key'])
        line(k + [k[0]])
        ft = end + sign * key_l
        line(arc(mid, ft, key_w, 0, math.pi) if sign == 1 else arc(mid, ft, key_w, math.pi, 2 * math.pi))
        # The three-point line: straight in the corners, an arc round the basket.
        basket = end + sign * 0.2
        r3 = min(w / 2 - m - 0.08, 0.86)
        corner = basket + sign * math.sqrt(max(0.0, r3 * r3 - (r3 * 0.94) ** 2))
        line([(mid - r3 * 0.94, end), (mid - r3 * 0.94, corner)])
        line([(mid + r3 * 0.94, end), (mid + r3 * 0.94, corner)])
        a = math.acos(0.94)
        line(arc(mid, basket, r3, a, math.pi - a) if sign == 1 else arc(mid, basket, r3, math.pi + a, 2 * math.pi - a))
    # The half-court line and the centre circle; the court's outline.
    line([(m, h / 2), (w - m, h / 2)])
    line(arc(mid, h / 2, 0.24, 0, 2 * math.pi))
    line([(m, m), (w - m, m), (w - m, h - m), (m, h - m), (m, m)])
    return finish(im, d, top)


def hoop(facing_viewer):
    """A hoop and backboard on a pole, for one end. `facing_viewer`: the board faces towards the viewer (the far end)."""
    W, H = 300 * SUPER, 560 * SUPER
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    gx, gy = W / 2, H - 20 * SUPER          # where the pole meets the ground
    ex, ey = CELL / 2 * SUPER, RISE * SUPER  # one cell along x, on the canvas: the board runs this way
    ux, uy = ex / math.hypot(ex, ey), ey / math.hypot(ex, ey)
    # The board stands a little into the court from the pole, which leans over from behind it.
    into = 1 if facing_viewer else -1         # into the court: towards the viewer (+y on the map) at the far end, away at the near
    yx, yy = -CELL / 2 * SUPER, RISE * SUPER  # one cell along y
    vy = (yx / math.hypot(yx, yy), yy / math.hypot(yx, yy))
    board_base = (gx + into * vy[0] * 30 * SUPER, gy + into * vy[1] * 30 * SUPER)
    bottom, top = 300 * SUPER, 400 * SUPER
    half = 62 * SUPER
    pole_w = 16 * SUPER
    # The pole, and its arm to the board.
    d.line([(gx, gy), (gx, gy - bottom + 10 * SUPER)], fill=PLUM, width=pole_w + 10 * SUPER)
    d.line([(gx, gy), (gx, gy - bottom + 10 * SUPER)], fill=(70, 74, 92, 255), width=pole_w)
    d.line([(gx, gy - bottom + 20 * SUPER), (board_base[0], board_base[1] - bottom)], fill=PLUM, width=pole_w + 4 * SUPER)
    d.line([(gx, gy - bottom + 20 * SUPER), (board_base[0], board_base[1] - bottom)], fill=(70, 74, 92, 255), width=pole_w - 6 * SUPER)

    def board_pt(along, up):
        return (board_base[0] + ux * along, board_base[1] + uy * along - up)

    def rim_pts(out, r):
        cx = board_base[0] + into * vy[0] * out
        cy = board_base[1] + into * vy[1] * out - 270 * SUPER
        return [(cx + ux * r * math.cos(t) + into * vy[0] * r * math.sin(t), cy + uy * r * math.cos(t) + into * vy[1] * r * math.sin(t)) for t in [2 * math.pi * k / 40 for k in range(41)]]

    def draw_board():
        b = [board_pt(-half, bottom), board_pt(half, bottom), board_pt(half, top), board_pt(-half, top)]
        d.polygon(b, fill=WHITE, outline=PLUM, width=6 * SUPER)
        # The painted square is on the court side: seen at the far end, not on the back of the near one.
        if facing_viewer:
            sq = [board_pt(-22 * SUPER, bottom + 12 * SUPER), board_pt(22 * SUPER, bottom + 12 * SUPER), board_pt(22 * SUPER, bottom + 50 * SUPER), board_pt(-22 * SUPER, bottom + 50 * SUPER)]
            d.line(sq + [sq[0]], fill=ORANGE, width=6 * SUPER)

    def draw_rim():
        ring = rim_pts(36 * SUPER, 30 * SUPER)
        # The net: lines down from the rim, narrowing.
        for k in range(0, 40, 4):
            x0, y0 = ring[k]
            cx = sum(p[0] for p in ring) / len(ring)
            d.line([(x0, y0), (cx + (x0 - cx) * 0.6, y0 + 52 * SUPER)], fill=WHITE, width=4 * SUPER)
        d.line(ring, fill=PLUM, width=13 * SUPER)
        d.line(ring, fill=ORANGE, width=7 * SUPER)

    # The board is behind the rim when the board faces the viewer, in front of it when it faces away.
    if facing_viewer:
        draw_board()
        draw_rim()
    else:
        draw_rim()
        draw_board()
    im = im.resize((W // SUPER, H // SUPER), Image.LANCZOS)
    return im.crop(im.getbbox())


# The basketball court's look the game uses: the owner's pick from the look sheet, "B, wood" (DESIGN.md 72; A, the
# outdoor blue, is the alternative). The recipe reads basketball-2x3.png.
CHOSEN = 'wood'


def write():
    os.makedirs(OUT, exist_ok=True)
    court(2, 3, CHOSEN).save(os.path.join(OUT, 'basketball-2x3.png'))
    for style in STYLES:
        for w, h in ((2, 3), (2, 2)):
            court(w, h, style).save(os.path.join(OUT, f'court-{style}-{w}x{h}.png'))
    tennis(2, 3).save(os.path.join(OUT, 'tennis-2x3.png'))
    volleyball(2, 3).save(os.path.join(OUT, 'volleyball-2x3.png'))
    soccer(3, 4).save(os.path.join(OUT, 'soccer-3x4.png'))
    hoop(True).save(os.path.join(OUT, 'hoop-far.png'))
    hoop(False).save(os.path.join(OUT, 'hoop-near.png'))
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    write()
