"""Remove coplanar render faces at dining/bar floors and doorframes.

Stage the current assembly, review/audit, then --export updates changed modules.
UVs, winding and physics are preserved. Covers are clipped to entrance bounds.
"""
import sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.geometry import barycentric_transform
sys.path.insert(0, str(Path('tools/level').resolve()))
from refine_floor_seams import subtract
from ship_modules import owner

# Entry bounds in Blender coordinates (X, -game Z, height).
ENTRIES = [
    ('coffee', -6, 4, 1.0, 4.6), ('bon', 6, -6, 1.0, 2.0),
    ('grill', 6, -17.75, 1.0, 1.9), ('lobster', 6, -13.25, 1.0, 1.9),
    ('fast', 6, 6.25, 1.0, 1.9), ('pub', 0, -24, 2.8, 1.2),
    ('starlight', 0, 36, 2.0, 1.0),
]

def rectangle(obj, face):
    points = [obj.matrix_world @ obj.data.vertices[i].co for i in face.vertices]
    if len(points) != 4:
        return None
    values = [sorted({round(p[i], 5) for p in points}) for i in range(3)]
    fixed = [i for i in range(3) if len(values[i]) == 1]
    if len(fixed) != 1:
        return None
    axis = fixed[0]
    other = [i for i in range(3) if i != axis]
    if any(len(values[i]) != 2 for i in other):
        return None
    return axis, values[axis][0], tuple(values[other[0]] + values[other[1]])

def intersection(a, b):
    result = max(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), min(a[3], b[3])
    return result if result[1]-result[0]>1e-6 and result[3]-result[2]>1e-6 else None

def entry_pieces(axis, plane, rect):
    result = []
    other = [i for i in range(3) if i != axis]
    for _, x, z, dx, dz in ENTRIES:
        bounds = [(x-dx,x+dx), (-z-dz,-z+dz), (0,3.7)]
        if not bounds[axis][0]-1e-5 <= plane <= bounds[axis][1]+1e-5:
            continue
        clipped = intersection(rect, bounds[other[0]] + bounds[other[1]])
        if clipped:
            result.append(clipped)
    return result

def cleanup():
    records = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or obj.name.startswith('Ship exterior '):
            continue
        name = obj.name.lower()
        floor = 'floor' in name or 'main deck' in name
        glass = any('glass' in m.name or 'glazing' in m.name for m in obj.data.materials if m)
        priority = (0 if floor and obj.name != 'Foyer promenade main floor' else 1 if floor else 4 if glass else 2 if any(k in name for k in ['portal','jamb','header','post','mullion','stile','rail']) else 3)
        for face in obj.data.polygons:
            info = rectangle(obj, face)
            if info and entry_pieces(*info):
                records.append(((priority,obj.name,face.index),obj,face.index,info))
    covers = {}
    changes = {}
    for _,obj,index,(axis,plane,rect) in sorted(records,key=lambda row:row[0]):
        key = axis,plane
        pieces = [rect]
        for cover in covers.get(key, []):
            pieces = [p for piece in pieces for p in subtract(piece,cover)]
        if pieces != [rect]:
            changes.setdefault(obj.name,{})[index] = axis,plane,pieces
        covers.setdefault(key,[]).extend(entry_pieces(axis,plane,rect))
    changed = {}
    for name,edits in changes.items():
        obj = bpy.data.objects[name]
        old = obj.data
        inverse = obj.matrix_world.inverted()
        verts, faces, materials, smooth = [], [], [], []
        uv_data = {layer.name: [] for layer in old.uv_layers}
        for face in old.polygons:
            original = [old.vertices[i].co.copy() for i in face.vertices]
            if face.index in edits:
                axis, plane, pieces = edits[face.index]
                normal = (obj.matrix_world @ original[1] - obj.matrix_world @ original[0]).cross(obj.matrix_world @ original[2] - obj.matrix_world @ original[0])[axis]
                other = [i for i in range(3) if i != axis]
                polygons = []
                for a,b,c,d in pieces:
                    points = []
                    for u,v in [(a,c),(b,c),(b,d),(a,d)]:
                        p = Vector((0,0,0)); p[axis] = plane; p[other[0]] = u; p[other[1]] = v
                        points.append(p)
                    if normal * (-1 if axis == 1 else 1) < 0:
                        points.reverse()
                    polygons.append([inverse @ point for point in points])
            else:
                polygons = [original]
            for polygon in polygons:
                start = len(verts)
                verts.extend(polygon)
                faces.append(tuple(range(start, len(verts))))
                materials.append(face.material_index)
                smooth.append(face.use_smooth)
                for layer in old.uv_layers:
                    uvs = [layer.data[i].uv.copy() for i in face.loop_indices]
                    if face.index in edits:
                        basis = [Vector((uvs[i].x, uvs[i].y, 0)) for i in (0,1,3)]
                        uv_data[layer.name].extend(barycentric_transform(point, original[0], original[1], original[3], *basis).xy for point in polygon)
                    else:
                        uv_data[layer.name].extend(uvs)
        mesh = bpy.data.meshes.new(old.name + ' entrance seams removed')
        mesh.from_pydata(verts, [], faces)
        for mat in old.materials:
            mesh.materials.append(mat)
        for face, mat, shading in zip(mesh.polygons, materials, smooth):
            face.material_index, face.use_smooth = mat, shading
        for name, uvs in uv_data.items():
            layer = mesh.uv_layers.new(name=name)
            for loop, uv in zip(layer.data, uvs):
                loop.uv = uv
        mesh.update()
        obj.data = mesh
        changed[obj.name] = {'faces':len(edits),'module':owner(obj)}
    print('RESTAURANT_OVERLAPS_REMOVED', changed, flush=True)
    return changed

def main():
    stage = Path('build/level/restaurant-surfaces.blend').resolve()
    bpy.context.preferences.filepaths.save_version = 0
    if '--export' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(stage))
        bpy.ops.wm.save_as_mainfile(filepath=str(Path('build/level/modules/assembly.blend').resolve()))
        from export_ship_modules import export_current
        import json
        for module in json.loads(Path('build/level/restaurant-surface-modules.json').read_text()):
            export_current(module)
        return
    bpy.ops.wm.open_mainfile(filepath='build/level/modules/assembly.blend')
    import json
    changed = cleanup()
    Path('build/level/restaurant-surface-modules.json').write_text(json.dumps(sorted({r['module'] for r in changed.values()})))
    assert not cleanup(), 'Restaurant seam cleanup must be idempotent'
    bpy.ops.wm.save_as_mainfile(filepath=str(stage))

if __name__ == '__main__':
    main()
