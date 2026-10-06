"""Remove coplanar stair/foyer render faces and cap the existing rail tubes.

Run after open_stair_access.py. Stage/review, then -- --export updates base only.
Physics and other venue meshes are untouched.
"""
import json
import sys
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path('tools/level').resolve()))
from refine_floor_seams import subtract
from ship_modules import owner

PREFIXES=('Rear lift stairs ','Starboard rear lift stairs ')

def cleanup_faces():
    records=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH' or obj.name.startswith('Ship exterior '):continue
        is_base=owner(obj)=='base'
        name=obj.name.lower()
        floor=any(k in name for k in ['floor','landing','main deck','gallery','flight']) and not any(k in name for k in ['guard','rail','post','opening','sign'])
        if not is_base and not floor:continue
        for face in obj.data.polygons:
            pts=[obj.matrix_world @ obj.data.vertices[i].co for i in face.vertices]
            if len(pts)!=4:continue
            hs={round(p.z,5) for p in pts};xs=sorted({round(p.x,5) for p in pts});zs=sorted({round(p.y,5) for p in pts})
            if len(hs)!=1 or len(xs)!=2 or len(zs)!=2:continue
            h=next(iter(hs))
            if not any(abs(h-y)<1e-4 for y in [0,1.7,3.4,3.15,3.2]):continue
            if zs[1]<-36.3 or zs[0]>-30 or xs[1]<-16.3 or xs[0]>16.3:continue
            if xs[0]>-7 and xs[1]<7:continue
            normal=(pts[1]-pts[0]).cross(pts[2]-pts[0]).z
            priority=(0 if not is_base else 1 if obj.name.startswith('Foyer rear floor') else 2 if floor else 3,obj.name,face.index)
            records.append((priority,obj,face.index,h,(xs[0],xs[1],zs[0],zs[1]),floor,normal,is_base))
    covers={};changes={};count=0
    for _,obj,index,h,rect,floor,normal,is_base in sorted(records,key=lambda r:r[0]):
        pieces=[rect]
        for cover in covers.get(h,[]):pieces=[p for piece in pieces for p in subtract(piece,cover)]
        if is_base and pieces!=[rect]:changes.setdefault(obj.name,{})[index]=(h,pieces,normal);count+=1
        if floor:covers.setdefault(h,[]).append(rect)
    for name,edits in changes.items():
        obj=bpy.data.objects[name];old=obj.data;verts=[];faces=[];materials=[]
        inverse=obj.matrix_world.inverted()
        for face in old.polygons:
            if face.index in edits:
                h,pieces,normal=edits[face.index];polygons=[]
                for a,b,c,d in pieces:
                    points=[Vector((a,c,h)),Vector((b,c,h)),Vector((b,d,h)),Vector((a,d,h))]
                    if normal<0:points.reverse()
                    polygons.append([inverse@v for v in points])
            else:polygons=[[old.vertices[i].co.copy() for i in face.vertices]]
            for polygon in polygons:
                start=len(verts);verts.extend(polygon);faces.append(tuple(range(start,len(verts))));materials.append(face.material_index)
        mesh=bpy.data.meshes.new(old.name+' no overlap');mesh.from_pydata(verts,[],faces)
        for mat in old.materials:mesh.materials.append(mat)
        for face,mat in zip(mesh.polygons,materials):face.material_index=mat
        mesh.update();obj.data=mesh
    print('COPLANAR_FACES_REMOVED',count,json.dumps({name:len(edits) for name,edits in changes.items()}),flush=True)
    return count

def cap_rails():
    count=0
    for obj in bpy.context.scene.objects:
        if not obj.name.startswith(PREFIXES) or obj.type!='MESH':continue
        if not any(k in obj.name for k in ['handrail','post ']):continue
        if obj.get('closed_stair_rail'):continue
        points=np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices]);center=points.mean(axis=0)
        _,_,vectors=np.linalg.svd(points-center,full_matrices=False);axis=vectors[0]
        lengths=(points-center)@axis
        a=points[np.isclose(lengths,lengths.min(),atol=1e-5)].mean(axis=0)
        b=points[np.isclose(lengths,lengths.max(),atol=1e-5)].mean(axis=0)
        delta=(b-a)/np.linalg.norm(b-a)
        u=vectors[1];v=np.cross(delta,u)
        radius=float(np.linalg.norm((points-center)-np.outer(lengths,axis),axis=1).max())
        verts=[Vector(tuple(end+radius*(math.cos(i*math.tau/8)*u+math.sin(i*math.tau/8)*v))) for end in [a,b] for i in range(8)]
        faces=[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]+[tuple(reversed(range(8))),tuple(range(8,16))]
        old=obj.data;mesh=bpy.data.meshes.new(obj.name+' capped');inverse=obj.matrix_world.inverted()
        mesh.from_pydata([inverse@p for p in verts],[],faces)
        for mat in old.materials:mesh.materials.append(mat)
        for face in mesh.polygons:face.use_smooth=face.index<8
        mesh.update();obj.data=mesh;obj['closed_stair_rail']=True;count+=1
    print('CAPPED_RAILS',count,flush=True)

def main():
    staged=Path('build/level/stair-surfaces.blend').resolve()
    if '--export' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(staged));bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path('build/level/modules/assembly.blend').resolve()))
        from export_ship_modules import export_current
        export_current('base');return
    bpy.ops.wm.open_mainfile(filepath='build/level/modules/assembly.blend');bpy.context.preferences.filepaths.save_version=0
    cleanup_faces();assert cleanup_faces()==0,'Render cleanup must be idempotent'
    cap_rails()
    bpy.ops.wm.save_as_mainfile(filepath=str(staged))

if __name__=='__main__':main()
