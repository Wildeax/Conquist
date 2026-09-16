"""v03: actual ground geometry, preserving v01/v02 terrain and prop layouts."""
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
parser.add_argument('--skip', nargs='*', choices=('Stone', 'Clay', 'Grain', 'Desert', 'Timber'), default=[])
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
STEMS = {'Stone': 'stone-relief', 'Clay': 'clay-relief', 'Grain': 'wheat-fields',
         'Desert': 'desert-relief', 'Timber': 'forest'}
RADIUS = 0.955
APOTHEM = RADIUS * math.sqrt(3) / 2
NORMALS = [(math.cos(i * math.pi / 3), math.sin(i * math.pi / 3)) for i in range(6)]


def smooth(a, b, value):
    t = max(0, min(1, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hash_value(x, y):
    n = (x * 374761393 + y * 668265263 + 428173) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffffff) / 4294967295


def noise(x, y):
    ix, iy = math.floor(x), math.floor(y)
    u, v = smooth(0, 1, x - ix), smooth(0, 1, y - iy)
    return ((hash_value(ix, iy) * (1-u) + hash_value(ix+1, iy) * u) * (1-v)
            + (hash_value(ix, iy+1) * (1-u) + hash_value(ix+1, iy+1) * u) * v) * 2 - 1


def cell(x, y):
    ix, iy = math.floor(x), math.floor(y)
    nearest, second = 100, 100
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            a, b = ix + dx, iy + dy
            distance = (x-a-0.15-0.7*hash_value(a,b))**2 + (y-b-0.15-0.7*hash_value(a+71,b-39))**2
            if distance < nearest:
                nearest, second = distance, nearest
            elif distance < second:
                second = distance
    return math.sqrt(nearest), math.sqrt(second) - math.sqrt(nearest)


def margin(x, y):
    return min(APOTHEM - x * nx - y * ny for nx, ny in NORMALS)


def displacement(kind, x, y):
    fade = smooth(0, 0.035, margin(x, y))
    broad, fine = noise(x * 17, y * 17), noise(x * 115, y * 115)
    if kind == 'Desert':
        u, v = x * 0.93 + y * 0.368, -x * 0.368 + y * 0.93
        wave = (0.5 + 0.5 * math.cos(math.tau * (v + 0.013 * math.sin(u * 8)) / 0.041)) ** 4
        return fade * (0.006 * wave + 0.0012 * fine)
    frequency = {'Stone': 30, 'Clay': 29, 'Grain': 48, 'Timber': 37}[kind]
    distance, gap = cell(x * frequency + 0.25 * broad, y * frequency)
    rounded = max(0, 1 - (distance / 0.80) ** 2)
    separated = smooth(0.006, 0.095, gap)
    weathered = 0.65 + 0.35 * smooth(-0.55, 0.65, noise(x * 8 + 9, y * 8))
    if kind == 'Stone':
        value = weathered * (0.015 * rounded * separated - 0.003 * (1 - separated)) + 0.003 * broad + 0.0012 * fine
    elif kind == 'Clay':
        value = weathered * (0.010 * rounded * separated - 0.0025 * (1 - separated)) + 0.001 * fine
    elif kind == 'Grain':
        u, v = x * 0.961 + y * 0.276, -x * 0.276 + y * 0.961
        path = abs(u + 0.016 * math.sin(v * 9)) < 0.048 or abs(v + 0.12 + 0.018 * math.sin(u * 9)) < 0.043
        rows = (0.5 + 0.5 * math.cos(math.tau * u / 0.026)) ** 3
        value = 0.006 * rounded * separated + 0.0012 * fine
        if path:
            value *= 0.34
            value -= 0.0035 * math.exp(-((abs(u) - 0.027) / 0.006) ** 2)
        elif margin(x, y) > 0.14:
            value += 0.004 * rows
    else:
        path = abs(x - (0.06 + 0.15 * math.sin(y * 4.5))) < 0.045
        value = weathered * 0.008 * rounded * separated + 0.003 * broad + 0.001 * fine
        if path:
            value *= 0.40
    return fade * value


def build(kind):
    stem = STEMS[kind]
    source = ROOT / 'output' / (stem + '-v02') / (stem + '-v02-details.blend')
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    output = ROOT / 'output' / (stem + '-v03')
    output.mkdir(parents=True, exist_ok=True)
    terrain = next(o for o in scene.objects if o.type == 'MESH' and o.name.startswith(kind + '_Relief'))
    original = terrain.data
    bvh = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
    color_layer = original.color_attributes[0]

    def original_surface(x, y):
        p, normal, face_index, _ = bvh.ray_cast(Vector((x, y, 3)), Vector((0, 0, -1)))
        if p is None:
            # Exact polygon corners can be missed by float ray intersection.
            p, normal, face_index, _ = bvh.ray_cast(Vector((x * 0.999999, y * 0.999999, 3)), Vector((0, 0, -1)))
        if p is None:
            raise ValueError(f'Ground sample missed: {x}, {y}')
        indices = list(original.polygons[face_index].vertices)[:3]
        a, b, c = [original.vertices[i].co for i in indices]
        den = (b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y)
        wa = ((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den
        wb = ((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den
        wc = 1-wa-wb
        rgb = tuple(sum(color_layer.data[index].color[channel] * weight
                        for index, weight in zip(indices, (wa, wb, wc))) for channel in range(3))
        return p.z, rgb

    vertices, faces, colors, lookup = [], [], [], {}
    deltas = []

    def vertex(x, y):
        key = (round(x, 9), round(y, 9))
        if key not in lookup:
            z, rgb = original_surface(x, y)
            delta = displacement(kind, x, y)
            if margin(x, y) < 1e-7:
                z, delta = 0.08, 0
            lookup[key] = len(vertices)
            vertices.append((x, y, z + delta))
            # Mild color variation follows the physical raised clods.
            tint = 0.92 + min(0.15, max(-0.12, delta * 7))
            colors.append(tuple(max(0, value * tint) for value in rgb))
            deltas.append(delta)
        return lookup[key]

    n = 180
    corners = [(RADIUS * math.cos(math.radians(30 + i * 60)), RADIUS * math.sin(math.radians(30 + i * 60))) for i in range(6)]
    for sector in range(6):
        a, b = corners[sector], corners[(sector+1)%6]
        grid = {}
        for i in range(n+1):
            for j in range(n+1-i):
                grid[i,j] = vertex((a[0]*i+b[0]*j)/n, (a[1]*i+b[1]*j)/n)
        for i in range(n):
            for j in range(n-i):
                faces.append((grid[i,j],grid[i+1,j],grid[i,j+1]))
                if i+j < n-1:
                    faces.append((grid[i+1,j],grid[i+1,j+1],grid[i,j+1]))
    top_vertices, top_faces = len(vertices), len(faces)
    boundary = sorted((i for i,p in enumerate(vertices) if margin(*p[:2]) < 1e-7),
                      key=lambda i: math.atan2(vertices[i][1],vertices[i][0]))
    previous = boundary
    for layer in range(1, 10):
        ring = []
        t = layer / 9
        for index in boundary:
            x, y, _ = vertices[index]
            # Cut-earth side walls have real inset ledges, without changing the footprint.
            erosion = math.sin(math.pi*t) * (0.003 + 0.005 * (0.5 + 0.5 * noise(x*34+layer*0.4,y*34)))
            radial = 1-erosion/RADIUS
            z = 0.08 - 0.18*t
            ring.append(len(vertices))
            vertices.append((x*radial,y*radial,z))
            band = (0.90 + 0.065 * math.sin(layer*1.9)) * (1-0.12*t)
            colors.append(tuple(c*band for c in colors[index]))
        for i in range(len(ring)):
            j = (i+1)%len(ring)
            faces.append((previous[i],ring[i],ring[j],previous[j]))
        previous = ring
    bottom = len(vertices)
    vertices.append((0,0,-0.10))
    colors.append(colors[0])
    for i in range(len(previous)):
        faces.append((bottom,previous[(i+1)%len(previous)],previous[i]))
    mesh = bpy.data.meshes.new(kind + '_Sculpted_Ground_v03')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    palette = mesh.color_attributes.new(name=color_layer.name,type='FLOAT_COLOR',domain='POINT')
    for i, rgb in enumerate(colors):
        palette.data[i].color = (*rgb,1)
    for material in original.materials:
        mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = polygon.index < top_faces
    terrain.data = mesh
    terrain.name = kind + '_Relief_v03'
    terrain['groundTopFaces'] = top_faces
    terrain['groundRevision'] = 3
    terrain['physicalDisplacementRange'] = [min(deltas),max(deltas)]
    edge_uses = {}
    for face in faces:
        for a,b in zip(face,(*face[1:],face[0])):
            key = tuple(sorted((a,b)))
            edge_uses[key] = edge_uses.get(key,0)+1
    assert all(count==2 for count in edge_uses.values()), 'Ground must remain closed'
    assert all(math.isfinite(v) for p in vertices for v in p)
    assert all(abs(vertices[i][2]-0.08)<1e-7 for i in boundary)
    assert max(deltas)-min(deltas)>0.004, 'Surface displacement missing'

    # Anchor existing objects to the new surface. Batched plants keep their layout.
    for obj in list(scene.objects):
        if obj==terrain or obj.name=='Review_Backdrop' or obj.type not in ('MESH','EMPTY'):
            continue
        if obj.parent is not None:
            continue  # Scarecrow children follow the single placement root.
        if obj.name.startswith('Wheat_Plot') or obj.name in ('Woodland_Undergrowth_And_Fallen_Timber','Fern_Fronds','Fallen_Leaves'):
            for point in obj.data.vertices:
                world = obj.matrix_world @ point.co
                point.co.z += displacement(kind,world.x,world.y)
        else:
            obj.location.z += displacement(kind,obj.location.x,obj.location.y)

    bpy.context.view_layer.update()
    ground_bvh = BVHTree.FromObject(terrain,bpy.context.evaluated_depsgraph_get())
    rng = random.Random(6347+list(STEMS).index(kind))
    grain_vertices, grain_faces = [], []
    grain_colors = []
    wanted = {'Stone':800,'Clay':1100,'Grain':850,'Desert':140,'Timber':750}[kind]
    count = 0
    for _ in range(wanted*5):
        x,y = rng.uniform(-0.8,0.8),rng.uniform(-0.88,0.88)
        if margin(x,y)<0.055:
            continue
        if kind=='Desert' and (x<0.2 or y>0.45):
            continue
        point,normal,_,_ = ground_bvh.ray_cast(Vector((x,y,3)),Vector((0,0,-1)))
        if point is None or normal.z<0.50:
            continue
        radius = rng.uniform(0.003,0.010) * (1.25 if kind in ('Stone','Clay') else 1)
        z = point.z-radius*0.18
        start = len(grain_vertices)
        _,rgb = original_surface(x,y)
        tint = rng.uniform(0.72,1.13)
        # Buried lower ring, irregular middle, offset cap: small pieces of earth.
        for level,scale in ((-0.18,0.6),(0.22,1.0),(0.73,0.45)):
            for j in range(5):
                angle = j*math.tau/5+count
                r = radius*scale*rng.uniform(0.8,1.2)
                grain_vertices.append((x+math.cos(angle)*r,y+math.sin(angle)*r,z+radius*level))
                grain_colors.append(tuple(c*tint for c in rgb))
        grain_faces.append(tuple(start+j for j in reversed(range(5))))
        for level in range(2):
            for j in range(5):
                a,b=start+level*5+j,start+level*5+(j+1)%5
                grain_faces.append((a,b,b+5,a+5))
        grain_faces.append(tuple(start+10+j for j in range(5)))
        count+=1
        if count==wanted:
            break
    pieces = bpy.data.meshes.new('Ground_Aggregates_Mesh')
    pieces.from_pydata(grain_vertices,[],grain_faces)
    pieces.update()
    attr = pieces.color_attributes.new(name='Soil_Grain_Color',type='FLOAT_COLOR',domain='POINT')
    for i,rgb in enumerate(grain_colors):
        attr.data[i].color = (*rgb,1)
    mat=bpy.data.materials.new('Soil_Aggregates')
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(1,1,1,1)
    color=mat.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name=attr.name
    mat.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
    pieces.materials.append(mat)
    obj=bpy.data.objects.new('Ground_Aggregates',pieces)
    scene.collection.objects.link(obj)
    obj['hexId'],obj['resource'],obj['physicalGrains']=terrain['hexId'],kind,count
    # texture_scene retains aggregate vertex colors in glTF; restore the same
    # multiplication in Blender after generating its neutral reusable PBR maps.
    scene['review_stage']='v03: sculpted soil, embedded aggregates and eroded cut-earth walls'
    bpy.ops.wm.save_as_mainfile(filepath=str(output/(stem+'-v03-geometry.blend')))
    print('GROUND_GEOMETRY_READY '+kind+' '+str(len(vertices))+' vertices; '+str(count)+' aggregates',flush=True)
    texture_report=texture_scene(terrain,kind,output)
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    texture=shader.inputs['Base Color'].links[0].from_socket
    color=nodes.new('ShaderNodeVertexColor')
    color.layer_name=attr.name
    mix=nodes.new('ShaderNodeMixRGB')
    mix.blend_type='MULTIPLY'
    mix.inputs[0].default_value=1
    links.new(texture,mix.inputs[1]);links.new(color.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],shader.inputs['Base Color'])
    # Export without an unsupported multiply node; glTF applies COLOR_0 itself.
    links.new(texture,shader.inputs['Base Color'])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type in ('MESH','EMPTY') and obj.name!='Review_Backdrop':
            obj.select_set(True)
    bpy.context.view_layer.objects.active=terrain
    bpy.ops.export_scene.gltf(filepath=str(output/(stem+'-v03.glb')),export_format='GLB',use_selection=True,
                              export_extras=True,export_yup=True,export_apply=True,
                              export_vertex_color='ACTIVE',export_all_vertex_colors=False)
    links.new(mix.outputs[0],shader.inputs['Base Color'])
    for image in bpy.data.images:
        if image.source=='FILE' and image.has_data:
            image.pack()
    scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
    scene.render.resolution_x,scene.render.resolution_y=1400,1200
    scene.render.filepath=str(output/'ground-perspective.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(output/(stem+'-v03.blend')))
    bpy.ops.render.render(write_still=True)
    # Low grazing angle makes the actual ground relief readable.
    target={'Stone':(0.16,-0.40,0.16),'Clay':(0.05,-0.30,0.13),'Grain':(-0.34,-0.42,0.10),
            'Desert':(0.12,-0.28,0.13),'Timber':(-0.22,-0.51,0.10)}[kind]
    camera=scene.camera
    camera.location=Vector(target)+Vector((0.37,-0.72,0.43))
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=0.62
    scene.render.resolution_x,scene.render.resolution_y=1200,1000
    scene.render.filepath=str(output/'ground-detail.png')
    bpy.ops.render.render(write_still=True)
    report={'resource':kind,'revision':3,'topVertices':top_vertices,'topFaces':top_faces,'vertices':len(vertices),
            'faces':len(faces),'physicalDisplacementRange':[min(deltas),max(deltas)],'aggregates':count,
            'watertight':True,'edgeHeight':0.08,'radius':RADIUS,'textures':texture_report,
            'note':'Actual soil mesh relief, embedded grains and inset side strata. Review asset; game LOD pending.'}
    (output/'ground-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('GROUND_COMPLETE '+kind,flush=True)


for kind in STEMS if args.terrain=='All' else (args.terrain,):
    if kind not in args.skip:
        build(kind)
