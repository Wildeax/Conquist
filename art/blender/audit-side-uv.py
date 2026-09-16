"""Validate closed terrain topology, vertical walls and bounded side UVs."""
import bpy,json
from pathlib import Path
from collections import Counter
root=Path(__file__).resolve().parent/'output'/'web-v01'
for kind in ('Timber','Stone','Clay','Grain','Desert'):
    bpy.ops.wm.open_mainfile(filepath=str(root/(kind+'.blend')))
    mesh=bpy.data.objects[kind+'_Ground_Web'].data
    edges=Counter();walls=0
    for p in mesh.polygons:
        indices=list(p.vertices)
        for a,b in zip(indices,indices[1:]+indices[:1]):edges[tuple(sorted((a,b)))]+=1
        if 'Continuous_Soil_Sides' not in mesh.materials[p.material_index].name:continue
        for loop in p.loop_indices:
            u,v=mesh.uv_layers.active.data[loop].uv
            assert -.001<=u<=1.001 and -.001<=v<=1.001,'Side atlas coordinates must not repeat'
        if max(mesh.vertices[i].co.z for i in indices)>-.09:
            walls+=1
            assert abs(p.normal.z)<.00001,'Side wall must be vertical, without twisted triangles'
    assert walls>6
    assert all(count==2 for count in edges.values()),'Ground must be closed at walls and base'
    print('SIDE_VALIDATED '+json.dumps({'resource':kind,'verticalWallFaces':walls,'closedMesh':True}),flush=True)
