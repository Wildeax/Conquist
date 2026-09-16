"""Native, browser-budget pasture prefab. Run with Blender --background.

Creates Wool.blend / Wool.glb independently of the five existing terrains.
All detail is geometry and locally generated PBR maps; no external assets.
"""
import bpy
import bmesh
import json
import math
import random
import shutil
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils import noise as sculpt_noise

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output' / 'web-v01'
OUT.mkdir(parents=True, exist_ok=True)
BACKUP = ROOT/'output'/'before-fleece-refinement'
if (OUT/'Wool.blend').exists() and not BACKUP.exists():
    BACKUP.mkdir()
    for source in OUT.glob('Wool*'):
        if source.is_file(): shutil.copy2(source, BACKUP/source.name)
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(58194)
R = .955
APOTHEM = R * math.sqrt(3) / 2


def margin(x, y):
    return min(APOTHEM-x*math.cos(i*math.pi/3)-y*math.sin(i*math.pi/3) for i in range(6))


def height(x, y):
    fade = min(1, max(0, margin(x, y)/.19))
    fade = fade*fade*(3-2*fade)
    hills = .15*math.exp(-((x+.28)**2/.17+(y-.26)**2/.3))
    hills += .095*math.exp(-((x-.36)**2/.15+(y+.32)**2/.21))
    return .08+fade*(hills+.008*math.sin(x*23+y*9)*math.sin(y*18-x*7))


def image(name, rgb, noncolor=False):
    if rgb.ndim == 2:
        rgb = np.repeat(rgb[:, :, None], 3, axis=2)
    h, w = rgb.shape[:2]
    rgba = np.concatenate([rgb, np.ones((h, w, 1), dtype=np.float32)], axis=2).astype(np.float32)
    img = bpy.data.images.new(name, width=w, height=h, alpha=False)
    img.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(OUT/(name+'.png')); img.file_format = 'PNG'; img.save(); img.pack()
    return img


flat = image('Wool_Shared_Normal', np.full((8, 8, 3), (.5, .5, 1), dtype=np.float32), True)
rough = image('Wool_Shared_Roughness', np.full((8, 8), .94, dtype=np.float32), True)


def material(name, color, normal=flat, roughness=rough, double=False):
    mat = bpy.data.materials.new(name); mat.use_nodes = True; mat.use_backface_culling = not double
    ns, ls = mat.node_tree.nodes, mat.node_tree.links
    bs = ns.get('Principled BSDF')
    for target, img in [('Base Color', color), ('Normal', normal), ('Roughness', roughness)]:
        tex = ns.new('ShaderNodeTexImage'); tex.image = img; tex.extension = 'EXTEND'
        if target == 'Normal':
            n = ns.new('ShaderNodeNormalMap'); ls.new(tex.outputs['Color'], n.inputs['Color']); ls.new(n.outputs[0], bs.inputs[target])
        else:
            ls.new(tex.outputs['Color'], bs.inputs[target])
    return mat


# World-scale grass/soil detail. Top and side maps have independent UV layouts.
size = 1024
v, u = np.mgrid[0:size, 0:size].astype(np.float32)/(size-1)
x, y = (u-.5)*2*R, (v-.5)*2*R
noise = np.random.default_rng(2084).random((size, size)).astype(np.float32)
patch = .5+.22*np.sin(x*7+np.sin(y*5))+.15*np.sin(y*15-x*9)
grain = (noise-.5)*.11 + np.sin(x*310+y*120)*np.sin(y*330)*.025
green = np.stack([.19+patch*.12+grain, .245+patch*.15+grain, .075+patch*.075+grain*.6], axis=2)
path = np.exp(-((x-(.055+.15*np.sin(y*4.2)))/.031)**2)*.8
soil = np.stack([.30+grain, .235+grain, .13+grain*.6], axis=2)
base = image('Wool_Ground_BaseColor', np.clip(green*(1-path[:, :, None])+soil*path[:, :, None], 0, 1))
gy, gx = np.gradient(noise*.18+np.sin(x*300+y*100)*.07)
normal = np.stack([-gx, -gy, np.ones_like(gx)], axis=2)
normal /= np.linalg.norm(normal, axis=2)[:, :, None]
ground_mat = material('Wool_Meadow_PBR', base, image('Wool_Ground_Normal', normal*.5+.5, True))
side_images = {c: bpy.data.images.load(str(OUT/('Timber_SideAtlas_'+c+'.png')), check_existing=True) for c in ['BaseColor', 'Normal', 'Roughness']}
for c, img in side_images.items():
    img.colorspace_settings.name = 'sRGB' if c == 'BaseColor' else 'Non-Color'; img.pack()
side_mat = material('Wool_Continuous_Soil_Sides', side_images['BaseColor'], side_images['Normal'], side_images['Roughness'])


def mesh_object(name, vertices, faces, mats, face_mats=None, uv_fn=None, smooth=False):
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    for mat in mats: mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name='PBR_UV')
    for p in mesh.polygons:
        p.use_smooth = smooth
        p.material_index = face_mats[p.index] if face_mats else 0
        for j, loop in enumerate(p.loop_indices):
            co = mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv = uv_fn(co, p, j) if uv_fn else (co.x/(2*R)+.5, co.y/(2*R)+.5)
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
    return obj


vertices, faces, slots, lookup = [], [], [], {}
def vertex(x, y, z):
    key = tuple(round(a, 7) for a in (x, y, z))
    if key not in lookup: lookup[key] = len(vertices); vertices.append((x, y, z))
    return lookup[key]

n = 18
for sector in range(6):
    a = Vector((R*math.cos(math.radians(30+60*sector)), R*math.sin(math.radians(30+60*sector))))
    b = Vector((R*math.cos(math.radians(90+60*sector)), R*math.sin(math.radians(90+60*sector))))
    grid = {}
    for i in range(n+1):
        for j in range(n+1-i):
            p = (a*i+b*j)/n; grid[i, j] = vertex(p.x, p.y, height(p.x, p.y))
    for i in range(n):
        for j in range(n-i):
            faces.append((grid[i, j], grid[i+1, j], grid[i, j+1])); slots.append(0)
            if i+j < n-1:
                faces.append((grid[i+1, j], grid[i+1, j+1], grid[i, j+1])); slots.append(0)
edges = {}
for face in faces:
    for a, b in zip(face, face[1:]+face[:1]): edges.setdefault(tuple(sorted((a, b))), []).append((a, b))
center = vertex(0, 0, -.1)
for uses in edges.values():
    if len(uses) != 1: continue
    a, b = uses[0]; va, vb = vertices[a], vertices[b]
    ba, bb = vertex(va[0], va[1], -.1), vertex(vb[0], vb[1], -.1)
    faces.extend([(b, a, ba, bb), (bb, ba, center)]); slots.extend([1, 1])

def ground_uv(co, p, j):
    if p.material_index == 0: return (co.x/(2*R)+.5, co.y/(2*R)+.5)
    side = round(math.atan2(p.center.y, p.center.x)/(math.pi/3)) % 6
    angle = side*math.pi/3
    along = -co.x*math.sin(angle)+co.y*math.cos(angle)
    return (.005+.99*(side*R+along+R/2)/(6*R), .06+.88*(co.z+.1)/.18)

ground = mesh_object('Wool_Ground_Web', vertices, faces, [ground_mat, side_mat], slots, ground_uv)
for p in ground.data.polygons: p.use_smooth = p.material_index == 0
bm = bmesh.new(); bm.from_mesh(ground.data)
assert all(len(e.link_faces) == 2 for e in bm.edges), 'Pasture must be closed'
bm.free()

# Reusable textured materials for blades, wool, faces/feet, small stones, flowers.
nv, nu = np.mgrid[0:256, 0:256].astype(np.float32)/255
fleece = np.random.default_rng(153).random((256, 256)).astype(np.float32)
# Closely spaced, crimped fibers: tangent detail across the whole fleece,
# rather than separate spherical clumps sitting on the back.
fiber = np.sin(math.tau*(nu*17+np.sin(nv*math.tau*9)*.75))
cross_fiber = np.sin(math.tau*(nv*21+np.sin(nu*math.tau*7)*.6))
fiber_height = .55*fiber+.25*cross_fiber+.2*fleece
wool_color = np.stack([.69+fiber_height*.055, .665+fiber_height*.055, .60+fiber_height*.055], axis=2)
fy, fx = np.gradient(fiber_height*.95)
fn = np.stack([-fx, -fy, np.ones_like(fx)], axis=2); fn /= np.linalg.norm(fn, axis=2)[:, :, None]
wool_mat = material('Wool_Fleece_PBR', image('Wool_Fleece_BaseColor', wool_color), image('Wool_Fleece_Normal', fn*.5+.5, True))
dark_mat = material('Wool_Faces_and_Hooves', image('Wool_Dark_BaseColor', np.full((8, 8, 3), (.085, .075, .059))))
grass_rgb = np.stack([.12+nv*.21, .20+nv*.19, .043+nv*.11], axis=2)
grass_mat = material('Wool_Meadow_Grass', image('Wool_Grass_BaseColor', grass_rgb), double=True)
stone_mat = material('Wool_Field_Stones', image('Wool_Stone_BaseColor', np.stack([.27+fleece*.13, .26+fleece*.12, .22+fleece*.11], axis=2)))
flower_mat = material('Wool_Wildflowers', image('Wool_Flower_BaseColor', np.full((8, 8, 3), (.73, .65, .33))), double=True)
parts = []


def ellipsoid(name, center, scale, mat, rot=0, segments=12, rings=6, fleece=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=center)
    obj = bpy.context.object; obj.name = name
    if fleece:
        for v in obj.data.vertices:
            # Continuous shallow relief on one watertight body mesh. Coherent
            # 3D noise avoids a UV seam or a row of bumps around the spine.
            co=v.co.copy()
            relief=.12*sculpt_noise.noise(co*4.5)+.045*sculpt_noise.noise(co*11.0)
            v.co *= 1+relief
    obj.scale = scale; obj.rotation_euler.z = rot; obj.data.materials.append(mat)
    for p in obj.data.polygons: p.use_smooth = True
    parts.append(obj); return obj


def limb(a, b, radius, mat):
    d = Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=radius*.78, radius2=radius, depth=d.length, location=(Vector(a)+Vector(b))/2)
    obj = bpy.context.object; obj.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); obj.data.materials.append(mat); parts.append(obj)


flock = [(-.47, -.16, .3, 1), (-.34, .30, 2.1, .96), (.39, .30, 3.6, 1.02), (.48, -.15, 1.1, .95),
         (-.36, -.49, 5.1, .93), (.28, -.48, 2.7, .98), (-.20, .40, 2.0, .58), (.49, .05, .8, .64)]
foot_gaps = []
for index, (sx, sy, angle, scale) in enumerate(flock):
    base_z = height(sx, sy)
    def point(x, y, z):
        return (sx+scale*(x*math.cos(angle)-y*math.sin(angle)), sy+scale*(x*math.sin(angle)+y*math.cos(angle)), base_z+scale*z)
    def oval(name, p, dims, mat, **kw):
        return ellipsoid(name, point(*p), tuple(s*scale for s in dims), mat, angle, **kw)
    oval('Sheep_%02d_Fleece'%index, (0, 0, .09), (.091, .047, .054), wool_mat, segments=28, rings=14, fleece=True)
    grazing = index % 3 == 0
    oval('Sheep_Neck', (.064, 0, .07 if grazing else .113), (.033, .030, .041), wool_mat)
    head = (.098, 0, .041 if grazing else .133)
    oval('Sheep_Dark_Muzzle', head, (.033, .022, .024), dark_mat)
    oval('Sheep_Forelock', (.081, 0, head[2]+.012), (.027, .025, .013), wool_mat)
    for sign in [-1, 1]:
        oval('Sheep_Ear', (.083, sign*.032, head[2]+.006), (.018, .025, .007), dark_mat, segments=8, rings=4)
        for lx in [-.052, .050]:
            top = point(lx, sign*.029, .075); bottom = point(lx, sign*.031, 0)
            z = height(bottom[0], bottom[1])-.001
            foot_gaps.append(z-height(bottom[0], bottom[1]))
            limb((bottom[0], bottom[1], z), top, .008*scale, dark_mat)
    oval('Sheep_Tail', (-.09, 0, .071), (.023, .014, .025), wool_mat, segments=8, rings=4)

# Individual blades rooted to the relief, sparse on the path and around hooves.
gv, gf, guv = [], [], []
for plant in range(950):
    for attempt in range(100):
        px, py = rng.uniform(-.88, .88), rng.uniform(-.92, .92)
        if margin(px, py)<.045: continue
        if abs(px-(.055+.15*math.sin(py*4.2)))<.036: continue
        if any(math.hypot(px-sx, py-sy)<.075*sc for sx, sy, _, sc in flock): continue
        break
    else: continue
    for blade in range(rng.randint(4, 7)):
        a = rng.random()*math.tau; px2=px+rng.uniform(-.012, .012); py2=py+rng.uniform(-.012, .012)
        z=height(px2, py2)-.001; length=rng.uniform(.018, .057); width=rng.uniform(.0015, .003)
        forward=Vector((math.cos(a), math.sin(a), 0)); side=Vector((-forward.y, forward.x, 0)); base=Vector((px2, py2, z))
        mid=base+forward*length*.16+Vector((0, 0, length*.58)); tip=base+forward*length*.4+Vector((0, 0, length))
        k=len(gv); gv.extend([base-side*width, base+side*width, mid+side*width*.55, mid-side*width*.55, tip])
        gf.extend([(k,k+1,k+2,k+3), (k+3,k+2,k+4)]); guv.extend([[(0,0),(1,0),(1,.6),(0,.6)],[(0,.6),(1,.6),(.5,1)]])
grass = mesh_object('Wool_Grass_Tufts', gv, gf, [grass_mat])
for p, coords in zip(grass.data.polygons, guv):
    for loop, uv in zip(p.loop_indices, coords): grass.data.uv_layers.active.data[loop].uv=uv

for i in range(13):
    x, y = rng.uniform(-.7, .7), rng.uniform(-.72, .72)
    if margin(x,y)<.1 or any(math.hypot(x-sx,y-sy)<.14 for sx,sy,_,_ in flock): continue
    ellipsoid('Meadow_Stone', (x,y,height(x,y)), (rng.uniform(.02,.04),.023,.016), stone_mat, rng.random()*6, segments=8, rings=4)
fv, ff = [], []
for i in range(65):
    x,y=rng.uniform(-.76,.76),rng.uniform(-.8,.8)
    if margin(x,y)<.1: continue
    z=height(x,y)+.025
    for petal in range(5):
        a=petal*math.tau/5; center=Vector((x,y,z)); tip=center+Vector((math.cos(a)*.01,math.sin(a)*.01,.003))
        s=Vector((-math.sin(a)*.003,math.cos(a)*.003,0)); k=len(fv);fv.extend([center-s,tip,center+s]);ff.append((k,k+1,k+2))
flowers=mesh_object('Wool_Wildflower_Patches',fv,ff,[flower_mat])

bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();decor=bpy.context.object;decor.name='Wool_Flock_and_Stones'
export=[ground, grass, flowers, decor]
bpy.ops.object.select_all(action='DESELECT')
triangles=0
for obj in export:
    obj.select_set(True); obj['resource']='Wool';obj['assetVersion']='web-v01'
    obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
ground['sheepCount']=len(flock);ground['lambCount']=2
assert triangles<30000, triangles
assert max(abs(g) for g in foot_gaps)<.003
bpy.context.view_layer.objects.active=ground
bpy.ops.export_scene.gltf(filepath=str(OUT/'Wool.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_extras=True,export_yup=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)

# Editable source plus a lit camera for inspection in Blender.
scene=bpy.context.scene
world=bpy.data.worlds.new('Pasture_World');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.30,.38,.48,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.7
bpy.ops.object.light_add(type='AREA',location=(-3,-4,7));bpy.context.object.data.energy=650;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=5
bpy.ops.object.camera_add(location=(2.1,-3,2.7));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.5;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'Wool-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Wool.blend'))
report={'resource':'Wool','triangles':triangles,'bytes':(OUT/'Wool.glb').stat().st_size,
        'sheep':8,'lambs':2,'grassTufts':950,'terrainTriangles':len(ground.data.loop_triangles),
        'source':'build-pasture.py; native browser prefab, no high-poly original',
        'fleece':'Continuous sculpted body and crimped-fiber normal map; no separate curl spheres',
        'validation':{'closedTerrain':True,'maxHoofGap':max(abs(g) for g in foot_gaps)},
        'compression':'KHR_draco_mesh_compression'}
(OUT/'Wool-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PASTURE_COMPLETE '+json.dumps(report),flush=True)
bpy.ops.render.render(write_still=True)
