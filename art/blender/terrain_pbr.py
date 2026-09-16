"""Bake unique terrain PBR maps and create reusable procedural prop textures.

All maps are original Blender/numerical surfaces, requiring no external images.
Terrain color includes the approved vertex palette; remove that attribute after
baking to avoid multiplying it twice in glTF viewers. Tangent normals use +Y.
"""
import math
from pathlib import Path
import re

import bpy
import numpy as np


def texture_scene(terrain, kind, output):
    texture_dir = output / 'textures'
    texture_dir.mkdir(exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.render.bake.margin = 12
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.normal_space = 'TANGENT'
    bpy.ops.object.select_all(action='DESELECT')
    terrain.select_set(True)
    bpy.context.view_layer.objects.active = terrain
    mesh = terrain.data
    uv = mesh.uv_layers.new(name='PBR_UV')
    for polygon in mesh.polygons:
        is_top = (polygon.index < terrain['groundTopFaces'] if 'groundTopFaces' in terrain else
                  all(mesh.vertices[mesh.loops[i].vertex_index].co.z > -0.09 for i in polygon.loop_indices))
        points = [mesh.vertices[mesh.loops[i].vertex_index].co for i in polygon.loop_indices]
        angles = [math.atan2(p.y, p.x) / math.tau + 0.5 for p in points]
        if max(angles) - min(angles) > 0.5:
            angles = [a + 1 if a < 0.5 else a for a in angles]
        for i, p, angle in zip(polygon.loop_indices, points, angles):
            if is_top:
                uv.data[i].uv = (0.02 + (p.x / 2 + 0.5) * 0.96, 0.20 + (p.y / 2 + 0.5) * 0.78)
            elif polygon.normal.z < -0.5:
                uv.data[i].uv = (0.015 + (p.x / 2 + 0.5) * 0.08, 0.015 + (p.y / 2 + 0.5) * 0.08)
            else:
                uv.data[i].uv = (0.115 + angle * 0.855, 0.02 + (p.z + 0.10) / 0.18 * 0.13)
    mesh.uv_layers.active = uv
    material = mesh.materials[0]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    output_node = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    vertex_color = next(n for n in nodes if n.type == 'VERTEX_COLOR')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = {'Stone': 45, 'Clay': 80, 'Grain': 140, 'Desert': 210, 'Timber': 110}[kind]
    noise.inputs['Detail'].default_value = 5
    noise.inputs['Roughness'].default_value = 0.72
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.20
    ramp.color_ramp.elements[0].color = (0.56, 0.52, 0.46, 1)
    ramp.color_ramp.elements[1].position = 0.80
    ramp.color_ramp.elements[1].color = (1.14, 1.09, 1.0, 1)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    mix = nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 0.74 if kind != 'Desert' else 0.36
    links.new(vertex_color.outputs['Color'], mix.inputs[1])
    links.new(ramp.outputs['Color'], mix.inputs[2])
    base_output = mix.outputs[0]
    height_output = noise.outputs['Fac']
    if kind in ('Stone', 'Clay'):
        fracture = nodes.new('ShaderNodeTexVoronoi')
        fracture.feature = 'DISTANCE_TO_EDGE'
        fracture.inputs['Scale'].default_value = 28 if kind == 'Stone' else 46
        coordinates = nodes.new('ShaderNodeTexCoord')
        weathering = nodes.new('ShaderNodeTexNoise')
        weathering.inputs['Scale'].default_value = 5
        weathering.inputs['Detail'].default_value = 3
        warp = nodes.new('ShaderNodeVectorMath')
        warp.operation = 'SCALE'
        warp.inputs[3].default_value = 0.12
        links.new(weathering.outputs['Color'], warp.inputs[0])
        add = nodes.new('ShaderNodeVectorMath')
        add.operation = 'ADD'
        links.new(coordinates.outputs['Generated'], add.inputs[0])
        links.new(warp.outputs[0], add.inputs[1])
        links.new(add.outputs[0], fracture.inputs['Vector'])
        crack_ramp = nodes.new('ShaderNodeValToRGB')
        crack_ramp.color_ramp.elements[0].position = 0.002
        crack_ramp.color_ramp.elements[0].color = (0.19, 0.16, 0.12, 1)
        crack_ramp.color_ramp.elements[1].position = 0.016
        crack_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        links.new(fracture.outputs['Distance'], crack_ramp.inputs[0])
        crack_mix = nodes.new('ShaderNodeMixRGB')
        crack_mix.blend_type = 'MULTIPLY'
        # Patchy exposure above the flat construction strip; avoid a tiled crust.
        geometry = nodes.new('ShaderNodeNewGeometry')
        separate = nodes.new('ShaderNodeSeparateXYZ')
        links.new(geometry.outputs['Position'], separate.inputs[0])
        elevation = nodes.new('ShaderNodeMapRange')
        elevation.inputs['From Min'].default_value = 0.105
        elevation.inputs['From Max'].default_value = 0.22
        links.new(separate.outputs['Z'], elevation.inputs['Value'])
        patches = nodes.new('ShaderNodeMapRange')
        patches.inputs['From Min'].default_value = 0.40
        patches.inputs['From Max'].default_value = 0.68
        patches.inputs['To Max'].default_value = 0.28 if kind == 'Stone' else 0.38
        links.new(weathering.outputs['Fac'], patches.inputs['Value'])
        mask = nodes.new('ShaderNodeMath')
        mask.operation = 'MULTIPLY'
        links.new(elevation.outputs['Result'], mask.inputs[0])
        links.new(patches.outputs['Result'], mask.inputs[1])
        links.new(mask.outputs[0], crack_mix.inputs[0])
        links.new(base_output, crack_mix.inputs[1])
        links.new(crack_ramp.outputs[0], crack_mix.inputs[2])
        base_output = crack_mix.outputs[0]
        height_mix = nodes.new('ShaderNodeMixRGB')
        height_mix.blend_type = 'MULTIPLY'
        links.new(mask.outputs[0], height_mix.inputs[0])
        links.new(noise.outputs['Fac'], height_mix.inputs[1])
        links.new(crack_ramp.outputs[0], height_mix.inputs[2])
        height_output = height_mix.outputs[0]
    links.new(base_output, bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.42 if kind in ('Stone', 'Clay') else 0.23
    bump.inputs['Distance'].default_value = {'Stone': 0.009, 'Clay': 0.005, 'Grain': 0.003,
                                             'Desert': 0.001, 'Timber': 0.003}[kind]
    links.new(height_output, bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.78
    rough.inputs['To Max'].default_value = 0.98
    links.new(noise.outputs['Fac'], rough.inputs['Value'])
    links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    emission = nodes.new('ShaderNodeEmission')
    baked = {}
    for channel in ('BaseColor', 'Roughness', 'Normal'):
        image = bpy.data.images.new(kind + '_' + channel, width=1024, height=1024, alpha=False)
        image.colorspace_settings.name = 'sRGB' if channel == 'BaseColor' else 'Non-Color'
        target = nodes.new('ShaderNodeTexImage')
        target.image = image
        nodes.active = target
        if channel == 'Normal':
            links.new(bsdf.outputs[0], output_node.inputs['Surface'])
            bake_type = 'NORMAL'
        else:
            links.new(base_output if channel == 'BaseColor' else rough.outputs['Result'], emission.inputs['Color'])
            links.new(emission.outputs[0], output_node.inputs['Surface'])
            bake_type = 'EMIT'
        bpy.ops.object.bake(type=bake_type)
        image.filepath_raw = str(texture_dir / (kind + '_' + channel + '.png'))
        image.file_format = 'PNG'
        image.save()
        baked[channel] = image
        print('TEXTURE_BAKED ' + kind + ' ' + channel, flush=True)
    # Portable glTF-compatible shader with the same baked maps used in Blender.
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs[0], out.inputs[0])

    def connect_maps(mat, images):
        ns, ls = mat.node_tree.nodes, mat.node_tree.links
        shader = next(n for n in ns if n.type == 'BSDF_PRINCIPLED')
        for channel, image in images.items():
            tex = ns.new('ShaderNodeTexImage')
            tex.image = image
            tex.label = channel + ' PBR'
            if channel == 'Normal':
                normal = ns.new('ShaderNodeNormalMap')
                ls.new(tex.outputs['Color'], normal.inputs['Color'])
                ls.new(normal.outputs['Normal'], shader.inputs['Normal'])
            else:
                ls.new(tex.outputs['Color'], shader.inputs['Base Color' if channel == 'BaseColor' else 'Roughness'])
        mat['PBR_Maps'] = 'BaseColor, Roughness, Normal (+Y)'

    connect_maps(material, baked)
    for attribute in list(mesh.color_attributes):
        mesh.color_attributes.remove(attribute)
    terrain['textureResolution'] = 1024
    terrain['colorBakedFromVertices'] = True

    # Small seamless textures are shared by material across editable prop meshes.
    size = 256
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    tau = math.tau
    fine = (np.sin(tau * (xx * 31 + yy * 19)) * np.sin(tau * (xx * 13 - yy * 37))
            + 0.5 * np.sin(tau * (xx * 67 + yy * 43))) / 1.5
    broad = np.sin(tau * (xx * 3 + yy * 2)) * np.cos(tau * (xx * 5 - yy * 3))
    images_by_material = {}
    family_images = {}

    def family_for(name):
        name = name.lower()
        if any(word in name for word in ('cloth', 'burlap', 'patch', 'stitch', 'rope', 'binding')):
            return 'Cloth'
        if any(word in name for word in ('wood', 'bark')):
            return 'Bark'
        if 'leaf' in name or 'leaves' in name:
            return 'Leaf'
        if any(word in name for word in ('straw', 'wheat', 'grain')):
            return 'Straw'
        return 'Stone'

    def save_array(name, array, color=False):
        image = bpy.data.images.new(name, width=size, height=size, alpha=False)
        image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
        rgba = np.ones((size, size, 4), dtype=np.float32)
        if color:
            # Byte-backed Blender images store encoded sRGB pixel values.
            array = np.where(array <= 0.0031308, array * 12.92, 1.055 * np.power(array, 1 / 2.4) - 0.055)
        rgba[:, :, :3] = array[:, :, None] if array.ndim == 2 else array
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw = str(texture_dir / (name + '.png'))
        image.file_format = 'PNG'
        image.save()
        return image

    for obj in list(scene.objects):
        if obj.type != 'MESH' or obj == terrain or obj.name == 'Review_Backdrop':
            continue
        for mat in obj.data.materials:
            if not mat or mat.name in images_by_material:
                continue
            family = family_for(mat.name)
            if family not in family_images:
                if family == 'Bark':
                    relief = (0.5 + 0.5 * np.sin(tau * xx * 17 + 1.3 * np.sin(tau * yy * 3))) ** 3
                    relief = relief * 0.8 + fine * 0.07 + broad * 0.08
                elif family == 'Cloth':
                    relief = 0.35 * np.cos(tau * xx * 32) + 0.35 * np.cos(tau * yy * 32)
                    relief += fine * 0.07
                elif family == 'Leaf':
                    spine = np.exp(-((xx - 0.5) / 0.025) ** 2)
                    veins = (0.5 + 0.5 * np.cos(tau * (yy * 8 - np.abs(xx - 0.5) * 5))) ** 16
                    relief = spine * 0.42 + veins * 0.20 + broad * 0.08
                elif family == 'Straw':
                    relief = 0.40 * np.sin(tau * xx * 22 + 0.2 * np.sin(tau * yy * 3)) + fine * 0.08
                else:
                    relief = broad * 0.3 + fine * 0.25
                dx = (np.roll(relief, -1, 1) - np.roll(relief, 1, 1)) * 0.85
                dy = (np.roll(relief, -1, 0) - np.roll(relief, 1, 0)) * 0.85
                normal = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
                normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
                roughness = np.clip(0.87 + relief * 0.08, 0.68, 0.99)
                family_images[family] = (relief,
                    save_array('Prop_' + family + '_Normal', normal * 0.5 + 0.5),
                    save_array('Prop_' + family + '_Roughness', roughness))
            relief, normal_map, rough_map = family_images[family]
            mat.use_nodes = True
            shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            rgb = np.array(shader.inputs['Base Color'].default_value[:3] if shader else mat.diffuse_color[:3])
            variation = np.clip(0.92 + relief * 0.26 + fine * 0.035, 0.58, 1.25)
            color = np.clip(variation[:, :, None] * rgb, 0, 1)
            safe_name = re.sub(r'[^A-Za-z0-9_]', '_', mat.name)
            base = save_array(safe_name + '_BaseColor', color, True)
            mat.node_tree.nodes.clear()
            shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
            out = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
            mat.node_tree.links.new(shader.outputs[0], out.inputs[0])
            if family == 'Leaf':
                shader.inputs['Subsurface Weight'].default_value = 0.025
            maps = {'BaseColor': base, 'Normal': normal_map, 'Roughness': rough_map}
            connect_maps(mat, maps)
            images_by_material[mat.name] = maps
        # Dominant-axis projection is stable on tiny batched branches and ears.
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='PBR_UV')
        for polygon in obj.data.polygons:
            mat = obj.data.materials[polygon.material_index] if len(obj.data.materials) else None
            family = family_for(mat.name) if mat else 'Stone'
            normal = polygon.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            components = ((1, 2), (0, 2), (0, 1))[axis]
            scale = {'Bark': 0.045, 'Leaf': 0.018, 'Straw': 0.025, 'Cloth': 0.05, 'Stone': 0.12}[family]
            maximum = max(polygon.vertices)
            geometric_leaf = (family == 'Leaf' and len(polygon.vertices) == 3
                              and (obj.name.startswith('Woodland_Tree') or obj.name == 'Fallen_Leaves'))
            leaf_uv = ((0.5, 0.02), (0.02, 0.5), (0.5, 0.98), (0.98, 0.5), (0.5, 0.5))
            for index in polygon.loop_indices:
                vi = obj.data.loops[index].vertex_index
                point = obj.data.vertices[vi].co
                uv.data[index].uv = leaf_uv[vi - (maximum - 4)] if geometric_leaf else (
                    point[components[0]] / scale, point[components[1]] / scale)
    return {'terrainResolution': 1024, 'propResolution': size,
            'channels': ['BaseColor (sRGB)', 'Roughness (linear)', 'Normal (tangent +Y, linear)'],
            'terrainColorIncludesVertexPalette': True, 'propMaterials': len(images_by_material),
            'files': sorted(path.name for path in texture_dir.glob('*.png')),
            'note': 'Unique baked terrain UV atlas; repeating original prop textures. Images embedded in GLB and packed in blend.'}
