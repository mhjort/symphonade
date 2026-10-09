"""Collider ray audit for Starlight's non-planar floor, in both door modes.
The stock planar-room audit cannot describe floors at four elevations. Use
the actual stair routes and tier surface heights, plus the room envelope.
Run in Blender: --python this.py -- [--closed].
"""
import json,math,sys
from pathlib import Path
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path('tools/blender-level').resolve()))
from bmlevel.core import box_corners,to_blender
d=json.loads(Path('build/starlight/level.json').read_text());vs=[];fs=[]
def hull(points):
    bm=bmesh.new()
    for p in points:bm.verts.new(to_blender(p))
    bmesh.ops.convex_hull(bm,input=list(bm.verts));offset=len(vs)
    idx={v:i for i,v in enumerate(bm.verts)}
    vs.extend(v.co.copy() for v in bm.verts)
    fs.extend(tuple(offset+idx[v] for v in f.verts) for f in bm.faces);bm.free()
for c in d['colliders']:
    hull(box_corners(c['position'],c['size'],c.get('yaw',0)) if c['shape']=='box' else [c['vertices'][i:i+3] for i in range(0,len(c['vertices']),3)])
if '--closed' in sys.argv:
    for door in json.loads(Path('src/work/world.json').read_text())['worldProfileData']['doors']:
        p=door['position'];hull(box_corners([p['x'],p['y'],p['z']],[door['width'],door['height'],door['thickness']],door.get('rotationY',0)))
bvh=BVHTree.FromPolygons(vs,fs);fail=[];checks=0
def cast(p,distance,direction=(0,-1,0)):
    hit=bvh.ray_cast(Vector(to_blender(p)),Vector(to_blender(direction)),distance)
    return hit[3] if hit[0] is not None else None
def check(ok,info):
    global checks
    checks+=1
    if not ok:fail.append(info)
routes=d['extras']['walkingRoutes']
for name,route in routes.items():
    if not (name=='Promenade|Starlight' or name.startswith('Starlight terraces') or name.startswith('Starlight upper connection') or name.startswith('Starlight lower ') or name.endswith('lift foyer deck 8|Starlight')):continue
    for a,b in zip(route,route[1:]):
        n=max(1,math.ceil(math.dist(a,b)/.15))
        for i in range(n+1):
            p=[a[j]+(b[j]-a[j])*i/n for j in range(3)]
            h=cast((p[0],p[1]+.3,p[2]),.6)
            check(h is not None and abs(h-.3)<.22,('floor',name,p,h))
            for y in [.5,1.1,1.75]:
                for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
                    h=cast((p[0],p[1]+y,p[2]),.3,(dx,0,dz))
                    check(h is None,('clearance',name,p,y,dx,dz,h))
# Check the complete stepped seating footprint, including the interfaces
# between convex sectors. Probe close to the slab to avoid the furniture.
for t,y in enumerate([3.4,3.4*2/3,3.4/3]):
    for k in range(65):
        x=-4.79+k*9.58/64;front=[45.2,47.5,49.8][t]+.6*(x/4.8)**2
        back=44.25 if t==0 else front-2.3
        for i in range(8):
            z=back+.03+(front-back-.06)*i/7;h=cast((x,y+.02,z),.1)
            check(h is not None,('tier seam',t,x,z))
# Roof and side walls around the revised venue; openings remain connected to
# the existing ship, so envelope rays can reach its adjacent room walls.
for x in [-9,-6,-3,0,3,6,9]:
    for z in [37,40,43,46,49,52,55,58]:
        check(cast((x,5,z),3,(0,1,0)) is not None,('roof',x,z))
        for dx in [-1,1]:check(cast((x,5,z),22,(dx,0,0)) is not None,('side wall',x,z,dx))
for side in [-1,1]:
    for x in [side*8.0,side*8.6,side*9.2]:
        for y in [3.65,4.5,5.5]:
            for z,dz in [(37,-1),(35,1)]:
                check(cast((x,y,z),1.5,(0,0,dz)) is not None,('closed lift lobby',x,y,z))
result={'mode':'closed' if '--closed' in sys.argv else 'open','checks':checks,'failures':fail}
Path('build/starlight/audit-'+result['mode']+'.json').write_text(json.dumps(result,indent=2))
print('STARLIGHT AUDIT',result['mode'],checks,'checks',len(fail),'failures')
for f in fail[:12]:print(f)
sys.exit(1 if fail else 0)
