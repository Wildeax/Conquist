"""Bake snow, distributed dark rock and crevice shading onto the browser mountain.

Uses native Blender procedural materials. No extra geometry or runtime shaders.
Always starts from the preserved pre-snow scene, so reruns do not stack paint.
"""
from pathlib import Path
import json
import shutil
import bpy

ROOT=Path(__file__).resolve().parent
OUTPUT=ROOT/'output'/'web-v01'
BASE=ROOT/'output'/'mountain-before-snow'
BASE.mkdir(exist_ok=True)
for filename in ('Stone.blend','Stone.glb','Stone-preview.png','Stone-report.json'):
    if not (BASE/filename).exists():
        shutil.copy2(OUTPUT/filename,BASE/filename)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'Stone.blend'))
scene=bpy.context.scene
ground=bpy.data.objects['Stone_Ground_Web']
material=ground.data.materials[0]
nodes,links=material.node_tree.nodes,material.node_tree.links
shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
surface=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
original=shader.inputs['Base Color'].links[0].from_socket

def node(kind,name):
    result=nodes.new(kind);result.label=name
    return result

def math_node(op,a,b=0):
    result=node('ShaderNodeMath',op);result.operation=op
    for i,value in enumerate((a,b)):
        if isinstance(value,(float,int)):result.inputs[i].default_value=value
        else:links.new(value,result.inputs[i])
    return result.outputs[0]

def remap(value,low,high,out_low=0,out_high=1):
    result=node('ShaderNodeMapRange','Smooth mask');result.interpolation_type='SMOOTHSTEP'
    links.new(value,result.inputs['Value'])
    for name,v in [('From Min',low),('From Max',high),('To Min',out_low),('To Max',out_high)]:
        result.inputs[name].default_value=v
    return result.outputs['Result']

def mix(a,b,factor,blend='MIX'):
    result=node('ShaderNodeMixRGB',blend);result.blend_type=blend
    for i,value in enumerate((factor,a,b)):
        if isinstance(value,(int,float)):result.inputs[i].default_value=value
        elif isinstance(value,tuple):result.inputs[i].default_value=value
        else:links.new(value,result.inputs[i])
    return result.outputs[0]

geometry=node('ShaderNodeNewGeometry','Local terrain features')
position=node('ShaderNodeSeparateXYZ','Altitude');links.new(geometry.outputs['Position'],position.inputs[0])
normals=node('ShaderNodeSeparateXYZ','Snow rests on upward facing rock');links.new(geometry.outputs['True Normal'],normals.inputs[0])
coords=node('ShaderNodeTexCoord','Rock coordinates')
noise=node('ShaderNodeTexNoise','Distributed slate outcrops');noise.inputs['Scale'].default_value=7.5
noise.inputs['Detail'].default_value=3.5;noise.inputs['Roughness'].default_value=.7
links.new(coords.outputs['Object'],noise.inputs['Vector'])
altitude=remap(position.outputs['Z'],.12,.3)
patch=math_node('MULTIPLY',remap(noise.outputs['Fac'],.32,.65,0,.86),altitude)
rock=mix(original,(.16,.21,.27,1),patch,'MULTIPLY')

fine=node('ShaderNodeTexNoise','Irregular snow line');fine.inputs['Scale'].default_value=22
fine.inputs['Detail'].default_value=3;links.new(coords.outputs['Object'],fine.inputs['Vector'])
height=max((ground.matrix_world@v.co).z for v in ground.data.vertices)
broken_height=math_node('ADD',position.outputs['Z'],math_node('MULTIPLY',math_node('SUBTRACT',fine.outputs['Fac'],.5),height*.22))
snow_height=remap(broken_height,height*.55,height*.72)
slope=remap(normals.outputs['Z'],.12,.65,.15,1)
summit=remap(position.outputs['Z'],height*.80,height*.94)
snow=math_node('MULTIPLY',snow_height,math_node('MAXIMUM',slope,summit))
snow_color=mix((.64,.72,.80,1),(.91,.94,.96,1),fine.outputs['Fac'])
color=mix(rock,snow_color,snow)

# Bake local occlusion into the existing color atlas: strengthens crevices
# without another texture fetch or freezing a directional sun shadow into it.
ao=node('ShaderNodeAmbientOcclusion','Baked crevice shading')
ao.inputs['Distance'].default_value=.14;ao.samples=16;ao.only_local=True
occlusion=remap(ao.outputs['AO'],0,1,.48,1)
color=mix(color,occlusion,.8,'MULTIPLY')
emission=node('ShaderNodeEmission','Bake portable surface')
links.new(color,emission.inputs['Color']);links.new(emission.outputs[0],surface.inputs['Surface'])
image=bpy.data.images.new('Stone_Snow_BaseColor',width=1024,height=1024,alpha=False)
image.colorspace_settings.name='sRGB'
target=node('ShaderNodeTexImage','Snow and slate color atlas');target.image=image;nodes.active=target
bpy.ops.object.select_all(action='DESELECT');ground.select_set(True);bpy.context.view_layer.objects.active=ground
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=8
bpy.ops.object.bake(type='EMIT')
image.filepath_raw=str(OUTPUT/'Stone_Snow_BaseColor.png');image.file_format='PNG';image.save()
links.new(target.outputs['Color'],shader.inputs['Base Color'])
links.new(shader.outputs[0],surface.inputs['Surface'])
ground['surfaceRevision']='snow-and-slate-v01'

bpy.ops.object.select_all(action='DESELECT')
triangles=0
for obj in scene.objects:
    if obj.type=='MESH' and obj.name!='Review_Backdrop':
        obj.select_set(True);obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
assert triangles==14510,'Surface treatment must not increase geometry'
grains=bpy.data.objects['Ground_Aggregates'];gmat=grains.data.materials[0]
gs=next(n for n in gmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
previous=gs.inputs['Base Color'].links[0].from_socket
gt=next(n for n in gmat.node_tree.nodes if n.type=='TEX_IMAGE' and 'BaseColor' in n.image.name)
gmat.node_tree.links.new(gt.outputs['Color'],gs.inputs['Base Color'])
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'Stone.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_extras=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
gmat.node_tree.links.new(previous,gs.inputs['Base Color'])
image.pack()
scene['review_stage']='Snow summit, distributed slate outcrops and baked crevice shading'
scene.render.filepath=str(OUTPUT/'Stone-preview.png');scene.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'Stone.blend'))
bpy.ops.render.render(write_still=True)
report=json.loads((BASE/'Stone-report.json').read_text(encoding='utf-8'))
report.update(bytes=(OUTPUT/'Stone.glb').stat().st_size,surfaceRevision='snow-and-slate-v01',
    surfaceNotes='1024px baked procedural snow, slate and local occlusion; same geometry and texture count.')
(OUTPUT/'Stone-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('MOUNTAIN_SURFACE_COMPLETE '+json.dumps(report),flush=True)
