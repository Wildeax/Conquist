"""Rustic scarecrow prop, editable parts parented to one placement handle."""
import math
import random

import bpy
from mathutils import Vector


def create_scarecrow(ground_height, hex_id):
    group = bpy.data.collections.new('Scarecrow')
    bpy.context.scene.collection.children.link(group)
    root = bpy.data.objects.new('Scarecrow_Placement', None)
    group.objects.link(root)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.04
    root.location = (0.015, -0.125, ground_height(0.015, -0.125))
    root.rotation_euler.z = 0.45
    root['hexId'], root['propType'] = hex_id, 'scarecrow'
    objects = [root]
    rng = random.Random(1709)

    def material(name, color):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Roughness'].default_value = 0.93
        return mat

    wood = material('Scarecrow_Weathered_Wood', (0.15, 0.082, 0.030))
    cloth = material('Scarecrow_Faded_Blue_Cloth', (0.055, 0.11, 0.135))
    seam = material('Scarecrow_Cloth_Seams', (0.029, 0.047, 0.05))
    sack = material('Scarecrow_Burlap', (0.38, 0.27, 0.14))
    straw = material('Scarecrow_Straw', (0.49, 0.32, 0.105))
    rope = material('Scarecrow_Rope', (0.19, 0.12, 0.05))
    patch = material('Scarecrow_Ochre_Patch', (0.30, 0.15, 0.055))
    dark = material('Scarecrow_Dark_Stitches', (0.027, 0.017, 0.009))

    def attach(obj, name, mat):
        for previous in list(obj.users_collection):
            previous.objects.unlink(obj)
        group.objects.link(obj)
        obj.name = name
        obj.parent = root
        obj.data.materials.append(mat)
        objects.append(obj)
        return obj

    def beam(name, a, b, radius, mat, sides=8):
        a, b = Vector(a), Vector(b)
        bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius,
                                            depth=(b - a).length, location=(a + b) / 2)
        obj = attach(bpy.context.object, name, mat)
        obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
        return obj

    def mesh_object(name, vertices, faces, mat):
        mesh = bpy.data.meshes.new(name + '_Mesh')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        attach(obj, name, mat)
        return obj

    beam('Wooden_Upright', (0, 0.01, -0.01), (0, 0.007, 0.284), 0.0085, wood)
    beam('Wooden_Crossbar', (-0.132, 0.008, 0.225), (0.134, 0.008, 0.232), 0.0045, wood)

    # Tailored as a loose sack: uneven hem, cinched waist, broad shoulders.
    shirt_vertices = []
    ring_specs = [(0.124, 0.048, 0.022), (0.159, 0.034, 0.021),
                  (0.205, 0.043, 0.026), (0.235, 0.031, 0.022)]
    count = 16
    for ring, (z, width, depth) in enumerate(ring_specs):
        for i in range(count):
            angle = math.tau * i / count
            ripple = 1 + 0.08 * math.sin(angle * 5 + ring)
            dz = (0.006 * math.sin(angle * 5 + 0.3)) if ring == 0 else 0
            shirt_vertices.append((width * math.cos(angle) * ripple,
                                   depth * math.sin(angle) * ripple, z + dz))
    shirt_faces = []
    for ring in range(len(ring_specs) - 1):
        for i in range(count):
            j = (i + 1) % count
            shirt_faces.append((ring * count + i, ring * count + j,
                                (ring + 1) * count + j, (ring + 1) * count + i))
    shirt = mesh_object('Worn_Shirt', shirt_vertices, shirt_faces, cloth)
    solidify = shirt.modifiers.new('Cloth_Thickness', 'SOLIDIFY')
    solidify.thickness = 0.0012
    for poly in shirt.data.polygons:
        poly.use_smooth = True

    # Slightly drooping sleeves, with angular creases and open cuffs.
    for side in (-1, 1):
        sleeve_vertices = []
        for k, (x, z, radius) in enumerate(((0.032, 0.222, 0.019), (0.072, 0.226, 0.015), (0.113, 0.215, 0.011))):
            for i in range(12):
                angle = i * math.tau / 12
                r = radius * (1 + 0.09 * math.cos(angle * 3 + k))
                sleeve_vertices.append((side * x, r * math.cos(angle), z + r * math.sin(angle)))
        sleeve_faces = []
        for k in range(2):
            for i in range(12):
                face = (k * 12 + i, k * 12 + (i + 1) % 12,
                        (k + 1) * 12 + (i + 1) % 12, (k + 1) * 12 + i)
                sleeve_faces.append(face if side == 1 else tuple(reversed(face)))
        sleeve = mesh_object(f'Sleeve_{side}', sleeve_vertices, sleeve_faces, cloth)
        sleeve.modifiers.new('Cloth_Thickness', 'SOLIDIFY').thickness = 0.001
        for poly in sleeve.data.polygons:
            poly.use_smooth = True
        for i in range(9):
            start = (side * 0.111, rng.uniform(-0.006, 0.006), 0.22 + rng.uniform(-0.009, 0.009))
            end = (side * rng.uniform(0.127, 0.148), start[1] + rng.uniform(-0.007, 0.007), start[2] - rng.uniform(0.002, 0.012))
            beam(f'Cuff_Straw_{side}_{i}', start, end, 0.00055, straw, sides=5)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=(0, -0.002, 0.269))
    head = attach(bpy.context.object, 'Burlap_Head', sack)
    head.scale = (0.025, 0.022, 0.030)
    for poly in head.data.polygons:
        poly.use_smooth = True

    # Stitched face oriented toward the review camera, not a glossy cartoon face.
    for side in (-1, 1):
        x = side * 0.0085
        beam(f'Eye_Stitch_A_{side}', (x - 0.002, -0.0234, 0.273), (x + 0.002, -0.0234, 0.277), 0.0007, dark, 6)
        beam(f'Eye_Stitch_B_{side}', (x - 0.002, -0.0234, 0.277), (x + 0.002, -0.0234, 0.273), 0.0007, dark, 6)
    beam('Mouth_Seam', (-0.007, -0.0227, 0.259), (0.007, -0.0227, 0.259), 0.00055, dark, 6)
    for i in range(4):
        x = -0.006 + 0.004 * i
        beam(f'Mouth_Stitch_{i}', (x, -0.023, 0.2575), (x, -0.023, 0.2605), 0.00045, dark, 5)

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.043, depth=0.005, location=(0.002, -0.002, 0.296))
    brim = attach(bpy.context.object, 'Straw_Hat_Brim', straw)
    brim.rotation_euler = (-0.10, 0.07, 0)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.027, radius2=0.018, depth=0.031, location=(0.003, -0.001, 0.313))
    crown = attach(bpy.context.object, 'Straw_Hat_Crown', straw)
    crown.rotation_euler = (-0.10, 0.07, 0)
    for i in range(14):
        a = i * math.tau / 14
        beam(f'Hat_Weave_{i}', (0.003 + 0.0265 * math.cos(a), -0.001 + 0.0265 * math.sin(a), 0.301),
             (0.003 + 0.018 * math.cos(a), -0.001 + 0.018 * math.sin(a), 0.328), 0.00055, rope, 5)

    for name, z, major in [('Waist_Rope', 0.158, 0.033), ('Neck_Tie', 0.24, 0.013), ('Hat_Band', 0.303, 0.025)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=0.0018,
                                        major_segments=24, minor_segments=6, location=(0, 0, z))
        tie = attach(bpy.context.object, name, rope)
        if name == 'Waist_Rope':
            tie.scale.y = 0.64

    patch_vertices = [(-0.028, -0.024, 0.182), (-0.010, -0.027, 0.181),
                      (-0.009, -0.027, 0.199), (-0.026, -0.024, 0.201)]
    mesh_object('Sewn_Repair_Patch', patch_vertices, [(0, 1, 2, 3)], patch)
    beam('Shirt_Front_Seam', (0, -0.0225, 0.165), (0, -0.0265, 0.228), 0.00075, seam, 6)
    for i in range(4):
        z = 0.184 + i * 0.0045
        beam(f'Patch_Stitch_{i}', (-0.028, -0.0248, z), (-0.024, -0.0255, z + 0.001), 0.0005, sack, 5)
    for i in range(10):
        x = rng.uniform(-0.038, 0.038)
        y = rng.uniform(-0.013, 0.013)
        beam(f'Hem_Straw_{i}', (x, y, 0.13), (x + rng.uniform(-0.006, 0.006), y, rng.uniform(0.094, 0.116)), 0.0006, straw, 5)

    bpy.context.view_layer.update()
    assert all(math.isfinite(value) for obj in objects for row in obj.matrix_world for value in row)
    return objects, {'type': 'scarecrow', 'parts': len(objects) - 1,
                     'position': list(root.location), 'heightAboveGround': 0.328,
                     'collection': group.name}
