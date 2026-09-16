"""Build independent browser prefabs from v03; retain the high-detail originals.

Rebake detailed terrain onto a reduced mesh, simplify complete plant elements,
and join decorations so shared materials render in batches.
"""
import argparse
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / 'output' / 'web-v01'
OUTPUT.mkdir(parents=True, exist_ok=True)
STEMS = {'Stone':'stone-relief','Clay':'clay-relief','Grain':'wheat-fields','Desert':'desert-relief','Timber':'forest'}
parser=argparse.ArgumentParser()
parser.add_argument('--terrain',nargs='+',choices=['All',*STEMS],default=['All'])
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])


class MeshBuilder:
    def __init__(self, source):
        self.source=source
        self.vertices=[]; self.faces=[]; self.materials=[]; self.uvs=[]; self.colors=[]
        self.has_colors=bool(source.color_attributes)

    def face(self, points, material, uvs=None, colors=None):
        start=len(self.vertices)
        self.vertices.extend(tuple(p) for p in points)
        self.faces.append(tuple(range(start,start+len(points))))
        self.materials.append(material)
        self.uvs.extend(uvs or [(0,0)]*len(points))
        self.colors.extend(colors or [(1,1,1,1)]*len(points))

    def copy_face(self, polygon):
        uv=self.source.uv_layers.active
        color=self.source.color_attributes.active_color if self.has_colors else None
        self.face([self.source.vertices[i].co for i in polygon.vertices],polygon.material_index,
                  [tuple(uv.data[i].uv) for i in polygon.loop_indices] if uv else None,
                  [tuple(color.data[i].color) for i in polygon.vertices] if color else None)

    def mesh(self, name):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices,[],self.faces)
        mesh.update()
        for material in self.source.materials:
            mesh.materials.append(material)
        for p, material in zip(mesh.polygons,self.materials):
            p.material_index=material
        uv=mesh.uv_layers.new(name='UVMap')
        for i,value in enumerate(self.uvs):
            uv.data[i].uv=value
        if self.has_colors:
            colors=mesh.color_attributes.new(name='Soil_Grain_Color',type='FLOAT_COLOR',domain='POINT')
            for i,value in enumerate(self.colors):
                colors.data[i].color=value
        return mesh


def decimate(obj, ratio):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    for existing in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=existing.name)
    modifier=obj.modifiers.new('Browser_Geometry','DECIMATE')
    modifier.ratio=ratio
    modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def simplify_tree(obj):
    source=obj.data
    leaves=MeshBuilder(source); wood=MeshBuilder(source)
    rng=random.Random(3287+int(obj.name.rsplit('_',1)[1]))
    seen=set()
    for polygon in source.polygons:
        if source.materials[polygon.material_index].name.startswith('Leaf_'):
            center=max(polygon.vertices)
            if center in seen:
                continue
            seen.add(center)
            if rng.random()>0.25:
                continue
            p=[source.vertices[center-4+i].co.copy() for i in range(4)]
            middle=sum(p,Vector())/4
            p=[middle+(v-middle)*1.65 for v in p]
            leaves.face(p,polygon.material_index,[(0.5,0),(0,0.5),(0.5,1),(1,0.5)])
        else:
            wood.copy_face(polygon)
    obj.data=wood.mesh(obj.name+'_Wood_Web')
    # Reconnect duplicated face vertices before reducing the branch skeleton.
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.000001)
    bpy.ops.object.mode_set(mode='OBJECT')
    decimate(obj,0.24)
    foliage=bpy.data.objects.new(obj.name+'_Foliage_Web',leaves.mesh(obj.name+'_Leaves_Web'))
    bpy.context.scene.collection.objects.link(foliage)
    foliage.matrix_world=obj.matrix_world.copy()


def simplify_wheat(obj):
    source=obj.data
    result=MeshBuilder(source)
    rng=random.Random(219+int(obj.name.rsplit('_',1)[1]))
    cursor=0; kept=0
    while cursor<len(source.vertices):
        p=[source.vertices[cursor+i].co.copy() for i in range(6)]
        short=p[2].z-p[0].z<0.05
        length=6 if short else 90
        assert cursor+length<=len(source.vertices),'Unexpected wheat topology'
        if short or rng.random()<0.7:
            kept+=1
            result.face(p[:3],0,[(0,0),(1,0),(0.5,1)])
            if not short:
                # One complete ear (eight triangles) instead of five solid kernels.
                base=p[2]; midpoint=base+Vector((0,0,0.009)); tip=base+Vector((0,0,0.025))
                radius=0.0042
                ring=[midpoint+Vector((math.cos(i*math.pi/2)*radius,math.sin(i*math.pi/2)*radius,0)) for i in range(4)]
                for i in range(4):
                    j=(i+1)%4
                    result.face([base,ring[j],ring[i]],1,[(0.5,0),(1,0.5),(0,0.5)])
                    result.face([tip,ring[i],ring[j]],2,[(0.5,1),(0,0.5),(1,0.5)])
                for offset in (6,12):
                    result.face([source.vertices[cursor+offset+i].co for i in range(3)],0,[(0,0),(1,0),(0.5,1)])
            else:
                result.face(p[3:],0,[(0,0),(1,0),(0.5,1)])
        cursor+=length
    obj.data=result.mesh(obj.name+'_Web')
    obj['browserStalks']=kept


def thin_ground(obj):
    source=obj.data;result=MeshBuilder(source)
    # Every grain is a closed 15-vertex component. Keep evenly distributed grains.
    assert len(source.vertices)%15==0
    for polygon in source.polygons:
        component=polygon.vertices[0]//15
        if component%8==0:
            result.copy_face(polygon)
    obj.data=result.mesh('Ground_Aggregates_Web')
    obj['physicalGrains']=math.ceil(len(source.vertices)/15/8)


def build(kind):
    stem=STEMS[kind]
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'output'/(stem+'-v03')/(stem+'-v03.blend')))
    scene=bpy.context.scene
    high=next(o for o in scene.objects if o.name==kind+'_Relief_v03')
    grains=bpy.data.objects.get('Ground_Aggregates')
    low=high.copy();low.data=high.data.copy()
    scene.collection.objects.link(low)
    low.name=kind+'_Ground_Web'
    low.data.materials[0]=high.data.materials[0].copy()
    low.data.materials[0].name=kind+'_Ground_Web_PBR'
    decimate(low,0.045)
    # The corners and building-edge reference must survive simplification.
    for i in range(6):
        x=0.955*math.cos(math.radians(30+60*i));y=0.955*math.sin(math.radians(30+60*i))
        assert min((v.co-Vector((x,y,0.08))).length for v in low.data.vertices)<0.003,'Hex corner changed'
    low.data.calc_loop_triangles()
    terrain_triangles=len(low.data.loop_triangles)
    material=low.data.materials[0];nodes=material.node_tree.nodes;links=material.node_tree.links
    shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    # Source terrain + small physical grains transfer to the reduced ground.
    scene.render.engine='CYCLES';scene.cycles.samples=12
    scene.render.bake.use_selected_to_active=True
    scene.render.bake.cage_extrusion=0.055
    scene.render.bake.max_ray_distance=0.14
    scene.render.bake.margin=8
    scene.render.bake.normal_space='TANGENT'
    baked={}
    for channel in ('BaseColor','Normal'):
        bpy.ops.object.select_all(action='DESELECT')
        high.select_set(True);grains.select_set(True);low.select_set(True)
        bpy.context.view_layer.objects.active=low
        image=bpy.data.images.new(kind+'_Web_'+channel,width=1024,height=1024,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='BaseColor' else 'Non-Color'
        target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
        if channel=='BaseColor':
            bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'})
        else:
            bpy.ops.object.bake(type='NORMAL')
        image.filepath_raw=str(OUTPUT/(kind+'_'+channel+'.png'));image.file_format='PNG';image.save()
        baked[channel]=target
        print('WEB_BAKED '+kind+' '+channel,flush=True)
    links.new(baked['BaseColor'].outputs['Color'],shader.inputs['Base Color'])
    normal=nodes.new('ShaderNodeNormalMap')
    links.new(baked['Normal'].outputs['Color'],normal.inputs['Color'])
    links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    bpy.data.objects.remove(high,do_unlink=True)
    scene.render.bake.use_selected_to_active=False
    for obj in list(scene.objects):
        if obj.type!='MESH' or obj==low or obj.name=='Review_Backdrop':
            continue
        if obj.name.startswith('Woodland_Tree_'):
            simplify_tree(obj)
        elif obj.name.startswith('Wheat_Plot_'):
            simplify_wheat(obj)
        elif obj==grains:
            thin_ground(obj)
        elif len(obj.data.polygons)>35:
            decimate(obj,0.5)
    bpy.context.view_layer.update()
    # Apply world transforms before joining; preserve the scarecrow hierarchy's placement.
    decorations=[o for o in scene.objects if o.type=='MESH' and o not in (low,grains) and o.name!='Review_Backdrop']
    for obj in decorations:
        matrix=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=matrix
    bpy.ops.object.select_all(action='DESELECT')
    for obj in decorations:
        obj.select_set(True)
    if decorations:
        bpy.context.view_layer.objects.active=decorations[0]
        bpy.ops.object.join()
        decor=bpy.context.object;decor.name=kind+'_Decorations_Web'
        decor['resource']=kind
    else:
        decor=None
    # Export only the three rendering groups. Empty placement handles are not needed.
    bpy.ops.object.select_all(action='DESELECT')
    export=[low,grains]+([decor] if decor else [])
    for obj in export:
        obj.select_set(True)
        obj['resource']=kind;obj['assetVersion']='web-v01'
        obj.data.validate(verbose=True)
    bpy.context.view_layer.objects.active=low
    # Aggregate palette is handled by COLOR_0 in glTF. Blender keeps its multiply shader.
    gmat=grains.data.materials[0];gnodes=gmat.node_tree.nodes;glinks=gmat.node_tree.links
    gshader=next(n for n in gnodes if n.type=='BSDF_PRINCIPLED')
    previous=gshader.inputs['Base Color'].links[0].from_socket
    gtexture=next(n for n in gnodes if n.type=='TEX_IMAGE' and 'BaseColor' in n.image.name)
    glinks.new(gtexture.outputs['Color'],gshader.inputs['Base Color'])
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT/(kind+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_extras=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
    glinks.new(previous,gshader.inputs['Base Color'])
    triangles=0
    for obj in export:
        evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles);evaluated.to_mesh_clear()
    assert triangles<80000,f'{kind}: browser geometry budget exceeded: {triangles}'
    for image in bpy.data.images:
        if image.has_data and image.source=='FILE':
            image.pack()
    scene['review_stage']='Browser geometry and rebaked high-detail terrain'
    scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x,scene.render.resolution_y=1400,1200
    scene.render.filepath=str(OUTPUT/(kind+'-preview.png'))
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/(kind+'.blend')))
    bpy.ops.render.render(write_still=True)
    report={'resource':kind,'triangles':triangles,'terrainTriangles':terrain_triangles,
            'bytes':(OUTPUT/(kind+'.glb')).stat().st_size,'source':'v03','groups':len(export),
            'notes':'High-detail ground rebaked to 1024px color and tangent normal. Whole plant elements simplified; shared-material decorations joined.'}
    (OUTPUT/(kind+'-report.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('WEB_ASSET_COMPLETE '+json.dumps(report),flush=True)


for kind in STEMS if 'All' in args.terrain else args.terrain:
    build(kind)
