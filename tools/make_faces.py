"""
Makes the faces of the social campus's moods (DESIGN.md 63.7) from the people pack's own parts, as the sleepers of
tools/make_bed.py are made: a student's figure as the card shows it (facing south-west, the first step), with its own
mouth painted over in the colour of the face round it and one of the pack's mouths drawn in, and for a laugh its eyes
shut with the pack's own shut eyes.

    smile   Mouth1         frown   Mouth2         flat    Mouth3
    small   Mouth4         smirk   Mouth5         laugh   MouthTalking and EyesBlink

    art/source/_rendered/fallback/faces/<mood>-<look>.png    one cell of the figure's sheet, 220 by 220

Every output lives under art/source, which is never committed: it is the pack's own pixels.

Usage:  python tools/make_faces.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NPC = os.path.join(ROOT, 'art', 'source', 'penzilla', 'NPC')
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'fallback', 'faces')
# The first step facing south-west: the second row of the sheet, its first cell.
CELL = (0, 220, 220, 440)
MOUTHS = ('Mouth1', 'Mouth2', 'Mouth3', 'Mouth4', 'Mouth5', 'MouthTalking')
EYES = ('Eyes1', 'Eyes2', 'Eyes3', 'Eyes4', 'Eyes5', 'Eyes6', 'EyesGlasses')
FACES = {
    'smile': ('Mouth1', None),
    'frown': ('Mouth2', None),
    'flat': ('Mouth3', None),
    'small': ('Mouth4', None),
    'smirk': ('Mouth5', None),
    'laugh': ('MouthTalking', 'EyesBlink'),
}


def part(name):
    return Image.open(os.path.join(NPC, 'Face', f'{name}.png')).convert('RGBA').crop(CELL)


def own(cell, names):
    """Which of these parts the figure has drawn: the one whose dark pixels it shares most."""
    dark = (cell[..., 3] > 128) & (cell[..., :3].max(axis=-1) < 90)
    best, score = None, -1.0
    for name in names:
        mask = np.array(part(name))[..., 3] > 60
        share = (dark & mask).sum() / max(1, mask.sum())
        if share > score:
            best, score = mask, share
    return best


def cover(cell, mask):
    """Paint over a part with the face round it: each covered pixel takes the mean of its uncovered neighbours."""
    dark = (cell[..., 3] > 128) & (cell[..., :3].max(axis=-1) < 90)
    hidden = np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    hidden &= cell[..., 3] > 128
    known = ~hidden
    for _ in range(40):
        if not hidden.any():
            break
        total = np.zeros(cell.shape[:2] + (3,))
        count = np.zeros(cell.shape[:2])
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                shifted = np.roll(np.roll(cell[..., :3], dy, axis=0), dx, axis=1)
                ok = np.roll(np.roll(known & ~dark | (known & ~hidden & (cell[..., :3].max(axis=-1) >= 90)), dy, axis=0), dx, axis=1)
                total += shifted * ok[..., None]
                count += ok
        fill = hidden & (count > 0)
        cell[fill, :3] = total[fill] / count[fill, None]
        known = known | fill
        dark = dark & ~fill
        hidden = hidden & ~fill
    return cell


def face(look, mouth, eyes):
    sheet = Image.open(os.path.join(NPC, f'NpcReadymade_{look}.png')).convert('RGBA')
    cell = np.array(sheet.crop(CELL)).astype(float)
    cell = cover(cell, own(cell, MOUTHS))
    if eyes:
        cell = cover(cell, own(cell, EYES))
    out = Image.fromarray(cell.clip(0, 255).astype(np.uint8), 'RGBA')
    out.alpha_composite(part(mouth))
    if eyes:
        out.alpha_composite(part(eyes))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    # The student crowd, as tools/make_penzilla_recipe.py lists it.
    plain = [n for n in range(1, 17) if n not in (1, 4, 5, 6)]
    looks = [f'Character{n}' for n in plain] + [f'SportsPlayer{n}' for n in range(1, 5)]
    for look in looks:
        for mood, (mouth, eyes) in FACES.items():
            face(look, mouth, eyes).save(os.path.join(OUT, f'{mood}-{look}.png'))
    print(f'wrote {len(looks) * len(FACES)} faces into {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
