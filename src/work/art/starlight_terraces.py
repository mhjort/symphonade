"""Photo-led Starlight rebuild. Blender 4.2+, run from project root.

Inputs: build/starlight/original.glb, base-original.glb and the current level JSON.
These are the registered meshes captured before this pass (2026-10-09).
The input GLBs are immutable; rerunning never accumulates transformations.
Outputs: ship-starlight.glb, ship-base.glb, terraces.blend and level.json.
"""
import json, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Matrix
sys.path.insert(0, str(Path('tools/blender-level').resolve()))
from bmlevel import scene, level, mat, box, decor, prism, stairs, context, text, lamp
from bmlevel.core import BoxCollider

OUT=Path('build/starlight'); PREFIX='Starlight terrace '
data=json.loads(Path('src/work/serenade.mesh-level.json').read_text())
for key in ['colliders','lights','volumes']:
    data[key]=[r for r in data[key] if not r['name'].startswith(PREFIX) and r['name']!='Starlight dance floor']
data['extras']['stairs']=[r for r in data['extras']['stairs'] if not r['name'].startswith(PREFIX)]

def bounds(o):
    ps=[o.matrix_world@v.co for v in o.data.vertices]
    return ([min(p.x for p in ps),min(p.z for p in ps),min(-p.y for p in ps)],
            [max(p.x for p in ps),max(p.z for p in ps),max(-p.y for p in ps)])

def loose_import(path):
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')

def clone_at(o, origin, target, yaw=0, name='copy'):
    n=o.copy();n.data=o.data.copy();bpy.context.scene.collection.objects.link(n)
    n.name=name
    a=Vector((origin[0],-origin[2],origin[1]));b=Vector((target[0],-target[2],target[1]))
    n.matrix_world=Matrix.Translation(b)@Matrix.Rotation(yaw,4,'Z')@Matrix.Translation(-a)@o.matrix_world
    return n

def tube(name,a,b,r,material):
    a=Vector((a[0],-a[2],a[1]));b=Vector((b[0],-b[2],b[1]));v=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=v.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
    o.data.materials.append(scene.materials[material])

def guard(name,a,b,y):
    # Panel carries physics; round rail and posts are visual trim.
    dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
    box(name+' glass',((a[0]+b[0])/2,y+.5,(a[1]+b[1])/2),(length,.96,.055),'glass_terrace',yaw=-math.atan2(dz,dx))
    tube(name+' handrail',(a[0],y+1.03,a[1]),(b[0],y+1.03,b[1]),.045,'terrace_rail')
    posts=[a,b]
    if ' guard ' in name:
        sector=int(name.rsplit(' ',1)[1])
        posts=([a] if sector%6==0 else [])+([b] if sector==23 else [])
    for i,p in enumerate(posts):tube(name+f' post {i}',(p[0],y+.03,p[1]),(p[0],y+1.03,p[1]),.025,'terrace_chrome')

def surface(name,x0,x1,z0,z1,y):
    box(name,((x0+x1)/2,(y-.04)/2,(z0+z1)/2),(x1-x0,y+.04,z1-z0),'terrace_carpet')

def front(t,x):return [45.2,47.5,49.8][t]+.6*(x/4.8)**2

loose_import(OUT/'original.glb')
scene.materials.update({m.name:m for m in bpy.data.materials})
mat('terrace_carpet',(.24,.205,.175),roughness=.95)
mat('terrace_rail',(.035,.025,.023),roughness=.22)
mat('terrace_chrome',(.64,.67,.7),metal=.88,roughness=.18)
mat('glass_terrace',(.58,.73,.74),metal=.05,roughness=.12,alpha=.2)
mat('emissive_stair_red',(1,.018,.025),glow=3)
mat('emissive_sign_white',(.93,.95,1),glow=1.6)
mat('terrace_fascia',(.025,.03,.043),roughness=.3)
mat('entrance_bronze',(.48,.32,.15),metal=.78,roughness=.24)
mat('entrance_carpet',(.085,.035,.045),roughness=.95)
mat('entrance_panel',(.035,.028,.034),roughness=.32)
mat('emissive_entrance_warm',(1,.72,.38),glow=1.4)
mat('closed_foyer_ivory',(.86,.83,.73),roughness=.5)

# Retire the two direct upper lift-lobby entrances. The central landing remains
# the route into Starlight. Slightly proud finishes avoid coplanar jamb edges.
for side in [-1,1]:
    box(PREFIX+f'closed lift lobby {side}',(side*8.6,4.775,35.995),(1.96,2.75,.32),'club_black')
    decor(PREFIX+f'closed lift lobby ivory {side}',(side*8.6,4.775,35.815),(1.98,2.77,.064),'closed_foyer_ivory')

# Salvage one complete cream chair and one tabletop from the existing module.
chair=[];table=[]
for o in list(bpy.context.scene.objects):
    lo,hi=bounds(o)
    if lo[0]>-6.8 and hi[0]<-5.8 and lo[2]>41.5 and hi[2]<42.5 and hi[1]<1.1:chair.append(o)
    if lo[0]>-8 and hi[0]<-7.2 and lo[2]>41.5 and hi[2]<42.5 and hi[1]<1.1:table.append(o)
assert len(chair)>=3 and table
templates=set(chair+table)

# The deck shell lives in ship-base. This module supplies furnishings and trim.
# Keep stage/ceiling, upper side seats, windows and the existing stocked bar.
for o in list(bpy.context.scene.objects):
    lo,hi=bounds(o);m=o.data.materials[0].name
    if o in templates:continue
    if hi[1]<3.15 and lo[0]>=-9.5 and hi[0]<=-5.3 and lo[2]>=36.2 and hi[2]<=40.05:
        o.location.z+=3.4; o.location.x+=2.1 # keep the side gallery aisle clear
        continue
    if (hi[1]<1.5 and lo[2]>=40.1 and hi[2]<54.3) or m in ('carpet_outline','carpet_taupe'):
        bpy.data.objects.remove(o,do_unlink=True);continue
    if lo[1]>=3.4 and hi[1]<4.6 and hi[2]<38.35 and lo[2]>38.05 and hi[0]-lo[0]>10:
        bpy.data.objects.remove(o,do_unlink=True);continue
    # Open gallery guard trim along the new upper seating connection.
    if lo[1]>=3.4 and hi[1]<4.6 and 7.1<abs((lo[0]+hi[0])/2)<7.7 and lo[2]>=38.05:
        if hi[2]<45.85:bpy.data.objects.remove(o,do_unlink=True)
        elif lo[2]<45.85:
            inv=o.matrix_world.inverted()
            for v in o.data.vertices:
                p=o.matrix_world@v.co
                edge={'club_black':45.82,'emissive_cyan':45.80,'crystal_silver':45.78}.get(m,45.85)
                p.y=min(p.y,-edge);v.co=inv@p

# Thin upper platforms leave the entrance stair open to the lower room.
for side in [-1,1]:
    a,b=sorted([side*1.6,side*7.25])
    box(PREFIX+f'rear platform {side}',((a+b)/2,3.275,(38.225+43.8)/2),(b-a,.25,43.8-38.225),'terrace_carpet')
surface(PREFIX+'upper landing',-7.25,7.25,43.8,44.25,3.4)
# Back guard protects the existing upper entrance from the central stair void.
guard(PREFIX+'rear stair opening',(-1.6,38.23),(1.6,38.23),3.4)

with context(PREFIX+'entry stair',origin=(0,0,38.4)):
    stairs(PREFIX+'entrance',(0,0,0),rise=3.4,run=5.4,width=3.0,steps=20,material='entrance_carpet',rail='terrace_chrome')
    for i in range(20):
        decor(PREFIX+f'entrance nosing {i}',(0,(i+1)*.17+.008,i*.27-.018),(2.96,.008,.04),'entrance_bronze')
        decor(PREFIX+f'entrance red {i}',(0,(i+1)*.17-.046,i*.27-.023),(2.86,.025,.026),'emissive_stair_red')
    # Rails along the upper platforms enclose the stairwell, including its headroom gap.
for side in [-1,1]:guard(PREFIX+f'stairwell {side}',(side*1.57,38.3),(side*1.57,43.1),3.4)

seat_meta=[]
for t,y in enumerate([3.4,3.4*2/3,3.4/3]):
    # 24 convex strips make a shallow U, opening toward the stage.
    for j in range(24):
        x0=-4.8+j*.4;x1=x0+.4
        b0=44.25 if t==0 else front(t-1,x0)
        b1=44.25 if t==0 else front(t-1,x1)
        prism(PREFIX+f'tier {t} sector {j}',[(x0,b0),(x1,b1),(x1,front(t,x1)),(x0,front(t,x0))],-.035,y,'terrace_carpet')
        guard(PREFIX+f'tier {t} guard {j}',(x0,front(t,x0)),(x1,front(t,x1)),y)
    # A row of chairs looks toward +Z, with small dark tables between pairs.
    for k,x in enumerate([-5,-3.8,-2.6,2.6,3.8,5] if t==0 else [-3.8,-2.55,-1.25,1.25,2.55,3.8]):
        z=41.7 if t==0 else front(t,x)-.85
        # Original port chair faces +X. Rotate to face the stage (+Z).
        for o in chair:clone_at(o,(-6.25,0,42),(x,y,z),-math.pi/2,PREFIX+f'chair {t} {k} '+o.name)
        name=PREFIX+f'chair {t} {k} body'
        level.colliders.append(BoxCollider(name,(x,y+.46,z),(.75,.86,.78),0,'environment'))
        seat_meta.append({'name':name,'forward':[0,0,1]})
    for k,x in enumerate([-4.4,4.4] if t==0 else [-3.18,0,3.18]):
        z=41.75 if t==0 else front(t,x)-.8
        for o in table:clone_at(o,(-7.6,0,42),(x,y,z),0,PREFIX+f'tabletop {t} {k}')
        tube(PREFIX+f'table stem {t} {k}',(x,y+.06,z),(x,y+.66,z),.06,'terrace_chrome')
        level.colliders.append(BoxCollider(PREFIX+f'tabletop {t} {k}',(x,y+.7,z),(.7,.08,.7),0,'environment'))
    # Full-width side landings are separated by short descending flights.
    for side in [-1,1]:
        x0,x1=sorted([side*4.8,side*7.19])
        start=43.8 if t==0 else [0,47.4,49.7][t]
        end=[45.8,48.1,50.4][t]
        surface(PREFIX+f'aisle landing {side} {t}',x0,x1,start,end,y)
        bottom=y-3.4/3
        with context(PREFIX+f'aisle {side} {t}',origin=(side*5.98,bottom,end+1.6),yaw=math.pi):
            stairs(PREFIX+f'descent {side} {t}',(0,0,0),rise=3.4/3,run=1.6,width=2.1,steps=7,material='terrace_carpet',rail='terrace_chrome')
            for i in range(7):decor(PREFIX+f'aisle red {side} {t} {i}',(0,(i+1)*(3.4/21)-.04,i*(1.6/7)-.02),(2.03,.035,.02),'emissive_stair_red')

# Reuse the organic carpet motifs on each flat tier, clear of stairs.
# A restrained woven pattern is geometry, using the original two carpet colours.
for t,y in enumerate([3.4,3.4*2/3,3.4/3]):
    for k in range(30):
        x=-4.5+(k%10);z=(44.35 if t==0 else front(t-1,x)+.15)+(k//10)*.32
        if z>front(t,x)-.12:continue
        pts=[]
        for i in range(12):
            a=i*math.tau/12;r=.14+.025*math.sin(3*a+k)
            pts.append((x+math.cos(a)*r*1.6,z+math.sin(a)*r))
        prism(PREFIX+f'carpet motif {t} {k}',pts,y+.006,y+.009,'carpet_taupe',solid=False)

# The lower bays reuse the actual Sea View organic carpet artwork, clipped to
# each bay. Facing into the room (+Z), right is -X and seating is on +X.
sys.path.insert(0,str(Path('tools/level').resolve()))
from zfight import Glb, primitives
import numpy as np
mat('starlight_lounge_carpet',(.27,.27,.25),roughness=.8)
mat('starlight_lounge_pattern',(.49,.48,.43),roughness=.8)
for side in [-1,1]:
    decor(PREFIX+f'lower lounge carpet {side}',(side*5.75,.003,40),(8.2,.006,7.5),'starlight_lounge_carpet')
carpet_source=Glb(str(OUT/'base-original.glb'),'ship-base')
def clip_carpet(poly,axis,edge,keep_greater):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ia=(a[axis]>=edge) if keep_greater else (a[axis]<=edge)
        ib=(b[axis]>=edge) if keep_greater else (b[axis]<=edge)
        if ia:out.append(a)
        if ia!=ib:
            t=(edge-a[axis])/(b[axis]-a[axis]);out.append(a+(b-a)*t)
    return out
for side in [-1,1]:
    verts=[];faces=[]
    for _,matrix,accessor,material,tris in primitives(carpet_source):
        if carpet_source.json['materials'][material]['name']!='tour_pattern':continue
        p=carpet_source.accessor(accessor)@matrix[:3,:3].T+matrix[:3,3]
        for tri in p[tris]:
            if not all(3.43<v[1]<3.445 for v in tri):continue
            poly=list(tri)
            for axis,edge,greater in [(0,-4.1,True),(0,4.1,False),(2,61,True),(2,68.5,False)]:
                if not poly:break
                poly=clip_carpet(poly,axis,edge,greater)
            if len(poly)<3:continue
            start=len(verts)
            verts.extend((float(v[0]+side*5.75),float(-(v[2]-24.75)),.013) for v in poly)
            faces.append(tuple(range(start,len(verts))))
    mesh=bpy.data.meshes.new(PREFIX+'Sea View carpet');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(PREFIX+f'lower lounge pattern {side}',mesh)
    bpy.context.scene.collection.objects.link(obj);obj.data.materials.append(scene.materials['starlight_lounge_pattern'])

for k,(x,z) in enumerate([(4.0,39.2),(7.3,39.2),(4.0,41.7),(7.3,41.7)]):
    dx,dz=5.65-x,40.45-z;length=math.hypot(dx,dz)
    for o in chair:clone_at(o,(-6.25,0,42),(x,0,z),-math.atan2(dz,dx),PREFIX+f'lower lounge chair {k} '+o.name)
    name=PREFIX+f'lower lounge chair {k} body'
    level.colliders.append(BoxCollider(name,(x,.46,z),(.8,.86,.8),0,'environment'))
    seat_meta.append({'name':name,'forward':[dx/length,0,dz/length]})
for o in table:clone_at(o,(-7.6,0,42),(5.65,0,40.45),0,PREFIX+'lower lounge tabletop')
tube(PREFIX+'lower lounge table stem',(5.65,.04,40.45),(5.65,.66,40.45),.06,'terrace_chrome')
level.colliders.append(BoxCollider(PREFIX+'lower lounge tabletop',(5.65,.7,40.45),(.7,.08,.7),0,'environment'))
text(PREFIX+'casino sign','CASINO  /  ROULETTE',(-5.7,2.55,43.70),'emissive_entrance_warm',yaw=0,size=.22)
text(PREFIX+'seating sign','STARLIGHT LOUNGE',(5.7,2.55,43.70),'emissive_entrance_warm',yaw=0,size=.20)
for side in [-1,1]:
    decor(PREFIX+f'lower bay ceiling light {side}',(side*5.5,3.11,40),(2.3,.035,.06),'emissive_entrance_warm')
    lamp(PREFIX+f'lower bay warm {side}',(side*5.5,2.7,40),'#ffe6c2',intensity=10,distance=7)
for o in templates:bpy.data.objects.remove(o,do_unlink=True)
# Lowest floor is a broad oval facing the existing stage; all dancers remain here.
pts=[(4.6*math.cos(a),52.15+1.98*math.sin(a)) for a in [i*math.tau/64 for i in range(64)]]
prism(PREFIX+'dance floor',pts,.006,.025,'oak',solid=False)
for side in [-1,1]:
    lamp(PREFIX+f'warm seating {side}',(side*3.4,5.8,44.7),'#ffe0b5',intensity=15,distance=10)

# Layered showbar portal: finishes stay outside the 3.17 m clear opening.
# Keep its top below the deck-8 approach floor at 3.4 m.
decor(PREFIX+'entrance sign rim',(0,2.90,35.65),(5.9,.58,.20),'entrance_bronze')
decor(PREFIX+'entrance sign',(0,2.90,35.52),(5.78,.48,.08),'terrace_fascia')
text(PREFIX+'entrance lettering','STARLIGHT',(0,2.86,35.46),'emissive_sign_white',yaw=0,size=.32)
text(PREFIX+'entrance subtitle','SHOWBAR  |  SEA VIEW LOUNGE',(0,2.71,35.46),'emissive_entrance_warm',yaw=0,size=.105)
for side in [-1,1]:
    # Cover the old ochre jamb with a polished bronze/chrome casing.
    decor(PREFIX+f'portal casing {side}',(side*1.705,1.35,35.64),(.23,2.7,.20),'entrance_bronze')
    decor(PREFIX+f'portal chrome {side}',(side*1.625,1.35,35.525),(.035,2.63,.025),'terrace_chrome')
    decor(PREFIX+f'portal light {side}',(side*1.77,1.4,35.524),(.018,2.45,.025),'emissive_entrance_warm')
    # Flush decorative panels flank the opening, anchored to the existing bulkhead.
    decor(PREFIX+f'outer panel {side}',(side*2.45,1.36,35.78),(1.21,2.65,.075),'entrance_panel')
    for j in range(9):
        decor(PREFIX+f'panel flute {side} {j}',(side*(1.91+j*.13),1.36,35.727),(.018,2.54,.022),'entrance_bronze')
    # Small constellation marks make the dark sign identifiable from the promenade.
    for j in range(7):
        x=side*(1.8+j*.13); y=2.93+.12*math.sin(j*1.7)
        decor(PREFIX+f'sign star {side} {j}',(x,y,35.461),(.025,.025,.012),'emissive_sign_white')
    # Dark stairwell lining with narrow bronze seams instead of bare slab sides.
    for j in range(6):
        z=38.7+j*.8
        decor(PREFIX+f'stair wall panel {side} {j}',(side*1.594,1.65,z),(.016,3.25,.77),'entrance_panel')
        decor(PREFIX+f'stair wall seam {side} {j}',(side*1.58,1.65,z-.39),(.022,3.23,.018),'entrance_bronze')
    tube(PREFIX+f'stair warm rail {side}',(side*1.51,1.06,38.4),(side*1.51,4.46,43.8),.018,'emissive_entrance_warm')
# Low vestibule ceiling has inset bronze coffers and warm linear lighting.
for j in range(3):
    z=36.35+j*.7
    decor(PREFIX+f'ceiling coffer {j}',(0,3.115,z),(3.1,.055,.53),'entrance_panel')
    decor(PREFIX+f'ceiling line {j}',(0,3.08,z-.24),(2.98,.025,.025),'emissive_entrance_warm')
decor(PREFIX+'threshold runner',(0,.016,37.15),(2.94,.02,2.42),'entrance_carpet')
for side in [-1,1]:
    decor(PREFIX+f'runner border {side}',(side*1.42,.03,37.15),(.025,.01,2.4),'entrance_bronze')
lamp(PREFIX+'entrance warm light',(0,2.65,36.7),'#ffd4a0',intensity=7,distance=5)

# Collision and route metadata are exported alongside the visual module.
remove=lambda n:n=='Aft gallery guard' or n.startswith(('Starlight lower chair','Starlight table '))
data['colliders']=[c for c in data['colliders'] if not remove(c['name'])]
for c in data['colliders']:
    if c['name'].startswith('Gallery guard '):c['position'][2]=(45.85+59.9)/2;c['size'][2]=59.9-45.85
    if c['name']=='Starlight bar counter':c['position']=[-5.3,3.96,39.6]
for key in ['colliders','lights']:data[key].extend(r.to_json() for r in getattr(level,key))
data['extras']['stairs'].extend(s.to_json() for s in level.stairs)
data['extras']['starlightSeats']=seat_meta
data['volumes'].append({'name':'Starlight dance floor','position':[0,1.35,52.2],'size':[9.2,2.7,4.0],'yaw':0,'tags':['indoors']})
routes=data['extras']['walkingRoutes']
for side,label in [(-1,'Port'),(1,'Starboard')]:
    foyer=label+' lift foyer deck 8'
    approach=[[side*8.6,3.4,33],[side*8.6,3.4,35.1],[0,3.4,35.1]]
    routes[foyer+'|Lift landing']=approach
    routes[foyer+'|Starlight']=approach+[[0,3.4,37],[side*8.1,3.4,37],[side*8.1,3.4,40]]
    data['extras']['links']=[r for r in data['extras']['links'] if not(r['from']==foyer and r['to'] in ['Starlight','Lift landing'])]
    data['extras']['links'].append({'from':foyer,'to':'Lift landing'})
entry=[[0,0,35],[0,0,38.4],[0,1.7,41.1],[0,3.4,43.8],[0,3.4,44.3]]
routes['Promenade|Starlight']=[[0,0,6]]+entry
routes['Starlight lower casino']=[[0,0,37.2],[-2.5,0,37.2],[-5.7,0,37.2],[-5.7,0,38.8]]
routes['Starlight lower lounge']=[[0,0,37.2],[2.5,0,37.2],[5.65,0,37.2],[5.65,0,38.5]]
for side in [-1,1]:
    route=[[0,3.4,44.3],[side*5.98,3.4,44.3]]
    for t,y in enumerate([3.4,3.4*2/3,3.4/3]):
        z=[45.8,48.1,50.4][t];route.extend([[side*5.98,y,z],[side*5.98,y-3.4/3,z+1.6]])
    route.extend([[side*5.98,0,52.8],[side*2.8,0,52.8]])
    routes[f'Starlight terraces {side}']=route
    routes[f'Starlight upper connection {side}']=[[0,3.4,44.3],[side*5.98,3.4,44.3],[side*8.1,3.4,44.3],[side*8.1,3.4,37],[0,3.4,37]]
(OUT/'level.json').write_text(json.dumps(data,indent=2)+'\n')
# bmlevel's prism winding follows the supplied outline. Resolve all closed
# authored meshes outward so the Y-up/XZ outlines never export inverted tops.
for o in bpy.context.scene.objects:
    if o.type=='MESH' and o.name.startswith(PREFIX):
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(o.data);bm.free()
scene.save_blend(str(OUT/'terraces-module.blend'))
scene.export_glb(str(OUT/'ship-starlight.glb'))

# Alter only the three original glass guards in the base GLB. Preserve every
# other vertex, material, image, node and buffer: the exterior is untouched.
sys.path.insert(0,str(Path('tools/level').resolve()))
from zfight import Glb, primitives
import numpy as np
g=Glb(str(OUT/'base-original.glb'),'ship-base');edits=0
for _,matrix,accessor,material,tris in primitives(g):
    material_name=g.json['materials'][material]['name']
    if material_name not in ('glass_clear','navy'):continue
    local=g.accessor(accessor).astype(float);p=local@matrix[:3,:3].T+matrix[:3,3]
    if material_name=='navy':
        # Remove the old STARLIGHT lettering above the now-closed side passages.
        sign=(abs(abs(p[:,0])-8.6)<.9)&(p[:,1]>6.30)&(p[:,1]<6.55)&(p[:,2]>35.65)&(p[:,2]<35.78)
        if sign.any():
            p[sign,2]=36.0
            inv=np.linalg.inv(matrix);g.write_positions(accessor,p@inv[:3,:3].T+inv[:3,3])
        continue
    aft=(abs(abs(p[:,0])-7.25)<.003)&(p[:,1]>=3.39)&(p[:,1]<=4.46)&(p[:,2]>=38.18)&(p[:,2]<=38.32)
    # Collapse the retired rear pane inside its old deck slab.
    p[aft]=[0,3.2,37.5]
    side=(abs(abs(p[:,0])-7.25)<.07)&(p[:,1]>=3.39)&(p[:,1]<=4.46)&(p[:,2]>=38.18)&(p[:,2]<45.85)
    p[side,2]=45.85
    if aft.any() or side.any():
        inv=np.linalg.inv(matrix);g.write_positions(accessor,p@inv[:3,:3].T+inv[:3,3]);edits+=int(aft.sum()+side.sum())
assert edits>0
g.save(str(OUT/'ship-base.glb'))
# For render review, bring in the structural interior but omit the exterior/ocean.
bpy.ops.import_scene.gltf(filepath=str(OUT/'ship-base.glb'))
for o in list(bpy.context.selected_objects):
    if o.type!='MESH':continue
    materials=[m.name for m in o.data.materials]
    if any(m.startswith('Exterior sided ') or m.startswith('ocean') for m in materials):
        bpy.data.objects.remove(o,do_unlink=True)
scene.save_blend(str(OUT/'terraces.blend'))
print('TERRACES_READY',len(data['colliders']),'colliders; base guard vertices changed:',edits)
