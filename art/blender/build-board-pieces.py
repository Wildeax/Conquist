"""Editable diorama settlements, cities, roads, ports and robber for Conquist.
All coordinates are Blender Z-up, in the existing one-unit hex scale.
"""
import bpy
import math
import json
import random
import sys
import numpy as np
from pathlib import Path
from mathutils import Vector

OUT=Path(__file__).resolve().parent/'output'/'web-v01'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
rng=random.Random(7591)

def image(name,rgb,noncolor=False):
    if rgb.ndim==2:rgb=np.repeat(rgb[:,:,None],3,axis=2)
    h,w=rgb.shape[:2];img=bpy.data.images.new(name,width=w,height=h,alpha=False)
    img.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
    img.pixels.foreach_set(np.concatenate([rgb,np.ones((h,w,1))],axis=2).astype(np.float32).ravel())
    img.filepath_raw=str(OUT/(name+'.png'));img.file_format='PNG';img.save();img.pack();return img

def material(name,color,style):
    size=256;v,u=np.mgrid[:size,:size].astype(np.float32)/size
    n=np.random.default_rng(71+len(name)).random((size,size))
    if style=='wood':
        h=.35*np.sin(u*140+np.sin(v*16)*1.8)+n*.23
    elif style=='stone':
        h=n*.23+.10*np.sin(u*27+np.sin(v*16)*2)+.08*np.sin(v*41+u*9)
    elif style=='roof':
        h=n*.18-(np.mod(v*12,1)<.09)*.38-(np.mod(u*10+np.floor(v*12)*.5,1)<.07)*.18
    else:h=n*.15
    rgb=np.clip(np.array(color)[None,None,:]*(1+h[:,:,None]*.4),0,1)
    gy,gx=np.gradient(h);normal=np.stack([-gx,-gy,np.ones_like(gx)],axis=2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    maps={'Base Color':image(name+'_BaseColor',rgb),'Normal':image(name+'_Normal',normal*.5+.5,True),
          'Roughness':image(name+'_Roughness',np.clip(.9+h*.1,.65,1),True)}
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    ns,ls=mat.node_tree.nodes,mat.node_tree.links;bs=ns.get('Principled BSDF')
    for channel,img in maps.items():
        tex=ns.new('ShaderNodeTexImage');tex.image=img
        if channel=='Normal':
            normal=ns.new('ShaderNodeNormalMap');ls.new(tex.outputs[0],normal.inputs['Color']);ls.new(normal.outputs[0],bs.inputs[channel])
        else:ls.new(tex.outputs[0],bs.inputs[channel])
    return mat

stone=material('Piece_Limestone',(.45,.40,.31),'stone')
plaster=material('Piece_Lime_Plaster',(.65,.61,.48),'grain')
wood=material('Piece_Oak',(.25,.16,.085),'wood')
roof=material('Piece_Owner_Tint',(.72,.72,.72),'roof')
iron=material('Piece_Dark_Iron',(.065,.073,.07),'grain')
cloth=material('Piece_Sail_Linen',(.77,.73,.59),'grain')
shingle=material('Piece_Weathered_Shingle',(.34,.265,.17),'wood')
leather=material('Piece_Oxblood_Leather',(.19,.055,.04),'grain')
green=material('Piece_Moss',(.23,.29,.095),'grain')
paving=material('Piece_Weathered_Granite',(.40,.42,.40),'stone')
owner_trim=material('Piece_Owner_Trim',(.86,.86,.86),'wood')
def surface(name,color,roughness,metallic=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=roughness;bs.inputs['Metallic'].default_value=metallic
    return mat

# Dedicated surfaces avoid turning clothing and animal faces into polished metal.
glass=surface('Piece_Window_Glass',(.13,.24,.29),.16)
metal=surface('Piece_Forged_Metal',(.24,.27,.29),.34,.78)
parts=[]

def cube(name,location,size,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);obj=bpy.context.object;obj.name=name;obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Worn_edges','BEVEL');mod.width=bevel;mod.segments=1
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.append(obj);return obj

def mesh(name,vertices,faces,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.validate();data.update();data.materials.append(mat)
    uv=data.uv_layers.new(name='PBR_UV')
    for p in data.polygons:
        n=p.normal;axes=(0,1) if abs(n.z)>.7 else (0,2) if abs(n.y)>.7 else (1,2)
        for loop in p.loop_indices:
            co=data.vertices[data.loops[loop].vertex_index].co
            uv.data[loop].uv=(co[axes[0]]*4,co[axes[1]]*4)
    obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj);parts.append(obj);return obj

def beam(name,a,b,radius,mat,vertices=6):
    d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=d.length,location=(Vector(a)+Vector(b))/2)
    obj=bpy.context.object;obj.name=name;obj.rotation_euler=d.to_track_quat('Z','Y').to_euler();obj.data.materials.append(mat);parts.append(obj);return obj

sys.path.insert(0,str(Path(__file__).resolve().parent))
from board_piece_details import detailed_builders
builders=detailed_builders(globals())
report={}
for name,build in builders.items():
    for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    parts=[];emitters=[];build();bpy.ops.object.select_all(action='DESELECT')
    if name in ['Settlement','City']:
        # Paint the architectural outlines, including the city battlements.
        # Neutral warehouse buildings at the ports keep their oak materials.
        trim_names=('Carved_bargeboard','Weathered_ridge','Upper_oak_post','Oak_bressumer',
                    'Side_oak_post','Door_jamb','Carved_lintel','Window_frame','Window_transom',
                    'Porch_post','Tower_coping','Wall_merlon','Tower_crenel')
        for part in parts:
            if part.name.startswith(trim_names):part.data.materials[0]=owner_trim
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    if name!='Cargo':
        bpy.ops.object.join();obj=bpy.context.object;obj.name=name
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        parts=[obj]
    triangles=0
    for obj in parts:
        obj['pieceType']=name;obj['assetVersion']='medieval-v02';obj.data.calc_loop_triangles()
        triangles+=len(obj.data.loop_triangles)
    assert triangles<24000,(name,triangles)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_extras=True,export_yup=True,export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,export_draco_position_quantization=14,
        export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
    scene=bpy.context.scene;world=bpy.data.worlds.get('World') or bpy.data.worlds.new('World');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.40,.47,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
    bpy.ops.object.light_add(type='AREA',location=(-2,-3,5));bpy.context.object.data.energy=500;bpy.context.object.data.size=3
    if name=='Cargo':
        for i,obj in enumerate(parts):obj.location.x=(i-2.5)*.20
    target=Vector((.12 if name=='Port' else 0,-.3 if name=='Port' else 0,.22 if name in ['City','Settlement','Port'] else .12))
    bpy.ops.object.camera_add(location=target+Vector((1.5,-2,1.6)));cam=bpy.context.object
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.45 if name=='Port' else 1.2 if name in ['Road','Cargo'] else .82 if name=='City' else .64 if name=='Settlement' else .43;scene.camera=cam
    scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
    scene.render.resolution_x=900;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.filepath=str(OUT/(name+'-preview.png'))
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
    bpy.ops.render.render(write_still=True)
    report[name]={'triangles':triangles,'bytes':(OUT/(name+'.glb')).stat().st_size,'chimneys':[[x,z,-y] for x,y,z in emitters]}
    print('BOARD_PIECE '+name+' '+json.dumps(report[name]),flush=True)
(OUT/'board-pieces-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
