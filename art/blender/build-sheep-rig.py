"""Export a shared rigid-part sheep for browser instancing, reusing Wool PBR."""
from pathlib import Path
import math
import json
import bpy
from mathutils import Vector, noise

OUT=Path(__file__).resolve().parent/'output'/'web-v01'
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(OUT/'Wool.blend'),link=False) as (source,target):
    target.materials=['Wool_Fleece_PBR','Wool_Faces_and_Hooves']
wool,dark=target.materials
groups={'body':[],'head':[],'leg':[]}
def oval(part,center,scale,mat,segments=12,rings=6,fleece=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=center)
    obj=bpy.context.object;obj.scale=scale;obj.data.materials.append(mat)
    if fleece:
        for v in obj.data.vertices:
            p=v.co.copy();v.co*=1+.12*noise.noise(p*4.5)+.045*noise.noise(p*11)
    for p in obj.data.polygons:p.use_smooth=True
    groups[part].append(obj)
oval('body',(0,0,.09),(.091,.047,.054),wool,28,14,True)
oval('body',(-.09,0,.071),(.023,.014,.025),wool,8,4)
# Head parts overlap the body's shoulder, and rotate about a neck pivot.
oval('head',(.063,0,.109),(.031,.030,.037),wool)
oval('head',(.10,0,.131),(.033,.022,.024),dark)
oval('head',(.083,0,.143),(.027,.025,.013),wool)
for side in [-1,1]:oval('head',(.083,side*.032,.137),(.018,.025,.007),dark,8,4)
bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.0062,radius2=.008,depth=.075,location=(0,0,-.0375))
leg=bpy.context.object;leg.data.materials.append(dark);groups['leg'].append(leg)
export=[]
for part,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name='Sheep_Rig_'+part
    # Bake into one canonical sheep coordinate frame, +X forward, +Z up.
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj['sheepPart']=part;export.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in export:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'SheepRig.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_extras=True,export_yup=True,export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,export_draco_position_quantization=14,
    export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'SheepRig.blend'))
report={'bytes':(OUT/'SheepRig.glb').stat().st_size,'parts':{}}
for obj in export:
    obj.data.calc_loop_triangles();report['parts'][obj['sheepPart']]=len(obj.data.loop_triangles)
(OUT/'SheepRig-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('SHEEP_RIG '+json.dumps(report),flush=True)
