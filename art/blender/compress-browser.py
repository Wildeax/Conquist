"""Re-export prepared browser scenes with Draco, without rebuilding or rendering."""
from pathlib import Path
import json
import bpy

root=Path(__file__).resolve().parent/'output'/'web-v01'
for kind in ('Stone','Clay','Grain','Desert','Timber'):
    bpy.ops.wm.open_mainfile(filepath=str(root/(kind+'.blend')))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH' and obj.name!='Review_Backdrop':
            obj.data.validate(verbose=True)
            obj.select_set(True)
    grains=bpy.data.objects['Ground_Aggregates']
    mat=grains.data.materials[0];nodes=mat.node_tree.nodes;links=mat.node_tree.links
    shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    texture=next(n for n in nodes if n.type=='TEX_IMAGE' and 'BaseColor' in n.image.name)
    links.new(texture.outputs['Color'],shader.inputs['Base Color'])
    bpy.context.view_layer.objects.active=grains
    bpy.ops.export_scene.gltf(filepath=str(root/(kind+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_extras=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
    report=json.loads((root/(kind+'-report.json')).read_text(encoding='utf-8'))
    report['bytes']=(root/(kind+'.glb')).stat().st_size
    report['compression']='KHR_draco_mesh_compression; position 14, normal 10, UV 12 bits'
    (root/(kind+'-report.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('COMPRESSED '+kind+' '+str(report['bytes']),flush=True)
