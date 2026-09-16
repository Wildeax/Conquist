"""Refine approved v01 scenes into independent v02 scenes with portable PBR maps.

Run in Blender background: --python this_file -- --terrain All|Stone|Clay|Grain|Desert|Timber
Original scenes stay untouched. Detail-only checkpoints precede texture generation.
"""
import argparse
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from terrain_pbr import texture_scene

parser = argparse.ArgumentParser()
parser.add_argument('--terrain', choices=('All', 'Stone', 'Clay', 'Grain', 'Desert', 'Timber'), default='All')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
SOURCES = {'Stone': ('relief-v01', 'stone-relief-v01'), 'Clay': ('clay-relief-v01', 'clay-relief-v01'),
           'Grain': ('wheat-fields-v01', 'wheat-fields-v01'), 'Desert': ('desert-relief-v01', 'desert-relief-v01'),
           'Timber': ('forest-v01', 'forest-v01')}


def refine(kind):
    folder, stem = SOURCES[kind]
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'output' / folder / (stem + '.blend')))
    stem = stem.replace('v01', 'v02')
    output = ROOT / 'output' / stem
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    terrain = next(obj for obj in scene.objects if obj.type == 'MESH' and obj.name.startswith(kind + '_Relief'))
    terrain.name = kind + '_Relief_v02'
    bvh = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
    rng = random.Random(19304 + list(SOURCES).index(kind))
    group = bpy.data.collections.new('Details_v02_' + kind)
    scene.collection.children.link(group)
    counts = {}

    def sample(x, y):
        point, normal, _, _ = bvh.ray_cast(Vector((x, y, 3)), Vector((0, 0, -1)))
        if point is None:
            raise ValueError('Detail outside tile')
        return point.z, normal

    def margin(x, y):
        return min(0.955 * math.sqrt(3) / 2 - x * math.cos(i * math.pi / 3)
                   - y * math.sin(i * math.pi / 3) for i in range(6))

    def material(name, rgb):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mat.diffuse_color = (*rgb, 1)
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = 0.90
        return mat

    stone = material('Detail_Rock', {'Stone': (0.25, 0.25, 0.22), 'Clay': (0.32, 0.13, 0.065),
                     'Desert': (0.40, 0.285, 0.16)}.get(kind, (0.20, 0.205, 0.15)))
    wood = material('Detail_Weathered_Wood', (0.14, 0.085, 0.041))
    straw = material('Detail_Dry_Straw', (0.44, 0.29, 0.075))
    green = material('Detail_Fern_Leaf', (0.05, 0.13, 0.018))
    litter = material('Detail_Fallen_Leaf', (0.19, 0.095, 0.027))
    mushroom = material('Detail_Mushroom_Cap', (0.26, 0.085, 0.033))
    cream = material('Detail_Mushroom_Stem', (0.38, 0.31, 0.20))

    def attach(obj, name, mat):
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        group.objects.link(obj)
        obj.name = name
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        obj['hexId'], obj['resource'], obj['revision'] = terrain['hexId'], kind, 2
        counts[name.split('_')[0]] = counts.get(name.split('_')[0], 0) + 1
        return obj

    def beam(name, a, b, radius, mat):
        a, b = Vector(a), Vector(b)
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=radius, radius2=radius * 0.63,
                                       depth=(b - a).length, location=(a + b) / 2)
        obj = attach(bpy.context.object, name, mat)
        obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
        return obj

    def rock_at(x, y, size, name):
        z, _ = sample(x, y)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(x, y, z + size * 0.1))
        obj = attach(bpy.context.object, name, stone)
        for vertex in obj.data.vertices:
            vertex.co *= rng.uniform(0.79, 1.18)
            vertex.co.z = max(-0.4, vertex.co.z)
        obj.scale = (size, size * rng.uniform(0.65, 1.1), size * rng.uniform(0.42, 0.85))
        obj.rotation_euler.z = rng.uniform(0, math.tau)

    desired = {'Stone': 56, 'Clay': 38, 'Grain': 12, 'Desert': 24, 'Timber': 24}[kind]
    placed = 0
    for _ in range(5000):
        x, y = rng.uniform(-0.70, 0.70), rng.uniform(-0.77, 0.77)
        if margin(x, y) < 0.15:
            continue
        z, normal = sample(x, y)
        if normal.z < 0.72:
            continue
        if kind == 'Desert' and (z > 0.17 or x < 0.15):
            continue
        if kind == 'Grain' and abs(y + 0.12) > 0.06:
            continue
        size = rng.uniform(0.009, 0.025)
        if kind == 'Stone' and placed < 9:
            size = rng.uniform(0.034, 0.06)
        if kind == 'Desert' and placed < 4:
            size = rng.uniform(0.035, 0.065)
        rock_at(x, y, size, 'Talus' if kind == 'Stone' else 'ErodedStone' if kind == 'Desert' else 'Pebble')
        placed += 1
        if placed == desired:
            break

    # Small mesh details are batched by material, retaining editable collections.
    def mesh_detail(name, vertices, faces, mat):
        mesh = bpy.data.meshes.new(name + '_Mesh')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        return attach(obj, name, mat)

    if kind == 'Grain':
        # Hand-tied sheaves on the harvested strip, using the field's rotation.
        for sheaf in range(3):
            u, v = -0.45 + sheaf * 0.075, -0.40 + sheaf * 0.025
            x, y = 0.961 * u - 0.276 * v, 0.276 * u + 0.961 * v
            z, _ = sample(x, y)
            for stalk in range(15):
                angle = math.tau * stalk / 15
                radius = rng.uniform(0.006, 0.016)
                a = (x + radius * math.cos(angle), y + radius * math.sin(angle), z)
                b = (x + radius * 0.20 * math.cos(angle), y + radius * 0.20 * math.sin(angle), z + 0.042)
                c = (x + radius * 0.85 * math.cos(angle), y + radius * 0.85 * math.sin(angle), z + rng.uniform(0.075, 0.095))
                beam('SheafStem', a, b, 0.00075, straw)
                beam('SheafStem', b, c, 0.00075, straw)
                beam('SheafEar', c, (c[0], c[1], c[2] + 0.011), 0.0024, straw)
            bpy.ops.mesh.primitive_torus_add(major_radius=0.005, minor_radius=0.0013, major_segments=16,
                                            minor_segments=5, location=(x, y, z + 0.042))
            attach(bpy.context.object, 'SheafBinding', wood)
        for i in range(55):
            x, y = rng.uniform(-0.45, 0.48), rng.uniform(-0.17, -0.11)
            z, _ = sample(x, y)
            dx, dy = rng.uniform(-0.019, 0.019), rng.uniform(-0.012, 0.012)
            z2, _ = sample(x + dx, y + dy)
            beam('LooseStraw', (x, y, z + 0.002), (x + dx, y + dy, z2 + 0.002), 0.0005, straw)

    if kind == 'Timber':
        fern_vertices, fern_faces, leaf_vertices, leaf_faces = [], [], [], []
        for plant in range(42):
            x, y = rng.uniform(-0.63, 0.63), rng.uniform(-0.68, 0.68)
            if margin(x, y) < 0.15 or abs(x - (0.06 + 0.15 * math.sin(y * 4.5))) < 0.06:
                continue
            z, _ = sample(x, y)
            for frond in range(7):
                angle = math.tau * frond / 7 + plant
                forward = Vector((math.cos(angle), math.sin(angle), 0))
                sideways = Vector((-math.sin(angle), math.cos(angle), 0))
                for k in range(1, 8):
                    t = k / 8
                    center = Vector((x, y, z + 0.004 + 0.025 * math.sin(t * math.pi * 0.8))) + forward * t * 0.045
                    for side in (-1, 1):
                        tip = center + sideways * side * 0.012 * (1 - t) + forward * 0.008
                        index = len(fern_vertices)
                        fern_vertices.extend((tuple(center - forward * 0.002), tuple(tip), tuple(center + forward * 0.002)))
                        fern_faces.append((index, index + 1, index + 2))
        mesh_detail('Fern_Fronds', fern_vertices, fern_faces, green)
        for i in range(340):
            x, y = rng.uniform(-0.7, 0.7), rng.uniform(-0.76, 0.76)
            if margin(x, y) < 0.105:
                continue
            z, _ = sample(x, y)
            angle, length = rng.uniform(0, math.tau), rng.uniform(0.005, 0.012)
            a = Vector((math.cos(angle) * length, math.sin(angle) * length, 0))
            b = Vector((-a.y * 0.45, a.x * 0.45, 0))
            center = Vector((x, y, z + 0.0014))
            j = len(leaf_vertices)
            leaf_vertices.extend(tuple(p) for p in (center - a, center - b, center + a, center + b, center + Vector((0, 0, 0.001))))
            leaf_faces.extend((j + k, j + (k + 1) % 4, j + 4) for k in range(4))
        mesh_detail('Fallen_Leaves', leaf_vertices, leaf_faces, litter)
        for i in range(16):
            x, y = -0.34 + rng.uniform(-0.06, 0.06), -0.46 + rng.uniform(-0.05, 0.05)
            z, _ = sample(x, y)
            h = rng.uniform(0.009, 0.018)
            beam('MushroomStem', (x, y, z), (x, y, z + h), 0.0017, cream)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=(x, y, z + h))
            obj = attach(bpy.context.object, 'MushroomCap', mushroom)
            obj.scale = (h * 0.47, h * 0.47, h * 0.20)
            for p in obj.data.polygons:
                p.use_smooth = True

    if kind == 'Desert':
        for i in range(3):
            x, y = 0.43 + i * 0.055, -0.24 + i * 0.12
            z, _ = sample(x, y)
            for branch in range(5):
                angle = branch * 2.4
                beam('DryScrub', (x, y, z), (x + math.cos(angle) * 0.020, y + math.sin(angle) * 0.020,
                                           z + rng.uniform(0.018, 0.036)), 0.0010, wood)

    bpy.context.view_layer.update()
    # Capture editable geometry before the surface pass, without touching v01.
    scene['review_stage'] = 'v02: additional geometry, then portable PBR textures'
    bpy.ops.wm.save_as_mainfile(filepath=str(output / (stem + '-details.blend')))
    print('DETAILS_READY ' + kind + ' ' + json.dumps(counts), flush=True)
    texture_report = texture_scene(terrain, kind, output)
    export_objects = [obj for obj in scene.objects if obj.type == 'MESH' and obj.name != 'Review_Backdrop']
    export_objects += [obj for obj in scene.objects if obj.type == 'EMPTY' and obj.get('propType')]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = terrain
    bpy.ops.export_scene.gltf(filepath=str(output / (stem + '.glb')), export_format='GLB',
                             use_selection=True, export_extras=True, export_yup=True, export_apply=True)
    for image in bpy.data.images:
        if image.source == 'FILE' and image.has_data:
            image.pack()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1200
    scene.render.filepath = str(output / 'textured-perspective.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(output / (stem + '.blend')))
    bpy.ops.render.render(write_still=True)
    camera = scene.camera
    target = {'Stone': (-0.12, 0, 0.34), 'Clay': (0.02, -0.10, 0.15),
              'Grain': (-0.14, -0.16, 0.19), 'Desert': (0.22, -0.05, 0.15),
              'Timber': (-0.26, -0.43, 0.16)}[kind]
    camera.location = Vector(target) + Vector((0.62, -1.05, 0.70))
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 0.85 if kind == 'Timber' else 1.0
    scene.render.resolution_x, scene.render.resolution_y = 1200, 1000
    scene.render.filepath = str(output / 'textured-detail.png')
    bpy.ops.render.render(write_still=True)
    report = {'resource': kind, 'source': str(ROOT / 'output' / folder / (SOURCES[kind][1] + '.blend')),
              'revision': 2, 'details': counts, 'textures': texture_report,
              'meshObjects': sum(obj.type == 'MESH' for obj in export_objects),
              'note': 'Editable review assets. PBR maps embedded in GLB. Game LOD and board integration pending.'}
    (output / 'detail-texture-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('REVISION_COMPLETE ' + kind + ' ' + str(output), flush=True)


for kind in SOURCES if args.terrain == 'All' else (args.terrain,):
    refine(kind)
