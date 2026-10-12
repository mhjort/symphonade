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
d=json.loads(Path('build/deck9/level.json').read_text());vs=[];fs=[]
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
    for door in json.loads(Path('build/deck9/deck9.doors.json').read_text()):
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
    if not ('Deck 9' in name or 'deck 9' in name or 'lift foyer deck 7|' in name):continue
    if '--closed' in sys.argv and '|Cabin 9' in name:continue
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

# Closed cabin envelopes and open/closed thresholds on the new deck.
for door in json.loads(Path('build/deck9/doors.json').read_text()):
    p=door['position'];direction=1 if p['x']==12 else -1
    hit=cast((11,8.15,p['z']),1.5,(direction,0,0))
    check((hit is not None) if '--closed' in sys.argv else (hit is None),('door',door['id'],hit))
for room in d['volumes']:
    if not room['name'].startswith('Cabin 9'):continue
    x,y,z=room['position']
    for dx in [-1,0,1]:
        for dz in [-.8,0,.8]:
            check(cast((x+dx,7.2,z+dz),.3) is not None,('cabin floor',room['name'],dx,dz))
    for direction in [(0,1,0),(0,0,1),(0,0,-1),(-1,0,0),(1,0,0)]:
        if '--closed' in sys.argv or direction[0]==0:
            check(cast((x,8.5,z),5,direction) is not None,('envelope',room['name'],direction))
for x in [-6.35,-6,-5.65,5.65,6,6.35]:
    for z in [32.65,33,33.35]:
        check(cast((x,.15,z),9.5,(0,1,0)) is None,('lift shaft travel',x,z))
result={'mode':'closed' if '--closed' in sys.argv else 'open','checks':checks,'failures':fail}
Path('build/deck9/route-audit-'+result['mode']+'.json').write_text(json.dumps(result,indent=2))
print('DECK9 AUDIT',result['mode'],checks,'checks',len(fail),'failures')
for f in fail[:20]:print(f)
sys.exit(1 if fail else 0)
