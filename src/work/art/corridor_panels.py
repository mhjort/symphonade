"""Reference-style cabin wall panels; keep all trim out of door/lift openings.

Blender -b --python this_file          # build and save for review
Blender -b --python this_file -- --export  # also export the base module
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'tools/level'))
from export_ship_modules import export_current
assembly=root/'build/level/modules/assembly.blend'
bpy.ops.wm.open_mainfile(filepath=str(assembly))
for o in list(bpy.context.scene.objects):
 if o.name.startswith(('Handrail ', 'Foyer corridor handrail ', 'Corridor skirting ', 'Cabin wall finish ')):
  bpy.data.objects.remove(o,do_unlink=True)
def material(name,color,metal=0,rough=.4):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
 m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
panel=material('Cabin pearl gray wall laminate',(.49,.51,.49),.18,.34)
metal=material('Cabin narrow brushed metal joints',(.43,.47,.46),.8,.26)
wood=material('Cabin honey wood handrail',(.32,.145,.048),0,.32)
dark=material('Cabin charcoal rail backing',(.035,.045,.043),.25,.4)
mount=material('Cabin bronze rail brackets',(.26,.22,.13),.7,.3)
made=[]
def box(label,x,y,z,dx,dy,dz,mat,side,bevel=0):
 # Build geometry directly: avoid scene-wide dependency updates per primitive.
 verts=[(a*dx/2,b*dz/2,c*dy/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 mesh=bpy.data.meshes.new(label); mesh.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]); mesh.materials.append(mat)
 o=bpy.data.objects.new('Cabin wall finish '+label,mesh);bpy.context.collection.objects.link(o)
 o.location=(x,-z,y);o['ship_module']='base';o['corridor_side']=side
 if bevel:
  m=o.modifiers.new('Rounded timber edges','BEVEL');m.width=bevel;m.segments=3
 made.append(o);return o
# Measure the authored closed leaves, not a hand-maintained list of cabin numbers.
bpy.context.view_layer.update()
openings={10:[],12:[]}
for o in bpy.context.scene.objects:
 if o.name.startswith('Cabin ') and ' approved Steel leaf' in o.name:
  points=[o.matrix_world@Vector(v) for v in o.bound_box]
  side=10 if o.location.x<11 else 12
  openings[side].append((min(-p.y for p in points)-.1,max(-p.y for p in points)+.1))
profile=json.load(open(root/'src/work/world.json'))['worldProfileData']
for d in profile['doors']:
 if d.get('keyId','').startswith('room-'):
  side=10 if d['position']['x']<11 else 12
  z=d['position']['z']; half=d['width']/2+.12
  openings[side].append((z-half,z+half))
# The lift foyer and Starlight are open passages with no door leaf.
openings[10] += [(30.65,33.35),(36.05,37.95)]
for side in [10,12]:
 sign=1 if side==10 else -1
 intervals=[(-11.7,39.7)]
 for lo,hi in sorted(openings[side]):
  intervals=[pair for a,b in intervals for pair in ([(a,b)] if hi<=a or lo>=b else ([(a,lo)] if a<lo else [])+([(hi,b)] if hi<b else []))]
 for segment,(a,b) in enumerate(intervals):
  span=b-a
  if span<.08: continue
  center=(a+b)/2; key=f'{side} {segment}'
  # The face of the structural bulkhead is 0.18 m into the corridor.
  count=math.ceil(span/.76)
  for i in range(count):
   lo=a+span*i/count;hi=a+span*(i+1)/count
   box('panel '+key+' '+str(i),side+sign*.194,4.97,(lo+hi)/2,.024,3.10,hi-lo-.012,panel,side)
   if i:
    box('vertical joint '+key+' '+str(i),side+sign*.209,4.97,lo,.012,3.10,.013,metal,side)
  box('dark plinth '+key,side+sign*.217,3.51,center,.026,.18,span,dark,side)
  box('rail backing '+key,side+sign*.222,4.25,center,.025,.16,span,dark,side)
  box('wood handrail '+key,side+sign*.292,4.37,center,.11,.055,span-.035,wood,side,.018)
  for i in range(max(1,math.ceil(span/1.1))):
   z=a+span*(i+.5)/max(1,math.ceil(span/1.1))
   box('bracket '+key+' '+str(i),side+sign*.255,4.30,z,.07,.10,.027,mount,side,.008)
# Assert every new finish piece remains outside every expanded doorway interval.
bpy.context.view_layer.update()
for o in made:
 points=[o.matrix_world@Vector(v) for v in o.bound_box]
 a=min(-p.y for p in points);b=max(-p.y for p in points)
 assert all(b<=lo+1e-5 or a>=hi-1e-5 for lo,hi in openings[o['corridor_side']]),o.name
print('DOOR_CLEARANCE_PASS',len(made),'pieces;',sum(map(len,openings.values())),'doorway/open-passage exclusions',flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(assembly))
if '--export' in sys.argv: export_current('base')
