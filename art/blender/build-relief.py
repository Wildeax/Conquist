"""Separate review pieces: realistic relief with original procedural surfaces.

Blender --background --factory-startup --python-exit-code 1 --python this_file
-- [--terrain Stone|Clay|Grain|Desert|Timber] [--height 1.0] [--detail 1.0] [--subdivisions 72]
The base map and live game are never overwritten.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--terrain', choices=('Stone', 'Clay', 'Grain', 'Desert', 'Timber'), default='Stone')
parser.add_argument('--height', type=float, default=1.0)
parser.add_argument('--detail', type=float, default=1.0)
parser.add_argument('--subdivisions', type=int, default=72)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
if not 0.1 <= args.height <= 2 or not 0 <= args.detail <= 2 or not 12 <= args.subdivisions <= 160:
    raise ValueError('Height: 0.1–2; detail: 0–2; subdivisions: 12–160.')
ROOT = Path(__file__).resolve().parent
IS_CLAY = args.terrain == 'Clay'
IS_GRAIN = args.terrain == 'Grain'
IS_DESERT = args.terrain == 'Desert'
IS_FOREST = args.terrain == 'Timber'
STEM = {'Stone': 'stone-relief-v01', 'Clay': 'clay-relief-v01', 'Grain': 'wheat-fields-v01',
        'Desert': 'desert-relief-v01', 'Timber': 'forest-v01'}[args.terrain]
OUTPUT = ROOT / 'output' / ('relief-v01' if args.terrain == 'Stone' else STEM)
OUTPUT.mkdir(parents=True, exist_ok=True)
layout = json.loads((ROOT / 'output' / 'layout.json').read_text(encoding='utf-8'))
tile = next(h for h in layout['hexes'] if h['resource'] == (None if IS_DESERT else args.terrain))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene['review_stage'] = ('02: clay hills; softer slopes and exposed earth' if IS_CLAY
                         else '01: one mountain tile; relief, silhouette and scale only')
scene['source_hex_id'] = tile['id']
if IS_GRAIN:
    scene['review_stage'] = '03: wheat fields; gentle terrain, planted rows and farm paths'
if IS_DESERT:
    scene['review_stage'] = '04: desert; wind-shaped dunes and sand ripples'
if IS_FOREST:
    scene['review_stage'] = '05: broad forest; layered canopy and winding woodland path'


def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hash_value(x, y):
    n = (x * 374761393 + y * 668265263 + 192837) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffffff) / 4294967295 * 2 - 1


def noise(x, y):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = hash_value(ix, iy) * (1 - fx) + hash_value(ix + 1, iy) * fx
    b = hash_value(ix, iy + 1) * (1 - fx) + hash_value(ix + 1, iy + 1) * fx
    return a * (1 - fy) + b * fy


def fbm(x, y, octaves=5):
    value, amplitude = 0, 0.5
    for _ in range(octaves):
        value += amplitude * noise(x, y)
        x, y = x * 2.07 + 31.3, y * 2.07 - 17.4
        amplitude *= 0.5
    return value


RADIUS = 0.955
APOTHEM = RADIUS * math.sqrt(3) / 2
normals = [(math.cos(i * math.pi / 3), math.sin(i * math.pi / 3)) for i in range(6)]


def farm_coordinates(x, y):
    return x * 0.961 + y * 0.276, -x * 0.276 + y * 0.961


def farm_plot(x, y):
    u, v = farm_coordinates(x, y)
    margin = min(APOTHEM - x * nx - y * ny for nx, ny in normals)
    if margin < 0.145 or abs(u + 0.016 * math.sin(v * 9)) < 0.048 or abs(v + 0.12 + 0.018 * math.sin(u * 9)) < 0.043:
        return -1
    return (0 if u < 0 else 1) + (0 if v > -0.12 else 2)


def height(x, y):
    margin = min(APOTHEM - x * nx - y * ny for nx, ny in normals)
    fade = smooth(0.065, 0.27, margin)
    warped_x = x + 0.065 * fbm(x * 4 + 2, y * 4)
    warped_y = y + 0.06 * fbm(x * 4, y * 4 - 3)
    if IS_DESERT:
        u, v = x * 0.93 + y * 0.368, -x * 0.368 + y * 0.93
        dunes = 0
        # Three staggered curved crests: broad windward slope, shorter slip face.
        for offset, peak, center, extent in ((0.25, 0.28, -0.08, 0.55),
                                             (-0.22, 0.18, 0.13, 0.48),
                                             (0.60, 0.12, 0.16, 0.42)):
            crest = offset + 0.14 * math.sin(u * 3.6 + offset * 2) - 0.12 * u * u
            distance = v - crest
            width = 0.24 if distance < 0 else 0.105
            dunes += peak * math.exp(-(distance / width) ** 2) * math.exp(-((u - center) / extent) ** 4)
        ripple = 0.0022 * math.sin(170 * v + 5 * math.sin(u * 9) + 3 * fbm(x * 8, y * 8))
        return 0.08 + fade * max(0, 0.013 + dunes + args.detail * ripple) * args.height
    if IS_FOREST:
        rolling = (0.13 * math.exp(-((x + 0.22) / 0.51) ** 2 - ((y - 0.27) / 0.5) ** 2)
                   + 0.055 * math.exp(-((x - 0.33) / 0.36) ** 2 - ((y + 0.21) / 0.45) ** 2))
        return 0.08 + fade * max(0, rolling + args.detail * 0.013 * fbm(x * 18, y * 18)) * args.height
    if IS_GRAIN:
        u, v = farm_coordinates(x, y)
        rolling = (0.105 * math.exp(-((x + 0.28) / 0.52) ** 2 - ((y - 0.21) / 0.48) ** 2)
                   + 0.060 * math.exp(-((x - 0.33) / 0.46) ** 2 - ((y + 0.14) / 0.52) ** 2))
        plot = farm_plot(x, y)
        # The tilled ridges and planted rows use the same spacing.
        rows = (0.5 + 0.5 * math.cos(2 * math.pi * u / 0.026)) ** 3 if plot >= 0 else 0
        rough = 0.0035 * fbm(x * 33, y * 33)
        return 0.08 + fade * max(0, rolling + args.detail * (0.004 * rows + rough)) * args.height
    if IS_CLAY:
        # Broad rounded hills, a shallow winding drainage and lower foothills.
        u, v = warped_x, warped_y
        hills = (0.27 * math.exp(-((u + 0.27) / 0.34) ** 2 - ((v - 0.13) / 0.32) ** 2)
                 + 0.23 * math.exp(-((u - 0.28) / 0.32) ** 2 - ((v - 0.24) / 0.30) ** 2)
                 + 0.15 * math.exp(-((u + 0.02) / 0.42) ** 2 - ((v + 0.31) / 0.26) ** 2))
        channel_x = 0.045 + 0.12 * math.sin(v * 5.0 + 0.4)
        drainage = 0.045 * math.exp(-((u - channel_x) / 0.057) ** 2)
        drainage *= 1 - smooth(0.28, 0.60, v)
        # Fine gullies in the exposed south-facing bank; the summits stay soft.
        bank = math.exp(-((v + 0.015) / 0.15) ** 2)
        runnels = 0.012 * bank * (0.5 + 0.5 * math.sin(u * 74 + 7 * fbm(u * 9, v * 9))) ** 8
        rough = 0.014 * fbm(x * 19, y * 19) + 0.004 * fbm(x * 48, y * 48, 3)
        return 0.08 + fade * max(0, hills - drainage + args.detail * (rough - runnels)) * args.height
    ridge_y = 0.12 + 0.12 * math.sin(5.3 * warped_x) + 0.028 * math.sin(14 * warped_x)
    profile = (0.48 * math.exp(-((warped_x + 0.20) / 0.31) ** 2)
               + 0.30 * math.exp(-((warped_x - 0.29) / 0.20) ** 2))
    ridge = profile * math.exp(-abs(warped_y - ridge_y) / 0.21)
    spur = 0.19 * math.exp(-abs(warped_y + 0.48 * warped_x + 0.12) / 0.12)
    spur *= math.exp(-((warped_x + 0.10) / 0.5) ** 4)
    foothill = 0.10 * math.exp(-(x * x + y * y) / 0.4)
    # Branching-looking runnels cut the slopes; macro relief stays readable.
    angle = math.atan2(y - 0.10, x + 0.18)
    radius = math.hypot(x + 0.18, y - 0.10)
    runnels = (0.5 + 0.5 * math.sin(angle * 21 + 7 * fbm(x * 5, y * 5))) ** 10
    runnels *= 0.044 * smooth(0.09, 0.28, radius)
    rough = 0.055 * fbm(x * 17, y * 17, 5) + 0.017 * fbm(x * 43, y * 43, 3)
    return 0.08 + fade * max(0, ridge + spur + foothill + args.detail * (rough - runnels)) * args.height


vertices, faces, lookup = [], [], {}


def vertex(x, y):
    key = (round(x, 9), round(y, 9))
    if key not in lookup:
        lookup[key] = len(vertices)
        vertices.append((x, y, height(x, y)))
    return lookup[key]


corners = [(RADIUS * math.cos(math.radians(30 + 60 * i)),
            RADIUS * math.sin(math.radians(30 + 60 * i))) for i in range(6)]
n = args.subdivisions
for sector in range(6):
    a, b = corners[sector], corners[(sector + 1) % 6]
    grid = {}
    for i in range(n + 1):
        for j in range(n + 1 - i):
            grid[i, j] = vertex((a[0] * i + b[0] * j) / n, (a[1] * i + b[1] * j) / n)
    for i in range(n):
        for j in range(n - i):
            faces.append((grid[i, j], grid[i + 1, j], grid[i, j + 1]))
            if i + j < n - 1:
                faces.append((grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]))

top_count = len(vertices)
boundary = [i for i, (x, y, _) in enumerate(vertices)
            if min(APOTHEM - x * nx - y * ny for nx, ny in normals) < 1e-7]
boundary.sort(key=lambda i: math.atan2(vertices[i][1], vertices[i][0]))
lower = []
for i in boundary:
    lower.append(len(vertices))
    vertices.append((*vertices[i][:2], -0.10))
bottom = len(vertices)
vertices.append((0, 0, -0.10))
top_faces = len(faces)
for i in range(len(boundary)):
    j = (i + 1) % len(boundary)
    faces.append((boundary[i], lower[i], lower[j], boundary[j]))
    faces.append((bottom, lower[j], lower[i]))

mesh = bpy.data.meshes.new(f'{args.terrain}_Relief_Mesh')
mesh.from_pydata(vertices, [], faces)
mesh.update()
terrain = bpy.data.objects.new(f'{args.terrain}_Relief_v01', mesh)
scene.collection.objects.link(terrain)
terrain['hexId'] = tile['id']
terrain['resource'] = args.terrain
terrain['sourceGameX'] = tile['x']
terrain['sourceGameZ'] = tile['z']
terrain['prefabOrigin'] = 'tile center; Blender Z up; glTF Y up'
terrain['heightMultiplier'] = args.height
terrain['detailMultiplier'] = args.detail
color_name = 'Clay_Color' if IS_CLAY else 'Rock_Color'
colors = mesh.color_attributes.new(name=color_name, type='FLOAT_COLOR', domain='POINT')
for i, (x, y, z) in enumerate(vertices):
    e = 0.006
    slope = math.hypot(height(x + e, y) - height(x - e, y),
                       height(x, y + e) - height(x, y - e)) / (2 * e)
    exposed = smooth(0.35, 1.3, slope)
    dirt, rock = (0.20, 0.17, 0.125), (0.29, 0.285, 0.26)
    variation = 0.83 + 0.32 * fbm(x * 27, y * 27)
    if IS_CLAY:
        exposed = smooth(0.24, 0.85, slope)
        dirt, rock = (0.245, 0.137, 0.068), (0.33, 0.103, 0.045)
        # Weathered ochre on gentle ground; iron-red strata on exposed banks.
        strata = 0.91 + 0.09 * math.sin((z - x * 0.045) * 125 + 1.5 * fbm(x * 5, y * 5))
        variation = (0.87 + 0.27 * fbm(x * 23 + 4, y * 23)) * (1 - exposed + exposed * strata)
    if IS_GRAIN:
        plot = farm_plot(x, y)
        exposed = 0
        dirt = (0.13, 0.071, 0.026) if plot >= 0 else (0.235, 0.175, 0.09)
        if i >= top_count:
            dirt = (0.15, 0.095, 0.043)
        variation = 0.86 + 0.24 * fbm(x * 29, y * 29)
    if IS_DESERT:
        exposed = smooth(0.10, 0.70, slope)
        dirt, rock = (0.52, 0.34, 0.165), (0.61, 0.415, 0.215)
        variation = 0.94 + 0.12 * fbm(x * 25, y * 25)
        if i >= top_count:
            dirt = rock = (0.37, 0.235, 0.115)
    if IS_FOREST:
        exposed = smooth(-0.12, 0.25, fbm(x * 9, y * 9))
        dirt, rock = (0.075, 0.048, 0.024), (0.09, 0.115, 0.035)
        if abs(x - (0.06 + 0.15 * math.sin(y * 4.5))) < 0.045:
            dirt = rock = (0.20, 0.145, 0.078)
        variation = 0.86 + 0.24 * fbm(x * 29, y * 29)
    colors.data[i].color = (*[(dirt[c] * (1 - exposed) + rock[c] * exposed) * variation for c in range(3)], 1)

mat = bpy.data.materials.new('Tilled_Soil_And_Paths' if IS_GRAIN else 'Exposed_Clay_And_Ochre' if IS_CLAY else 'Weathered_Rock')
if IS_DESERT:
    mat.name = 'Warm_Windblown_Sand'
if IS_FOREST:
    mat.name = 'Woodland_Soil_Moss_And_Path'
mat.use_nodes = True
mat.diffuse_color = (0.29, 0.12, 0.056, 1) if IS_CLAY else (0.25, 0.23, 0.19, 1)
nodes, links = mat.node_tree.nodes, mat.node_tree.links
bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = 0.91
color = nodes.new('ShaderNodeVertexColor')
color.layer_name = color_name
links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
tex = nodes.new('ShaderNodeTexNoise')
tex.inputs['Scale'].default_value = 145
tex.inputs['Detail'].default_value = 3
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.28
bump.inputs['Distance'].default_value = 0.006 if IS_GRAIN else 0.008 if IS_CLAY else 0.016
if IS_DESERT:
    bump.inputs['Distance'].default_value = 0.002
if IS_FOREST:
    bump.inputs['Distance'].default_value = 0.004
links.new(tex.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
mesh.materials.append(mat)
for polygon in mesh.polygons:
    polygon.use_smooth = polygon.index < top_faces

# Explicit geometry sanity checks, including watertightness at the six seams.
edge_uses = {}
for face in faces:
    for a, b in zip(face, (*face[1:], face[0])):
        edge = tuple(sorted((a, b)))
        edge_uses[edge] = edge_uses.get(edge, 0) + 1
assert all(count == 2 for count in edge_uses.values()), 'Mesh is not watertight'
assert all(math.isfinite(value) for point in vertices for value in point)
assert all(abs(vertices[i][2] - 0.08) < 1e-6 for i in boundary)
assert all(mesh.polygons[i].normal.z > 0 for i in range(top_faces))

bpy.context.view_layer.objects.active = terrain
terrain.select_set(True)
crop_report = None
crop_objects = []
prop_report = None
prop_objects = []
forest_report = None
forest_objects = []
if IS_GRAIN:
    sys.path.insert(0, str(ROOT))
    from wheat_geometry import create_wheat
    from scarecrow_geometry import create_scarecrow
    crop_objects, crop_report = create_wheat(height, farm_plot, tile['id'])
    prop_objects, prop_report = create_scarecrow(height, tile['id'])
if IS_FOREST:
    sys.path.insert(0, str(ROOT))
    from forest_geometry import create_forest
    forest_objects, forest_report = create_forest(height, tile['id'])
bpy.ops.object.select_all(action='DESELECT')
for obj in [terrain, *crop_objects, *prop_objects, *forest_objects]:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / f'{STEM}.glb'), export_format='GLB',
                          use_selection=True, export_extras=True, export_yup=True, export_apply=True)
bpy.ops.object.select_all(action='DESELECT')

# A neutral studio floor lets the silhouette, gullies and height be reviewed.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.105))
floor = bpy.context.object
floor.name = 'Review_Backdrop'
floor_mat = bpy.data.materials.new('Backdrop')
floor_mat.diffuse_color = (0.065, 0.075, 0.084, 1)
floor.data.materials.append(floor_mat)
for name, location, energy, size in [('Key', (-3, -4, 5), 450, 2.3), ('Fill', (3, 1, 3), 120, 3)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    lamp = bpy.context.object
    lamp.name, lamp.data.energy, lamp.data.size = name, energy, size
    lamp.rotation_euler = (Vector((0, 0, 0.1)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(2.2, -3.3, 2.7))
camera = bpy.context.object
camera.name = 'Relief_Review_Camera'
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.8
camera.rotation_euler = (Vector((0, 0, 0.15)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera
scene.world.color = (0.15, 0.15, 0.15)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1400, 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUTPUT / 'relief-perspective.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
terrain.select_set(True)
bpy.context.view_layer.objects.active = terrain
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / f'{STEM}.blend'))
bpy.ops.render.render(write_still=True)
camera.location = (0, -0.001, 4)
camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.ortho_scale = 2.35
scene.render.filepath = str(OUTPUT / 'relief-top.png')
bpy.ops.render.render(write_still=True)
if IS_GRAIN:
    camera.location = (0.70, -1.15, 0.95)
    camera.rotation_euler = (Vector((-0.14, -0.12, 0.14)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 0.90
    scene.render.resolution_x, scene.render.resolution_y = 1100, 900
    scene.render.filepath = str(OUTPUT / 'wheat-detail.png')
    bpy.ops.render.render(write_still=True)
report = {'resource': args.terrain, 'sourceHexId': tile['id'], 'topVertices': top_count, 'vertices': len(vertices),
          'faces': len(faces), 'height': max(v[2] for v in vertices), 'watertight': True,
          'edgeHeight': 0.08, 'radius': RADIUS, 'parameters': vars(args),
          'note': 'Review piece only. Blender micro-bump is not baked into GLB; vertex colors and geometric relief are exported.'}
if crop_report:
    report['crops'] = crop_report
if prop_report:
    report['prop'] = prop_report
if forest_report:
    report['forest'] = forest_report
(OUTPUT / 'geometry-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
