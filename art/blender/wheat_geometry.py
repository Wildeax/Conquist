"""Editable mesh wheat grouped by field; no textures, external assets or services."""
import math
import random

import bpy


def create_wheat(ground_height, plot_at, hex_id):
    rng = random.Random(42817)
    group = bpy.data.collections.new('Wheat_Fields')
    bpy.context.scene.collection.children.link(group)
    palette = [(0.34, 0.20, 0.045), (0.49, 0.32, 0.085), (0.62, 0.43, 0.15), (0.24, 0.25, 0.06)]
    materials = []
    for name, color in zip(('Stem', 'Ripe_Gold', 'Sunlit_Grain', 'Green_Stem'), palette):
        mat = bpy.data.materials.new(f'Wheat_{name}')
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Roughness'].default_value = 0.82
        materials.append(mat)
    data = [{'vertices': [], 'faces': [], 'materials': [], 'stalks': 0} for _ in range(4)]

    def face(d, indices, material):
        d['faces'].append(indices)
        d['materials'].append(material)

    def ribbon(d, a, b, width, material, direction=0):
        dx, dy = math.cos(direction) * width, math.sin(direction) * width
        i = len(d['vertices'])
        d['vertices'].extend([(a[0] - dx, a[1] - dy, a[2]),
                              (a[0] + dx, a[1] + dy, a[2]), b])
        face(d, (i, i + 1, i + 2), material)

    def grain(d, center, radius, length, material, direction):
        # A tapered ear segment, aligned along the stem, with a pointed awn.
        i = len(d['vertices'])
        cx, cy, cz = center
        for dz, r in ((-length * 0.5, radius * 0.30), (0, radius), (length * 0.5, radius * 0.18)):
            for k in range(4):
                angle = direction + k * math.pi / 2
                d['vertices'].append((cx + r * math.cos(angle), cy + r * math.sin(angle), cz + dz))
        face(d, (i + 3, i + 2, i + 1, i), material)
        for ring in range(2):
            for k in range(4):
                a, b = i + ring * 4 + k, i + ring * 4 + (k + 1) % 4
                face(d, (a, b, b + 4, a + 4), material)
        face(d, (i + 8, i + 9, i + 10, i + 11), material)
        ribbon(d, (cx, cy, cz + length * 0.3),
               (cx + math.cos(direction) * 0.005, cy + math.sin(direction) * 0.005, cz + length * 1.8),
               0.00020, material, direction + math.pi / 2)

    # Dense rows with small independent variations in stalk height and lean.
    for row in range(-35, 36):
        for column in range(-76, 77):
            u = row * 0.026 + rng.uniform(-0.003, 0.003)
            v = column * 0.012 + rng.uniform(-0.003, 0.003)
            x, y = 0.961 * u - 0.276 * v, 0.276 * u + 0.961 * v
            plot = plot_at(x, y)
            if plot < 0 or rng.random() < 0.06:
                continue
            d = data[plot]
            # One parcel has a narrow harvested strip, leaving short stubble.
            stubble = plot == 2 and u < -0.34
            h = rng.uniform(0.010, 0.020) if stubble else rng.uniform(0.085, 0.12)
            z = ground_height(x, y) - 0.001
            lean_x, lean_y = rng.uniform(0.001, 0.008), rng.uniform(-0.004, 0.002)
            top = (x + lean_x, y + lean_y, z + h)
            stem_material = 3 if plot == 0 and rng.random() < 0.22 else 0
            ribbon(d, (x, y, z), top, 0.00065, stem_material)
            ribbon(d, (x, y, z), top, 0.00065, stem_material, math.pi / 2)
            if not stubble:
                direction = rng.uniform(0, math.tau)
                for k in range(3):
                    angle = direction + k * math.pi
                    base = (x + lean_x * 0.5, y + lean_y * 0.5, z + h * (0.25 + 0.2 * k))
                    tip = (base[0] + 0.027 * math.cos(angle), base[1] + 0.027 * math.sin(angle), base[2] + h * 0.19)
                    ribbon(d, base, tip, 0.0022, stem_material, angle + math.pi / 2)
                for k in range(5):
                    angle = direction + (k % 2) * math.pi
                    center = (top[0] + 0.0022 * math.cos(angle), top[1] + 0.0022 * math.sin(angle), top[2] + k * 0.0042)
                    grain(d, center, 0.0029, 0.006, 1 if rng.random() < 0.65 else 2, angle)
            d['stalks'] += 1
    objects = []
    for plot, d in enumerate(data):
        mesh = bpy.data.meshes.new(f'Wheat_Plot_{plot + 1}_Mesh')
        mesh.from_pydata(d['vertices'], [], d['faces'])
        mesh.update()
        for mat in materials:
            mesh.materials.append(mat)
        for polygon, mat_index in zip(mesh.polygons, d['materials']):
            polygon.material_index = mat_index
        obj = bpy.data.objects.new(f'Wheat_Plot_{plot + 1}', mesh)
        group.objects.link(obj)
        obj['hexId'] = hex_id
        obj['resource'] = 'Grain'
        obj['plot'] = plot + 1
        obj['stalkCount'] = d['stalks']
        assert all(math.isfinite(v) for point in d['vertices'] for v in point)
        objects.append(obj)
    return objects, {'plots': 4, 'stalks': sum(d['stalks'] for d in data),
                     'vertices': sum(len(d['vertices']) for d in data),
                     'faces': sum(len(d['faces']) for d in data),
                     'stage': 'Detailed review mesh. Game LOD and instancing are pending.'}
