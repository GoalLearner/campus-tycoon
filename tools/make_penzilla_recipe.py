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
import importlib.util
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

# Lit windows (DESIGN.md section 33.5): for each dorm and lecture hall, its own window glass in a warm colour and
# nothing else, one picture for each of the two walls that show. The game lays them over the building at night.
for zone in ('housing', 'academic'):
    for variant in range(3):
        for stage in (1, 2):
            source = sprites[f'{zone}.{stage}.{variant}']['layers'][0]
            for side in ('sw', 'se'):
                sprites[f'lit.{zone}.{stage}.{variant}.{side}'] = {'layers': [{**source, 'glass': 'window'}], 'side': side, 'optional': True}

# ------------------------------------------------------------------ quads --
sprites['quad.lawn'] = {'layers': [on_grid(TILES + 'Grass.png', swap='rim', recolour='lawn')]}
sprites['quad.tree'] = {'layers': [standing(PLANTS + 'Tree1.png', 0.5, 0.52)]}
# Whole quad tiles for game builds from before quads were laid out piece by piece.
LAWN = on_grid(TILES + 'Grass.png', swap='rim', recolour='lawn')
sprites['quad.0'] = {'layers': [LAWN, standing(PLANTS + 'Tree1.png', 0.5, 0.52)]}
sprites['quad.1'] = {'layers': [LAWN, standing(PLANTS + 'Tree13.png', 0.5, 0.52)]}
sprites['quad.2'] = {'layers': [LAWN, standing(OLD + 'Decor/Bench.png', 0.56, 0.6)]}
# Grounds (play stop 4): bins, seating, litter and the Facilities Yard. Stand-ins are listed in DESIGN.md section 26.
# A bin in three states: the lidded can, the pack's heaped wire basket when it is filling, and that basket with a bag beside it when full.
sprites['grounds.bin'] = {'layers': [standing(DECOR + 'TrashCan.png', 0.5, 0.5, scale=1.35)]}
sprites['grounds.bin.full'] = {'layers': [standing(DECOR + 'TrashCanLarge.png', 0.5, 0.5, scale=1.35)]}
sprites['grounds.bin.over'] = {'layers': [standing(DECOR + 'TrashCanLarge.png', 0.4, 0.42, scale=1.35), standing(DECOR + 'TrashBag1.png', 0.72, 0.7, scale=1.2)]}
sprites['grounds.bench'] = {'layers': [standing(OLD + 'Decor/Bench.png', 0.5, 0.5)]}
# The pack has no picnic table. Its table with four chairs stands in.
sprites['grounds.table'] = {'layers': [standing(DECOR + 'TableSet1.png', 0.5, 0.56)]}
# Beside anything broken, as building sites already use it.
sprites['grounds.cone'] = {'layers': [standing(DECOR + 'EmergencyCone.png', 0.8, 0.74, scale=0.8)]}
# Litter: the pack's five small pieces and a cup, each at its own spot on the cell.
for n, (fx, fy) in enumerate([(0.3, 0.3), (0.68, 0.36), (0.42, 0.66), (0.7, 0.7), (0.26, 0.58)]):
    sprites[f'litter.{n}'] = {'layers': [standing(OLD + f'Decor/Garbage{n + 1}.png', fx, fy, scale=1.6)]}
sprites['litter.5'] = {'layers': [standing(OLD + 'Decor/Cup.png', 0.56, 0.5, scale=1.5)]}
sprites['build.yard'] = {'layers': [on_grid(SHOPS + 'Workplace_Handyman_OneFloor.png', 2, 1)]}
# What a worker has with them. No figure can hold anything, so it is drawn beside them.
sprites['grounds.broom'] = {'layers': [standing(OLD + 'Decor/Broom.png', 0.5, 0.5)]}
sprites['grounds.cart'] = {'layers': [standing(DECOR + 'Cart.png', 0.5, 0.5, scale=0.7)]}

# Street lamps, for paths, roads and the town's streets. Off by day, lit in the evening and at night.
# The glow is the pack's own picture of the lit lamp with its halo. The game adds it as light over the night tint.
sprites['lamp.off'] = {'layers': [standing(DECOR + 'StreetLampOff.png', 0.14, 0.3)]}
sprites['lamp.on'] = {'layers': [standing(DECOR + 'StreetLampOn.png', 0.14, 0.3)]}
sprites['lamp.glow'] = {'layers': [standing(DECOR + 'StreetLampGlow.png', 0.14, 0.3)]}
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
sprites['build.courts'] = {'layers': [on_grid(PUBLIC + 'Stadium_Tennis.png', 2, 2, cut=COURT), on_grid(PUBLIC + 'Stadium_Tennis_Front.png', 2, 2)]}  # grass is added under it below
# The pack draws a red cross on its medical buildings. A red cross on white is a protected emblem, so it is turned green.
sprites['build.medical'] = {'layers': [on_grid(PUBLIC + 'Doctor_EmergencyRoom.png', 2, 2, recolour='cross')]}
sprites['build.safety'] = {'layers': [on_grid(PUBLIC + 'Emergency_PoliceStation.png', 2, 2)]}
# The football stadium has five tiers and the pack draws one. Tiers two and three are made
# from its own parts: the stand is cut out, then raised behind itself as an upper deck, and
# mirrored and shrunk as a second stand behind the scoreboard.
STADIUM = PUBLIC + 'Stadium_FootballAmerican.png'
STAND = [[176, 284], [478, 88], [656, 100], [656, 372], [345, 562], [296, 524], [284, 394], [184, 394]]
STADIUM_BASE = [on_grid(STADIUM, 2, 2), on_grid(PUBLIC + 'Stadium_FootballAmerican_Front.png', 2, 2)]
UPPER_DECK = on_grid(STADIUM, 2, 2, cut=STAND, shift=[-0.549, -0.259])
FAR_STAND = on_grid(STADIUM, 2, 2, cut=STAND, flip=True, scale=0.72, shift=[0.434, -0.612])
sprites['stadium.1'] = {'layers': STADIUM_BASE}
sprites['stadium.2'] = {'layers': [UPPER_DECK] + STADIUM_BASE}
sprites['stadium.3'] = {'layers': [FAR_STAND, UPPER_DECK] + STADIUM_BASE}
sprites['build.stadium'] = {'layers': STADIUM_BASE}
# Tiers four and five are a full bowl, which the pack does not draw. Until drawn art is commissioned it is a
# 3D model rendered with the pack's colours, outline and camera (see tools/render/model.html).
sprites['stadium.4'] = {'layers': [{'file': '_rendered/fallback/stadium.png', 'render': [2, 3]}]}
# Tier five is the same bowl built taller, with a pale top ring.
sprites['stadium.5'] = {'layers': [{'file': '_rendered/fallback/stadium-tall.png', 'render': [2, 3]}]}
# ------------------------------------------------- town, roads and cars --
# The third play stop's art, for the look review. Nothing here has rules yet.
#
# Road pieces are named by which neighbours they join, the way paths are:
# 1 is the cell up-right (x, y - 1), 2 down-right (x + 1, y), 4 down-left (x, y + 1), 8 up-left (x - 1, y).
# The pack draws nine pieces. The other seven are the same pieces mirrored, which swaps 1 with 8 and 2 with 4.
ROAD_PIECES = {15: (1, False), 13: (2, False), 11: (2, True), 14: (3, False), 7: (3, True), 9: (4, False),
               12: (5, False), 3: (5, True), 6: (6, False), 5: (7, False), 10: (7, True),
               8: (8, False), 1: (8, True), 4: (9, False), 2: (9, True), 0: (1, False)}
for mask, (piece, mirrored) in ROAD_PIECES.items():
    layer = on_grid(f'{TILES}Road_Tile{piece}.png')
    if mirrored:
        layer['flip'] = True
    sprites[f'road.{mask}'] = {'layers': [layer]}
# A crossing where a road meets a path. The pack has none, so the bars are its own lane marks set side by side
# (tools/make_crosswalk.py).
sprites['road.cross.5'] = {'layers': [on_grid('_rendered/fallback/crosswalk.png')]}
sprites['road.cross.10'] = {'layers': [on_grid('_rendered/fallback/crosswalk.png', flip=True)]}
# The sidewalk: a strip of slabs along each side of a road that meets no more road, and a small slab in an inside
# corner where another road opens off (DESIGN.md 59.1). Drawn over the road by tools/make_sidewalk.py in the pack's
# sidewalk colours: kerb.<sides>.<corners>, with the bits of the road pieces.
_spec = importlib.util.spec_from_file_location('make_sidewalk', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'make_sidewalk.py'))
_sidewalk = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sidewalk)
for _edges, _corners in _sidewalk.combinations():
    sprites[f'kerb.{_edges}.{_corners}'] = {'layers': [on_grid(f'_rendered/fallback/kerb/kerb-{_edges}-{_corners}.png')]}
# Order on the streets: the pack's round red sign stands at every way into a junction, as a stop sign, and its
# blue square sign marks a crossing that stands by itself. Both as drawn.
sprites['sign.stop'] = {'layers': [standing(DECOR + 'TraficSign3.png', 0.5, 0.5)]}
sprites['sign.crossing'] = {'layers': [standing(DECOR + 'TraficSign4.png', 0.5, 0.5)]}

HOUSES = CITY + 'Houses/'
TOWN_HOUSES = [('Blue', 1), ('Red', 5), ('Yellow', 9), ('Green', 13), ('Pink', 17), ('White', 20), ('Brown', 3), ('Grey', 7),
               ('Yellow', 2), ('Blue', 11), ('Red', 15), ('Green', 6)]
for n, (colour, kind) in enumerate(TOWN_HOUSES):
    sprites[f'town.house.{n}'] = {'layers': [GRASS, on_grid(f'{HOUSES}{colour}/House_Type{kind}.png')]}
# A driveway is a paved pad from the street to the back of the lot, where a car parks (DESIGN.md 59.3). Drawn by
# tools/make_sidewalk.py in the pack's concrete colours.
sprites['town.driveway'] = {'layers': [GRASS, on_grid('_rendered/fallback/kerb/drive.png')]}
sprites['town.pool'] = {'layers': [GRASS, on_grid(HOUSES + 'Garden_Pool.png')]}
sprites['town.garden'] = {'layers': [GRASS, on_grid(HOUSES + 'Garden_Rustic.png')]}

# Cars come drawn from the front and from the back. Mirrored, that is all four ways along the grid:
# px drives down-right (x + 1), nx up-left, py down-left (y + 1), ny up-right.
CARS = CITY + 'Vehicles/'
TOWN_CARS = ['CarType1_Red', 'CarType1_Blue', 'CarType2_Green', 'CarType1_White', 'CarType2_Grey', 'CarType1_Yellow', 'Bus_Yellow']
for n, name in enumerate(TOWN_CARS):
    for way, view, mirrored in (('px', 'Front', False), ('py', 'Front', True), ('nx', 'Back', False), ('ny', 'Back', True)):
        layer = standing(f'{CARS}{name}_{view}.png', 0.5, 0.64)
        if mirrored:
            layer['flip'] = True
        sprites[f'car.{n}.{way}'] = {'layers': [layer]}

sprites['build.parking.large'] = {'layers': [on_grid(PUBLIC + 'Carpark_2x2_Sign.png', 2, 2)]}
# No pack draws a parking structure. Until one is commissioned it is a model made of plain blocks,
# rendered with the pack's colours, outline and camera (tools/render/model.html?builtin=parking).
sprites['build.garage'] = {'layers': [{'file': '_rendered/fallback/parking-structure.png', 'render': [2, 2]}]}

sprites['build.studentlife'] = {'layers': [on_grid(PUBLIC + 'Leasure_Theater.png', 2, 2), on_grid(PUBLIC + 'Leasure_Theater_Front.png', 2, 2)]}
# What Academic lots could grow into once four of them merge.
sprites['build.school'] = {'layers': [on_grid(PUBLIC + 'Education_School.png', 2, 2)]}
sprites['build.college'] = {'layers': [on_grid(PUBLIC + 'Education_College.png', 2, 2)]}
sprites['build.university'] = {'layers': [on_grid(PUBLIC + 'Education_University.png', 2, 2)]}
sprites['build.site'] = {'layers': [on_grid(PUBLIC + 'Construction_2x2.png', 2, 2)]}

# ------------------------------------------------------------------ water --
sprites['pond.small'] = {'layers': [GRASS, standing(OLD + 'Decor/Pond.png', 0.94, 0.94), standing(OLD + 'Decor/LakePlants1.png', 0.3, 0.72)]}
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


def grass_under(w, h):
    """A grass tile for every cell of a block, back to front. Flat things are drawn in place of the ground, so they bring their own."""
    cells = sorted(((x, y) for y in range(h) for x in range(w)), key=lambda c: (c[0] + c[1], c[0]))
    return [on_grid(TILES + 'Grass.png', swap='rim', shift=[x, y]) for x, y in cells]


def moved(layers, x, y):
    return [{**layer, 'shift': [x, y]} for layer in layers]


# The lake is three cells by three, laid from the nine shore pieces.
LAKE_PLAN = [('top', 0, 0), ('ne', 1, 0), ('nw', 0, 1), ('right', 2, 0), ('full', 1, 1), ('left', 0, 2), ('se', 2, 1), ('sw', 1, 2), ('bottom', 2, 2)]
# Grass goes under the shore pieces. Their edges are ragged, and without it the earth of the
# tiles behind showed through at the lake's two side corners.
sprites['pond.large'] = {'layers': grass_under(3, 3) + [layer for name, x, y in LAKE_PLAN for layer in moved(LAKE[name], x, y)]}
sprites['pond.medium'] = {'layers': grass_under(2, 2) + [on_grid(PUBLIC + 'Park_Pond.png', 2, 2)]}

sprites['build.courts']['layers'] = grass_under(2, 2) + sprites['build.courts']['layers']

# The four additions of the feedback pass.
sprites['build.pool'] = {'layers': grass_under(2, 1) + [on_grid(PUBLIC + 'Pool.png', 2, 1)]}
# A pitch for anyone to use: the soccer stadium with its stand, booth and banner cut away.
FIELD = [[186, 662], [676, 384], [704, 372], [740, 366], [900, 452], [900, 530], [992, 590], [524, 868]]
sprites['build.field'] = {'layers': grass_under(2, 2) + [on_grid(PUBLIC + 'Stadium_FootballSocker.png', 2, 2, cut=FIELD)]}
sprites['build.coffee'] = {'layers': [on_grid(PUBLIC + 'StreetStand_Coffee.png'), on_grid(PUBLIC + 'StreetStand_Coffee_Front.png')]}
# Play stop 4b: eight more places to eat and three Academics buildings. Every one is the pack's own picture,
# used as drawn. The stand-ins are listed in DESIGN.md section 26.
for key, name in (('burger', 'Burger'), ('diner', 'Breakfast'), ('pizza', 'Pizza'), ('taco', 'Mexican')):
    sprites[f'build.{key}'] = {'layers': [on_grid(f'{FOOD}Restaurant_{name}.png', 2, 1), on_grid(f'{FOOD}Restaurant_{name}_Front.png', 2, 1)]}
# The food court is the pack's open-air market of stalls and umbrellas.
sprites['build.foodcourt'] = {'layers': [on_grid(SHOPS + 'Groceries_Market.png', 2, 2)] + [on_grid(f'{SHOPS}Groceries_Market_Front{n}.png', 2, 2) for n in (1, 2, 3)]}
# The smoothie and juice bar is the ice-cream stand, and the convenience store the newspaper kiosk.
sprites['build.smoothie'] = {'layers': [on_grid(PUBLIC + 'StreetStand_Icecream.png'), on_grid(PUBLIC + 'StreetStand_Icecream_Front.png')]}
sprites['build.convenience'] = {'layers': [on_grid(PUBLIC + 'StreetStand_NewsPaper.png'), on_grid(PUBLIC + 'StreetStand_NewsPaper_Front.png')]}
# The food truck is the box truck with an apple on its side, parked on its cell.
sprites['build.truck'] = {'layers': [standing(CITY + 'Vehicles/Truck_Groceries_Front.png', 0.5, 0.78)]}
# The computer lab is the electrician's workshop, and the makerspace the tool shop.
sprites['build.computerlab'] = {'layers': [on_grid(SHOPS + 'Workplace_Electrician_OneFloor.png', 2, 1)]}
sprites['build.makerspace'] = {'layers': [on_grid(SHOPS + 'Shop_Tools_OneFloor.png', 2, 1), on_grid(SHOPS + 'Shop_Tools_Front.png', 2, 1)]}
# The study center is the plain roofed shop with the Medieval pack's open book on its two blank signs.
BOOK = OLD + 'Decor/Book.png'
sprites['build.studycenter'] = {'layers': [
    on_grid(SHOPS + 'Shop_Empty_OneFloorRoofed.png', 2, 1, paste=[{'file': BOOK, 'box': [668, 480, 748, 560]}, {'file': BOOK, 'box': [436, 444, 492, 492]}]),
    on_grid(SHOPS + 'Shop_Empty_Front.png', 2, 1),
]}
sprites['build.admin'] = {'layers': [on_grid(PUBLIC + 'Public_Townhall.png', 2, 2)]}

# -------------------------------------------------------- reward buildings --
# One for each rank goal (DESIGN.md section 40). Each is the pack's own drawing, as drawn, on the block of cells
# the pack drew it for. The fountain is a park laid flat, so it brings its own grass, as the pond does.
sprites['reward.fountain'] = {'layers': grass_under(2, 2) + [on_grid(PUBLIC + 'Park_Fountain.png', 2, 2)]}
sprites['reward.post'] = {'layers': [on_grid(PUBLIC + 'PostOffice.png', 2, 1)]}
sprites['reward.cinema'] = {'layers': [on_grid(PUBLIC + 'Leasure_Cinema.png', 2, 2), on_grid(PUBLIC + 'Leasure_Cinema_Front.png', 2, 2)]}
sprites['reward.radio'] = {'layers': [on_grid(PUBLIC + 'RadioStation.png', 2, 1)]}
sprites['reward.museum'] = {'layers': [on_grid(PUBLIC + 'Leasure_Museum.png', 2, 2), on_grid(PUBLIC + 'Leasure_Museum_Front.png', 2, 2)]}
sprites['reward.alumni'] = {'layers': [on_grid(PUBLIC + 'Hotel_ThreeFloors.png', 2, 1)]}
sprites['reward.broadcast'] = {'layers': [on_grid(PUBLIC + 'TeleTower.png')]}
sprites['reward.bell'] = {'layers': [on_grid(OLD + 'Buildings/TowerStoneRoofed.png')]}

# ------------------------------------------------------- the eras' big builds --
# What the Flagship and Legacy eras open (DESIGN.md section 45). The three Flagship buildings are the pack's own
# drawings, as drawn, on the block the pack drew each for. The Grand Library and the Hall of Champions have none
# that honestly fits, and wait.
sprites['era.union'] = {'layers': [on_grid(SHOPS + 'Groceries_Mall.png', 2, 2)]}
sprites['era.honors'] = {'layers': [on_grid(PUBLIC + 'Hotel_TwoFloors.png', 2, 1)]}
sprites['era.welcome'] = {'layers': [on_grid(PUBLIC + 'Hotel_OneFloor.png', 2, 1)]}
# ------------------------------------------------------------ research labs --
# One for each field (DESIGN.md section 49), each the pack's own drawing, as drawn, on the block the pack drew it for.
# The doctor's office has its red cross turned green, as the Medical Center's is.
sprites['lab.sciences'] = {'layers': [on_grid(PUBLIC + 'Industrial_WaterPlant.png', 2, 2), on_grid(PUBLIC + 'Industrial_WaterPlant_Front.png', 2, 2)]}
sprites['lab.engineering'] = {'layers': [on_grid(PUBLIC + 'Industrial_PowerPlant.png', 2, 2)]}
sprites['lab.health'] = {'layers': [on_grid(PUBLIC + 'Doctor_Office.png', 2, 2, recolour='cross')]}

# ------------------------------------------------------------- Greek Row --
# Chapter houses (DESIGN.md section 51): the Medieval pack's two-storey half-timbered houses, as drawn, each on a cell of
# grass as the town's houses are. Six looks, two roof colours; a chapter keeps its look.
CHAPTER_LOOKS = [('Style15', 14), ('Style13', 4), ('Style15', 24), ('Style13', 14), ('Style15', 4), ('Style13', 24)]
for n, (style, kind) in enumerate(CHAPTER_LOOKS):
    sprites[f'chapter.{n}'] = {'layers': [GRASS, on_grid(f'{OLD}Houses/{style}/houses_{kind:02d}.png')]}

# The pack's building site for a block of two cells, for a big build of that size while it goes up.
sprites['build.site.wide'] = {'layers': [on_grid(PUBLIC + 'Construction_1x2.png', 2, 1)]}
# Founders' Commons is a green of three cells by three, laid out from the packs' own pieces, each as drawn: the grass,
# a cross of paving, the statue in the middle, trees, lamps, benches and flowers. It is on section 26 as assembled.
COMMONS_PAVING = [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)]
COMMONS_THINGS = [
    standing(PLANTS + 'Tree1.png', 0.5, 0.5),
    standing(PLANTS + 'Tree13.png', 2.5, 0.45),
    standing(PLANTS + 'Tree13.png', 0.45, 2.5),
    standing(OLD + 'Decor/StreetLight.png', 1.85, 0.95),
    standing(OLD + 'Decor/StreetLight.png', 0.95, 1.85),
    standing(OLD + 'Decor/Statue.png', 1.5, 1.5, scale=1.7),
    standing(OLD + 'Decor/Bench.png', 2.45, 1.75),
    standing(OLD + 'Decor/Bench.png', 1.75, 2.45, flip=True),
    standing(PLANTS + 'Plant1.png', 2.55, 2.55, scale=1.2),
]
sprites['era.commons'] = {'layers': grass_under(3, 3) + [on_grid(TILES + 'Sidewalk_Tile9.png', shift=[x, y]) for x, y in sorted(COMMONS_PAVING, key=lambda c: (c[0] + c[1], c[0]))] + COMMONS_THINGS}

# ------------------------------------------------------------- a dorm room --
# A peek inside a student's room (DESIGN.md section 46). The packs have no inside walls, no floor and no bed, so a room
# is laid out at run time from these pieces on a grid of its own, each the pack's own drawing as drawn. The walls are
# the Medieval stable's back corner, its two faces taken apart so a room can be two cells along each wall; the floor
# is the city pack's square paver. Each piece stands on the middle of its cell, so the room can move it by any part of
# a cell. Listed on section 26 as assembled.
OLD_DECOR = OLD + 'Decor/'
sprites['room.wall.left'] = {'layers': [on_grid(OLD + 'Buildings/Stable_Back.png')], 'side': 'sw'}
sprites['room.wall.right'] = {'layers': [on_grid(OLD + 'Buildings/Stable_Back.png')], 'side': 'se'}
sprites['room.floor'] = {'layers': [on_grid(TILES + 'Concreet.png')]}
ROOM_PIECES = {
    'desk': (DECOR + 'Table.png', 1),
    'chair': (DECOR + 'ChairBack.png', 1),
    'chairFront': (DECOR + 'ChairFront.png', 1),
    'shelf': (DECOR + 'Cabinette.png', 1),
    'speaker': (DECOR + 'Jukebox.png', 0.8),
    'notes': (DECOR + 'Notes1.png', 0.9),
    'notes2': (DECOR + 'Notes2.png', 0.9),
    'plant': (PLANTS + 'Plant13.png', 0.8),
    'rug': (OLD_DECOR + 'Rug.png', 1),
    'drapes': (OLD_DECOR + 'Drapes.png', 0.9),
    'book': (OLD_DECOR + 'Book.png', 0.8),
    'papers': (OLD_DECOR + 'Papers.png', 0.8),
    'scroll': (OLD_DECOR + 'Scroll.png', 0.7),
    'stool': (OLD_DECOR + 'Stool.png', 1),
    'lute': (OLD_DECOR + 'MusicLute.png', 0.8),
    'cup': (OLD_DECOR + 'Cup.png', 0.6),
    'apple': (OLD_DECOR + 'Apple.png', 0.5),
    'bread': (OLD_DECOR + 'Bread.png', 0.6),
    'basket': (OLD_DECOR + 'Basket.png', 0.8),
    'box': (OLD_DECOR + 'Box.png', 0.8),
    'ball': (ICONS + 'BasketBall.png', 0.13),
    'soccerBall': (ICONS + 'SockerFootBall.png', 0.13),
    'kettlebell': (ICONS + 'KettleBell_Red.png', 0.1),
    'controller': (ICONS + 'Controler.png', 0.13),
    'chess': (ICONS + 'Chess_White.png', 0.14),
    'cards': (ICONS + 'PlayingCards.png', 0.12),
    'dice': (ICONS + 'DiceRoll.png', 0.12),
    'trophy': (ICONS + 'Trophy_Bronze.png', 0.14),
}
for name, (file, scale) in ROOM_PIECES.items():
    sprites[f'room.{name}'] = {'layers': [standing(file, 0.5, 0.5, scale=scale)]}

# ------------------------------------------------------------------ icons --
# First aid: the cross sign that stands outside the pack's pharmacy.
sprites['icon.injury'] = {'layers': [{'file': SHOPS + 'Shop_Pharmacy_OneFloorRoofed.png', 'crop': [632, 416, 772, 606], 'stand': [0.5, 0.5], 'recolour': 'cross'}]}
# The badge over a car park that no road reaches: the pack's lowered barrier gate, as drawn.
sprites['icon.noroad'] = {'layers': [standing(DECOR + 'GateDown.png', 0.5, 0.5, scale=1.4)]}
sprites['icon.mischief'] = {'layers': [standing(DECOR + 'EmergencyCone.png', 0.5, 0.5, scale=1.5)]}
sprites['decor.hoop'] = {'layers': [standing(ICONS + 'BasketBallNet.png', 0.5, 0.5, scale=0.16)]}

# ------------------------------------------------------- the daily layer --
# The University Level, Gold Seals and collecting (DESIGN.md section 42). Each is the pack's own drawing, only
# made smaller: nothing is cut, recoloured or assembled. The owner saw them on one sheet first and chose these.
# The marker over a building that is ready to collect, which is also what rises when it is tapped.
sprites['icon.collect'] = {'layers': [standing(ICONS + 'Medal_Gold.png', 0.5, 0.5, scale=0.24)]}
# The Gold Seal, and the level badge that the level's number is set on. Both are shown in panels, larger than
# anything on the map, so they are kept larger here.
sprites['ui.seal'] = {'layers': [standing(ICONS + 'PinMedal_Gold.png', 0.5, 0.5, scale=0.6)]}
sprites['ui.level'] = {'layers': [standing(ICONS + 'LaurelWreath.png', 0.5, 0.5, scale=0.9)]}

# ----------------------------------------------------------- decorations --
# The decorations of DESIGN.md 42.5, as the owner chose them from one sheet on 2026-11-13. Each is the pack's own
# drawing, made smaller and stood on its cell: nothing is cut or assembled. One is recoloured, and it is on the
# list of section 26: the school banner, whose red cloth is turned to each of the eight school colours.
# A name here is a decoration's id in src/sim/config/decor.ts.
HOUSES = CITY + 'Houses/'
FENCES = CITY + 'Fences/'
OLD_DECOR = OLD + 'Decor/'
OLD_BUILT = OLD + 'Buildings/'
OLD_FENCES = OLD + 'Fences/'
POST = 'post'    # a post, a pot or a figure: it stands on the middle of its cell
BASE = 'base'    # it stands on a base as wide as the drawing, set in the middle of its cell
DECORATIONS = {
    'statue': (OLD_DECOR + 'Statue.png', POST, 1),
    'sculpture': (DECOR + 'Sculpture.png', BASE, 1),
    # From the sport set, which is drawn as large flat icons: it is shrunk further than the map's own drawings.
    'cup': (ICONS + 'Trophy_Gold.png', POST, 0.34),
    'windmill': (OLD_BUILT + 'Mill.png', BASE, 1),
    'lookout': (OLD_BUILT + 'TowerWood.png', BASE, 1),
    'waterTower': (DECOR + 'Watertower.png', BASE, 1),
    'fountain': (OLD_DECOR + 'Fountain.png', BASE, 1),
    'reflectingPool': (DECOR + 'WaterBasin.png', BASE, 1),
    'gardenPool': (HOUSES + 'Garden_Pool.png', BASE, 1),
    'wishingWell': (OLD_DECOR + 'WellRood.png', BASE, 1),
    'stoneWell': (OLD_DECOR + 'Well.png', BASE, 1),
    # Three small things are drawn very small, and are shown a little larger, as the bins are.
    'flowers': (PLANTS + 'Plant1.png', POST, 1.2),
    'flowerBox': (PLANTS + 'Plant2.png', BASE, 1),
    'planters': (PLANTS + 'Plant13.png', BASE, 1),
    'topiary': (PLANTS + 'Plant8.png', POST, 1),
    'hedge': (PLANTS + 'Bushes7.png', BASE, 1),
    'hedgePlanter': (PLANTS + 'Bushes9.png', BASE, 1),
    'cottageGarden': (HOUSES + 'Garden_Rustic.png', BASE, 1),
    'flowerStall': (PUBLIC + 'StreetStand_Flowers.png', BASE, 1),
    'globeLamp': (DECOR + 'Lamp.png', POST, 1),
    'stringLights': (DECOR + 'Lights.png', POST, 1),
    'lantern': (OLD_DECOR + 'Lantern.png', POST, 1.6),
    'tallLamp': (OLD_DECOR + 'StreetLight.png', POST, 1),
    'ribbonPole': (OLD_DECOR + 'PoleFestive.png', POST, 1),
    'sofa': (DECOR + 'Seat.png', BASE, 1),
    'tableSet': (DECOR + 'TableSet3.png', BASE, 1),
    'parasol': (DECOR + 'Parasol.png', POST, 1),
    'swingSet': (DECOR + 'Swingset.png', BASE, 1),
    'campusMap': (DECOR + 'SignMap.png', POST, 1),
    'mailbox': (DECOR + 'Mailbox.png', POST, 1),
    'gumball': (DECOR + 'GumballMachine.png', POST, 1),
    'boulder': (OLD_DECOR + 'Rock1.png', BASE, 1),
    'steppingStones': (TILES + 'StonePath_Tile1.png', BASE, 1),
    'stoneWall': (OLD_FENCES + 'StoneFence1.png', BASE, 1),
    'ropeLine': (DECOR + 'Vip2.png', BASE, 1),
    'stage': (OLD_DECOR + 'Podium.png', BASE, 1),
    'marquee': (OLD_DECOR + 'Tent.png', BASE, 1),
    'stall': (OLD_BUILT + 'MarketStand.png', BASE, 1),
    # The fall set.
    'pumpkins': (OLD_BUILT + 'MarketProduce_Gourds.png', BASE, 1),
    'hayBales': (OLD_BUILT + 'Hay.png', BASE, 1),
    'haystack': (OLD_DECOR + 'HayStack.png', BASE, 1),
    'appleCrate': (DECOR + 'AppleCrate.png', BASE, 1),
    'autumnHedge': (FENCES + 'Hedge4.png', BASE, 1),
    # The summer set.
    'lounger': (DECOR + 'PoolChair.png', BASE, 1),
    'beachParasol': (DECOR + 'PoolParasol.png', POST, 1),
    'lifeguardChair': (DECOR + 'PoolLifeguardChair.png', POST, 1),
    'beachBall': (DECOR + 'PoolBall.png', POST, 1.3),
    'poolFloat': (DECOR + 'PoolFloatie.png', POST, 1.3),
    'iceCreamSign': (DECOR + 'IceCreamSign.png', POST, 1),
}


def drawn_width(file, crop=None):
    """How wide a pack drawing is once the empty margin round it is trimmed, in the pack's own pixels."""
    from PIL import Image
    im = Image.open(os.path.join(ROOT, 'art', 'source', file)).convert('RGBA')
    if crop:
        im = im.crop(tuple(crop))
    box = im.getbbox()
    return box[2] - box[0]


def decoration(file, how, scale, **more):
    """A decoration stood on its cell: a post on the middle, anything on a base with that base in the middle."""
    at = 0.56 if how == POST else min(0.95, 0.5 + drawn_width(file, more.get('crop')) / 512 / 2)
    return {'layers': [standing(file, at, at, scale=scale, **more)]}


for name, (file, how, scale) in DECORATIONS.items():
    sprites[f'decoration.{name}'] = decoration(file, how, scale)
# Bunting on two posts. The file has a stray line of pixels down its left edge, which is left out.
sprites['decoration.bunting'] = decoration(OLD_FENCES + 'Festive1.png', BASE, 1, crop=[200, 0, 512, 1024])
# The school banner, once for each school colour: the same eight as SCHOOL_COLOURS in src/sim/config/football.ts.
# Only the red cloth changes. Its hue is turned to the school's and its brightness matched; the dark outline, the
# pole and the artist's shading are left as drawn.
SCHOOL_COLOURS = {'crimson': 0xc0392b, 'navy': 0x2c4a8a, 'forest': 0x2e7d4f, 'gold': 0xe0a82e, 'purple': 0x7b4bb0, 'orange': 0xe07a2e, 'teal': 0x1f8f8f, 'maroon': 0x7a2238}
BANNER_RED = (215, 55, 0)
banner_rules = {}


def hsv(rgb):
    import colorsys
    h, s_, v = colorsys.rgb_to_hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    return h * 360, s_, v


for colour, value in SCHOOL_COLOURS.items():
    hue, sat, val = hsv(((value >> 16) & 255, (value >> 8) & 255, value & 255))
    _, red_sat, red_val = hsv(BANNER_RED)
    banner_rules[f'banner.{colour}'] = {'from': [8, 25], 'to': round(hue, 1), 'saturation': round(sat / red_sat, 3), 'value': round(val / red_val, 3), 'minSaturation': 0.8}
    sprites[f'decoration.banner.{colour}'] = {'layers': [standing(OLD_DECOR + 'Banner.png', 0.56, 0.56, recolour=f'banner.{colour}')]}
# What floats over the Makerspace when the Workshop has finished something: the old-town pack's hammer.
sprites['icon.craft'] = {'layers': [standing(OLD_DECOR + 'Hammer.png', 0.5, 0.5, scale=3.2)]}

# ------------------------------------------------------------------ alive --
# Markers at the edge of a campus the town cannot get into: the pack's arrow sign for a path, and its
# blue square sign for parking. Both as drawn, a little larger so they read at phone zoom.
sprites['icon.walkin'] = {'layers': [standing(DECOR + 'Sign5.png', 0.5, 0.5, scale=1.25)]}
sprites['icon.drivein'] = {'layers': [standing(DECOR + 'TraficSign4.png', 0.5, 0.5, scale=1.35)]}
# The campus shuttle and two delivery trucks, turned the four ways like the cars.
for key, name in (('shuttle', 'Bus_Orange'), ('truck.0', 'Truck_Groceries'), ('truck.1', 'Truck_Mail')):
    for way, view, mirrored in (('px', 'Front', False), ('py', 'Front', True), ('nx', 'Back', False), ('ny', 'Back', True)):
        layer = standing(f'{CITY}Vehicles/{name}_{view}.png', 0.5, 0.64)
        if mirrored:
            layer['flip'] = True
        sprites[f'{key}.{way}'] = {'layers': [layer]}
# A football for the recreation field. The pool's own picture already has its toys.
sprites['play.ball'] = {'layers': [standing(ICONS + 'SockerFootBall.png', 0.5, 0.5, scale=0.045)]}
# What goes beside two of the people on campus, because no figure can hold anything: the red pennant an
# admissions guide leads a tour with, and the boxes a delivery driver unloads.
sprites['people.pennant'] = {'layers': [standing(OLD + 'Decor/Banner.png', 0.5, 0.5, scale=0.75)]}
sprites['people.boxes'] = {'layers': [standing(DECOR + 'Boxes1.png', 0.5, 0.5, scale=0.85)]}
# Small scenes (DESIGN.md section 33): a club's table on a lawn is the city pack's table, parasol and sandwich
# board with the Medieval pack's banner, set out together on the cell. Each stays its own sprite, so the game
# stands them side by side and the banner can move in the wind.
sprites['scene.parasol'] = {'layers': [standing(DECOR + 'Parasol.png', 0.5, 0.5, scale=1.5)]}
sprites['scene.table'] = {'layers': [standing(DECOR + 'Table.png', 0.5, 0.5, scale=1.0)]}
sprites['scene.sign'] = {'layers': [standing(DECOR + 'Sign2.png', 0.5, 0.5, scale=0.82)]}
sprites['scene.banner'] = {'layers': [standing(OLD + 'Decor/Banner.png', 0.5, 0.5, scale=1.1)]}
# A study group's book on a picnic table, a busker's drum and lute, a rug and a basket for a picnic, and a
# volleyball for a ring of friends on a quad.
sprites['scene.book'] = {'layers': [standing(OLD + 'Decor/Book.png', 0.5, 0.5, scale=0.85)]}
sprites['scene.lute'] = {'layers': [standing(OLD + 'Decor/MusicLute.png', 0.5, 0.5, scale=0.9)]}
sprites['scene.drum'] = {'layers': [standing(OLD + 'Decor/MusicDrum.png', 0.5, 0.5, scale=0.8)]}
sprites['scene.rug'] = {'layers': [standing(OLD + 'Decor/Rug.png', 0.5, 0.5, scale=1.5)]}
# Move-in day: a crate, a parcel and a small box stacked by a dorm's door.
sprites['scene.boxes'] = {'layers': [standing(DECOR + 'Boxes3.png', 0.5, 0.5, scale=0.8)]}
sprites['scene.basket'] = {'layers': [standing(OLD + 'Decor/Basket.png', 0.5, 0.5, scale=0.62)]}
sprites['play.volleyball'] = {'layers': [standing(ICONS + 'VolleyBall.png', 0.5, 0.5, scale=0.05)]}
sprites['decor.car'] = {'layers': [standing(CITY + 'Vehicles/CarType1_Blue_Front.png', 0.5, 0.5)]}
sprites['decor.lamp'] = {'layers': [standing(DECOR + 'StreetLampOn.png', 0.5, 0.5)]}
sprites['decor.hedge'] = {'layers': [standing(PLANTS + 'Bushes1.png', 0.5, 0.6)]}

# ----------------------------------------------------------------- people --
# The crowd is the students: twelve plain looks and the four athletes. Everyone else has a look of their own,
# so a hat or a uniform tells the player who they are (DESIGN.md section 32.3). Nothing here is assembled:
# each is the pack's own figure.
#   Two older-looking figures are kept for visiting parents, and the two in trucker caps for neighbours from the town.
PARENTS = [1, 4]
TOWNIES = [5, 6]
plain = [n for n in range(1, 17) if n not in PARENTS + TOWNIES]
students = [f'Character{n}' for n in plain] + [f'SportsPlayer{n}' for n in range(1, 5)]
jobs = [
    ('professor', ['Teacher']),
    ('advisor', ['Waiter']),
    ('guide', ['BellHop']),
    ('chef', ['Chef']),
    ('clerk', ['Busdriver']),
    ('booster', ['Mayor']),
    ('driver', ['Mailman']),
    ('townie', [f'Character{n}' for n in TOWNIES]),
    ('parent', [f'Character{n}' for n in PARENTS]),
    ('medic', ['Doctor']),
    ('officer', ['Police']),
    ('worker', ['ConstructionWorker']),
]
roles = {'athlete': len(plain)}
others = []
for role, names in jobs:
    roles[role] = len(students) + len(others)
    others += names
people = {
    'comment': 'Penzilla Giant NPC Sprite Pack. Each sheet is 8 frames by 5 rows. Row 1 faces south-west and row 3 north-west; the other two directions are mirrored. The first looks are the student crowd. The rest each have a job, named under roles: a role with two looks uses its number and the next.',
    'frames': 8,
    'frameMs': 84,
    'height': 36,
    'cell': [220, 220],
    'rows': {'sw': 1, 'nw': 3},
    'flip': {'se': 'sw', 'ne': 'nw'},
    'crowd': len(students),
    'roles': roles,
    'looks': [f'{NPC}NpcReadymade_{name}.png' for name in students + others],
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
        **banner_rules,
    },
    'glass': {
        # The pack's window glass is one flat blue. Lit, it is a pale warm yellow, which the game deepens with an orange glow.
        'window': {'from': [87, 191, 246], 'within': 14, 'to': [255, 238, 156]},
    },
    'swaps': {
        'comment': 'Colours taken from the pack: the rim drawn round the top of a grass tile, and the grass itself.',
        'rim': {'from': [149, 148, 55], 'to': [166, 173, 54], 'within': 12, 'above': 220},
    },
    'sprites': sprites,
    'trees': [name for name, _ in TREES],
    'people': people,
    'footprints': {
        'build.library': [2, 2], 'build.gym': [2, 1], 'build.dining': [2, 1], 'build.store': [2, 1], 'build.yard': [2, 1],
        'build.burger': [2, 1], 'build.diner': [2, 1], 'build.pizza': [2, 1], 'build.taco': [2, 1], 'build.foodcourt': [2, 2],
        'build.computerlab': [2, 1], 'build.makerspace': [2, 1], 'build.studycenter': [2, 1],
        'build.parking': [2, 1], 'build.track': [2, 2], 'build.courts': [2, 2], 'build.medical': [2, 2],
        'build.safety': [2, 2], 'build.stadium': [2, 2], 'stadium.1': [2, 2], 'stadium.2': [2, 2], 'stadium.3': [2, 2], 'stadium.4': [2, 3], 'stadium.5': [2, 3], 'build.parking.large': [2, 2], 'build.garage': [2, 2], 'build.pool': [2, 1], 'build.field': [2, 2], 'build.admin': [2, 2], 'pond.large': [3, 3], 'build.studentlife': [2, 2], 'build.school': [2, 2],
        'build.college': [2, 2], 'build.university': [2, 2], 'build.site': [2, 2], 'pond.medium': [2, 2],
        'reward.fountain': [2, 2], 'reward.post': [2, 1], 'reward.cinema': [2, 2], 'reward.radio': [2, 1], 'reward.museum': [2, 2], 'reward.alumni': [2, 1],
        'era.union': [2, 2], 'era.honors': [2, 1], 'era.welcome': [2, 1], 'era.commons': [3, 3], 'build.site.wide': [2, 1],
        'lab.sciences': [2, 2], 'lab.engineering': [2, 2], 'lab.health': [2, 2],
    },
    'menuCredit': 'Graphics created by Penzilla Design.',
    'credits': [
        {
            'name': 'Isometric City Builder Pack, Giant NPC Sprite Pack, Medieval City Builder Pack, and Sport and Games Pack',
            'author': 'Graphics created by Penzilla Design (penzilla.itch.io)',
            'licence': 'Penzilla Design Standard Licence: commercial use in one project, credit required, the files may not be shared',
            'licenceUrl': 'https://penzilla.itch.io/',
            'source': 'https://penzilla.itch.io/',
            'changes': 'Sprites are shrunk to the map scale and packed into one atlas. The drawn rim on the top edges of grass tiles is painted the colour of the grass, so tiles join. The lawn is a brightened grass tile. The gym is the plain hall with a dumbbell icon on its sign. The study center is the plain roofed shop with the open book from the Medieval pack on its signs. The outdoor court is cut from the tennis stadium. The first-aid icon is the pharmacy sign. Stadium tiers two and three add a second deck and a second stand made from the stand the stadium already has. Red crosses on the medical building, the health lab and the first-aid icon are recoloured green. Road pieces and cars are mirrored to face every way. The crossing is a road piece with its own lane mark enlarged and repeated across it. The recreation field is the soccer stadium with its stand, booth and banner cut away. For lit windows at night, the window glass of each apartment block is cut out on its own and recoloured a warm yellow. A club table, a picnic and a busker are the packs\' own parasol, table, sign, banner, rug, basket, drum and lute stood together. The school banner among the decorations has its red cloth recoloured to each school colour. Founders\' Commons is the packs\' own grass, paving, statue, trees, street lamps, benches and flowers laid out together. A student\'s room is the Medieval stable\'s back corner taken apart into its two walls, on the city pack\'s concrete tile, with the packs\' furniture and things; the Sport and Games icons in it are shrunk.',
        },
        {
            'name': 'Football stadium (3D model)',
            'author': 'Poly by Google, via Poly Pizza',
            'licence': 'Creative Commons Attribution 3.0 (CC-BY 3.0)',
            'licenceUrl': 'https://creativecommons.org/licenses/by/3.0/',
            'source': 'https://poly.pizza/m/6TZCkGh76m5',
            'changes': 'Rendered to flat pictures for stadium tiers four and five, with the ground slab and road removed, the colours changed to match the drawn pack, and a dark outline added.',
        },
    ],
}

path = os.path.join(ROOT, 'art', 'recipes', 'penzilla.json')
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(recipe, f, indent=1)
    f.write('\n')
print(f'wrote {os.path.relpath(path, ROOT)}: {len(sprites)} sprites, {len(people["looks"])} people')
