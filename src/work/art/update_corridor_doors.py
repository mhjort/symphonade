"""Apply the approved cabin leaf to closed cabins in the current ship assembly."""
import bpy, math, sys
from pathlib import Path
from mathutils import Matrix, Vector
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'tools/level'))
from export_ship_modules import export_current
assembly=root/'build/level/modules/assembly.blend'
bpy.ops.wm.open_mainfile(filepath=str(assembly))
# Use the same source model as the playable cabin doors, including its brass reader.
with bpy.data.libraries.load(str(root/'build/level/cabin-door-8402.blend'),link=False) as (source,target):
    target.objects=source.objects
parts=[o for o in target.objects if o]
for o in parts: bpy.context.collection.objects.link(o)
placements=[]
for x in [10,12]:
 for i,z in enumerate([-9,-5,-1,3,7,19,23,27,31]):
  n=8403+i*2+(x==12)
  for prefix in ['Closed cabin','Number','Handle']:
   for o in list(bpy.data.objects):
    if o.name.startswith(f'{prefix} {n}'):
     bpy.data.objects.remove(o,do_unlink=True)
  # Idempotent if re-run on the updated assembly.
  for o in list(bpy.data.objects):
   if o.name.startswith(f'Cabin {n} approved '): bpy.data.objects.remove(o,do_unlink=True)
  yaw=math.pi/2 if x==10 else -math.pi/2
  transform=Matrix.Translation((x+(.19 if x==10 else -.19),-z,3.4)) @ Matrix.Rotation(yaw,4,'Z') @ Matrix.Diagonal((1/1.1,1,1,1))
  for part in parts:
   o=part.copy(); o.data=part.data.copy() if part.type=='FONT' else part.data
   bpy.context.collection.objects.link(o)
   o.name=f'Cabin {n} approved {part.name}'; o['ship_module']='base'
   if o.type=='FONT': o.data.body=str(n)
   o.matrix_world=transform @ part.matrix_basis
  placements.append((n,x,z))
for o in parts: bpy.data.objects.remove(o,do_unlink=True)
# The old continuous corridor rails ran across the old door panels. Break them
# at every doorway so the matching new lock plates and handles stay unobstructed.
for o in list(bpy.context.scene.objects):
 if not o.name.startswith('Handrail '): continue
 if o.get('cabin_door_segment'): continue
 bounds=[o.matrix_world @ Vector(p) for p in o.bound_box]
 lo=min(-p.y for p in bounds); hi=max(-p.y for p in bounds)
 center=sum(bounds,Vector())/8
 cuts=[(lo,hi)]
 for z in [-9,-5,-1,3,7,19,23,27,31]:
  remaining=[]
  for a,b in cuts:
   if z+.58<=a or z-.58>=b: remaining.append((a,b)); continue
   if a<z-.58: remaining.append((a,z-.58))
   if b>z+.58: remaining.append((z+.58,b))
  cuts=remaining
 for index,(a,b) in enumerate(cuts):
  bpy.ops.mesh.primitive_cube_add(size=1,location=(center.x,-(a+b)/2,center.z))
  seg=bpy.context.object; seg.name=f'{o.name} door-clear {index}'
  seg.dimensions=(.07,b-a,.09)
  seg.data.materials.append(o.data.materials[0]); seg['ship_module']='base'; seg['cabin_door_segment']=True
 bpy.data.objects.remove(o,do_unlink=True)
# Module exporter batches meshes; convert just the newly copied number text.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.name.startswith('Cabin ') and ' approved ' in o.name: o.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in bpy.context.selected_objects)
bpy.ops.object.convert(target='MESH')
bpy.ops.wm.save_as_mainfile(filepath=str(assembly))
export_current('base')
print('UPDATED_CABINS',placements)
