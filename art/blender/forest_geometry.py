"""Deterministic, individually editable woodland trees for the Timber review tile.

Foliage is real leaf geometry, with no billboard textures or external assets.
This is a detailed art prototype; game instancing and LOD remain a later step.
"""
import math
import random

import bpy
from mathutils import Vector


def create_forest(height_at, hex_id):
    rng = random.Random(42817)
    collection = bpy.data.collections.new('Broad_Woodland')
    bpy.context.scene.collection.children.link(collection)
    materials = []
    palette = [('Bark_Shadow', (0.065, 0.041, 0.026)),
               ('Bark_Ridges', (0.125, 0.09, 0.056)),
               ('Leaf_Deep_Green', (0.028, 0.077, 0.012)),
               ('Leaf_Forest_Green', (0.062, 0.135, 0.023)),
               ('Leaf_Olive', (0.115, 0.17, 0.032)),
               ('Leaf_New_Growth', (0.14, 0.22, 0.046)),
               ('Dead_Wood', (0.19, 0.135, 0.076)),
               ('Wood_Cut', (0.30, 0.205, 0.10))]
    for name, rgb in palette:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.diffuse_color = (*rgb, 1)
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*rgb, 1)
        shader.inputs['Roughness'].default_value = 0.84
        if name.startswith('Leaf'):
            shader.inputs['Subsurface Weight'].default_value = 0.035
            shader.inputs['Subsurface Radius'].default_value = (0.025, 0.05, 0.015)
        materials.append(material)

    apothem = 0.955 * math.sqrt(3) / 2
    normals = [(math.cos(i * math.pi / 3), math.sin(i * math.pi / 3)) for i in range(6)]

    def margin(x, y):
        return min(apothem - x * nx - y * ny for nx, ny in normals)

    def path_x(y):
        return 0.06 + 0.15 * math.sin(y * 4.5)

    # Dense coverage across the hexagon, with a walkable winding passage.
    placements = []
    for _ in range(10000):
        x, y = rng.uniform(-0.74, 0.74), rng.uniform(-0.80, 0.80)
        if margin(x, y) < 0.19 or abs(x - path_x(y)) < 0.072:
            continue
        if any(math.hypot(x - px, y - py) < 0.143 for px, py in placements):
            continue
        placements.append((x, y))
        if len(placements) == 60:
            break
    assert len(placements) >= 45, 'Forest coverage is too sparse'

    objects = []
    leaf_count = 0
    tree_heights = []

    class Geometry:
        def __init__(self):
            self.vertices, self.faces, self.colors, self.smooth = [], [], [], []

        def face(self, indices, material, smooth=False):
            self.faces.append(tuple(indices))
            self.colors.append(material)
            self.smooth.append(smooth)

        def branch(self, start, end, radius_a, radius_b, material=0, sides=7):
            a, b = Vector(start), Vector(end)
            axis = (b - a).normalized()
            cross = axis.cross(Vector((0, 1, 0))).normalized()
            other = axis.cross(cross).normalized()
            start_index = len(self.vertices)
            for point, radius in ((a, radius_a), (b, radius_b)):
                for j in range(sides):
                    angle = 2 * math.pi * j / sides
                    p = point + radius * (cross * math.cos(angle) + other * math.sin(angle))
                    self.vertices.append(tuple(p))
            for j in range(sides):
                k = (j + 1) % sides
                self.face((start_index + j, start_index + k, start_index + sides + k,
                           start_index + sides + j), material + (j % 3 == 0) if material == 0 else material, True)
            self.face(tuple(start_index + j for j in reversed(range(sides))), material)
            self.face(tuple(start_index + sides + j for j in range(sides)), material)

        def leaf(self, center, length, direction, material):
            axis = Vector(direction).normalized()
            side = axis.cross(Vector((0.15, 0.25, 1))).normalized()
            ridge = axis.cross(side).normalized() * (length * 0.085)
            p = Vector(center)
            index = len(self.vertices)
            self.vertices.extend(tuple(v) for v in (
                p - axis * length * 0.5, p - side * length * 0.25,
                p + axis * length * 0.5, p + side * length * 0.25,
                p + ridge))
            for j in range(4):
                self.face((index + j, index + (j + 1) % 4, index + 4), material)

        def finish(self, name, location=(0, 0, 0)):
            assert all(math.isfinite(v) for p in self.vertices for v in p)
            mesh = bpy.data.meshes.new(name + '_Mesh')
            mesh.from_pydata(self.vertices, [], self.faces)
            mesh.update()
            for material in materials:
                mesh.materials.append(material)
            for polygon, material, smooth in zip(mesh.polygons, self.colors, self.smooth):
                polygon.material_index = int(material)
                polygon.use_smooth = smooth
            obj = bpy.data.objects.new(name, mesh)
            collection.objects.link(obj)
            obj.location = location
            obj['resource'], obj['hexId'] = 'Timber', hex_id
            objects.append(obj)
            return obj

    for index, (x, y) in enumerate(placements):
        geometry = Geometry()
        # Older, taller trees in the interior; smaller crowns along the fringe.
        age = rng.uniform(0.75, 1.12)
        if margin(x, y) < 0.25:
            age *= 0.88
        tall = rng.uniform(0.38, 0.53) * age
        crown_width = rng.uniform(0.095, 0.12) * age
        lean = Vector((rng.uniform(-0.018, 0.018), rng.uniform(-0.018, 0.018), 0))
        trunk_points = [Vector((lean.x * t + 0.003 * math.sin(t * 9 + index),
                                lean.y * t, tall * t)) for t in (0, 0.23, 0.47, 0.68, 0.86)]
        for j in range(4):
            geometry.branch(trunk_points[j], trunk_points[j + 1],
                            (0.013 - j * 0.0024) * age, (0.0106 - j * 0.0024) * age)
        for j in range(5):
            angle = j * math.tau / 5 + rng.uniform(-0.2, 0.2)
            dx, dy = math.cos(angle) * 0.035 * age, math.sin(angle) * 0.035 * age
            # Root endpoints follow the terrain rather than floating above it.
            geometry.branch((dx, dy, height_at(x + dx, y + dy) - height_at(x, y) + 0.002),
                            (0, 0, 0.035 * age), 0.0015, 0.006 * age)
        tone = rng.choice((2, 3, 3, 4))
        for cluster in range(11):
            angle = cluster * 2.399963 + index * 1.7
            t = cluster / 10
            spread = crown_width * (0.73 if cluster < 7 else 0.36)
            center = Vector((lean.x + math.cos(angle) * spread,
                             lean.y + math.sin(angle) * spread,
                             tall * (0.57 + 0.36 * t)))
            radius = rng.uniform(0.038, 0.052) * age
            branch_start = Vector((lean.x * 0.5, lean.y * 0.5, tall * (0.35 + t * 0.35)))
            elbow = branch_start.lerp(center, 0.56) - Vector((0, 0, 0.015))
            geometry.branch(branch_start, elbow, 0.0048 * age, 0.0026 * age)
            geometry.branch(elbow, center, 0.0026 * age, 0.0008)
            for twig in range(3):
                tip = center + Vector((rng.uniform(-radius, radius), rng.uniform(-radius, radius),
                                       rng.uniform(-0.015, 0.04)))
                geometry.branch(center, tip, 0.0012, 0.0004, sides=5)
            for _ in range(105):
                # Leaves occupy irregular volumes, avoiding solid spherical crowns.
                z = rng.uniform(-1, 1)
                theta = rng.uniform(0, math.tau)
                r = rng.uniform(0.45, 1.0) ** (1 / 3)
                lateral = math.sqrt(1 - z * z)
                offset = Vector((math.cos(theta) * lateral * radius * r,
                                 math.sin(theta) * lateral * radius * r,
                                 z * radius * r * 0.82))
                position = center + offset
                direction = (math.cos(theta + rng.uniform(-1, 1)),
                             math.sin(theta + rng.uniform(-1, 1)), rng.uniform(-0.35, 0.65))
                material = tone if rng.random() < 0.62 else rng.choice((2, 3, 4, 5))
                geometry.leaf(position, rng.uniform(0.013, 0.021) * age, direction, material)
                leaf_count += 1
        obj = geometry.finish(f'Woodland_Tree_{index + 1:02d}', (x, y, height_at(x, y)))
        obj['ageScale'] = age
        tree_heights.append(tall)
        # All foliage stays clear of the construction strip around the tile.
        assert all(margin(x + p[0], y + p[1]) > 0.035 for p in geometry.vertices)

    # Fallen timber and young growth add detail below the main canopy.
    ground = Geometry()
    for x, y, angle in ((-0.36, -0.47, 0.35), (0.42, 0.18, -0.8)):
        start = Vector((x, y, height_at(x, y) + 0.012))
        dx, dy = math.cos(angle) * 0.13, math.sin(angle) * 0.13
        end = Vector((x + dx, y + dy, height_at(x + dx, y + dy) + 0.012))
        ground.branch(start, end, 0.012, 0.010, material=6, sides=9)
        axis = (end - start).normalized()
        ground.branch(end, end + axis * 0.0005, 0.009, 0.009, material=7, sides=9)
    for _ in range(180):
        x, y = rng.uniform(-0.7, 0.7), rng.uniform(-0.75, 0.75)
        if margin(x, y) < 0.11 or abs(x - path_x(y)) < 0.055:
            continue
        origin = Vector((x, y, height_at(x, y) + 0.003))
        for j in range(7):
            angle = j * math.tau / 7
            direction = Vector((math.cos(angle), math.sin(angle), 0.7))
            ground.leaf(origin + direction * 0.013, rng.uniform(0.018, 0.03), direction, rng.choice((2, 3, 4)))
    ground.finish('Woodland_Undergrowth_And_Fallen_Timber')
    return objects, {'trees': len(placements), 'leaves': leaf_count,
                     'treeHeightRange': [min(tree_heights), max(tree_heights)],
                     'vertices': sum(len(obj.data.vertices) for obj in objects),
                     'faces': sum(len(obj.data.polygons) for obj in objects),
                     'seed': 42817, 'constructionBorderClear': True,
                     'note': 'Individual editable trees, geometric leaves and branches. Review density; game LOD pending.'}
