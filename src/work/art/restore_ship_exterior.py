"""Restore the original hull, clipping only the boarding entrance.

Blender, from project root. Writes a staged exterior-restored.blend for review.
Use -- --export after review to save the assembly and export only its base module.
Window views use outward-facing shell materials, never destructive sight cones.
"""
import json
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path('tools/level').resolve()))


def subtract_boxes(bm, matrix, boxes):
    """Clip intersecting polygons at box boundaries, retaining interpolated UVs."""
    layers = list(bm.loops.layers.uv.values())
    inverse = matrix.inverted()

    def split(poly, axis, value, sign):
        inside, outside = [], []
        for index, a in enumerate(poly):
            b = poly[(index+1) % len(poly)]
            da, db = sign*(a[0][axis]-value), sign*(b[0][axis]-value)
            (inside if da <= 1e-7 else outside).append(a)
            if (da < -1e-7 and db > 1e-7) or (da > 1e-7 and db < -1e-7):
                t = da/(da-db)
                point = (a[0].lerp(b[0], t), [u.lerp(v, t) for u, v in zip(a[1], b[1])])
                inside.append(point)
                outside.append(point)
        return inside, outside

    changed_count = 0
    for face in list(bm.faces):
        original = [(matrix @ loop.vert.co, [loop[layer].uv.copy() for layer in layers]) for loop in face.loops]
        pieces, changed = [original], False
        for lo, hi in boxes:
            next_pieces = []
            for poly in pieces:
                if any(max(p[0][axis] for p in poly) <= lo[axis] or min(p[0][axis] for p in poly) >= hi[axis] for axis in range(3)):
                    next_pieces.append(poly)
                    continue
                remainder, fragments = poly, []
                for axis in range(3):
                    for value, sign in ((lo[axis], -1), (hi[axis], 1)):
                        if len(remainder) < 3:
                            break
                        remainder, outside = split(remainder, axis, value, sign)
                        if len(outside) >= 3:
                            fragments.append(outside)
                if len(remainder) >= 3:
                    changed = True
                    next_pieces.extend(fragments)
                else:
                    next_pieces.append(poly)
            pieces = next_pieces
        if not changed:
            continue
        changed_count += 1
        material, smooth = face.material_index, face.smooth
        bm.faces.remove(face)
        for poly in pieces:
            clean = []
            for point in poly:
                if not clean or (clean[-1][0]-point[0]).length > 1e-6:
                    clean.append(point)
            if len(clean) > 2 and (clean[0][0]-clean[-1][0]).length < 1e-6:
                clean.pop()
            if len(clean) < 3:
                continue
            new = bm.faces.new([bm.verts.new(inverse @ p[0]) for p in clean])
            new.material_index, new.smooth = material, smooth
            for loop, point in zip(new.loops, clean):
                for layer, uv in zip(layers, point[1]):
                    loop[layer].uv = uv
    bm.normal_update()
    return changed_count


def main():
    assembly = Path('build/level/modules/assembly.blend').resolve()
    staged = Path('build/level/exterior-restored.blend').resolve()
    if '--export' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(staged))
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(assembly))
        from export_ship_modules import export_current
        export_current('base')
        return
    bpy.ops.wm.open_mainfile(filepath=str(assembly))
    bpy.context.preferences.filepaths.save_version = 0
    old_shell = [o for o in bpy.context.scene.objects if o.name.startswith('Ship exterior ')]
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath='build/ship/source/SiljaSerenade.glb')
    imported = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    transform = Matrix(((0,100,0,0),(-100,0,0,0),(0,0,100,-9),(0,0,0,1)))
    data = json.loads(Path('src/work/serenade.mesh-level.json').read_text())
    boxes = []
    for room in data['volumes']:
        # Passenger interiors use camera-based shell visibility. Only the actual
        # entrance needs a physical visual aperture from the outside. Cutting
        # above the promenade would also slice the original funnel and sun deck.
        if room['name'] not in ('Boarding gangway', 'Boarding vestibule', 'Boarding lobby'):
            continue
        if room.get('yaw', 0) != 0:
            raise ValueError('Rotated room needs oriented clipping: '+room['name'])
        x, y, z = room['position']
        w, h, d = room['size']
        # A small overlap hides original decks behind authored walls and floors.
        pad = .22
        boxes.append(((x-w/2-pad, -z-d/2-pad, y-h/2-pad),
                      (x+w/2+pad, -z+d/2+pad, y+h/2+pad)))
    counts = []
    for obj in imported:
        obj.matrix_world = transform @ obj.matrix_world
        obj.name = 'Restored '+obj.name
        obj['ship_module'] = 'base'
        for slot in obj.material_slots:
            if slot.material:
                material = slot.material.copy()
                material.name = 'Exterior sided '+slot.material.name
                material.use_backface_culling = True
                slot.material = material
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        original_faces = len(bm.faces)
        upper_faces = [face for face in bm.faces
                       if all((obj.matrix_world @ v.co).z > 10 for v in face.verts)]
        changed = subtract_boxes(bm, obj.matrix_world, boxes)
        if not all(face.is_valid for face in upper_faces):
            raise RuntimeError('Exterior clipping damaged an upper-deck or funnel face: '+obj.name)
        bm.to_mesh(obj.data)
        counts.append(dict(name=obj.name, originalFaces=original_faces, clippedFaces=changed, finalFaces=len(bm.faces)))
        bm.free()
    bpy.data.batch_remove(old_shell)
    for obj in imported:
        obj.name = 'Ship exterior '+obj.name.removeprefix('Restored ')
    Path('build/level/exterior-restoration.json').write_text(json.dumps(counts, indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(staged))
    print('RESTORED', len(imported), 'source meshes; interiors and colliders preserved', flush=True)


if __name__ == '__main__':
    main()
