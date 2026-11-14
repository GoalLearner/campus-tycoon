"""Build the game's art from a recipe.

Reads art/recipes/<name>.json, puts each game sprite together from source art
in art/source (which is not committed), packs the sprites into one atlas, and
writes:

    atlas.png      the packed sprites
    atlas.json     frame rectangles, in the format Phaser reads
    manifest.json  what the game looks up: sprite, anchor, footprint, people, tree names
    CREDITS.md     each pack in use and its licence (in the repository root)

A normal recipe writes into public/assets. A recipe marked "private": true is a
paid pack: it writes into art/private, which is git-ignored, and never into
public/assets.

The game never names a source file. Swapping art means editing a recipe, never
the code.

A sprite is a list of layers, drawn in order. A layer is either

    ["L", 67, -66, 0]            a numbered tile from "sources", pasted with its
                                 top-left corner at that offset from the top
                                 corner of the cell's ground diamond

or an object with any of:

    "file":     a file under art/source            (or "tile": ["L", 67])
    "crop":     [left, top, right, bottom] in the file's own pixels
    "cut":      a list of [x, y] points in the file's own pixels: only the
                inside of that outline is kept
    "paste":    [{"file": ..., "box": [left, top, right, bottom]}]: other
                pictures shrunk into boxes of this one before anything else
    "scale":    size change for this layer, on top of the recipe's "scale"
    "recolour": the name of a rule under "recolours"
    "swap":     the name of a rule under "swaps": one exact colour replaced by
                another, used to hide a tile's drawn rim so tiles join cleanly
    "glass":    the name of a rule under "glass": everything but the window
                glass is cleared and the glass takes the rule's colour, for the
                lit windows the game lays over a building at night
    "flip":     true to mirror it
    "at":       [dx, dy] top-left corner, as above
    "stand":    [x, y] in cells: the middle of the picture's bottom edge is put
                on that spot of the cell, so [0.5, 0.5] stands it in the middle
    "footprint": [w, h] in cells, for packs that draw every picture on a canvas
                lined up with the ground grid (see "canvas" in the recipe). The
                picture is placed so its ground meets a w by h block of cells
                whose top corner is this cell. "shift": [x, y] in cells moves it.
    "render":   [w, h] in cells, for a picture made from a 3D model by the page
                tools/render/model.html. The notes saved beside the picture say
                where the model's ground middle is and how big it is, so the
                picture is sized to fill a w by h block of cells and stood on
                its middle. For buildings no pack draws, until drawn art arrives.
    "lift":     pixels to raise a standing picture, for art with space under it
    "shadow":   [radius x, radius y, darkness 0-255] a soft shadow under a
                standing picture

Needs Python 3 with Pillow and numpy.  Usage:  python tools/build_art.py [recipe-name]
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, 'art', 'source')
OUT_DIR = os.path.join(ROOT, 'public', 'assets')
PRIVATE_DIR = os.path.join(ROOT, 'art', 'private')
PADDING = 3          # clear pixels around every sprite, so shrunken views do not bleed
CANVAS = 768         # scratch canvas each sprite is put together on
ORIGIN = (CANVAS // 2, CANVAS // 2)
DIRECTIONS = ('se', 'sw', 'nw', 'ne')


def load_recipe(name):
    with open(os.path.join(ROOT, 'art', 'recipes', name + '.json'), encoding='utf-8') as f:
        return json.load(f)


def resized(im, factor):
    if abs(factor - 1.0) < 1e-6:
        return im
    size = (max(1, round(im.width * factor)), max(1, round(im.height * factor)))
    return im.resize(size, Image.LANCZOS)


def recoloured(im, rule):
    """Move the pixels whose hue lies in rule["from"] (degrees) to the hue rule["to"].

    "saturation" and "value" scale those pixels. Everything else is left alone,
    so a tree keeps its trunk while its leaves change colour.
    """
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a[..., :3].max(axis=-1)
    mn = a[..., :3].min(axis=-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rm = nz & (mx == r)
    gm = nz & (mx == g) & ~rm
    bm = nz & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h *= 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    v = mx

    lo, hi = rule['from']
    mask = (h >= lo) & (h <= hi) & (s >= rule.get('minSaturation', 0.12))
    h = np.where(mask, rule['to'], h)
    s = np.clip(np.where(mask, s * rule.get('saturation', 1.0), s), 0, 1)
    v = np.clip(np.where(mask, v * rule.get('value', 1.0), v), 0, 1)

    c = v * s
    hp = (h / 60.0) % 6
    x = c * (1 - np.abs(hp % 2 - 1))
    zero = np.zeros_like(c)
    sector = np.floor(hp).astype(int)
    rgb = np.select(
        [sector[..., None] == k for k in range(6)],
        [np.stack(t, axis=-1) for t in ((c, x, zero), (x, c, zero), (zero, c, x), (zero, x, c), (x, zero, c), (c, zero, x))],
    )
    out = np.concatenate([rgb + (v - c)[..., None], a[..., 3:4]], axis=-1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def glass_only(im, rule):
    """Keep only the pixels close to rule["from"], in the colour rule["to"]. Used on the file's own pixels, before shrinking."""
    a = np.asarray(im.convert('RGBA')).astype(np.int16)
    near = (np.abs(a[..., :3] - np.array(rule['from'], dtype=np.int16)).max(axis=-1) <= rule.get('within', 10)) & (a[..., 3] > 200)
    out = np.zeros_like(a)
    out[..., :3][near] = np.array(rule['to'], dtype=np.int16)
    out[..., 3][near] = 255
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def swapped(im, rule):
    """Replace every pixel close to rule["from"] with rule["to"]. Used on the file's own pixels, before shrinking."""
    a = np.asarray(im.convert('RGBA')).astype(np.int16)
    near = np.abs(a[..., :3] - np.array(rule['from'], dtype=np.int16)).max(axis=-1) <= rule.get('within', 10)
    if 'above' in rule:  # only rows above this line of the picture
        rows = np.arange(a.shape[0])[:, None] < rule['above']
        near = near & rows
    out = a.copy()
    out[..., :3][near] = np.array(rule['to'], dtype=np.int16)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def soft_shadow(canvas, centre, radius_x, radius_y, darkness):
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    cx, cy = centre
    ImageDraw.Draw(layer).ellipse((cx - radius_x, cy - radius_y, cx + radius_x, cy + radius_y), fill=(20, 30, 20, darkness))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(max(1.0, radius_y * 0.35))))


class Builder:
    def __init__(self, recipe):
        self.recipe = recipe
        self.scale = recipe.get('scale', 1.0)
        self.half_w = recipe['tile']['halfWidth']
        self.half_h = recipe['tile']['halfHeight']
        self.cache = {}

    def open(self, relative):
        path = os.path.join(SOURCE_DIR, relative)
        if path not in self.cache:
            self.cache[path] = Image.open(path).convert('RGBA')
        return self.cache[path]

    def numbered(self, key, number):
        return self.open(self.recipe['sources'][key] % number)

    def cell_point(self, x, y):
        """Where a spot on the cell falls on the scratch canvas. (0, 0) is the top corner."""
        ox, oy = ORIGIN
        return (ox + (x - y) * self.half_w, oy + (x + y) * self.half_h)

    def draw_layer(self, canvas, layer):
        ox, oy = ORIGIN
        if isinstance(layer, list):
            key, number, dx, dy = layer
            canvas.alpha_composite(resized(self.numbered(key, number), self.scale), (ox + dx, oy + dy))
            return

        im = self.numbered(*layer['tile']) if 'tile' in layer else self.open(layer['file'])
        if 'swap' in layer:
            im = swapped(im, self.recipe['swaps'][layer['swap']])
        if 'glass' in layer:
            im = glass_only(im, self.recipe['glass'][layer['glass']])
        if 'paste' in layer:
            im = im.copy()
            for extra in layer['paste']:
                left, top, right, bottom = extra['box']
                piece = self.open(extra['file'])
                piece = piece.crop(piece.getbbox())
                fit = min((right - left) / piece.width, (bottom - top) / piece.height)
                piece = resized(piece, fit)
                im.alpha_composite(piece, (round((left + right - piece.width) / 2), round((top + bottom - piece.height) / 2)))
        if 'cut' in layer:
            mask = Image.new('L', im.size, 0)
            ImageDraw.Draw(mask).polygon([tuple(point) for point in layer['cut']], fill=255)
            clear = Image.new('RGBA', im.size, (0, 0, 0, 0))
            im = Image.composite(im, clear, mask)
        if 'render' in layer:
            with open(os.path.join(SOURCE_DIR, os.path.splitext(layer['file'])[0] + '.json'), encoding='utf-8') as handle:
                notes = json.load(handle)
            w, h = layer['render']
            # The model's long side fills the long side of the block. One cell edge is half a cell wide on screen.
            long_side = max(notes['modelGroundSize']) * notes['pixelsPerUnitAcross']
            factor = max(w, h) * self.half_w / long_side * layer.get('scale', 1.0)
            ground_x, ground_y = notes['groundMiddle']
            px, py = self.cell_point(w / 2, h / 2)
            im = resized(im, factor)
            canvas.alpha_composite(im, (round(px - ground_x * factor), round(py - ground_y * factor)))
            return
        if 'footprint' in layer:
            # The pack's own grid, in the file's pixels: where this picture's ground block begins.
            grid = self.recipe['canvas']
            w, h = layer['footprint']
            corner_x = h * grid['cell'] / 2
            corner_y = im.height - grid['bottom'] - (w + h) * grid['rise']
            factor = self.scale * layer.get('scale', 1.0)
            sx, sy = layer.get('shift', [0, 0])
            px, py = self.cell_point(sx, sy)
            if layer.get('flip'):
                # Mirrored about the middle of the picture, which is the middle of a square block of cells.
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
                corner_x = im.width - corner_x
            im = resized(im, factor)
            if 'recolour' in layer:
                im = recoloured(im, self.recipe['recolours'][layer['recolour']])
            canvas.alpha_composite(im, (round(px - corner_x * factor), round(py - corner_y * factor)))
            return
        if 'crop' in layer:
            im = im.crop(tuple(layer['crop']))
        if 'stand' in layer:
            box = im.getbbox()
            if box:
                im = im.crop(box)
        im = resized(im, self.scale * layer.get('scale', 1.0))
        if 'recolour' in layer:
            im = recoloured(im, self.recipe['recolours'][layer['recolour']])
        if layer.get('flip'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)

        if 'stand' in layer:
            px, py = self.cell_point(*layer['stand'])
            if 'shadow' in layer:
                soft_shadow(canvas, (px, py), *layer['shadow'])
            canvas.alpha_composite(im, (round(px - im.width / 2), round(py - im.height + layer.get('lift', 0) * -1)))
        else:
            dx, dy = layer.get('at', [0, 0])
            canvas.alpha_composite(im, (ox + dx, oy + dy))

    def compose(self, spec):
        """Returns (image trimmed to its pixels, anchor inside it).

        The anchor is where the top corner of the cell's ground diamond falls.
        """
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        ox, oy = ORIGIN
        if 'layers' in spec:
            for layer in spec['layers']:
                self.draw_layer(canvas, layer)
        else:
            self.stack(canvas, spec['stack'])
        # One face of a building only: the wall left of its front corner, or the wall right of it.
        if spec.get('side') == 'sw':
            canvas.paste((0, 0, 0, 0), (ox, 0, CANVAS, CANVAS))
        elif spec.get('side') == 'se':
            canvas.paste((0, 0, 0, 0), (0, 0, ox, CANVAS))
        box = canvas.getbbox()
        if box is None:
            raise ValueError('empty sprite')
        return canvas.crop(box), (ox - box[0], oy - box[1])

    def stack(self, canvas, stack):
        rules = self.recipe['stack']
        ox, oy = ORIGIN
        ground = self.numbered('B', stack['ground'])
        top = oy + rules['groundBottom'] - ground.height
        canvas.alpha_composite(ground, (ox - ground.width // 2, top))
        for upper in stack['uppers']:
            piece = self.numbered('B', upper)
            top -= rules['storeyHeight']
            canvas.alpha_composite(piece, (ox - piece.width // 2, top))
        if stack.get('roof') is not None:
            piece = self.numbered('B', stack['roof'])
            canvas.alpha_composite(piece, (ox - piece.width // 2, top - (piece.height - rules['roofSeat'])))

    # ------------------------------------------------------------ people --

    def people(self, spec):
        """Cut walking people out of sprite sheets.

        Each sheet is a grid: one row per drawn direction, one column per frame.
        Every person is shrunk to the same standing height, and every frame of
        a person keeps the same feet point, so the walk does not jitter.
        Returns {sprite name: (image, anchor)}; the anchor is the feet.
        """
        sprites = {}
        cell_w, cell_h = spec['cell']
        frames = spec['frames']
        rows = spec['rows']                      # {"sw": 0, "nw": 1}: direction -> row of the sheet
        feet = spec.get('feet')                  # the standing point inside a cell, or None for bottom middle
        for look, relative in enumerate(spec['looks']):
            sheet = self.open(relative)
            cells = {}
            up = side = down = 0
            # With no feet point given, the person stands at the lowest pixel of the whole
            # sheet, so a bob up and down is kept rather than flattened.
            lowest = 0
            if not feet:
                for row in rows.values():
                    for f in range(frames):
                        box = sheet.crop((f * cell_w, row * cell_h, (f + 1) * cell_w, (row + 1) * cell_h)).getbbox()
                        if box:
                            lowest = max(lowest, box[3])
            for direction, row in rows.items():
                for f in range(frames):
                    cell = sheet.crop((f * cell_w, row * cell_h, (f + 1) * cell_w, (row + 1) * cell_h))
                    box = cell.getbbox()
                    if box is None:
                        raise ValueError(f'{relative}: empty frame {direction} {f}')
                    fx, fy = feet if feet else (cell_w / 2, lowest)
                    cells[(direction, f)] = (cell, fx, fy)
                    up = max(up, fy - box[1])
                    down = max(down, box[3] - fy)
                    side = max(side, fx - box[0], box[2] - fx)
            # Height is measured on the first frame of the first row, which stands closest to upright.
            first = cells[(next(iter(rows)), 0)]
            standing = first[2] - first[0].getbbox()[1]
            factor = spec['height'] / standing
            for (direction, f), (cell, fx, fy) in cells.items():
                left, top = int(fx - side) - 1, int(fy - up) - 1
                right, bottom = int(fx + side) + 2, int(fy + down) + 2
                piece = resized(cell.crop((left, top, right, bottom)), factor)
                anchor = ((fx - left) * factor, (fy - top) * factor)
                if 'shadow' in spec:
                    pad = 4
                    canvas = Image.new('RGBA', (piece.width + pad * 2, piece.height + pad * 2), (0, 0, 0, 0))
                    anchor = (anchor[0] + pad, anchor[1] + pad)
                    soft_shadow(canvas, anchor, *spec['shadow'])
                    canvas.alpha_composite(piece, (pad, pad))
                    piece = canvas
                box = piece.getbbox()
                sprites[f'person.{look}.{direction}.{f}'] = (piece.crop(box), (round(anchor[0] - box[0]), round(anchor[1] - box[1])))
            # Asleep: one more picture of this person, a single cell drawn where their first cell is, cut the same.
            sleep = spec.get('sleep', [])
            if look < len(sleep):
                fx, fy = cells[(next(iter(rows)), 0)][1:]
                cell = self.open(sleep[look])
                left, top = int(fx - side) - 1, int(fy - up) - 1
                right, bottom = int(fx + side) + 2, int(fy + down) + 2
                piece = resized(cell.crop((left, top, right, bottom)), factor)
                anchor = ((fx - left) * factor, (fy - top) * factor)
                box = piece.getbbox()
                sprites[f'person.{look}.sleep'] = (piece.crop(box), (round(anchor[0] - box[0]), round(anchor[1] - box[1])))
            # Moods (DESIGN.md 63.7): their first south-west step with another face, cut the same as that step.
            for mood, files in spec.get('moods', {}).items():
                if look >= len(files):
                    continue
                fx, fy = cells[(next(iter(rows)), 0)][1:]
                cell = self.open(files[look])
                left, top = int(fx - side) - 1, int(fy - up) - 1
                right, bottom = int(fx + side) + 2, int(fy + down) + 2
                piece = resized(cell.crop((left, top, right, bottom)), factor)
                anchor = ((fx - left) * factor, (fy - top) * factor)
                box = piece.getbbox()
                sprites[f'person.{look}.mood.{mood}'] = (piece.crop(box), (round(anchor[0] - box[0]), round(anchor[1] - box[1])))
        return sprites


def pack(sprites, width, height):
    """Shelf packing, tallest first. Returns {name: (x, y)} or None if it does not fit."""
    order = sorted(sprites, key=lambda n: (-sprites[n][0].height, n))
    x = y = PADDING
    shelf = 0
    placed = {}
    for name in order:
        im = sprites[name][0]
        if x + im.width + PADDING > width:
            x = PADDING
            y += shelf + PADDING
            shelf = 0
        if y + im.height + PADDING > height:
            return None
        placed[name] = (x, y)
        x += im.width + PADDING
        shelf = max(shelf, im.height)
    return placed


def all_recipes():
    """Every recipe in art/recipes, with the built-in pack first."""
    folder = os.path.join(ROOT, 'art', 'recipes')
    names = sorted(f[:-5] for f in os.listdir(folder) if f.endswith('.json'))
    recipes = [load_recipe(n) for n in names]
    return sorted(recipes, key=lambda r: (bool(r.get('private')), r['pack']))


def write_credits():
    lines = [
        '# Credits',
        '',
        'Campus Tycoon uses the art below. This file is written by `tools/build_art.py` from the art recipes.',
        '',
    ]
    for recipe in all_recipes():
        for c in recipe['credits']:
            where = ('Used in builds that are given the private art pack.' if recipe.get('private')
                     else 'Built into this repository. Every build can fall back to it.')
            lines += [
                '## ' + c['name'],
                '',
                '- **By:** ' + c['author'],
                '- **Licence:** ' + c['licence'] + ' (' + c['licenceUrl'] + ')',
                '- **From:** ' + c['source'],
                '- **Changes made:** ' + c['changes'],
                '- **Where:** ' + where,
                '',
            ]
    lines += [
        '## Interface Sounds, UI Audio and Music Jingles',
        '',
        '- **By:** Kenney Vleugels (www.kenney.nl)',
        '- **Licence:** Creative Commons Zero (CC0) (http://creativecommons.org/publicdomain/zero/1.0/)',
        '- **From:** https://kenney.nl/assets',
        '- **Changes made:** Six files are used, each made mono, trimmed of its opening silence and saved as WAV: the tap (UI Audio, click3), something built (Interface Sounds, drop_002), something that could not be done (Interface Sounds, error_008), and the tunes for a win, a loss and a reward (Music Jingles, Pizzicato 02, 01 and 10).',
        '- **Where:** Built into this repository, in `public/assets/sound`. Every build.',
        '',
        '## The emotes and bubbles',
        '',
        '- **By:** Made for this game.',
        '- **Licence:** None needed.',
        '- **From:** `tools/make_emotes.py`, drawn in code in the people pack' + "'" + 's way: a speech bubble, a thought cloud, a heart, a broken heart, a sparkle, a laugh, a sad cloud, an anger mark, a music note, a party cup, a soda cup, an exclamation mark and a sweat drop; four greetings (a wave, a high five, a fist bump, a hug); and chat bubbles with what students talk about inside (sports, gaming, music, fitness, parties, studying, art, fashion, and a heart).',
        '- **Changes made:** None. Each is one file named in the art recipes, so it can be swapped for a drawn one.',
        '- **Where:** Every build.',
        '',
        '## The soundscape and the music',
        '',
        '- **By:** Made for this game, in code.',
        '- **Licence:** None needed.',
        '- **From:** `src/app/sound.ts`. Made while the game runs, from plain tones and filtered noise: footsteps and chatter, traffic, birds, crickets, rain, the stadium crowd, the bell on the hour, the busker and the background music.',
        '- **Changes made:** None. If a recorded sound ever replaces one of these, its page, author and licence are listed here first.',
        '- **Where:** Every build.',
        '',
    ]
    with open(os.path.join(ROOT, 'CREDITS.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'kenney'
    recipe = load_recipe(name)
    builder = Builder(recipe)

    sprites = {}
    for key, spec in recipe['sprites'].items():
        try:
            sprites[key] = builder.compose(spec)
        except Exception as err:
            # A wall with no windows has no lit windows: that sprite is simply not made.
            if spec.get('optional') and str(err) == 'empty sprite':
                continue
            raise SystemExit(f'Could not build sprite "{key}": {err}')

    people = recipe.get('people')
    if people:
        sprites.update(builder.people(people))

    # A power-of-two atlas, so the browser can build smaller copies for zoomed-out views. It may be twice
    # as wide as it is tall: a phone holds the whole picture in memory, so it is never larger than it must be.
    placed = None
    width = height = 0
    for width, height in ((512, 512), (1024, 512), (1024, 1024), (2048, 1024), (2048, 2048), (4096, 2048), (4096, 4096)):
        placed = pack(sprites, width, height)
        if placed is not None:
            break
    if placed is None:
        raise SystemExit('The sprites do not fit in a 4096 atlas.')

    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    frames = {}
    manifest_sprites = {}
    for key, (x, y) in placed.items():
        im, anchor = sprites[key]
        atlas.alpha_composite(im, (x, y))
        frames[key] = {
            'frame': {'x': x, 'y': y, 'w': im.width, 'h': im.height},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height},
            'sourceSize': {'w': im.width, 'h': im.height},
        }
        manifest_sprites[key] = {
            'frame': key,
            'anchor': [anchor[0], anchor[1]],
            'footprint': recipe.get('footprints', {}).get(key, [1, 1]),
        }

    # A recipe marked private is a paid pack. Its atlas goes to art/private, which is
    # git-ignored, and never into public/assets.
    out_dir = PRIVATE_DIR if recipe.get('private') else OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, 'atlas.png'), optimize=True)
    with open(os.path.join(out_dir, 'atlas.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'frames': dict(sorted(frames.items())),
                   'meta': {'image': 'atlas.png', 'format': 'RGBA8888',
                            'size': {'w': width, 'h': height}, 'scale': '1'}}, f, indent=1)
        f.write('\n')
    manifest = {
        'version': 1,
        'pack': recipe['pack'],
        'tile': recipe['tile'],
        'atlas': {'image': 'atlas.png', 'data': 'atlas.json'},
        'sprites': dict(sorted(manifest_sprites.items())),
        'credits': recipe['credits'],
    }
    if recipe.get('menuCredit'):
        manifest['menuCredit'] = recipe['menuCredit']
    if recipe.get('trees'):
        manifest['trees'] = recipe['trees']
    if people:
        looks = len(people['looks'])
        manifest['people'] = {'looks': looks, 'frames': people['frames'], 'frameMs': people['frameMs']}
        for key in ('flip', 'crowd', 'roles'):
            if people.get(key):
                manifest['people'][key] = people[key]
    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    write_credits()
    print(f'{len(sprites)} sprites packed into a {width} x {height} atlas in {os.path.relpath(out_dir, ROOT)}.')


if __name__ == '__main__':
    main()
