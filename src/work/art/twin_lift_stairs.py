"""Add the starboard return stair and connect both upper foyers to cabins.

Run after lift_stairs.py. Stage twin-lift-stairs.blend and its collision sidecar;
review/audit, then -- --export updates the assembly and base GLB only.
"""
import copy
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix

sys.path.insert(0,str(Path('tools/blender-level').resolve()))
sys.path.insert(0,str(Path('tools/level').resolve()))
from bmlevel import scene, level, slab, wall, volume, text, decor

P='Rear lift stairs '
S='Starboard rear lift stairs '
OLD={'Foyer starboard lower outer','Deck 8 corridor floor','Deck 8 corridor roof',
     'Corridor outer forward','Foyer corridor aft','Foyer corridor forward',
     'Handrail 12 16.5','Foyer corridor handrail 16.5','Foyer corridor handrail 33.4',
     'Closed cabin 8420','Number 8420','Handle 8420','Foyer corridor header','Foyer cabin sign'}

def mirror_record(record):
    result=copy.deepcopy(record)
    result['name']=result['name'].replace(P,S,1)
    for key in ['position','foot','top']:
        if key in result:result[key][0]*=-1
    if 'yaw' in result:result['yaw']*=-1
    if 'vertices' in result:
        result['vertices']=[-v if i%3==0 else v for i,v in enumerate(result['vertices'])]
    return result

def main():
    staged=Path('build/level/twin-lift-stairs.blend').resolve()
    if '--export' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(staged))
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path('build/level/modules/assembly.blend').resolve()))
        from export_ship_modules import export_current
        export_current('base')
        return
    bpy.ops.wm.open_mainfile(filepath='build/level/modules/assembly.blend')
    bpy.context.preferences.filepaths.save_version=0
    scene.materials.update({m.name:m for m in bpy.data.materials})
    data=json.loads(Path('src/work/serenade.mesh-level.json').read_text())
    def replaced(name):return name.startswith(S) or name in OLD
    bpy.data.batch_remove([o for o in bpy.context.scene.objects if replaced(o.name)])
    for key in ['colliders','volumes','landmarks','lights']:
        data[key]=[r for r in data[key] if not replaced(r['name'])]
    reflect=Matrix.Diagonal((-1,1,1,1))
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH' or not obj.name.startswith(P):continue
        if obj.name==P+'aft wall' or 'sign ' in obj.name:continue
        duplicate=obj.copy();duplicate.data=obj.data.copy()
        duplicate.name=obj.name.replace(P,S,1)
        duplicate.data.transform(reflect @ obj.matrix_world)
        duplicate.matrix_world=Matrix.Identity(4)
        bm=bmesh.new();bm.from_mesh(duplicate.data)
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(duplicate.data);bm.free()
        bpy.context.scene.collection.objects.link(duplicate)
        duplicate['ship_module']='base'
    for key in ['colliders','volumes','landmarks','lights']:
        data[key].extend(mirror_record(r) for r in list(data[key]) if r['name'].startswith(P) and r['name']!=P+'aft wall')
    extras=data['extras']
    extras['stairs']=[s for s in extras['stairs'] if not s['name'].startswith(S)]
    extras['stairs'].extend(mirror_record(s) for s in list(extras['stairs']) if s['name'].startswith(P))

    # The lower stair is beneath the former corridor. Retain corridor sections
    # on either side, with a direct cabin entrance from the new upper landing.
    for lo,hi,label in [(-12.05,30.13,'cabins'),(36.08,40.05,'forward')]:
        # Cabin oak floors end at x=10.075 / 11.925; meet them without coplanar overlap.
        floor_width = 1.85 if label == 'cabins' else 2.4
        slab(S+label+' corridor floor',(11,(lo+hi)/2),(floor_width,hi-lo),'navy',y=3.4,thickness=.25)
        slab(S+label+' corridor roof',(11,(lo+hi)/2),(2.4,hi-lo),'cabin_white',y=6.85,thickness=.25)
    wall(S+'corridor outer aft',(12,15.5),(12,30.1),3.2,'cabin_white',base=3.4)
    wall(S+'corridor outer forward',(12,36.1),(12,40),3.2,'cabin_white',base=3.4)
    wall(S+'corridor inner aft',(10,15.5),(10,30.1),3.2,'cabin_white',base=3.4)
    wall(S+'corridor inner forward',(10,36.1),(10,40),3.2,'cabin_white',base=3.4,
         opening={'at':.9,'width':1.6,'height':2.3})
    wall(S+'aft lower wall',(9.95,30.1),(16.12,30.1),3.4,'stair_ivory')
    wall(S+'cabin entrance',(9.95,30.1),(16.12,30.1),3.25,'stair_ivory',base=3.4,
         opening={'at':1.1,'width':1.8,'height':2.65})
    for x in [10.22,11.78]:
        decor(S+'corridor handrail '+str(x),(x,4.35,23.2),(.07,.09,13.4),'oak')
    for y,deck in [(0,7),(3.4,8)]:
        text(S+f'deck sign {deck}',f'DECK {deck}',(15.94,y+1.9,31.45),'stair_mural_blue',yaw=math.pi/2,size=.28)
        text(S+f'foyer sign {deck}',f'STAIRS / DECK {8 if deck==7 else 7}',(9.82,y+2.88,31.95),'stair_mural_blue',yaw=math.pi/2,size=.14)
    text(S+'cabin direction','CABINS',(10.3,6.15,30.25),'navy',yaw=0,size=.18)
    # Port arrivals cross the existing upper gallery to the cabin-side foyer.
    text(S+'port cabin wayfinding','CABINS  >',(-8.4,6.12,35.76),'navy',yaw=math.pi,size=.19)
    text(S+'starboard cabin wayfinding','<  CABINS',(8.4,6.12,35.76),'navy',yaw=math.pi,size=.19)
    room=next(r for r in data['volumes'] if r['name']=='Deck 8 cabins')
    room['position']=[11,5,9.125];room['size']=[2,3.2,42.25]
    volume(S+'forward corridor',(11,5,38.05),(2,3.2,3.9),tags=['indoors'])
    for obj in bpy.context.scene.objects:
        if obj.name.startswith(S):obj['ship_module']='base'
    for key in ['colliders','volumes','landmarks','lights']:
        data[key].extend(r.to_json() for r in getattr(level,key))
    routes=extras['walkingRoutes']
    def connect(a,b,route):
        connection={'from':a,'to':b,'door':None}
        if not any(l['from']==a and l['to']==b for l in extras['links']):extras['links'].append(connection)
        routes[a+'|'+b]=route
    up=[[-x,y,z] for x,y,z in routes['Port lift foyer deck 7|Port lift foyer deck 8']]
    connect('Starboard lift foyer deck 7','Starboard lift foyer deck 8',up)
    cabins=[[8.6,3.4,33],[8.6,3.4,30.9],[11.05,3.4,30.9],[11.05,3.4,29],[11,3.4,14]]
    connect('Starboard lift foyer deck 8','Deck 8 cabins',cabins)
    connect('Port lift foyer deck 8','Deck 8 cabins',[[-8.6,3.4,33],[-8.6,3.4,35.1],[0,3.4,35.1],[8.6,3.4,35.1]]+cabins)
    connect('Deck 8 cabins','Starlight',[[11,3.4,14],[11.05,3.4,29],[11.05,3.4,30.9],[8.6,3.4,30.9],[8.6,3.4,35.1],[0,3.4,35.1],[0,3.4,37],[8.1,3.4,37]])
    connect(S+'forward corridor','Starlight',[[11,3.4,38.05],[11,3.4,37],[8.1,3.4,37]])
    for cabin,x in [('Promenade cabin',8),('Sea view cabin',14)]:
        connect('Deck 8 cabins',cabin,[[11,3.4,9.05],[11,3.4,14],[x,3.4,14]])
    # Keep collider overlap, but stop corridor mesh faces at the stair surfaces.
    for label,edge in [('cabins',30.045),('forward',36.12)]:
        for surface in ['floor','roof']:
            obj=bpy.data.objects[S+label+' corridor '+surface]
            limit=edge if surface=='floor' else (30 if label=='cabins' else 36.2)
            inverse=obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                p=obj.matrix_world @ vertex.co
                if label=='cabins':p.y=max(p.y,-limit)
                else:p.y=min(p.y,-limit)
                vertex.co=inverse @ p
    Path('build/level/twin-lift-stairs.mesh-level.json').write_text(json.dumps(data,indent=2)+'\n')
    world=json.loads(Path('src/work/world.json').read_text())
    Path('build/level/twin-lift-stairs.doors.json').write_text(json.dumps(world['worldProfileData']['doors'],indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(staged))
    print('TWIN_STAIRS_READY',len(data['colliders']),'colliders',flush=True)

if __name__=='__main__':main()
