"""Extend the registered ship with a cabin deck; immutable inputs in build/deck9.

blender -b --python src/work/art/deck9.py
Stages meshes and metadata for review; never overwrites world.json.
"""
import copy, json, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector
sys.path.insert(0, str(Path('tools/blender-level').resolve()))
from bmlevel import scene, level, mat, slab, wall, decor, stairs, context, text, volume, lamp
from bmlevel.core import HullCollider

OUT = Path('build/deck9')
Y = 7.05
DY = Y - 3.4
STATIONS = [-9, -5, -1, 3, 7, 14, 19, 23, 27]
data = json.loads((OUT/'source-level.json').read_text())
world = json.loads(Path('src/work/world.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str((OUT/'source-components.blend').resolve()))
bpy.context.preferences.filepaths.save_version = 0
scene.materials.update({m.name:m for m in bpy.data.materials})

def bounds(o):
    ps=[o.matrix_world@v.co for v in o.data.vertices]
    return ([min(p.x for p in ps),min(p.z for p in ps),min(-p.y for p in ps)],
            [max(p.x for p in ps),max(p.z for p in ps),max(-p.y for p in ps)])

def subtract(lo, hi, a, b):
    a=[max(lo[i],a[i]) for i in range(3)]; b=[min(hi[i],b[i]) for i in range(3)]
    if any(a[i]>=b[i]-1e-6 for i in range(3)):return [(lo,hi)]
    result=[];lo=lo[:];hi=hi[:]
    for i in range(3):
        if lo[i]<a[i]:
            end=hi[:];end[i]=a[i];result.append((lo[:],end));lo[i]=a[i]
        if hi[i]>b[i]:
            start=lo[:];start[i]=b[i];result.append((start,hi[:]));hi[i]=b[i]
    return result

# Cut the two existing stair ceilings, the landing guard across the next flight,
# lift back-wall openings, and the decorative upper promenade window row.
cuts=[]
for side in [-1,1]:
    cuts += [([min(side*4.65,side*7.16),6.58,31.55],[max(side*4.65,side*7.16),7.051,34.45]),
             ([side*6-.3,Y,34.3],[side*6+.3,Y+2.65,35.9]),
             ([min(side*9.9,side*16.3),6.58,30.0],[max(side*9.9,side*16.3),6.87,36.2]),
             ([min(side*10.1,side*13.3),3.41,31.44],[max(side*10.1,side*13.3),4.55,31.66]),
             ([side*7.2-.15,Y,32.15],[side*7.2+.15,Y+2.4,33.85])]
for z in STATIONS:cuts.append(([5.55,Y,z-1.51],[6.3,Y+3.2,z+1.51]))

def cut_mesh(o, a, b):
    if not o.data.vertices:return
    lo,hi=bounds(o)
    if any(hi[i]<a[i]+1e-5 or lo[i]>b[i]-1e-5 for i in range(3)):return
    bm=bmesh.new();bm.from_mesh(o.data)
    # Imported components have applied transforms and use Blender Z-up.
    for axis,values in [(0,(a[0],b[0])),(2,(a[1],b[1])),(1,(-b[2],-a[2]))]:
        normal=Vector((0,0,0));normal[axis]=1
        for value in values:
            point=Vector((0,0,0));point[axis]=value
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=point,plane_no=normal)
    remove=[]
    for f in bm.faces:
        p=f.calc_center_median();q=[p.x,p.z,-p.y]
        if all(a[i]-1e-5<=q[i]<=b[i]+1e-5 for i in range(3)):remove.append(f)
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bm.to_mesh(o.data);bm.free()

for o in list(bpy.context.scene.objects):
    if o.type!='MESH' or o.data.materials[0].name.startswith('Exterior sided '):continue
    lo,hi=bounds(o)
    for a,b in cuts:
        if all(hi[i]>a[i]+1e-5 and lo[i]<b[i]-1e-5 for i in range(3)):cut_mesh(o,a,b)
    if not o.data.polygons:bpy.data.objects.remove(o,do_unlink=True)

# Keep the established outward-only facade decoration. From inside a cabin
# only the real glass remains visible; from the promenade the bays retain their look.
for o in list(bpy.context.scene.objects):
    if o.type!='MESH':continue
    lo,hi=bounds(o);material=o.data.materials[0].name
    if lo[0]<4.8 or hi[0]>5.9 or lo[1]<6.7 or hi[1]>10 or lo[2]<-12 or hi[2]>30:continue
    if material not in ['window_teal','window_reflection','curtain','bay_cream','bronze_frame']:continue
    if material!='bay_cream':
        replacement='cabin_outward_'+material
        if replacement not in scene.materials:
            m=o.data.materials[0].copy();m.name=replacement;m.use_backface_culling=True;scene.materials[replacement]=m
        o.data.materials[0]=scene.materials[replacement]
    # Retain only faces visible from the atrium (-X); avoid opaque backs.
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.normal.x>-.5],context='FACES')
    bm.to_mesh(o.data);bm.free()

for o in bpy.context.scene.objects:
    if o.type=='MESH' and o.data.materials[0].name=='emissive_stair_lamp':
        lo,hi=bounds(o)
        if 6.45<lo[1]<6.58 and lo[2]>30 and hi[2]<36.2 and abs(lo[0])>10:o.location.z+=DY

updated=[]
for c in data['colliders']:
    if c['shape']!='box':updated.append(c);continue
    size=c['size'][:];yaw=c.get('yaw',0)
    if abs(math.sin(yaw*2))>.001:updated.append(c);continue
    if abs(math.sin(yaw))>.5:size[0],size[2]=size[2],size[0]
    lo=[c['position'][i]-size[i]/2 for i in range(3)];hi=[c['position'][i]+size[i]/2 for i in range(3)]
    pieces=[(lo,hi)]
    for a,b in cuts:pieces=[p for l,h in pieces for p in subtract(l,h,a,b)]
    if pieces==[(lo,hi)]:updated.append(c);continue
    for j,(a,b) in enumerate(pieces):
        updated.append(dict(c,name=c['name']+f' deck9 cut {j}',yaw=0,position=[(a[i]+b[i])/2 for i in range(3)],size=[b[i]-a[i] for i in range(3)]))
data['colliders']=updated

# The original first pair supplies collider templates; visual templates are the
# same registered GLBs used by deck 8. New instances keep shared GPU buffers.
placements=[];doors=[]
for i,z in enumerate(STATIONS):
    for side,prefix in enumerate(['Promenade cabin','Sea view cabin']):
        number=str(9401+i*2+side);name='Cabin '+number
        placements.append(dict(id=number,template='sea' if side else 'promenade',z=z,y=Y))
        for c in list(data['colliders']):
            if not c['name'].startswith(prefix+' '):continue
            n=copy.deepcopy(c);n['name']=n['name'].replace(prefix,name)
            n['position'][1]+=DY;n['position'][2]+=z+9
            data['colliders'].append(n)
        volume(name,(14 if side else 8,Y+1.6,z),(4,3.2,3),tags=['indoors','destination'])
        d=copy.deepcopy(next(d for d in world['worldProfileData']['doors'] if d['id']==str(8401+side)))
        d.update(id=number,keyId='room-'+number);d['position']['y']+=DY;d['position']['z']=z;doors.append(d)
        data['extras']['doors'].append(number)
        data['extras']['links'].append(dict(from_='Deck 9 cabins',to=name,door=number))
        data['extras']['links'][-1]['from']=data['extras']['links'][-1].pop('from_')
        data['extras']['walkingRoutes']['Deck 9 cabins|'+name]=[[11,Y,9.05],[11,Y,z],[14 if side else 8,Y,z]]

mat('deck9_carpet',(.075,.16,.24),roughness=1)
mat('deck9_ivory',(.85,.83,.76),roughness=.8)
mat('deck9_oak',(.39,.22,.09),roughness=.5)
mat('emissive_deck9_light',(1,.9,.7),glow=1.5)
P='Deck 9 '
slab(P+'corridor floor',(11,9.025),(1.85,42.15),'deck9_carpet',y=Y,thickness=.2)
slab(P+'corridor ceiling',(11,9.025),(2.3,42.15),'deck9_ivory',y=Y+3.45,thickness=.25)
for x in [10,12]:
    edges=[-12.05]+[v for z in STATIONS for v in [z-.55,z+.55]]+[30.1]
    for j in range(0,len(edges),2):
        wall(P+f'corridor {x} {j}',(x,edges[j]),(x,edges[j+1]),3.2,'deck9_ivory',base=Y,thickness=.15)
    for z in STATIONS:
        wall(P+f'lintel {x} {z}',(x,z-.55),(x,z+.55),1,'deck9_ivory',base=Y+2.2,thickness=.15)
wall(P+'corridor end',(10,-12.05),(12,-12.05),3.2,'deck9_ivory',base=Y,thickness=.15)
volume('Deck 9 cabins',(11,Y+1.6,9.025),(1.85,3.2,42.15),tags=['indoors'])
for z in [-10,-2,6,14,22,29]:
    decor(P+f'light fixture {z}',(11,Y+3.16,z),(.65,.05,.4),'emissive_deck9_light')
    lamp(P+f'corridor light {z}',(11,Y+2.95,z),'#fff0d6',intensity=9,distance=7)
text(P+'corridor label','DECK 9  /  CABINS 9401-9418',(11,Y+2.6,-11.92),'deck9_carpet',yaw=math.pi,size=.13)

for side,label in [(-1,'Port'),(1,'Starboard')]:
    # Two return flights sit directly above the existing flights. The landing
    # guard removed above is now the entrance to the rising flight.
    for j,(x,y,z,yaw) in enumerate([(side*11.45,3.4,31.5,0),(side*14.55,3.4+DY/2,34.3,math.pi)]):
        with context(P+label+str(j),origin=(x,y,z),yaw=yaw):
            stairs(P+label+f' flight {j}',(0,0,0),rise=DY/2,run=2.8,width=2.15,steps=11,material='stair_carpet',rail='stair_oak')
            # Stacked stairs require a sloping soffit, not a solid wedge:
            # the wedge would intrude into the deck 7 flight's headroom.
            ramp=level.colliders[-3]  # ramp, left rail, right rail
            assert ramp.name.endswith(' ramp')
            points=[]
            for zz,yy in [(31.5 if j==0 else 34.3,y),(34.3 if j==0 else 31.5,y+DY/2)]:
                for xx in [x-1.075,x+1.075]:
                    for h in [yy-.18,yy]:points.extend([xx,h,zz])
            level.colliders[-3]=HullCollider(ramp.name,points)
            for obj in bpy.context.scene.objects:
                if obj.name.startswith(P+label+f' flight {j} tread'):
                    for v in obj.data.vertices:
                        worldp=obj.matrix_world@v.co
                        t=((-worldp.y-31.5)/2.8 if j==0 else (34.3+worldp.y)/2.8)
                        bottom=y+max(0,min(1,t))*DY/2-.18
                        if worldp.z<bottom:
                            worldp.z=bottom;v.co=obj.matrix_world.inverted()@worldp
            for k in range(11):decor(P+label+f' nosing {j} {k}',(0,(k+1)*DY/22+.009,k*2.8/11+.02),(2.1,.018,.04),'emissive_deck9_light')
    slab(P+label+' half landing',(side*13.1,35.12),(6.25,1.8),'stair_carpet',y=3.4+DY/2,thickness=.2)
    slab(P+label+' landing',(side*13.1,30.82),(6.25,1.55),'stair_carpet',y=Y,thickness=.2)
    slab(P+label+' stair ceiling',(side*13.1,33.1),(6.35,6.1),'stair_ivory',y=Y+3.45,thickness=.25)
    for z in [30.1,36.1]:
        wall(P+label+f' stair end {z}',(side*10,z),(side*16.12,z),DY+.4,'stair_ivory',base=6.6,
             opening={'at':1.05,'width':1.8,'height':3.1} if side==1 and z==30.1 else None)
    wall(P+label+' stair outer',(side*16.12,30.1),(side*16.12,36.1),DY+.4,'stair_ivory',base=6.6)
    wall(P+label+' stair foyer',(side*10,30.1),(side*10,36.1),DY+.4,'stair_ivory',base=6.6,
         opening={'at':1.08,'width':1.85,'height':3.1})
    slab(P+label+' foyer floor',(side*8.6,33.1),(2.85,5.9),'deck9_carpet',y=Y,thickness=.18)
    slab(P+label+' foyer ceiling',(side*8.6,33.1),(2.85,5.9),'deck9_ivory',y=Y+3.45,thickness=.25)
    wall(P+label+' foyer end',(side*7.2,30.15),(side*10,30.15),3.2,'deck9_ivory',base=Y)
    wall(P+label+' foyer rear',(side*7.2,36.05),(side*10,36.05),3.2,'deck9_ivory',base=Y)
    # Header above the new gate. The uncut shaft back already supplies jambs.
    wall(P+label+' lift lintel',(side*7.2,32.15),(side*7.2,33.85),.8,'deck9_ivory',base=Y+2.4,thickness=.12)
    volume(label+' lift foyer deck 9',(side*8.6,Y+1.6,33.1),(2.8,3.2,5.8),tags=['indoors'])
    # Expand the existing stair room so exterior visibility and the audits cover
    # both stacked flights without overlapping room envelopes.
    old=next(v for v in data['volumes'] if v['name']==('Rear lift stairs well' if side<0 else 'Starboard rear lift stairs well'))
    old['position'][1]=(Y+3.2)/2;old['size'][1]=Y+3.2
    wall(P+label+' landing guard',(side*10.1,31.55),(side*13.3,31.55),1.05,'stair_ivory',base=Y,thickness=.07)
    text(P+label+' number','DECK 9',(side*15.94,Y+1.9,30.9),'deck9_carpet',yaw=side*math.pi/2,size=.28)
    text(P+label+' stairs sign','STAIRS  /  DECK 9',(side*9.82,6.25,30.35),'deck9_carpet',yaw=side*math.pi/2,size=.14)
    lamp(P+label+' stair light',(side*13.1,Y+2.7,33.2),'#fff0d6',intensity=18,distance=10)
    oldroute=data['extras']['walkingRoutes'][label+' lift foyer deck 7|'+label+' lift foyer deck 8']
    route=[[x,3.4+y/3.4*DY,z] for x,y,z in oldroute]
    a=label+' lift foyer deck 8';b=label+' lift foyer deck 9'
    data['extras']['links'].append({'from':a,'to':b,'door':None});data['extras']['walkingRoutes'][a+'|'+b]=route

# Upper cross-landing over the existing bridge, not over the promenade void.
slab(P+'cross landing',(0,35.1),(14.5,1.8),'deck9_carpet',y=Y,thickness=.18)
slab(P+'cross ceiling',(0,35.1),(14.5,1.8),'deck9_ivory',y=Y+3.45,thickness=.25)
for z in [34.2,36]:wall(P+f'cross guard {z}',(-7.2,z),(7.2,z),1.05,'deck9_ivory',base=Y,thickness=.08)
volume(P+'cross landing',(0,Y+1.6,35.1),(14.4,3.2,1.7),tags=['indoors','unsealed'])
for side,label in [(-1,'Port'),(1,'Starboard')]:
    route=[[side*8.6,Y,33],[side*8.6,Y,35.1]]
    if side<0:route += [[0,Y,35.1],[8.6,Y,35.1]]
    route += [[8.6,Y,30.9],[11,Y,30.9],[11,Y,29],[11,Y,14]]
    a=label+' lift foyer deck 9';b='Deck 9 cabins'
    data['extras']['links'].append({'from':a,'to':b,'door':None});data['extras']['walkingRoutes'][a+'|'+b]=route

for key in ['colliders','volumes','lights','landmarks']:data[key].extend(v.to_json() for v in getattr(level,key))
data['extras']['stairs'].extend(s.to_json() for s in level.stairs)
(OUT/'level.json').write_text(json.dumps(data,indent=2)+'\n')
(OUT/'doors.json').write_text(json.dumps(doors,indent=2)+'\n')
(OUT/'cabins.json').write_text(json.dumps(placements,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str((OUT/'deck9.blend').resolve()))
# Export separately after review with deck9_export.py.
print('DECK9',len(data['colliders']),'colliders; 18 cabins; stairs and lift foyers')
