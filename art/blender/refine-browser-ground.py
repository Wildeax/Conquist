"""Ground rocks, add forest understory and replace stretched side UVs.
Native Blender geometry/material baking, preserving a repeatable pre-edit snapshot.
"""
import json
import math
import random
import shutil
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'output'/'web-v01'
BASE=ROOT/'output'/'before-ground-refinement'
BASE.mkdir(exist_ok=True)
KINDS=('Stone','Clay','Grain','Desert','Timber')
for kind in KINDS:
    for suffix in ('.blend','.glb','-preview.png','-report.json'):
        name=kind+suffix
        if not (BASE/name).exists():shutil.copy2(OUT/name,BASE/name)


def make_sides():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane=bpy.context.object
    mat=bpy.data.materials.new('Soil_Sides_PBR');mat.use_nodes=True
    plane.data.materials.append(mat)
    ns,ls=mat.node_tree.nodes,mat.node_tree.links
    bs=ns.get('Principled BSDF');out=ns.get('Material Output')
    uv=ns.new('ShaderNodeTexCoord')
    noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5
    noise.inputs['Detail'].default_value=4;ls.new(uv.outputs['UV'],noise.inputs['Vector'])
    fine=ns.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=55
    fine.inputs['Detail'].default_value=2;ls.new(uv.outputs['UV'],fine.inputs['Vector'])
    wave=ns.new('ShaderNodeTexWave');wave.bands_direction='Y'
    wave.inputs['Scale'].default_value=1.2;wave.inputs['Distortion'].default_value=3
    wave.inputs['Detail Scale'].default_value=2;ls.new(uv.outputs['UV'],wave.inputs['Vector'])
    mix=ns.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.06
    ls.new(noise.outputs['Fac'],mix.inputs[1]);ls.new(wave.outputs['Color'],mix.inputs[2])
    ramp=ns.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(.055,.035,.021,1)
    ramp.color_ramp.elements[1].color=(.24,.17,.10,1)
    ls.new(mix.outputs[0],ramp.inputs[0])
    sep=ns.new('ShaderNodeSeparateXYZ');ls.new(uv.outputs['UV'],sep.inputs[0])
    humus=ns.new('ShaderNodeMapRange')
    humus.inputs['From Min'].default_value=.65;humus.inputs['From Max'].default_value=1
    humus.inputs['To Min'].default_value=1;humus.inputs['To Max'].default_value=.55
    ls.new(sep.outputs['Y'],humus.inputs['Value'])
    color=ns.new('ShaderNodeMixRGB');color.blend_type='MULTIPLY';color.inputs[0].default_value=1
    ls.new(ramp.outputs[0],color.inputs[1]);ls.new(humus.outputs[0],color.inputs[2])
    rough=ns.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.83
    rough.inputs['To Max'].default_value=.99;ls.new(fine.outputs['Fac'],rough.inputs['Value'])
    bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.3;bump.inputs['Distance'].default_value=.008
    ls.new(fine.outputs['Fac'],bump.inputs['Height']);ls.new(bump.outputs[0],bs.inputs['Normal'])
    emission=ns.new('ShaderNodeEmission')
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
    scene.render.bake.margin=4
    images={}
    for channel,source in [('BaseColor',color.outputs[0]),('Roughness',rough.outputs[0]),('Normal',None)]:
        image=bpy.data.images.new('Soil_Sides_'+channel,width=256,height=256,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='BaseColor' else 'Non-Color'
        target=ns.new('ShaderNodeTexImage');target.image=image;ns.active=target
        if source:
            ls.new(source,emission.inputs['Color']);ls.new(emission.outputs[0],out.inputs[0])
        else:ls.new(bs.outputs[0],out.inputs[0])
        bpy.ops.object.bake(type='EMIT' if source else 'NORMAL')
        image.filepath_raw=str(OUT/('Soil_Sides_'+channel+'.png'));image.file_format='PNG';image.save();image.pack()
        images[channel]=image
    ns.clear();bs=ns.new('ShaderNodeBsdfPrincipled');out=ns.new('ShaderNodeOutputMaterial');ls.new(bs.outputs[0],out.inputs[0])
    for channel,img in images.items():
        tex=ns.new('ShaderNodeTexImage');tex.image=img
        if channel=='Normal':
            normal=ns.new('ShaderNodeNormalMap');ls.new(tex.outputs[0],normal.inputs['Color']);ls.new(normal.outputs[0],bs.inputs['Normal'])
        else:ls.new(tex.outputs[0],bs.inputs['Base Color' if channel=='BaseColor' else 'Roughness'])
    bpy.data.libraries.write(str(OUT/'soil-sides-material.blend'),{mat})


def sampler(ground):
    verts=[ground.matrix_world@v.co for v in ground.data.vertices]
    tree=BVHTree.FromPolygons(verts,[list(p.vertices) for p in ground.data.polygons])
    def sample(x,y):
        point,normal,_,_=tree.ray_cast(Vector((x,y,4)),Vector((0,0,-1)))
        assert point is not None,'Placement outside terrain'
        return point,normal
    return sample


def rocks(ground):
    obj=bpy.data.objects['Stone_Decorations_Web'];mesh=obj.data
    sample=sampler(ground);matrix=obj.matrix_world;inverse=matrix.inverted()
    parent=list(range(len(mesh.vertices)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    def union(a,b):parent[find(a)]=find(b)
    for edge in mesh.edges:union(*edge.vertices)
    duplicates={}
    for v in mesh.vertices:
        key=tuple(round(float(c),6) for c in v.co)
        if key in duplicates:union(v.index,duplicates[key])
        else:duplicates[key]=v.index
    groups={}
    for v in mesh.vertices:groups.setdefault(find(v.index),[]).append(v.index)
    rng=random.Random(91);moved=0;embedded=0
    for indices in groups.values():
        points=[matrix@mesh.vertices[i].co for i in indices]
        center=sum(points,Vector())/len(points)
        target,normal=sample(center.x,center.y)
        # Tall loose boulders on very steep/snowy faces become lower scree.
        if target.z>.48 or normal.z<.48:
            for _ in range(16):
                direction=Vector((normal.x,normal.y,0))
                if direction.length<.01:direction=Vector((center.x,center.y,0))
                direction.normalize()
                candidate=target+direction*.045
                if math.hypot(candidate.x,candidate.y)>.72:break
                target,normal=sample(candidate.x,candidate.y)
                if target.z<.43 and normal.z>.5:break
            moved+=1
        rotation=Vector((0,0,1)).rotation_difference(normal)
        scale=rng.uniform(.85,1.05)
        adjusted=[]
        for p in points:
            offset=p-center;offset.z*=.7
            adjusted.append(target+rotation@(offset*scale))
        differences=sorted(sample(p.x,p.y)[0].z-p.z for p in adjusted)
        # Embed the lower half of each solid component in the slope.
        dz=differences[int(len(differences)*.5)]-.002
        gaps=[]
        for index,p in zip(indices,adjusted):
            p.z+=dz;mesh.vertices[index].co=inverse@p
            gaps.append(p.z-sample(p.x,p.y)[0].z)
        assert min(gaps)<0 and max(gaps)>0,'Rock must intersect terrain and remain visible'
        embedded+=1
    mesh.update()
    return {'rocksSeated':embedded,'rocksMovedDownSlope':moved}


def understory(ground):
    rng=random.Random(8154);sample=sampler(ground)
    vertices=[];faces=[];uvs=[]
    def tri(a,b,c):
        i=len(vertices);vertices.extend((a,b,c));faces.append((i,i+1,i+2));uvs.extend(((0,0),(1,0),(.5,1)))
    placements=[]
    for _ in range(6000):
        x,y=rng.uniform(-.75,.75),rng.uniform(-.8,.8)
        margin=min(.955*math.sqrt(3)/2-x*math.cos(i*math.pi/3)-y*math.sin(i*math.pi/3) for i in range(6))
        if margin<.09 or abs(x-(.06+.15*math.sin(y*4.5)))<.065:continue
        if any(math.hypot(x-px,y-py)<.067 for px,py in placements):continue
        placements.append((x,y))
        if len(placements)==150:break
    for plant,(x,y) in enumerate(placements):
        point,_=sample(x,y);point.z-=.002
        if plant%3:
            # Low fern rosettes with readable paired leaflets.
            for frond in range(6):
                a=frond*math.tau/6+rng.random()*.6
                forward=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0))
                length=rng.uniform(.045,.078)
                for k in range(1,6):
                    t=k/6;c=point+forward*length*t+Vector((0,0,.035*math.sin(t*math.pi*.8)))
                    for sign in (-1,1):
                        tip=c+side*sign*(1-t)*.021+forward*.013
                        tri(c-forward*.004,c+forward*.004,tip)
        else:
            for blade in range(9):
                a=rng.uniform(0,math.tau);f=Vector((math.cos(a),math.sin(a),0));s=Vector((-f.y,f.x,0))
                base=point+f*rng.uniform(0,.013);tip=base+f*rng.uniform(.01,.04)+Vector((0,0,rng.uniform(.025,.065)))
                tri(base-s*.002,base+s*.002,tip)
    mesh=bpy.data.meshes.new('Forest_Understory');mesh.from_pydata(vertices,[],faces);mesh.update()
    layer=mesh.uv_layers.new(name='UVMap')
    for item,value in zip(layer.data,uvs):item.uv=value
    mesh.materials.append(bpy.data.materials['Detail_Fern_Leaf'])
    obj=bpy.data.objects.new('Forest_Understory',mesh);bpy.context.scene.collection.objects.link(obj)
    # Merge into the existing material batches; the new ferns share its PBR maps.
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    decor=bpy.data.objects['Timber_Decorations_Web'];decor.select_set(True);bpy.context.view_layer.objects.active=decor
    bpy.ops.object.join()
    return {'understoryPlants':len(placements),'understoryTriangles':len(faces)}


def sides(ground):
    with bpy.data.libraries.load(str(OUT/'soil-sides-material.blend'),link=False) as (source,target):
        target.materials=['Soil_Sides_PBR']
    mat=target.materials[0];ground.data.materials.append(mat);slot=len(ground.data.materials)-1
    uv=ground.data.uv_layers.active;count=0
    # Unwrap by true distance along each of the six flat hex sides.
    for p in ground.data.polygons:
        points=[ground.data.vertices[i].co for i in p.vertices]
        if max(v.z for v in points)>.085 or p.normal.z>.45:continue
        p.material_index=slot;count+=1
        side=round(math.atan2(p.center.y,p.center.x)/(math.pi/3))%6
        angle=side*math.pi/3;tangent=Vector((-math.sin(angle),math.cos(angle),0))
        for loop in p.loop_indices:
            v=ground.data.vertices[ground.data.loops[loop].vertex_index].co
            uv.data[loop].uv=((side*.955+v.dot(tangent)+.4775)/.18,(v.z+.1)/.18)
    assert count>20,'Side material was not assigned'
    return {'sideFaces':count,'sideUV':'physical perimeter distance / 0.18; height / 0.18'}


make_sides()
for kind in KINDS:
    bpy.ops.wm.open_mainfile(filepath=str(BASE/(kind+'.blend')))
    scene=bpy.context.scene;ground=bpy.data.objects[kind+'_Ground_Web']
    details={}
    if kind=='Stone':details.update(rocks(ground))
    if kind=='Timber':details.update(understory(ground))
    details.update(sides(ground))
    bpy.ops.object.select_all(action='DESELECT');triangles=0
    for obj in scene.objects:
        if obj.type=='MESH' and obj.name!='Review_Backdrop':
            obj.select_set(True);obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    assert triangles<80000
    grains=bpy.data.objects['Ground_Aggregates'];mat=grains.data.materials[0];ns=mat.node_tree.nodes;ls=mat.node_tree.links
    bs=next(n for n in ns if n.type=='BSDF_PRINCIPLED');previous=bs.inputs['Base Color'].links[0].from_socket
    tex=next(n for n in ns if n.type=='TEX_IMAGE' and 'BaseColor' in n.image.name)
    ls.new(tex.outputs[0],bs.inputs['Base Color'])
    bpy.context.view_layer.objects.active=ground
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_extras=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
    ls.new(previous,bs.inputs['Base Color'])
    scene['groundRefinement']='Seated rocks, forest understory, physical side UVs'
    scene.render.filepath=str(OUT/(kind+'-preview.png'));scene.cycles.samples=24
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'.blend')))
    if kind in ('Stone','Timber'):bpy.ops.render.render(write_still=True)
    report=json.loads((BASE/(kind+'-report.json')).read_text(encoding='utf-8'))
    report.update(triangles=triangles,bytes=(OUT/(kind+'.glb')).stat().st_size,groundRefinement=details)
    (OUT/(kind+'-report.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('GROUND_REFINED '+kind+' '+json.dumps(report),flush=True)
