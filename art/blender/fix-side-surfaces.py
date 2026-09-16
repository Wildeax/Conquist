"""Bake a continuous, world-scale soil atlas across all six side faces.
Preserves the current mountain, rock placement and forest understory.
"""
import bpy,bmesh,json,math,shutil
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'output'/'web-v01';BASE=ROOT/'output'/'before-continuous-sides'
BASE.mkdir(exist_ok=True)
KINDS=('Timber','Stone','Clay','Grain','Desert')
for kind in KINDS:
    for suffix in ('.blend','.glb','-report.json'):
        name=kind+suffix
        if not (BASE/name).exists():shutil.copy2(OUT/name,BASE/name)

for kind in KINDS:
    bpy.ops.wm.open_mainfile(filepath=str(BASE/(kind+'.blend')))
    scene=bpy.context.scene;ground=bpy.data.objects[kind+'_Ground_Web'];mesh=ground.data
    slots={i for i,m in enumerate(mesh.materials) if m.name.startswith('Soil_Sides')}
    assert len(slots)==1
    slot=next(iter(slots))
    # Decimation left eroded, twisted side triangles. Rebuild the skirt from
    # the top surface boundary, preserving its exact outline and top UVs.
    source_uv=mesh.uv_layers.active
    vertices=[tuple(v.co) for v in mesh.vertices];faces=[];face_uv=[];face_material=[];smooth=[]
    edge_uses={}
    for p in mesh.polygons:
        if p.material_index in slots:continue
        indices=list(p.vertices);faces.append(indices)
        face_uv.append([tuple(source_uv.data[i].uv) for i in p.loop_indices]);face_material.append(p.material_index);smooth.append(p.use_smooth)
        for a,b in zip(indices,indices[1:]+indices[:1]):
            key=tuple(sorted((a,b)));edge_uses.setdefault(key,[]).append((a,b))
    # Discard tiny disconnected rim slivers left by decimation. Extruding those
    # together with the outline would create overlapping internal skirt edges.
    owners={}
    for i,indices in enumerate(faces):
        for a,b in zip(indices,indices[1:]+indices[:1]):owners.setdefault(tuple(sorted((a,b))),[]).append(i)
    adjacency=[set() for _ in faces]
    for group in owners.values():
        for i in group:adjacency[i].update(j for j in group if j!=i)
    remaining=set(range(len(faces)));components=[]
    while remaining:
        stack=[remaining.pop()];component=[]
        while stack:
            i=stack.pop();component.append(i)
            for j in adjacency[i]:
                if j in remaining:remaining.remove(j);stack.append(j)
        components.append(component)
    keep=sorted(max(components,key=len));removed=len(faces)-len(keep)
    assert removed<25,'Unexpected disconnected terrain regions'
    faces=[faces[i] for i in keep];face_uv=[face_uv[i] for i in keep]
    face_material=[face_material[i] for i in keep];smooth=[smooth[i] for i in keep]
    edge_uses={}
    for indices in faces:
        for a,b in zip(indices,indices[1:]+indices[:1]):edge_uses.setdefault(tuple(sorted((a,b))),[]).append((a,b))
    print('RIM_SLIVERS_REMOVED',kind,removed,flush=True)
    boundary=[uses[0] for uses in edge_uses.values() if len(uses)==1]
    assert len(boundary)>6
    # Trace simple boundary cycles, splitting pinched vertices. Fill tiny holes
    # at the rim instead of extruding their outlines as additional side walls.
    outgoing={}
    for a,b in boundary:outgoing.setdefault(a,[]).append(b)
    cycles=[]
    while any(outgoing.values()):
        start=next(a for a,targets in outgoing.items() if targets)
        path=[start];positions={start:0}
        while path and outgoing.get(path[-1]):
            nxt=outgoing[path[-1]].pop()
            if nxt in positions:
                at=positions[nxt];cycles.append(path[at:])
                path=path[:at+1];positions={v:i for i,v in enumerate(path)}
            else:positions[nxt]=len(path);path.append(nxt)
    def area(loop):
        return abs(sum(vertices[a][0]*vertices[b][1]-vertices[b][0]*vertices[a][1] for a,b in zip(loop,loop[1:]+loop[:1])))/2
    outer=max(cycles,key=area)
    for loop in cycles:
        if loop is outer:continue
        assert area(loop)<.01,'Unexpected large hole in terrain'
        c=sum((Vector(vertices[i]) for i in loop),Vector())/len(loop)
        middle=len(vertices);vertices.append(tuple(c))
        for a,b in zip(loop,loop[1:]+loop[:1]):
            indices=[b,a,middle];faces.append(indices);face_material.append(0);smooth.append(True)
            face_uv.append([(.02+(vertices[i][0]/2+.5)*.96,.20+(vertices[i][1]/2+.5)*.78) for i in indices])
    boundary=list(zip(outer,outer[1:]+outer[:1]))
    print('RIM_HOLES_FILLED',kind,len(cycles)-1,flush=True)
    bottom={}
    for a,b in boundary:
        for index in (a,b):
            if index not in bottom:
                v=mesh.vertices[index].co;bottom[index]=len(vertices);vertices.append((v.x,v.y,-.1))
    center=len(vertices);vertices.append((0,0,-.1))
    for a,b in boundary:
        faces.append([b,a,bottom[a],bottom[b]]);face_uv.append([(0,0)]*4);face_material.append(slot);smooth.append(False)
        faces.append([bottom[b],bottom[a],center]);face_uv.append([(0,0)]*3);face_material.append(slot);smooth.append(False)
    rebuilt=bpy.data.meshes.new(kind+'_Clean_Sidewalls');rebuilt.from_pydata(vertices,[],faces);rebuilt.update()
    for m in mesh.materials:rebuilt.materials.append(m)
    uv=rebuilt.uv_layers.new(name='PBR_UV')
    for p,coords,material_index,is_smooth in zip(rebuilt.polygons,face_uv,face_material,smooth):
        p.material_index=material_index;p.use_smooth=is_smooth
        for loop,co in zip(p.loop_indices,coords):uv.data[loop].uv=co
    ground.data=rebuilt;mesh=rebuilt
    side_faces=[p.index for p in mesh.polygons if p.material_index in slots]
    for index in side_faces:
        p=mesh.polygons[index]
        side=round(math.atan2(p.center.y,p.center.x)/(math.pi/3))%6
        angle=side*math.pi/3;tangent=Vector((-math.sin(angle),math.cos(angle),0))
        p.use_smooth=False
        for loop in p.loop_indices:
            v=mesh.vertices[mesh.loops[loop].vertex_index].co
            # Keep the complete perimeter inside one atlas. No repeated UV tiles.
            u=(side*.955+v.dot(tangent)+.4775)/(6*.955)
            uv.data[loop].uv=(.005+.99*u,.06+.88*(v.z+.1)/.18)
    temp=ground.copy();temp.data=mesh.copy();scene.collection.objects.link(temp)
    temp.name='Side_Bake_Target'
    bm=bmesh.new();bm.from_mesh(temp.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index not in slots],context='FACES')
    bm.to_mesh(temp.data);bm.free()
    temp.data.materials.clear()
    for p in temp.data.polygons:p.material_index=0
    mat=bpy.data.materials.new(kind+'_Continuous_Soil_Sides');mat.use_nodes=True
    temp.data.materials.append(mat)
    ns,ls=mat.node_tree.nodes,mat.node_tree.links
    bs=ns.get('Principled BSDF');output=ns.get('Material Output')
    geometry=ns.new('ShaderNodeNewGeometry')
    def noise(scale):
        n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=scale;n.inputs['Detail'].default_value=3
        ls.new(geometry.outputs['Position'],n.inputs['Vector']);return n.outputs['Fac']
    broad=noise(12);fine=noise(110)
    ramp=ns.new('ShaderNodeValToRGB');ls.new(broad,ramp.inputs[0])
    palette=((.032,.024,.014,1),(.16,.105,.054,1)) if kind=='Timber' else ((.065,.043,.025,1),(.26,.185,.10,1))
    if kind=='Desert':palette=((.14,.10,.055,1),(.36,.26,.135,1))
    for e,c in zip(ramp.color_ramp.elements,palette):e.color=c
    granular=ns.new('ShaderNodeMapRange');ls.new(fine,granular.inputs['Value'])
    granular.inputs['To Min'].default_value=.55;granular.inputs['To Max'].default_value=1.25
    color=ns.new('ShaderNodeMixRGB');color.blend_type='MULTIPLY';color.inputs[0].default_value=.65
    ls.new(ramp.outputs[0],color.inputs[1]);ls.new(granular.outputs[0],color.inputs[2])
    # Distinct shallow organic layer follows world height instead of UV stretching.
    sep=ns.new('ShaderNodeSeparateXYZ');ls.new(geometry.outputs['Position'],sep.inputs[0])
    layer=ns.new('ShaderNodeMapRange');ls.new(sep.outputs['Z'],layer.inputs['Value'])
    layer.inputs['From Min'].default_value=.035;layer.inputs['From Max'].default_value=.08
    layer.inputs['To Min'].default_value=1;layer.inputs['To Max'].default_value=.65
    final=ns.new('ShaderNodeMixRGB');final.blend_type='MULTIPLY';final.inputs[0].default_value=1
    ls.new(color.outputs[0],final.inputs[1]);ls.new(layer.outputs[0],final.inputs[2])
    bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.001
    ls.new(fine,bump.inputs['Height']);ls.new(bump.outputs[0],bs.inputs['Normal'])
    rough=ns.new('ShaderNodeMapRange');ls.new(fine,rough.inputs['Value'])
    rough.inputs['To Min'].default_value=.86;rough.inputs['To Max'].default_value=.99
    emission=ns.new('ShaderNodeEmission')
    bpy.ops.object.select_all(action='DESELECT');temp.select_set(True);bpy.context.view_layer.objects.active=temp
    hidden={o:o.hide_render for o in scene.objects if o!=temp}
    for o in hidden:o.hide_render=True
    scene.render.engine='CYCLES';scene.cycles.samples=8
    scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=2
    images={}
    for channel,source in [('BaseColor',final.outputs[0]),('Roughness',rough.outputs[0]),('Normal',None)]:
        image=bpy.data.images.new(kind+'_SideAtlas_'+channel,width=2048,height=64,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='BaseColor' else 'Non-Color'
        target=ns.new('ShaderNodeTexImage');target.image=image;ns.active=target
        if source:ls.new(source,emission.inputs[0]);ls.new(emission.outputs[0],output.inputs[0])
        else:ls.new(bs.outputs[0],output.inputs[0])
        bpy.ops.object.bake(type='EMIT' if source else 'NORMAL')
        image.filepath_raw=str(OUT/(kind+'_SideAtlas_'+channel+'.png'));image.file_format='PNG';image.save();image.pack()
        images[channel]=image
    for o,value in hidden.items():o.hide_render=value
    bpy.data.objects.remove(temp,do_unlink=True)
    ns.clear();bs=ns.new('ShaderNodeBsdfPrincipled');output=ns.new('ShaderNodeOutputMaterial');ls.new(bs.outputs[0],output.inputs[0])
    for channel,image in images.items():
        tex=ns.new('ShaderNodeTexImage');tex.image=image;tex.extension='EXTEND'
        if channel=='Normal':
            normal=ns.new('ShaderNodeNormalMap');ls.new(tex.outputs[0],normal.inputs['Color']);ls.new(normal.outputs[0],bs.inputs['Normal'])
        else:ls.new(tex.outputs[0],bs.inputs['Base Color' if channel=='BaseColor' else 'Roughness'])
    mesh.materials[slot]=mat
    bpy.ops.object.select_all(action='DESELECT');triangles=0
    for obj in scene.objects:
        if obj.type=='MESH' and obj.name!='Review_Backdrop':
            obj.select_set(True);obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    grains=bpy.data.objects['Ground_Aggregates'];gmat=grains.data.materials[0];gn=gmat.node_tree.nodes;gl=gmat.node_tree.links
    gs=next(n for n in gn if n.type=='BSDF_PRINCIPLED');previous=gs.inputs['Base Color'].links[0].from_socket
    gt=next(n for n in gn if n.type=='TEX_IMAGE' and 'BaseColor' in n.image.name);gl.new(gt.outputs[0],gs.inputs['Base Color'])
    bpy.context.view_layer.objects.active=ground
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,
        export_apply=True,export_extras=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,export_draco_normal_quantization=10,export_draco_texcoord_quantization=12)
    gl.new(previous,gs.inputs['Base Color'])
    report=json.loads((BASE/(kind+'-report.json')).read_text(encoding='utf-8'))
    assert triangles<report['triangles']+1000,'Side reconstruction exceeded geometry allowance'
    mesh.calc_loop_triangles()
    report.update(triangles=triangles,terrainTriangles=len(mesh.loop_triangles),bytes=(OUT/(kind+'.glb')).stat().st_size,sideRevision='rebuilt-continuous-sides-v03')
    report['groundRefinement']['sideUV']='Rebuilt vertical walls; unique 2048x64 perimeter atlas; world-space bake'
    (OUT/(kind+'-report.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    scene.render.filepath=str(OUT/(kind+'-preview.png'));scene.cycles.samples=24
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'.blend')))
    if kind=='Timber':bpy.ops.render.render(write_still=True)
    print('CONTINUOUS_SIDES '+kind+' '+str(report['bytes']),flush=True)
