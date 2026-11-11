"""
Makes the crossing where a road meets a path: art/source/_rendered/fallback/crosswalk.png.

The drawn pack has road pieces and no crossing. This takes its straight road
piece, removes the middle lane mark, and sets four enlarged copies of that
mark side by side across the road, so the bars are the pack's own drawing and
read clearly at normal phone zoom. The result sits on the same canvas as the
pack's tiles, so the art build treats it like any other tile.

It is on the "art to fix before release" list in DESIGN.md: a drawn crossing
tile replaces it by changing one line of the recipe.

Usage:  python tools/make_crosswalk.py
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'art', 'source', 'penzilla', 'GiantCityBuilder', 'Tiles', 'Road_Tile7.png')
OUT = os.path.join(ROOT, 'art', 'source', '_rendered', 'fallback', 'crosswalk.png')

# The top face of a tile is a diamond 512 wide and 292 tall whose top corner is 68 px down.
CENTRE = (256, 68 + 146)
# Half the size of the patch that holds the middle lane mark and its outline.
PATCH = (46, 30)
# How much larger than a lane mark each bar is.
GROW = 2.0
# One step across the road, along the tile's other diagonal. The bars sit at half steps.
ACROSS = (62, 35.4)
BARS = (-1.5, -0.5, 0.5, 1.5)

tile = Image.open(SOURCE).convert('RGBA')
left, top = CENTRE[0] - PATCH[0], CENTRE[1] - PATCH[1]
patch = tile.crop((left, top, CENTRE[0] + PATCH[0], CENTRE[1] + PATCH[1]))

# The mark is everything in the patch that is not plain road.
pixels = np.asarray(patch).astype(int)
colours, counts = np.unique(pixels.reshape(-1, 4), axis=0, return_counts=True)
road = tuple(int(v) for v in colours[counts.argmax()])
mark = (np.abs(pixels - np.array(road)).sum(axis=2) > 40).astype(np.uint8) * 255
mask = Image.fromarray(mark, 'L')

out = tile.copy()
# Take the small mark away, so only the bars are left in the middle.
out.paste(Image.new('RGBA', patch.size, road), (left, top), mask)

size = (round(patch.width * GROW), round(patch.height * GROW))
bar = patch.resize(size, Image.LANCZOS)
bar_mask = mask.resize(size, Image.LANCZOS).point(lambda v: 255 if v > 96 else 0)
for step in BARS:
    x = round(CENTRE[0] + step * ACROSS[0] - size[0] / 2)
    y = round(CENTRE[1] + step * ACROSS[1] - size[1] / 2)
    out.paste(bar, (x, y), bar_mask)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
out.save(OUT)
print('wrote', os.path.relpath(OUT, ROOT))
