"""Reuse the two furnished cabins; cut real doorways in the current assembly.

Run Blender -b --python this_file. Outputs stay in build/level/deck8-cabins
until reviewed. --apply installs metadata and the edited authoring assembly.
The game instances the two exported room templates, sharing GPU geometry.
"""
import bpy, copy, json, math, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'build/level/deck8-cabins'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'tools/level'))
from export_ship_modules import export_module, export_current
sys.path.insert(0, str(Path(__file__).parent))
from renumber_deck8_cabins import renumber

source = OUT / 'source.blend'
if not source.exists():
    import shutil
    shutil.copy2(ROOT / 'build/level/modules/assembly.blend', source)
    shutil.copy2(ROOT / 'src/work/serenade.mesh-level.json', OUT / 'source.mesh-level.json')
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.context.preferences.filepaths.save_version = 0
level = json.loads((OUT / 'source.mesh-level.json').read_text())
world = json.loads((ROOT / 'src/work/world.json').read_text())
doors = world['worldProfileData']['doors']
original_doors = {d['id']: copy.deepcopy(d) for d in doors if d['id'] in ['8401', '8402']}
for door in original_doors.values():
    door['position']['z'] = 14
    door['assetId'] = 'cabin-door-shared'
doors[:] = [d for d in doors if not d.get('keyId', '').startswith('room-')] + list(original_doors.values())
stations = [-9, -5, -1, 3, 7, 19, 23, 27]
placements = [dict(id=str(8403+i*2+side), template='sea' if side else 'promenade', z=z)
              for i,z in enumerate(stations) for side in [0,1]]

def translated(record, dz, old, new):
    result = copy.deepcopy(record)
    result['name'] = result['name'].replace(old,new)
    result['position'][2] += dz
    return result

# Export the exact furnished rooms, excluding their old room-number plaques and
# the tall promenade walls (which serve several decks).
templates = {}
for side, name, number in [('promenade','Promenade cabin','8401'), ('sea','Sea view cabin','8402')]:
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and
               (o.name.startswith(name+' ') or o.name.startswith(number+' ')) and
               'plaque' not in o.name and 'wall below' not in o.name and 'wall above' not in o.name]
    assert any(o.name == name+' floor' for o in objects)
    templates[side] = objects
    export_module(objects, 'cabin-'+side, OUT)

for obj in list(bpy.context.scene.objects):
    if obj.name in {f'{room} {label}' for room in ['Promenade cabin', 'Sea view cabin']
                   for label in ['plaque', 'corridor plaque']}:
        bpy.data.objects.remove(obj, do_unlink=True)

# A box subtraction is exact for these straight bulkheads; both visual segments
# and physics are derived from the same cuts, preserving floors on other decks.
def subtract(lo, hi, cutlo, cuthi):
    a=[max(lo[i],cutlo[i]) for i in range(3)]
    b=[min(hi[i],cuthi[i]) for i in range(3)]
    if any(a[i]>=b[i]-1e-6 for i in range(3)): return [(lo,hi)]
    parts=[]; lo=lo[:]; hi=hi[:]
    for i in range(3):
        if lo[i]<a[i]-1e-6:
            end=hi[:]; end[i]=a[i]; parts.append((lo[:],end)); lo[i]=a[i]
        if hi[i]>b[i]+1e-6:
            start=lo[:]; start[i]=b[i]; parts.append((start,hi[:])); hi[i]=b[i]
    return parts

def cut_box(obj, cuts):
    points=[obj.matrix_world @ Vector(p) for p in obj.bound_box]
    lo=[min(p.x for p in points),min(p.z for p in points),min(-p.y for p in points)]
    hi=[max(p.x for p in points),max(p.z for p in points),max(-p.y for p in points)]
    pieces=[(lo,hi)]
    for a,b in cuts: pieces=[p for l,h in pieces for p in subtract(l,h,a,b)]
    if pieces==[(lo,hi)]: return
    name=obj.name; material=obj.data.materials[0]
    bpy.data.objects.remove(obj,do_unlink=True)
    for i,(a,b) in enumerate(pieces):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata([(x,-z,y) for x,y,z in [(a[0],a[1],a[2]),(b[0],a[1],a[2]),(b[0],a[1],b[2]),(a[0],a[1],b[2]),(a[0],b[1],a[2]),(b[0],b[1],a[2]),(b[0],b[1],b[2]),(a[0],b[1],b[2])]],[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        mesh.materials.append(material)
        o=bpy.data.objects.new(name+f' cabin cut {i}',mesh); bpy.context.collection.objects.link(o); o['ship_module']='base'

doorcuts=[([x-.5,3.39,z-.55],[x+.5,5.6,z+.55]) for x in [10,12] for z in stations]
windowcuts=[([5.7,3.4,z-1.5],[6.3,6.6,z+1.5]) for z in stations]
wallnames={'Corridor 10 aft','Corridor 12 aft','Starboard rear lift stairs corridor outer aft','Starboard rear lift stairs corridor inner aft'}
for o in list(bpy.context.scene.objects):
    if o.name.startswith('Cabin ') and ' approved ' in o.name:
        bpy.data.objects.remove(o,do_unlink=True)
    elif o.name in wallnames or o.name.startswith('Starboard rear lift stairs corridor handrail '):
        cut_box(o,doorcuts)
    elif o.name.startswith(('Bon Vivant entrance wall','Venue boundary east')):
        cut_box(o,windowcuts)

updated=[]
for c in level['colliders']:
    cuts=doorcuts if c['name'] in wallnames else windowcuts if c['name'].startswith(('Bon Vivant entrance wall','Venue boundary east')) else []
    if not cuts: updated.append(c); continue
    # These walls are axis-aligned, with some stored as a 90-degree local box.
    size=c['size'][:]
    if abs(math.sin(c.get('yaw',0)))>.5: size[0],size[2]=size[2],size[0]
    lo=[c['position'][i]-size[i]/2 for i in range(3)]; hi=[c['position'][i]+size[i]/2 for i in range(3)]
    pieces=[(lo,hi)]
    for a,b in cuts: pieces=[p for l,h in pieces for p in subtract(l,h,a,b)]
    for i,(a,b) in enumerate(pieces):
        updated.append(dict(c,name=c['name']+f' cabin cut {i}',position=[(a[j]+b[j])/2 for j in range(3)],size=[b[j]-a[j] for j in range(3)],yaw=0))
level['colliders']=updated

# Replace the affected opaque decorative promenade bays with copies of the
# already see-through 8401 facade, aligned with the actual room windows.
facade=[o for o in bpy.context.scene.objects if o.name.startswith('Enterable cabin facade ')]
for o in list(bpy.context.scene.objects):
    prefixes=['Projecting cabin bay','Bronze window surround','Cabin glazing','Curtain','Window reflected sky']
    if any(o.name.startswith(p+' 1 0 ') for p in prefixes):
        index=int(o.name.split()[-1]); z=-22+index*4
        if any(abs(z-s)<=1.1 for s in stations): bpy.data.objects.remove(o,do_unlink=True)
for p in placements:
    number=p['id']; side=p['template']; dz=p['z']-14
    oldname='Sea view cabin' if side=='sea' else 'Promenade cabin'; oldid='8402' if side=='sea' else '8401'
    for c in list(level['colliders']):
        if (c['name'].startswith(oldname+' ') and 'wall below' not in c['name'] and 'wall above' not in c['name']) or c['name'].startswith(oldid+' '):
            level['colliders'].append(translated(c,dz,oldname if c['name'].startswith(oldname) else oldid,'Cabin '+number))
    for key in ['volumes','landmarks']:
        for record in list(level[key]):
            if record['name']==oldname: level[key].append(translated(record,dz,oldname,'Cabin '+number))
    d=copy.deepcopy(original_doors[oldid]); d.update(id=number,keyId='room-'+number,assetId='cabin-door-shared'); d['position']['z']=p['z']
    doors[:]=[v for v in doors if v['id']!=number]; doors.append(d)
    level['extras']['doors'].append(number)
    level['extras']['links'].append({'from':'Deck 8 cabins','to':'Cabin '+number,'door':number})
    level['extras']['walkingRoutes']['Deck 8 cabins|Cabin '+number]=[[11,3.4,9.05],[11,3.4,p['z']],[14 if side=='sea' else 8,3.4,p['z']]]
    if side=='promenade':
        for obj in facade:
            o=obj.copy(); o.data=obj.data; o.name='Cabin '+number+' facade '+obj.name; o.location.y-=dz; bpy.context.collection.objects.link(o)

level = renumber(level, doors, placements)
(OUT/'cabins.json').write_text(json.dumps(placements,indent=2)+'\n')
(OUT/'deck8.mesh-level.json').write_text(json.dumps(level,indent=2)+'\n')
(OUT/'deck8.doors.json').write_text(json.dumps(doors,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'base.blend'))
export_current('base',str(OUT))
# Full review assembly only; these copies never go in the base download.
for p in placements:
    for obj in templates[p['template']]:
        o=obj.copy(); o.data=obj.data; o.name='Cabin '+p['id']+' '+obj.name; o.location.y-=p['z']-14; bpy.context.collection.objects.link(o)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'review.blend'))
if '--apply' in sys.argv:
    import shutil
    shutil.copy2(OUT/'base.blend',ROOT/'build/level/modules/assembly.blend')
    shutil.copy2(OUT/'deck8.mesh-level.json',ROOT/'src/work/serenade.mesh-level.json')
    shutil.copy2(OUT/'cabins.json',ROOT/'src/work/deck8-cabins.json')
    # Re-read shared world data immediately before its targeted update.
    current=json.loads((ROOT/'src/work/world.json').read_text())
    current['worldProfileData']['doors']=[d for d in current['worldProfileData']['doors'] if not d.get('keyId','').startswith('room-')]+[d for d in doors if d.get('keyId','').startswith('room-')]
    (ROOT/'src/work/world.json').write_text(json.dumps(current,indent=2)+'\n')

# One numberless leaf for all new cabins. Numbers are attached at runtime.
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'build/level/cabin-door-8402.blend'))
for o in list(bpy.context.scene.objects):
    if o.name.startswith('Cabin number'): bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'cabin-door-shared.glb'),export_format='GLB')
print('CABINS COMPLETE: 18 rooms; 2 reusable interior templates; 1 reusable door')
