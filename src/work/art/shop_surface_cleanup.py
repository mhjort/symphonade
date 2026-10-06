"""Trim shared render faces beneath the three clothing-shop floors.

Run after the existing assembly repairs. Review the staged blend before --export.
Only base render geometry changes; colliders and shop modules remain intact.
"""
import sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.geometry import barycentric_transform
sys.path.insert(0, str(Path('tools/level').resolve()))
from refine_floor_seams import subtract
from ship_modules import owner

SHOPS = ('fashion', 'desigual', 'marimekko')

def rectangle(obj, face):
    points = [obj.matrix_world @ obj.data.vertices[i].co for i in face.vertices]
    if len(points) != 4 or any(abs(p.z) > 1e-5 for p in points):
        return None
    xs = sorted({round(p.x, 5) for p in points})
    ys = sorted({round(p.y, 5) for p in points})
    if len(xs) != 2 or len(ys) != 2:
        return None
    return (xs[0], xs[1], ys[0], ys[1])

def cleanup():
    covers = []
    for shop in SHOPS:
        obj = bpy.data.objects['Venue ' + shop + ' floor 1']
        covers.extend(r for face in obj.data.polygons if (r := rectangle(obj, face)))
    changed = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH' or owner(obj) != 'base' or obj.name.startswith('Ship exterior '):
            continue
        edits = {}
        for face in obj.data.polygons:
            rect = rectangle(obj, face)
            if rect is None:
                continue
            pieces = [rect]
            for cover in covers:
                pieces = [part for piece in pieces for part in subtract(piece, cover)]
            if pieces != [rect]:
                edits[face.index] = pieces
        if not edits:
            continue
        old = obj.data
        inverse = obj.matrix_world.inverted()
        verts, faces, materials, smooth = [], [], [], []
        uv_data = {layer.name: [] for layer in old.uv_layers}
        for face in old.polygons:
            original = [old.vertices[i].co.copy() for i in face.vertices]
            if face.index in edits:
                normal = (obj.matrix_world @ original[1] - obj.matrix_world @ original[0]).cross(obj.matrix_world @ original[2] - obj.matrix_world @ original[0]).z
                polygons = []
                for a,b,c,d in edits[face.index]:
                    points = [Vector((a,c,0)), Vector((b,c,0)), Vector((b,d,0)), Vector((a,d,0))]
                    if normal < 0:
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
        mesh = bpy.data.meshes.new(old.name + ' shop seams removed')
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
        changed[obj.name] = len(edits)
    print('SHOP_OVERLAPS_REMOVED', changed, flush=True)
    return changed

def main():
    stage = Path('build/level/shop-surfaces.blend').resolve()
    bpy.context.preferences.filepaths.save_version = 0
    if '--export' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(stage))
        bpy.ops.wm.save_as_mainfile(filepath=str(Path('build/level/modules/assembly.blend').resolve()))
        from export_ship_modules import export_current
        export_current('base')
        return
    bpy.ops.wm.open_mainfile(filepath='build/level/modules/assembly.blend')
    cleanup()
    assert not cleanup(), 'Shop seam cleanup must be idempotent'
    bpy.ops.wm.save_as_mainfile(filepath=str(stage))

if __name__ == '__main__':
    main()
