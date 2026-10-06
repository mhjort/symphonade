"""Photo-inspired return stair behind the port elevators, decks 7–8.

Build a staged scene/metadata from the current assembly. After review and audits,
-- --export installs the scene and exports only the base module. No hull cutting.
"""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path('tools/blender-level').resolve()))
sys.path.insert(0, str(Path('tools/level').resolve()))
from bmlevel import mat, slab, wall, box, decor, stairs, context, volume, landmark, lamp, level, scene, text
from photo_details import wire, mesh
from bmlevel.core import BoxCollider, HullCollider

N = 'Rear lift stairs '


def trim_floor_joins():
    """Trim only new visible floor faces; overlapping colliders stay continuous."""
    from refine_floor_seams import subtract
    covers={}
    for name in ['Foyer rear floor -1 0','Foyer rear floor -1 3.4','Starlight main deck']:
        obj=bpy.data.objects.get(name)
        if not obj:continue
        for face in obj.data.polygons:
            p=[obj.matrix_world @ obj.data.vertices[i].co for i in face.vertices]
            heights={round(v.z,5) for v in p}
            if len(heights)!=1:continue
            h=next(iter(heights))
            if h not in (0,3.4):continue
            covers.setdefault(h,[]).append((min(v.x for v in p),max(v.x for v in p),min(v.y for v in p),max(v.y for v in p)))
    for name in [N+'lower floor',N+'upper landing']:
        obj=bpy.data.objects[name];old=obj.data;vertices=[];faces=[]
        inverse=obj.matrix_world.inverted()
        for face in old.polygons:
            p=[obj.matrix_world @ old.vertices[i].co for i in face.vertices]
            heights={round(v.z,5) for v in p}
            polygons=[p]
            if len(heights)==1 and next(iter(heights)) in covers:
                h=next(iter(heights));pieces=[(min(v.x for v in p),max(v.x for v in p),min(v.y for v in p),max(v.y for v in p))]
                for cover in covers[h]:pieces=[piece for rect in pieces for piece in subtract(rect,cover)]
                polygons=[[Vector((a,c,h)),Vector((b,c,h)),Vector((b,d,h)),Vector((a,d,h))] for a,b,c,d in pieces]
            for polygon in polygons:
                first=len(vertices);vertices.extend(inverse@v for v in polygon);faces.append(tuple(range(first,len(vertices))))
        new=bpy.data.meshes.new(name+' joined');new.from_pydata(vertices,[],faces)
        for material in old.materials:new.materials.append(material)
        obj.data=new


def build():
    mat('stair_ivory', (.82,.80,.71), roughness=.8)
    mat('stair_carpet', (.27,.35,.42), roughness=1)
    mat('stair_pattern', (.42,.50,.55), roughness=1)
    mat('stair_chrome', (.68,.74,.77), metal=.8, roughness=.2)
    mat('stair_oak', (.38,.20,.065), roughness=.4)
    mat('stair_mural_blue', (.32,.52,.57))
    mat('stair_mural_coral', (.72,.32,.20))
    mat('stair_mural_gold', (.69,.57,.30))
    mat('glass_stair_porthole', (.67,.82,.9), alpha=.1, roughness=.12)
    mat('emissive_stair_nosing', (.72,.88,1), glow=1.2)
    mat('emissive_stair_lamp', (1,.89,.64), glow=1.2)

    slab(N+'lower floor',(-13.1,33.1),(6.25,6.0),'stair_carpet',y=0,thickness=.3)
    slab(N+'upper landing',(-13.1,30.82),(6.25,1.55),'stair_carpet',y=3.4,thickness=.2)
    slab(N+'half landing',(-13.1,35.12),(6.25,1.8),'stair_carpet',y=1.7,thickness=.2)
    slab(N+'ceiling',(-13.1,33.1),(6.35,6.1),'stair_ivory',y=6.85,thickness=.25)
    wall(N+'outer wall',(-16.12,30.1),(-16.12,36.1),6.65,'stair_ivory')
    wall(N+'aft wall',(-16.12,30.1),(-9.95,30.1),6.65,'stair_ivory')
    for y,deck in [(0,7),(3.4,8)]:
        wall(N+f'foyer opening {deck}',(-10,30.1),(-10,36.1),3.4,'stair_ivory',base=y,
             opening={'at':1.08,'width':1.85,'height':2.65})
        text(N+f'deck sign {deck}',f'DECK {deck}',(-15.94,y+1.9,30.75),'stair_mural_blue',yaw=-math.pi/2,size=.28)
        text(N+f'foyer sign {deck}',f'STAIRS / DECK {8 if deck==7 else 7}',(-9.82,y+2.88,30.35),'stair_mural_blue',yaw=-math.pi/2,size=.14)
    # Circular opening over the half landing, with a solid transparent pane.
    wall(N+'window sill',(-16.12,36),(-10,36),2.15,'stair_ivory')
    wall(N+'window band',(-16.12,36),(-10,36),2.5,'stair_ivory',base=2.15,
         opening={'at':3.02,'width':2.4,'height':2.4})
    wall(N+'window header',(-16.12,36),(-10,36),2.1,'stair_ivory',base=4.55)
    cx,cy,cz=-13.1,3.35,35.86
    points=[(cx+1.17*math.cos(i*math.tau/64),cy+1.17*math.sin(i*math.tau/64),cz) for i in range(64)]
    mesh(N+'round glass',points,[tuple(range(64))],'glass_stair_porthole')
    level.colliders.append(BoxCollider(N+'window collider',(cx,cy,36),(2.4,2.4,.055),0))
    # Fill the corners of the square wall opening to form a real round aperture.
    outer=[]
    for i in range(64):
        a=i*math.tau/64;c,s=math.cos(a),math.sin(a);r=1.23/max(abs(c),abs(s))
        outer.append((cx+r*c,cy+r*s,cz+.01))
    mesh(N+'round window surround',outer+points,[(i,i+64,(i+1)%64+64,(i+1)%64) for i in range(64)],'stair_ivory')
    wire(N+'porthole rim',points+[points[0]],'stair_chrome',.045)

    for index,(x,y,z,direction) in enumerate([(-11.45,0,31.5,1),(-14.55,1.7,34.3,-1)]):
        with context(N+f'flight {index}',origin=(x,y,z),yaw=0 if direction==1 else math.pi):
            stairs(N+f'flight {index}',(0,0,0),rise=1.7,run=2.8,width=2.15,steps=10,material='stair_carpet')
            for step in range(10):
                top=(step+1)*.17;front=step*.28
                decor(N+f'edge {index} {step}',(0,top+.012,front+.025),(2.12,.025,.045),'emissive_stair_nosing')
                for k in range(11):
                    decor(N+f'carpet stitch {index} {step} {k}',(-.95+k*.19,top+.008,front+.16),(.065,.009,.065),'stair_pattern',yaw=math.pi/4)
        # Continuous rail panels stop a capsule falling sideways; tubes are decor.
        for side in [-1,1]:
            xx=x+side*1.10
            a=(xx,y,z);b=(xx,y+1.7,z+direction*2.8)
            corners=[(px+dx,py+dy,pz) for px,py,pz in [a,b] for dx,dy in [(-.035,.12),(.035,.12),(-.035,1.05),(.035,1.05)]]
            level.colliders.append(HullCollider(N+f'rail barrier {index} {side}',[v for p in corners for v in p]))
            for height,material,radius in [(.32,'stair_chrome',.018),(.59,'stair_chrome',.018),(.86,'stair_chrome',.018),(1.05,'stair_oak',.038)]:
                wire(N+f'handrail {index} {side} {height}',[(xx,y+height,z-direction*.12),(xx,y+1.7+height,z+direction*2.92)],material,radius)
            for j in range(5):
                t=j/4;zz=z+direction*2.8*t;yy=y+1.7*t
                wire(N+f'post {index} {side} {j}',[(xx,yy+.05,zz),(xx,yy+1.04,zz)],'stair_chrome',.032)

    wall(N+'upper landing guard',(-13.3,31.55),(-10.1,31.55),1.05,'glass_stair_porthole',base=3.4,thickness=.045)
    wire(N+'landing handrail',[(-13.3,4.45,31.55),(-10.1,4.45,31.55)],'stair_oak',.04)
    for x in [-13.3,-12.3,-11.3,-10.1]:
        wire(N+'landing post '+str(x),[(x,3.42,31.55),(x,4.45,31.55)],'stair_chrome',.032)
    # Decorative maritime wall art, behind the rails and clear of the route.
    for i in range(9):
        y=.7+i*.56
        pts=[(-16.005,y+.18*math.sin(j*.5+i),30.45+j*.18) for j in range(29)]
        wire(N+'mural wave '+str(i),pts,['stair_mural_blue','stair_mural_coral','stair_mural_gold'][i%3],.06)
    for x,z in [(-11.4,31),(-13.1,35.15),(-14.5,32)]:
        lamp(N+f'light {x} {z}',(x,5.9,z),'#fff2d6',intensity=14,distance=9)
        decor(N+f'ceiling luminaire {x} {z}',(x,6.54,z),(.7,.055,.3),'emissive_stair_lamp')
    volume(N+'well',(-13.0,3.3,33.1),(6.2,6.6,5.8),tags=['indoors','stairs'])
    landmark(N+'deck 7',(-11.45,.1,31.1),tags=['stairs'])
    landmark(N+'deck 8',(-14.55,3.5,30.95),tags=['stairs'])


def main():
    staged=Path('build/level/lift-stairs.blend').resolve()
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
    def replaced(name):return name.startswith(N) or name=='Foyer port outer'
    bpy.data.batch_remove([o for o in bpy.context.scene.objects if replaced(o.name)])
    for key in ['colliders','volumes','landmarks','lights']:
        data[key]=[r for r in data[key] if not replaced(r['name'])]
    build()
    trim_floor_joins()
    for obj in bpy.context.scene.objects:
        if obj.name.startswith(N):obj['ship_module']='base'
    for key in ['colliders','volumes','landmarks','lights']:
        data[key].extend(r.to_json() for r in getattr(level,key))
    extras=data['extras']
    extras['stairs']=[s for s in extras.get('stairs',[]) if not s['name'].startswith(N)]+[s.to_json() for s in level.stairs]
    route=[[-8.6,0,33],[-8.6,0,31.1],[-11.45,0,31.1],[-11.45,0,31.5],[-11.45,1.7,34.3],[-11.45,1.7,35.1],[-14.55,1.7,35.1],[-14.55,1.7,34.3],[-14.55,3.4,31.5],[-14.55,3.4,30.9],[-11.45,3.4,30.9],[-8.6,3.4,30.9],[-8.6,3.4,33]]
    connection={'from':'Port lift foyer deck 7','to':'Port lift foyer deck 8','door':None}
    if connection not in extras['links']:extras['links'].append(connection)
    extras.setdefault('walkingRoutes',{})['Port lift foyer deck 7|Port lift foyer deck 8']=route
    Path('build/level/lift-stairs.mesh-level.json').write_text(json.dumps(data,indent=2)+'\n')
    world=json.loads(Path('src/work/world.json').read_text())
    Path('build/level/lift-stairs.doors.json').write_text(json.dumps(world['worldProfileData']['doors'],indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(staged))
    print('REAR_STAIRS_READY',len(data['colliders']),'colliders',flush=True)


if __name__=='__main__':main()
