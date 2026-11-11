"""
Makes the crossing where a road meets a path: art/source/_rendered/fallback/crosswalk.png.

The drawn pack has road pieces and no crossing. This takes its straight road
piece and repeats that piece's own middle lane mark side by side across the
road, so the bars are the pack's own drawing. The result sits on the same
canvas as the pack's tiles, so the art build treats it like any other tile.

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
# Steps across the road, along the tile's other diagonal.
ACROSS = (52, 30)

tile = Image.open(SOURCE).convert('RGBA')
left, top = CENTRE[0] - PATCH[0], CENTRE[1] - PATCH[1]
patch = tile.crop((left, top, CENTRE[0] + PATCH[0], CENTRE[1] + PATCH[1]))

# Keep only the mark: everything in the patch that is not plain road.
pixels = np.asarray(patch).astype(int)
colours, counts = np.unique(pixels.reshape(-1, 4), axis=0, return_counts=True)
road = colours[counts.argmax()]
mark = (np.abs(pixels - road).sum(axis=2) > 40).astype(np.uint8) * 255
mask = Image.fromarray(mark, 'L')

out = tile.copy()
for step in (-2, -1, 1, 2):
    out.paste(patch, (left + step * ACROSS[0], top + step * ACROSS[1]), mask)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
out.save(OUT)
print('wrote', os.path.relpath(OUT, ROOT))
