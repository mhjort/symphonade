"""Replace the current assembly's opaque promenade roof with framed glazing.

Run with Blender from the project root; pass -- --export after visual review.
The existing roof collider stays intact. Other ship modules are untouched.
"""
import sys
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path('tools/blender-level').resolve()))
sys.path.insert(0, str(Path('tools/level').resolve()))
from bmlevel import mat, scene

bpy.ops.wm.open_mainfile(filepath='build/level/modules/assembly.blend')
bpy.context.preferences.filepaths.save_version = 0
roof = bpy.data.objects.get('Promenade ceiling')
if roof is None:
    raise RuntimeError('Expected the authored Promenade ceiling in the current assembly')
for obj in list(bpy.context.scene.objects):
    # Legacy luminous panels imitate daylight but block the actual sky.
    if obj.name.startswith(('Promenade skylight ', 'Skylight pane ',
                            'Skylight transverse rib ', 'Skylight spine ')):
        bpy.data.objects.remove(obj, do_unlink=True)

mat('glass_promenade_roof', (.72, .86, .92), alpha=.10, roughness=.12)
mat('promenade_roof_frame', (.82, .85, .82), metal=.25, roughness=.35)
roof.data.materials.clear()
roof.data.materials.append(bpy.data.materials['glass_promenade_roof'])
# One thin surface avoids tinting the sky twice through a box's top and bottom.
mesh = bpy.data.meshes.new('Promenade roof glazing')
mesh.from_pydata([(-6.2, 24.2, 21.125), (6.2, 24.2, 21.125),
                 (6.2, -36.2, 21.125), (-6.2, -36.2, 21.125)], [], [(0, 1, 2, 3)])
mesh.materials.append(bpy.data.materials['glass_promenade_roof'])
roof.data = mesh
roof.matrix_world.identity()

def beam(name, start, end, width):
    a, b = Vector(start), Vector(end)
    # Author beam vertices in game coordinates, then convert to Blender.
    direction = (b-a).normalized()
    across = direction.cross(Vector((0, 1, 0))).normalized()*width/2
    up = direction.cross(across).normalized()*width/2
    points = [p + s*across + t*up for p in (a,b) for s,t in ((-1,-1),(1,-1),(1,1),(-1,1))]
    scene._add_mesh('Promenade skylight '+name, [(p.x,-p.z,p.y) for p in points],
                    [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], 'promenade_roof_frame')

for x in (-6, -3, 0, 3, 6):
    beam('longitudinal '+str(x), (x,21,-24.2), (x,21,36.2), .13)
for z in range(-24,37,4):
    beam('crossbar '+str(z), (-6.2,20.96,z), (6.2,20.96,z), .16)
    if z % 8 == 0:
        beam('truss tie '+str(z), (-6,20.25,z), (6,20.25,z), .11)
        for i in range(4):
            x = -6+i*3
            beam(f'brace {z} {i}', (x,20.25,z), (x+1.5,20.96,z), .065)
            beam(f'brace return {z} {i}', (x+1.5,20.96,z), (x+3,20.25,z), .065)
for obj in bpy.context.scene.objects:
    if obj.name.startswith('Promenade skylight '):
        obj['ship_module'] = 'base'
bpy.ops.wm.save_as_mainfile(filepath=str(Path('build/level/modules/assembly.blend').resolve()))
if '--export' in sys.argv:
    from export_ship_modules import export_current
    export_current('base')
