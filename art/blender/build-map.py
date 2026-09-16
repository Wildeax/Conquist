"""Build an editable map blockout from Conquist's actual rules layout.

Run with Blender --background --factory-startup --python-exit-code 1
--python art/blender/build-map.py. Outputs stay alongside this script.
"""
import json
from pathlib import Path

import bpy
from mathutils import Vector

OUTPUT = Path(__file__).resolve().parent / 'output'
layout = json.loads((OUTPUT / 'layout.json').read_text(encoding='utf-8'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'


def collection(name):
    result = bpy.data.collections.new(name)
    scene.collection.children.link(result)
    return result


tiles = collection('01_Terrain')
tokens = collection('02_Number_Tokens')
guides = collection('03_Gameplay_Guides')
presentation = collection('04_Presentation')
guides.hide_render = True


def move_to(obj, group):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    group.objects.link(obj)
    return obj


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = 0.82
    return mat


palette = {
    'Timber': (0.10, 0.28, 0.19),
    'Clay': (0.59, 0.23, 0.14),
    'Wool': (0.39, 0.60, 0.23),
    'Grain': (0.82, 0.56, 0.16),
    'Stone': (0.36, 0.43, 0.49),
    'Desert': (0.73, 0.58, 0.35),
}
materials = {name: material(name, color) for name, color in palette.items()}
sand = material('Coast_Sand', (0.47, 0.35, 0.22))
ocean = material('Ocean', (0.025, 0.14, 0.20))
ivory = material('Token_Ivory', (0.91, 0.84, 0.66))
ink = material('Token_Ink', (0.06, 0.07, 0.08))
red = material('Token_6_8', (0.63, 0.09, 0.045))


def cylinder(name, xy, radius, depth, height, mat, group, sides=6):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=sides, radius=radius, depth=depth,
        location=(xy[0], xy[1], height),
        # Blender starts cylinder vertices on +Y, already pointy-top.
        rotation=(0, 0, 0),
    )
    obj = move_to(bpy.context.object, group)
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Soft_Edges', 'BEVEL')
    bevel.width = 0.018
    bevel.segments = 2
    return obj


for tile in layout['hexes']:
    xy = (tile['x'], -tile['z'])
    resource = tile['resource'] or 'Desert'
    obj = cylinder(f"Hex_{tile['id']:02d}_{resource}", xy, 0.955, 0.25,
                   0.125, materials[resource], tiles)
    obj['hexId'] = tile['id']
    obj['resource'] = resource
    obj['number'] = tile['number']
    obj['q'], obj['r'] = tile['q'], tile['r']
    cylinder(f"Coast_{tile['id']:02d}", xy, 0.99, 0.10, -0.04, sand, tiles)
    if tile['number']:
        cylinder(f"Token_{tile['id']:02d}", xy, 0.25, 0.055,
                 0.292, ivory, tokens, sides=48)
        bpy.ops.object.text_add(location=(*xy, 0.323))
        label = move_to(bpy.context.object, tokens)
        label.name = f"Number_{tile['id']:02d}"
        label.data.body = str(tile['number'])
        label.data.align_x = 'CENTER'
        label.data.align_y = 'CENTER'
        label.data.size = 0.27
        label.data.extrude = 0.001
        label.data.materials.append(red if tile['number'] in (6, 8) else ink)
        # Mesh text survives glTF export. Keep the number in custom properties.
        label['number'] = tile['number']
        bpy.ops.object.convert(target='MESH')

for vertex in layout['vertices']:
    obj = bpy.data.objects.new(f"Vertex_{vertex['id']:02d}", None)
    guides.objects.link(obj)
    obj.location = (vertex['x'], -vertex['z'], 0.27)
    obj.empty_display_type = 'SPHERE'
    obj.empty_display_size = 0.055
    obj['vertexId'] = vertex['id']
    obj['harbour'] = -1 if vertex['harbour'] is None else vertex['harbour']

for edge in layout['edges']:
    a, b = (layout['vertices'][edge[key]] for key in ('a', 'b'))
    obj = bpy.data.objects.new(f"Edge_{edge['id']:02d}", None)
    guides.objects.link(obj)
    obj.location = ((a['x'] + b['x']) / 2, -(a['z'] + b['z']) / 2, 0.27)
    obj.empty_display_type = 'CUBE'
    obj.empty_display_size = 0.035
    obj['edgeId'], obj['a'], obj['b'] = edge['id'], edge['a'], edge['b']

cylinder('Ocean_Plinth', (0, 0), 5.65, 0.18, -0.21, ocean, presentation, sides=96)
bpy.ops.object.camera_add(location=(9, -12, 13))
camera = move_to(bpy.context.object, presentation)
camera.name = 'Map_Camera'
camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 13.8
scene.camera = camera

for name, location, energy, size in [
    ('Key', (0, -4, 10), 1700, 7),
    ('Fill', (-6, 2, 6), 900, 6),
]:
    bpy.ops.object.light_add(type='AREA', location=location)
    lamp = move_to(bpy.context.object, presentation)
    lamp.name, lamp.data.energy, lamp.data.shape, lamp.data.size = name, energy, 'DISK', size
    lamp.rotation_euler = (-lamp.location).to_track_quat('-Z', 'Y').to_euler()

scene.world.color = (0.25, 0.25, 0.25)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1400, 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUTPUT / 'map-preview.png')
scene['conquist_seed'] = layout['seed']
scene['stage'] = 'Blockout: dimensions and gameplay anchors; terrain art pending.'
guides.hide_viewport = True

# Open in a useful camera/material view without changing user preferences.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.shading.type = 'MATERIAL'

bpy.ops.object.select_all(action='DESELECT')
for group in (tiles, tokens):
    for obj in group.objects:
        obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT / 'conquist-map-base.glb'), export_format='GLB',
    use_selection=True, export_yup=True, export_extras=True,
    export_apply=True,
)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'conquist-map-base.blend'))
bpy.ops.render.render(write_still=True)
print(json.dumps({'hexes': len(layout['hexes']), 'vertices': len(layout['vertices']),
                  'edges': len(layout['edges']), 'output': str(OUTPUT)}))
