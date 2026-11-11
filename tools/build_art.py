"""Build the game's art from a recipe.

Reads art/recipes/<name>.json, puts each game sprite together from the source
pack in art/source (which is not committed), packs the sprites into one atlas,
and writes:

    public/assets/atlas.png      the packed sprites
    public/assets/atlas.json     frame rectangles, in the format Phaser reads
    public/assets/manifest.json  what the game looks up: sprite, anchor, footprint
    CREDITS.md                   each pack in use and its licence

The game never names a source file. Swapping art means editing the recipe or
the manifest, never the code.

Needs Python 3 and Pillow.  Usage:  python tools/build_art.py [recipe-name]
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, 'art', 'source')
OUT_DIR = os.path.join(ROOT, 'public', 'assets')
PRIVATE_DIR = os.path.join(ROOT, 'art', 'private')
PADDING = 4          # clear pixels around every sprite, so shrunken views do not bleed
CANVAS = 512         # scratch canvas each sprite is put together on
ORIGIN = (CANVAS // 2, CANVAS // 2)


def load_recipe(name):
    with open(os.path.join(ROOT, 'art', 'recipes', name + '.json'), encoding='utf-8') as f:
        return json.load(f)


class Builder:
    def __init__(self, recipe):
        self.recipe = recipe
        self.cache = {}

    def source(self, key, number):
        path = os.path.join(SOURCE_DIR, self.recipe['sources'][key] % number)
        if path not in self.cache:
            self.cache[path] = Image.open(path).convert('RGBA')
        return self.cache[path]

    def compose(self, spec):
        """Returns (image trimmed to its pixels, anchor inside it).

        The anchor is where the top corner of the cell's ground diamond falls.
        """
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        ox, oy = ORIGIN
        if 'layers' in spec:
            for key, number, dx, dy in spec['layers']:
                canvas.alpha_composite(self.source(key, number), (ox + dx, oy + dy))
        else:
            self.stack(canvas, spec['stack'])
        box = canvas.getbbox()
        if box is None:
            raise ValueError('empty sprite')
        return canvas.crop(box), (ox - box[0], oy - box[1])

    def stack(self, canvas, stack):
        rules = self.recipe['stack']
        ox, oy = ORIGIN
        ground = self.source('B', stack['ground'])
        top = oy + rules['groundBottom'] - ground.height
        canvas.alpha_composite(ground, (ox - ground.width // 2, top))
        for upper in stack['uppers']:
            piece = self.source('B', upper)
            top -= rules['storeyHeight']
            canvas.alpha_composite(piece, (ox - piece.width // 2, top))
        if stack.get('roof') is not None:
            piece = self.source('B', stack['roof'])
            canvas.alpha_composite(piece, (ox - piece.width // 2, top - (piece.height - rules['roofSeat'])))


def pack(sprites, size):
    """Shelf packing, tallest first. Returns {name: (x, y)} or None if it does not fit."""
    order = sorted(sprites, key=lambda n: (-sprites[n][0].height, n))
    x = y = PADDING
    shelf = 0
    placed = {}
    for name in order:
        im = sprites[name][0]
        if x + im.width + PADDING > size:
            x = PADDING
            y += shelf + PADDING
            shelf = 0
        if y + im.height + PADDING > size:
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
    with open(os.path.join(ROOT, 'CREDITS.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'kenney'
    recipe = load_recipe(name)
    builder = Builder(recipe)

    sprites = {}
    for key, spec in recipe['sprites'].items():
        sprites[key] = builder.compose(spec)

    # A power-of-two atlas, so the browser can build smaller copies for zoomed-out views.
    size = 256
    placed = None
    while placed is None:
        size *= 2
        if size > 4096:
            raise SystemExit('The sprites do not fit in a 4096 atlas.')
        placed = pack(sprites, size)

    atlas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
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
                            'size': {'w': size, 'h': size}, 'scale': '1'}}, f, indent=1)
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
    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    write_credits()
    print(f'{len(sprites)} sprites packed into a {size} x {size} atlas in {os.path.relpath(out_dir, ROOT)}.')


if __name__ == '__main__':
    main()
