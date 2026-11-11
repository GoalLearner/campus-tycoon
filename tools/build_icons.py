"""Build the placeholder iOS app icon and launch image.

Draws the same picture as the home-screen web icon: one campus building on a
green hill. The building comes from the built-in Kenney atlas, so this needs no
downloaded packs. Replace it with real artwork before a store release.

Writes into the Xcode asset catalog:

    AppIcon.appiconset/AppIcon-512@2x.png   1024 x 1024, no transparency
    Splash.imageset/splash-2732x2732*.png   2732 x 2732, one per scale

Xcode builds every smaller icon size from the single 1024 image, and the launch
screen scales the one launch image to fill any screen, so these are all the
sizes an iOS app needs.

Needs Python 3 and Pillow.  Usage:  python tools/build_icons.py
"""
import json
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'public', 'assets')
CATALOG = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets')

SKY = (47, 79, 62)        # the dark green behind the building
HILL = (122, 176, 80)     # the lawn
SPLASH_BG = (53, 82, 63)  # the game's page colour, #35523f
SPRITE = 'housing.2.0'    # a two-storey hall


def building():
    """Cut the building out of the atlas and trim the clear pixels around it."""
    with open(os.path.join(ASSETS, 'atlas.json'), encoding='utf-8') as f:
        frame = json.load(f)['frames'][SPRITE]['frame']
    atlas = Image.open(os.path.join(ASSETS, 'atlas.png')).convert('RGBA')
    sprite = atlas.crop((frame['x'], frame['y'], frame['x'] + frame['w'], frame['y'] + frame['h']))
    return sprite.crop(sprite.getbbox())


def scaled(sprite, height):
    width = round(sprite.width * height / sprite.height)
    return sprite.resize((width, height), Image.LANCZOS)


def icon(size):
    image = Image.new('RGB', (size, size), SKY)
    draw = ImageDraw.Draw(image)
    # A wide hill whose top sits a little below the middle.
    draw.ellipse((-0.45 * size, 0.56 * size, 1.45 * size, 1.9 * size), fill=HILL)
    sprite = scaled(building(), round(size * 0.76))
    image.paste(sprite, ((size - sprite.width) // 2, round(size * 0.10)), sprite)
    return image


def splash(size):
    image = Image.new('RGB', (size, size), SPLASH_BG)
    # The launch screen crops this square to the screen, so the picture stays small and centred.
    sprite = scaled(building(), round(size * 0.16))
    image.paste(sprite, ((size - sprite.width) // 2, (size - sprite.height) // 2), sprite)
    return image


def main():
    icon_path = os.path.join(CATALOG, 'AppIcon.appiconset', 'AppIcon-512@2x.png')
    icon(1024).save(icon_path, optimize=True)
    print('wrote', os.path.relpath(icon_path, ROOT))

    launch = splash(2732)
    for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
        path = os.path.join(CATALOG, 'Splash.imageset', name)
        launch.save(path, optimize=True)
        print('wrote', os.path.relpath(path, ROOT))


if __name__ == '__main__':
    main()
