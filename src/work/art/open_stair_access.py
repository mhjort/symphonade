"""Open deck 8 stair foyers to Starlight; remove displaced cabin leaves/trim.

Stage after twin_lift_stairs.py; -- --export installs only base and Starlight.
"""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path('tools/blender-level').resolve()))
sys.path.insert(0,str(Path('tools/level').resolve()))
from bmlevel import scene, level, wall, text

N='Open stair access '
S='Starboard rear lift stairs '
REMOVE={f'Foyer forward enclosure {side}' for side in [-1,1]} | {'Starlight aft port','Starlight aft starboard',S+'port cabin wayfinding',S+'starboard cabin wayfinding',
    'Deck 8 corridor bow',S+'corridor outer forward'}

def replaced(name):
    return name in REMOVE or name.startswith((N,'Cabin 8419 approved ','Cabin 8420 approved ',
        'Foyer corridor forward ',S+'corridor inner forward ',S+'forward corridor',
        'Starlight gallery entrance','Starlight upper aft 1 '))

def trim_finishes():
    # Older corridor panels and timber rails ran through the new stairwell.
    for obj in list(bpy.context.scene.objects):
        if not obj.name.startswith('Cabin wall finish '):continue
        bounds=[obj.matrix_world @ Vector(p) for p in obj.bound_box]
        lo=min(-p.y for p in bounds);hi=max(-p.y for p in bounds)
        if hi<=30 or lo>=40.1:continue
        intervals=[]
        if lo<30:intervals.append((lo,30))
        if hi>40.1:intervals.append((40.1,hi))
        for i,(a,b) in enumerate(intervals):
            piece=obj.copy();piece.data=obj.data.copy()
            piece.name=obj.name+' trimmed '+str(i)
            bpy.context.scene.collection.objects.link(piece)
            inverse=piece.matrix_world.inverted()
            for v in piece.data.vertices:
                p=piece.matrix_world @ v.co;p.y=max(-b,min(-a,p.y));v.co=inverse @ p
        bpy.data.objects.remove(obj,do_unlink=True)

def main():
    path=Path('build/level/open-stair-access.blend').resolve()
    if '--export' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(path))
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path('build/level/modules/assembly.blend').resolve()))
        from export_ship_modules import export_current
        export_current('base');export_current('starlight')
        return
    bpy.ops.wm.open_mainfile(filepath='build/level/modules/assembly.blend')
    bpy.context.preferences.filepaths.save_version=0
    scene.materials.update({m.name:m for m in bpy.data.materials})
    data=json.loads(Path('src/work/serenade.mesh-level.json').read_text())
    bpy.data.batch_remove([o for o in bpy.context.scene.objects if replaced(o.name)])
    trim_finishes()
    for key in ['colliders','volumes','landmarks','lights']:
        data[key]=[r for r in data[key] if not replaced(r['name'])]
    # The old forward corridor is a dead end after the direct foyer connections.
    # Remove its room/route along with its geometry, and restore the club wall.
    obsolete=S+'forward corridor'
    data['extras']['links']=[r for r in data['extras']['links'] if obsolete not in (r['from'],r['to'])]
    data['extras']['walkingRoutes']={k:v for k,v in data['extras']['walkingRoutes'].items() if obsolete not in k.split('|')}
    wall(N+'Starlight side wall',(10,36),(10,40.9),3.2,'club_black',base=3.4)
    bpy.data.objects[N+'Starlight side wall']['ship_module']='starlight'
    for side,label in [(-1,'Port'),(1,'Starboard')]:
        for face,z,material,module in [('foyer',35.95,'ivory','base'),('club',36,'club_black','starlight')]:
            prefix=N+label+' '+face
            wall(prefix+' lower',(side*6,z),(side*10,z),3.4,material)
            wall(prefix+' upper',(side*6,z),(side*10,z),3.2,material,base=3.4,
                 opening={'at':2.6,'width':1.9,'height':2.7})
            for obj in bpy.context.scene.objects:
                if not obj.name.startswith(prefix):continue
                obj['ship_module']=module
                # The two wall finishes share a reveal; split their visible depth
                # while the colliders keep their small, deliberate overlap.
                inverse=obj.matrix_world.inverted()
                for vertex in obj.data.vertices:
                    p=obj.matrix_world @ vertex.co
                    p.y=max(p.y,-35.975) if face=='foyer' else min(p.y,-35.975)
                    vertex.co=inverse @ p
        text(N+label+' Starlight sign','STARLIGHT',(side*8.6,6.35,35.72),'navy',yaw=0,size=.18)
        foyer=label+' lift foyer deck 8'
        route=[[side*8.6,3.4,33],[side*8.6,3.4,35],[side*8.6,3.4,37],[side*8.6,3.4,40]]
        data['extras']['links']=[r for r in data['extras']['links'] if not(r['from']==foyer and r['to']=='Starlight')]
        data['extras']['links'].append({'from':foyer,'to':'Starlight'})
        data['extras']['walkingRoutes'][foyer+'|Starlight']=route
    for obj in bpy.context.scene.objects:
        if obj.name.startswith(N) and 'ship_module' not in obj:obj['ship_module']='base'
    for key in ['colliders','volumes','landmarks','lights']:
        data[key].extend(r.to_json() for r in getattr(level,key))
    # Every public deck 8 entrance is an open passage. Individual cabin locks stay.
    for link in data['extras']['links']:
        if link.get('door')=='Starlight gallery entrance':link.pop('door')
    world=json.loads(Path('src/work/world.json').read_text())
    doors=[d for d in world['worldProfileData']['doors'] if d['id']!='Starlight gallery entrance']
    Path('build/level/open-stair-access.mesh-level.json').write_text(json.dumps(data,indent=2)+'\n')
    Path('build/level/open-stair-access.doors.json').write_text(json.dumps(doors,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print('OPEN_STAIR_ACCESS_READY',len(data['colliders']),'colliders',flush=True)

if __name__=='__main__':main()
