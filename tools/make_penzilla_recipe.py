"""Write art/recipes/penzilla.json.

The Penzilla recipe has several hundred near-identical lines, so it is written
by this script rather than by hand. Edit the lists here and run:

    python tools/make_penzilla_recipe.py
    python tools/build_art.py penzilla

The recipe is marked private: its atlas goes to art/private and never into the
public repository. The pack files themselves live in art/source/penzilla, which
is git-ignored.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CITY = 'penzilla/GiantCityBuilder/'
OLD = 'penzilla/Medieval/'
NPC = 'penzilla/NPC/'
ICONS = 'penzilla/SportAndGames/'

TILES = CITY + 'Tiles/'
PLANTS = CITY + 'Plants/'
DECOR = CITY + 'DecorItems/'
PUBLIC = CITY + 'Public/'
FOOD = CITY + 'Restaurants/'
SHOPS = CITY + 'Shopping/'
FLATS = CITY + 'Appartments/'


def on_grid(file, w=1, h=1, **more):
    """A pack picture drawn on the pack's own ground grid, for a w by h block of cells."""
    return {'file': file, 'footprint': [w, h], **more}


def standing(file, x=0.5, y=0.5, **more):
    """A loose picture (a tree, a bench) stood on a spot of the cell."""
    return {'file': file, 'stand': [x, y], **more}


# The grass tile is drawn with a darker tufted rim. Painting the rim the colour of the grass lets tiles join into one lawn.
GRASS = on_grid(TILES + 'Grass.png', swap='rim')
DIRT = on_grid(TILES + 'Dirt.png')
sprites = {}

# ----------------------------------------------------------------- ground --
sprites['ground.grass'] = {'layers': [GRASS]}
# A campus path is a fully paved cell. The pack's pavers have no edge pieces, so every join looks the same.
for mask in range(16):
    sprites[f'path.{mask}'] = {'layers': [GRASS, on_grid(TILES + 'Sidewalk_Tile9.png')]}

sprites['lot.empty'] = {'layers': [DIRT]}
sprites['lot.site'] = {'layers': [DIRT, on_grid(PUBLIC + 'Construction_1x1.png')]}
sprites['lot.works'] = {'layers': [standing(DECOR + 'EmergencyCone.png', 0.22, 0.96), standing(DECOR + 'EmergencyCone.png', 0.96, 0.22)]}

# ------------------------------------------------------------------ zones --
# Housing: one-cell apartment blocks, a storey taller at stage two.
for variant, colour in enumerate(['Red', 'Yellow', 'Pink']):
    for stage in (1, 2):
        sprites[f'housing.{stage}.{variant}'] = {'layers': [on_grid(f'{FLATS}Appartment_{colour}_1x1_Level{stage}.png')]}
# Academic: the pack's real school buildings cover four cells. Until lots can merge,
# one-cell academic lots use the plainer blocks in cooler colours.
for variant, colour in enumerate(['Blue', 'Grey', 'Green']):
    for stage in (1, 2):
        sprites[f'academic.{stage}.{variant}'] = {'layers': [on_grid(f'{FLATS}Appartment_{colour}_1x1_Level{stage}.png')]}

# ------------------------------------------------------------------ quads --
sprites['quad.lawn'] = {'layers': [on_grid(TILES + 'Grass.png', swap='rim', recolour='lawn')]}
sprites['quad.tree'] = {'layers': [standing(PLANTS + 'Tree1.png', 0.5, 0.52)]}
# Whole quad tiles for game builds from before quads were laid out piece by piece.
LAWN = on_grid(TILES + 'Grass.png', swap='rim', recolour='lawn')
sprites['quad.0'] = {'layers': [LAWN, standing(PLANTS + 'Tree1.png', 0.5, 0.52)]}
sprites['quad.1'] = {'layers': [LAWN, standing(PLANTS + 'Tree13.png', 0.5, 0.52)]}
sprites['quad.2'] = {'layers': [LAWN, standing(OLD + 'Decor/Bench.png', 0.56, 0.6)]}
sprites['quad.bench'] = {'layers': [standing(PLANTS + 'Plant1.png', 0.26, 0.3), standing(OLD + 'Decor/Bench.png', 0.56, 0.6)]}
sprites['quad.flowers'] = {'layers': [
    standing(PLANTS + 'Plant1.png', 0.5, 0.32),
    standing(PLANTS + 'Plant1.png', 0.28, 0.58, flip=True),
    standing(PLANTS + 'Plant1.png', 0.72, 0.58),
    standing(PLANTS + 'Plant1.png', 0.5, 0.82, flip=True),
]}
sprites['quad.feature'] = {'layers': [standing(OLD + 'Decor/Fountain.png', 0.5, 0.68)]}

# ------------------------------------------------------------------ trees --
TREES = [('Oak', 'Tree1'), ('Pine', 'Pine1'), ('Palm', 'Palm1'), ('Blossom', 'Tree13'), ('Maple', 'Tree22'), ('Elm', 'Tree10')]
for kind, (_, file) in enumerate(TREES):
    sprites[f'tree.{kind}'] = {'layers': [standing(f'{PLANTS}{file}.png', 0.5, 0.55)]}

# -------------------------------------------------- hand-placed buildings --
sprites['build.library'] = {'layers': [on_grid(PUBLIC + 'Public_Library.png', 2, 2), on_grid(PUBLIC + 'Public_Library_Front.png', 2, 2)]}
# The gym is the pack's plain hall with a dumbbell from Penzilla's free sport icons on its sign.
sprites['build.gym'] = {'layers': [on_grid(SHOPS + 'Workplace_Empty_OneFloor.png', 2, 1, paste=[{'file': ICONS + 'Weight.png', 'box': [386, 452, 534, 566]}])]}
sprites['build.dining'] = {'layers': [on_grid(FOOD + 'Restaurant_Sandwich.png', 2, 1), on_grid(FOOD + 'Restaurant_Sandwich_Front.png', 2, 1)]}
sprites['build.store'] = {'layers': [on_grid(SHOPS + 'Shop_Kiosk_OneFloor.png', 2, 1), on_grid(SHOPS + 'Shop_Kiosk_Front.png', 2, 1)]}
sprites['build.parking'] = {'layers': [on_grid(PUBLIC + 'Carpark_1x2_Sign.png', 2, 1)]}
sprites['build.track'] = {'layers': [on_grid(PUBLIC + 'Stadium_Athletics.png', 2, 2), on_grid(PUBLIC + 'Stadium_Athletics_Roof.png', 2, 2)]}
# Outdoor courts: the court cut out of the tennis stadium, without its stands.
COURT = [[180, 668], [660, 392], [1000, 578], [512, 866]]
sprites['build.courts'] = {'layers': [on_grid(PUBLIC + 'Stadium_Tennis.png', 2, 2, cut=COURT), on_grid(PUBLIC + 'Stadium_Tennis_Front.png', 2, 2)]}
# The pack draws a red cross on its medical buildings. A red cross on white is a protected emblem, so it is turned green.
sprites['build.medical'] = {'layers': [on_grid(PUBLIC + 'Doctor_EmergencyRoom.png', 2, 2, recolour='cross')]}
sprites['build.safety'] = {'layers': [on_grid(PUBLIC + 'Emergency_PoliceStation.png', 2, 2)]}
sprites['build.stadium'] = {'layers': [
    on_grid(PUBLIC + 'Stadium_FootballAmerican.png', 2, 2),
    on_grid(PUBLIC + 'Stadium_FootballAmerican_Roof.png', 2, 2),
    on_grid(PUBLIC + 'Stadium_FootballAmerican_Front.png', 2, 2),
]}
sprites['build.studentlife'] = {'layers': [on_grid(PUBLIC + 'Leasure_Theater.png', 2, 2), on_grid(PUBLIC + 'Leasure_Theater_Front.png', 2, 2)]}
# What Academic lots could grow into once four of them merge.
sprites['build.school'] = {'layers': [on_grid(PUBLIC + 'Education_School.png', 2, 2)]}
sprites['build.college'] = {'layers': [on_grid(PUBLIC + 'Education_College.png', 2, 2)]}
sprites['build.university'] = {'layers': [on_grid(PUBLIC + 'Education_University.png', 2, 2)]}
sprites['build.site'] = {'layers': [on_grid(PUBLIC + 'Construction_2x2.png', 2, 2)]}

# ------------------------------------------------------------------ water --
sprites['pond.small'] = {'layers': [GRASS, standing(OLD + 'Decor/Pond.png', 0.94, 0.94), standing(OLD + 'Decor/LakePlants1.png', 0.3, 0.72)]}
sprites['pond.medium'] = {'layers': [on_grid(PUBLIC + 'Park_Pond.png', 2, 2)]}
# A lake of any rectangle: a full-water middle, four shores and four corners. Each tile was
# chosen by which of its edges are grass. The pack has no west corner or south-east shore,
# so those are the east corner and south-west shore mirrored.
def lake(number, **more):
    return on_grid(f'{OLD}Tiles/RiverLake{number}.png', swap='rim', **more)


LAKE = {
    'top': [lake(16)],
    'right': [lake(13)],
    'bottom': [lake(11)],
    'left': [lake(13, flip=True)],
    'ne': [lake(14)],
    'nw': [lake(18)],
    'sw': [lake(19)],
    'se': [lake(19, flip=True)],
    # No tile is water corner to corner: 27 has a tuft at its top and 28 at its bottom.
    # The top half of 28 and the bottom half of 27 make one that is.
    'full': [lake(27, cut=[[0, 214], [512, 214], [512, 512], [0, 512]]), lake(28, cut=[[0, 0], [512, 0], [512, 215], [0, 215]])],
}
for name, layers in LAKE.items():
    sprites[f'water.{name}'] = {'layers': layers}
sprites['water.bridge'] = {'layers': [standing(OLD + 'Tiles/BridgeWood.png', 0.98, 0.98)]}

# ------------------------------------------------------------------ icons --
# First aid: the cross sign that stands outside the pack's pharmacy.
sprites['icon.injury'] = {'layers': [{'file': SHOPS + 'Shop_Pharmacy_OneFloorRoofed.png', 'crop': [632, 416, 772, 606], 'stand': [0.5, 0.5], 'recolour': 'cross'}]}
sprites['icon.mischief'] = {'layers': [standing(DECOR + 'EmergencyCone.png', 0.5, 0.5, scale=1.5)]}
sprites['decor.hoop'] = {'layers': [standing(ICONS + 'BasketBallNet.png', 0.5, 0.5, scale=0.16)]}
sprites['decor.car'] = {'layers': [standing(CITY + 'Vehicles/CarType1_Blue_Front.png', 0.5, 0.5)]}
sprites['decor.lamp'] = {'layers': [standing(DECOR + 'StreetLampOn.png', 0.5, 0.5)]}
sprites['decor.hedge'] = {'layers': [standing(PLANTS + 'Bushes1.png', 0.5, 0.6)]}

# ----------------------------------------------------------------- people --
students = [f'Character{n}' for n in range(1, 17)] + [f'SportsPlayer{n}' for n in range(1, 5)] + ['Teacher']
helpers = ['Doctor', 'Police']
people = {
    'comment': 'Penzilla Giant NPC Sprite Pack. Each sheet is 8 frames by 5 rows. Row 1 faces south-west and row 3 north-west; the other two directions are mirrored. The last two looks are the responders, not part of the crowd.',
    'frames': 8,
    'frameMs': 84,
    'height': 36,
    'cell': [220, 220],
    'rows': {'sw': 1, 'nw': 3},
    'flip': {'se': 'sw', 'ne': 'nw'},
    'crowd': len(students),
    'roles': {'medic': len(students), 'officer': len(students) + 1, 'athlete': 16},
    'looks': [f'{NPC}NpcReadymade_{name}.png' for name in students + helpers],
}

recipe = {
    'pack': 'penzilla-giant-city',
    'private': True,
    'note': 'Written by tools/make_penzilla_recipe.py. Edit that script, not this file.',
    'tile': {'halfWidth': 66, 'halfHeight': 37.640625},
    'scale': 0.2578125,
    'canvas': {
        'comment': 'The pack draws on a 512 wide grid whose diamonds are 292 tall. Every picture is bottom-aligned, with 152 pixels of earth under the front corner.',
        'cell': 512,
        'rise': 146,
        'bottom': 152,
    },
    'sources': {},
    'recolours': {
        'comment': 'A mown lawn: the same grass, a little greener and brighter.',
        'lawn': {'from': [45, 95], 'to': 76, 'saturation': 1.0, 'value': 1.13},
        'cross': {'from': [0, 30], 'to': 135, 'saturation': 0.9, 'value': 0.82, 'minSaturation': 0.5},
    },
    'swaps': {
        'comment': 'Colours taken from the pack: the rim drawn round the top of a grass tile, and the grass itself.',
        'rim': {'from': [149, 148, 55], 'to': [166, 173, 54], 'within': 12, 'above': 220},
    },
    'sprites': sprites,
    'trees': [name for name, _ in TREES],
    'people': people,
    'footprints': {
        'build.library': [2, 2], 'build.gym': [2, 1], 'build.dining': [2, 1], 'build.store': [2, 1],
        'build.parking': [2, 1], 'build.track': [2, 2], 'build.courts': [2, 2], 'build.medical': [2, 2],
        'build.safety': [2, 2], 'build.stadium': [2, 2], 'build.studentlife': [2, 2], 'build.school': [2, 2],
        'build.college': [2, 2], 'build.university': [2, 2], 'build.site': [2, 2], 'pond.medium': [2, 2],
    },
    'menuCredit': 'Graphics created by Penzilla Design.',
    'credits': [
        {
            'name': 'Isometric City Builder Pack, Giant NPC Sprite Pack, Medieval City Builder Pack, and Sport and Games Pack',
            'author': 'Graphics created by Penzilla Design (penzilla.itch.io)',
            'licence': 'Penzilla Design Standard Licence: commercial use in one project, credit required, the files may not be shared',
            'licenceUrl': 'https://penzilla.itch.io/',
            'source': 'https://penzilla.itch.io/',
            'changes': 'Sprites are shrunk to the map scale and packed into one atlas. The drawn rim on the top edges of grass tiles is painted the colour of the grass, so tiles join. The lawn is a brightened grass tile. The gym is the plain hall with a dumbbell icon on its sign. The outdoor court is cut from the tennis stadium. The first-aid icon is the pharmacy sign. Red crosses on the medical building and the first-aid icon are recoloured green.',
        },
    ],
}

path = os.path.join(ROOT, 'art', 'recipes', 'penzilla.json')
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(recipe, f, indent=1)
    f.write('\n')
print(f'wrote {os.path.relpath(path, ROOT)}: {len(sprites)} sprites, {len(people["looks"])} people')
