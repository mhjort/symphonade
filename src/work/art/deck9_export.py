"""Batch the reviewed deck scene by material without duplicating 16,000 parts."""
import bpy
from pathlib import Path
bpy.ops.wm.open_mainfile(filepath=str(Path('build/deck9/deck9.blend').resolve()))
groups={}
for o in bpy.context.scene.objects:
 if o.type=='MESH':groups.setdefault(o.data.materials[0].name,[]).append(o)
import bmesh
originals=list(bpy.context.scene.objects)
for name,objects in groups.items():
 bm=bmesh.new()
 for o in objects:
  o.data.transform(o.matrix_world)
  bm.from_mesh(o.data)
 mesh=bpy.data.meshes.new('Ship '+name);bm.to_mesh(mesh);bm.free()
 mesh.materials.append(objects[0].data.materials[0])
 obj=bpy.data.objects.new('Ship '+name,mesh);bpy.context.scene.collection.objects.link(obj)
bpy.data.batch_remove(originals)
print('BATCHED',len(groups),flush=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(Path('build/deck9/ship-base.glb').resolve()),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_lights=False,export_cameras=False)
print('EXPORTED',flush=True)
