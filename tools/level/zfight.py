#!/usr/bin/env python3
"""Find and fix z-fighting (coplanar overlapping faces) in the ship's exported GLBs.

Two faces that lie on the same plane, overlap and look different flicker in the
game: the depth buffer cannot decide which is in front. Blender renders cannot
show it, and the per-collider check in audit.py only sees box colliders, so this
works on the final visual meshes exactly as the game assembles them:

  - ship-base and every venue module share one world origin,
  - cabin-promenade / cabin-sea are instanced along Z from deck8-cabins.json,
  - door leaves are fitted into their world.json door records like DungeonDoor does.

    python3 tools/level/zfight.py audit [--glbs DIR] [--json OUT]
    python3 tools/level/zfight.py fix   [--glbs DIR] --out DIR

`audit` exits 1 when any fight is found. `fix` pushes the smaller piece of every
fighting pair (the trim, sign, jamb or rug — not the wall it sits on) out along
its normal so it clears the other face by OFFSET, rewriting only POSITION data;
every other byte of each GLB is kept. It repeats until a clean audit and writes
only the files that changed. Download the current GLBs first:

    python3 tools/level/zfight.py fetch --out build/zfight/orig

Register a fixed GLB with `bitmagic assets add <file> --keep-glb --asset-id <id>`
using the asset's existing id and targetHeight.

Pure Python + numpy; no Blender needed.
"""
import argparse
import json
import math
import os
import struct
import sys
import urllib.request
from collections import defaultdict

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WORK = os.path.join(ROOT, 'src', 'work')

PLANE_TOL = 0.002      # faces closer than this along their normal count as coplanar
NORMAL_TOL = 0.9995    # cos of ~1.8 degrees
MIN_OVERLAP = 2e-5     # m^2 (0.2 cm^2); smaller slivers are invisible
OFFSET = 0.003         # separation the winning face is moved to
LAYER = 0.005          # step between stacked coplanar pieces (>= OFFSET + PLANE_TOL)
WELD = 1e-5

COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# ------------------------------------------------------------------ GLB io

class Glb:
    def __init__(self, path, asset_id):
        self.path, self.asset_id = path, asset_id
        data = open(path, 'rb').read()
        json_len = struct.unpack_from('<I', data, 12)[0]
        self.json = json.loads(data[20:20 + json_len])
        off = 20 + json_len
        bin_len = struct.unpack_from('<I', data, off)[0]
        self.bin = bytearray(data[off + 8:off + 8 + bin_len])
        self.dirty = False

    def accessor(self, index):
        acc = self.json['accessors'][index]
        view = self.json['bufferViews'][acc['bufferView']]
        dtype = np.dtype(COMPONENT[acc['componentType']])
        width = WIDTH[acc['type']]
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        stride = view.get('byteStride', 0) or dtype.itemsize * width
        if stride != dtype.itemsize * width:
            raise SystemExit(f'{self.path}: strided accessor {index} is not supported')
        arr = np.frombuffer(self.bin, dtype=dtype, count=acc['count'] * width, offset=start)
        return arr.reshape(-1, width) if width > 1 else arr

    def write_positions(self, index, positions):
        acc = self.json['accessors'][index]
        view = self.json['bufferViews'][acc['bufferView']]
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        raw = positions.astype(np.float32).tobytes()
        self.bin[start:start + len(raw)] = raw
        acc['min'] = positions.min(axis=0).astype(float).tolist()
        acc['max'] = positions.max(axis=0).astype(float).tolist()
        self.dirty = True

    def save(self, path):
        js = json.dumps(self.json, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        total = 12 + 8 + len(js) + 8 + len(bn)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(bn), 0x004E4942)); f.write(bn)


def node_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=float).reshape(4, 4).T
    t = node.get('translation', [0, 0, 0]); r = node.get('rotation', [0, 0, 0, 1]); s = node.get('scale', [1, 1, 1])
    x, y, z, w = r
    rot = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4); m[:3, :3] = rot * np.array(s); m[:3, 3] = t
    return m


def primitives(glb):
    """Yield (prim_key, node_matrix, positions_accessor, triangles[N,3])."""
    js = glb.json
    scene = js['scenes'][js.get('scene', 0)]
    stack = [(n, np.eye(4)) for n in scene['nodes']]
    while stack:
        index, parent = stack.pop()
        node = js['nodes'][index]
        world = parent @ node_matrix(node)
        stack += [(c, world) for c in node.get('children', [])]
        if 'mesh' not in node:
            continue
        for p, prim in enumerate(js['meshes'][node['mesh']]['primitives']):
            if prim.get('mode', 4) != 4:
                continue
            pos_index = prim['attributes']['POSITION']
            count = js['accessors'][pos_index]['count']
            tris = glb.accessor(prim['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in prim \
                else np.arange(count).reshape(-1, 3)
            yield (node['mesh'], p), world, pos_index, prim.get('material'), tris


# ------------------------------------------------------------------ scene layout

def load_world():
    return json.load(open(os.path.join(WORK, 'world.json')))


def glb_assets(world):
    assets = world.get('assets') or world.get('worldProfileData', {}).get('assets', [])
    return {a['id']: a for a in assets if a.get('type') == 'glb'}


def door_records(world):
    found = []
    def walk(value):
        if isinstance(value, dict):
            if 'assetId' in value and 'rotationY' in value and 'thickness' in value and 'position' in value:
                found.append(value)
            for v in value.values():
                walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)
    walk(world)
    return found


def rot_y(angle):
    c, s = math.cos(angle), math.sin(angle)
    m = np.eye(4); m[0, 0] = c; m[0, 2] = s; m[2, 0] = -s; m[2, 2] = c
    return m


def translate(x, y, z):
    m = np.eye(4); m[:3, 3] = (x, y, z); return m


def layout(world):
    """{asset_id: [(instance_label, matrix)]} in game world space."""
    manifest = json.load(open(os.path.join(WORK, 'ship-modules.json')))
    placed = defaultdict(list)
    placed[manifest['base']['assetId']].append(('', np.eye(4)))
    for venue in manifest['venues']:
        placed[venue['assetId']].append(('', np.eye(4)))
    for cabin in json.load(open(os.path.join(WORK, 'deck8-cabins.json'))):
        placed['cabin-' + cabin['template']].append((cabin['id'], translate(0, 0, cabin['z'] - 14)))
    return manifest, placed


def door_matrix(glb, door):
    """DungeonDoor: centre the asset's bounds on the pivot, scale to width/height/thickness, yaw."""
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    for _, world, pos_index, _, _ in primitives(glb):
        pts = glb.accessor(pos_index).astype(float) @ world[:3, :3].T + world[:3, 3]
        lo = np.minimum(lo, pts.min(axis=0)); hi = np.maximum(hi, pts.max(axis=0))
    size, centre = hi - lo, (hi + lo) / 2
    fit = np.diag([door['width'] / size[0], door['height'] / size[1], door['thickness'] / size[2], 1])
    p = door['position']
    return translate(p['x'], p['y'], p['z']) @ rot_y(door['rotationY']) @ fit @ translate(*-centre)


# ------------------------------------------------------------------ geometry

class Surface:
    """One primitive of one GLB, with welded islands for choosing and moving pieces."""

    def __init__(self, sid, glb, key, local, pos_index, material, tris):
        self.sid, self.glb, self.key, self.local, self.pos_index, self.tris = sid, glb, key, local, pos_index, tris
        mats = glb.json.get('materials', [])
        mat = mats[material] if material is not None and material < len(mats) else {}
        self.material = mat.get('name', f'#{material}')
        pbr = mat.get('pbrMetallicRoughness', {})
        self.textured = 'baseColorTexture' in pbr
        self.double = bool(mat.get('doubleSided'))
        self.blend = mat.get('alphaMode') == 'BLEND'
        self.look = (self.material, tuple(pbr.get('baseColorFactor', [1, 1, 1, 1])), tuple(mat.get('emissiveFactor', [0, 0, 0])))
        pts = glb.accessor(pos_index).astype(float)
        self.points = pts @ local[:3, :3].T + local[:3, 3]           # GLB-root space
        # Weld by position so a flat-shaded box is one piece again.
        q = np.round(self.points / WELD).astype(np.int64)
        _, self.weld = np.unique(q, axis=0, return_inverse=True)
        self.weld = self.weld.reshape(-1)
        parent = np.arange(self.weld.max() + 1)
        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]; a = parent[a]
            return a
        w = self.weld[tris]
        for a, b, c in w:
            ra, rb, rc = find(a), find(b), find(c)
            parent[rb] = ra; parent[find(rc)] = ra
        roots = np.array([find(i) for i in range(len(parent))])
        self.island_of_weld = roots
        self.tri_island = roots[w[:, 0]]
        area = np.linalg.norm(np.cross(self.points[tris[:, 1]] - self.points[tris[:, 0]],
                                       self.points[tris[:, 2]] - self.points[tris[:, 0]]), axis=1) / 2
        lo = np.full((len(parent), 3), np.inf); hi = np.full((len(parent), 3), -np.inf)
        np.minimum.at(lo, roots[self.weld], self.points); np.maximum.at(hi, roots[self.weld], self.points)
        self.island_size = np.linalg.norm(np.nan_to_num(hi - lo, posinf=0, neginf=0), axis=1)
        self.island_area = np.bincount(self.tri_island, weights=area, minlength=len(parent))
        # A closed (watertight) piece hides the back of its faces: the back-to-back contact of
        # two closed pieces cannot flicker even when the material is double-sided.
        edges = np.sort(np.concatenate([w[:, [0, 1]], w[:, [1, 2]], w[:, [2, 0]]]), axis=1)
        _, inverse, counts = np.unique(edges, axis=0, return_inverse=True, return_counts=True)
        open_edge = counts[inverse.reshape(-1)] % 2 == 1
        self.island_open = np.zeros(len(parent), dtype=bool)
        self.island_open[np.tile(self.tri_island, 3)[open_edge]] = True


def clip(poly, a, b):
    """Keep the part of a 2D polygon left of a->b."""
    out = []
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        dp = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        dq = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])
        if dp >= 0:
            out.append(p)
        if (dp > 0 > dq) or (dp < 0 < dq):
            t = dp / (dp - dq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def ccw(tri):
    (ax, ay), (bx, by), (cx, cy) = tri
    return tri if (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) >= 0 else [tri[0], tri[2], tri[1]]


def overlap_area(t1, t2):
    poly = ccw(t1)
    t2 = ccw(t2)
    for i in range(3):
        poly = clip(poly, t2[i], t2[(i + 1) % 3])
        if len(poly) < 3:
            return 0.0
    s = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def bake_cabin_floor_trim(glb):
    """ShipAssembly.trimCabinFloorOverlap, baked: pull the corridor's navy floor out of the cabins.

    The runtime version matches exact corner coordinates, so it must run before anything here
    moves those vertices; once baked it finds nothing and does nothing.
    """
    js = glb.json
    for _, world, pos_index, material, _ in primitives(glb):
        if material is None or js['materials'][material].get('name') != 'navy':
            continue
        raw = glb.accessor(pos_index).astype(float)
        pts = raw @ world[:3, :3].T + world[:3, 3]
        changed = False
        for i, (x, y, z) in enumerate(pts):
            edge = 10.075 if abs(x - 9.8) < .001 else 11.925 if abs(x - 12.2) < .001 else None
            if edge is None or not any(abs(y - h) < .001 for h in (3.15, 3.4)) or \
                    not any(abs(z - c) < .001 for c in (-12.05, 30.045)):
                continue
            pts[i, 0] = edge
            changed = True
        if changed:
            inv = np.linalg.inv(world)
            glb.write_positions(pos_index, pts @ inv[:3, :3].T + inv[:3, 3])


class Scene:
    def __init__(self, glb_dir):
        self.world = load_world()
        manifest, placed = layout(self.world)
        self.glbs = {}
        for asset_id in list(placed) + [d['assetId'] for d in door_records(self.world)]:
            if asset_id not in self.glbs:
                path = os.path.join(glb_dir, asset_id + '.glb')
                if not os.path.exists(path):
                    raise SystemExit(f'missing {path} — run `zfight.py fetch` first')
                self.glbs[asset_id] = Glb(path, asset_id)
        for door in door_records(self.world):
            placed[door['assetId']].append(('door ' + str(door.get('id')), door_matrix(self.glbs[door['assetId']], door)))
        self.placed = placed
        if manifest['base']['assetId'] in self.glbs:
            bake_cabin_floor_trim(self.glbs[manifest['base']['assetId']])
        self.surfaces = []
        for asset_id, glb in self.glbs.items():
            for key, local, pos_index, material, tris in primitives(glb):
                self.surfaces.append(Surface(len(self.surfaces), glb, key, local, pos_index, material, tris))

    def triangles(self):
        """World-space triangles with owner columns: surface, triangle, instance, matrix id."""
        chunks, owners, self.instances = [], [], []
        for s in self.surfaces:
            for label, matrix in self.placed[s.glb.asset_id]:
                inst = len(self.instances)
                self.instances.append((s.glb.asset_id, label, matrix))
                pts = s.points @ matrix[:3, :3].T + matrix[:3, 3]
                chunks.append(pts[s.tris])
                owners.append(np.column_stack([np.full(len(s.tris), s.sid), np.arange(len(s.tris)), np.full(len(s.tris), inst)]))
        return np.concatenate(chunks), np.concatenate(owners)


def find_fights(scene):
    tri, owner = scene.triangles()
    e1, e2 = tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
    cross = np.cross(e1, e2)
    area2 = np.linalg.norm(cross, axis=1)
    keep = area2 > 4e-6
    tri, owner, cross, area2 = tri[keep], owner[keep], cross[keep], area2[keep]
    normal = cross / area2[:, None]
    # Canonical direction so opposite-facing coplanar faces share a bucket.
    flip = np.where(np.abs(normal[:, 0]) > 1e-6, normal[:, 0] < 0, np.where(np.abs(normal[:, 1]) > 1e-6, normal[:, 1] < 0, normal[:, 2] < 0))
    canon = np.where(flip[:, None], -normal, normal)
    dist = np.einsum('ij,ij->i', canon, tri[:, 0])
    nkey = np.round(canon * 50).astype(np.int64)
    order = np.lexsort((dist, nkey[:, 2], nkey[:, 1], nkey[:, 0]))
    surf = scene.surfaces
    fights = []
    i = 0
    n = len(order)
    while i < n:
        j = i + 1
        while j < n and (nkey[order[j]] == nkey[order[i]]).all() and dist[order[j]] - dist[order[j - 1]] < PLANE_TOL:
            j += 1
        group = order[i:j]
        i = j
        if len(group) < 2 or len({int(owner[g, 0]) for g in group}) < 2 and len({int(owner[g, 2]) for g in group}) < 2:
            continue
        c = canon[group[0]]
        u = np.cross(c, [0, 1, 0] if abs(c[1]) < .9 else [1, 0, 0]); u /= np.linalg.norm(u)
        v = np.cross(c, u)
        flat = np.stack([tri[group] @ u, tri[group] @ v], axis=2)          # (k,3,2)
        lo, hi = flat.min(axis=1), flat.max(axis=1)
        srt = np.argsort(lo[:, 0])
        lo, hi, flat, group = lo[srt], hi[srt], flat[srt], group[srt]
        sids = owner[group, 0]; insts = owner[group, 2]
        for a in range(len(group)):
            end = np.searchsorted(lo[:, 0], hi[a, 0] - 1e-6, side='left')
            if end <= a + 1:
                continue
            cand = np.arange(a + 1, end)
            cand = cand[(lo[cand, 1] < hi[a, 1] - 1e-6) & (hi[cand, 1] > lo[a, 1] + 1e-6) &
                        (np.abs(dist[group[cand]] - dist[group[a]]) < PLANE_TOL)]
            if not len(cand):
                continue
            sa = surf[sids[a]]
            for b in cand:
                sb = surf[sids[b]]
                if sa.look == sb.look and not (sa.textured and (insts[a] != insts[b] or sa.tri_island[owner[group[a], 1]] != sb.tri_island[owner[group[b], 1]])):
                    continue
                ga, gb = group[a], group[b]
                facing = float(normal[ga] @ normal[gb])
                if facing < 0 and not ((sa.double and sa.island_open[sa.tri_island[owner[ga, 1]]]) or
                                       (sb.double and sb.island_open[sb.tri_island[owner[gb, 1]]])):
                    continue
                if abs(facing) < NORMAL_TOL:
                    continue
                # Exact test: the other face must reach within PLANE_TOL of this face's plane.
                h = (tri[gb] - tri[ga][0]) @ normal[ga]
                if h.min() > PLANE_TOL or h.max() < -PLANE_TOL:
                    continue
                area = overlap_area([tuple(p) for p in flat[a]], [tuple(p) for p in flat[b]])
                if area < MIN_OVERLAP:
                    continue
                fights.append((ga, gb, area))
    return tri, owner, normal, fights


def describe(scene, owner, idx):
    s = scene.surfaces[owner[idx, 0]]
    asset, label, _ = scene.instances[owner[idx, 2]]
    return asset + (f' [{label}]' if label else ''), s.material


def audit(scene, json_out=None, quiet=False):
    tri, owner, normal, fights = find_fights(scene)
    groups = defaultdict(lambda: {'area': 0.0, 'count': 0, 'at': None})
    for a, b, area in fights:
        (fa, ma), (fb, mb) = describe(scene, owner, a), describe(scene, owner, b)
        key = tuple(sorted([(fa.split(' [')[0], ma), (fb.split(' [')[0], mb)]))
        g = groups[key]
        g['area'] += area; g['count'] += 1
        if g['at'] is None:
            g['at'] = tri[a].mean(axis=0).round(2).tolist()
            g['where'] = f'{fa} / {fb}'
    if not quiet:
        print(f'ZFIGHT {len(fights)} overlapping coplanar triangle pair(s) in {len(groups)} material pairing(s)')
        for key, g in sorted(groups.items(), key=lambda kv: -kv[1]['area']):
            (fa, ma), (fb, mb) = key
            print(f"  {g['area']*1e4:9.1f} cm²  {g['count']:5d}×  {fa}:{ma}  ×  {fb}:{mb}   e.g. at {g['at']}")
    if json_out:
        json.dump([{'a': list(k[0]), 'b': list(k[1]), **g} for k, g in groups.items()], open(json_out, 'w'), indent=1)
    return tri, owner, normal, fights


def fitted_assets(scene):
    """Assets the engine rescales to their bounds (door leaves): faces on the bounds cannot move."""
    return {d['assetId'] for d in door_records(scene.world)}


def plan_move(scene, owner, normal, tri, a, b, fitted):
    """Pick which face of a fighting pair moves, and how far along which world vector."""
    sa, sb = scene.surfaces[owner[a, 0]], scene.surfaces[owner[b, 0]]
    ia, ib = sa.tri_island[owner[a, 1]], sb.tri_island[owner[b, 1]]
    same = float(normal[a] @ normal[b]) > 0
    fa, fb = sa.glb.asset_id in fitted, sb.glb.asset_id in fitted
    if fa != fb:
        # A fitted door leaf never moves against the world (its bounds are rescaled anyway);
        # the wall, frame or floor it touches steps back instead.
        world_side = b if fa else a
        order = [(world_side, -1 if same else +1)]
    elif sa.blend != sb.blend:
        # Glass steps back behind the solid face it overlaps.
        glass, solid = (a, b) if sa.blend else (b, a)
        order = [(glass, -1)]
    else:
        ka = (sa.island_size[ia], sa.island_area[ia])
        kb = (sb.island_size[ib], sb.island_area[ib])
        win, lose = (a, b) if ka <= kb else (b, a)
        # The smaller piece (trim, sign, rug) comes forward; if it cannot, the bigger one steps back.
        order = [(win, +1), (lose, +1 if not same else -1)]
    for mover, sign in order:
        other = b if mover == a else a
        n = normal[mover] * sign
        # Closest corner decides: slightly tilted faces cross even when one corner is clear.
        gap = float(np.min((tri[mover] - tri[other][0]) @ n))
        need = OFFSET + 0.001 - gap
        if need <= 0.001:
            return None
        s = scene.surfaces[owner[mover, 0]]
        if s.glb.asset_id in fitted and touches_bounds(s, int(owner[mover, 1]), scene.instances[owner[mover, 2]][2], n):
            continue
        return mover, n * need
    return None


def touches_bounds(s, t, matrix, direction):
    """Would moving this face along `direction` change the asset's bounding box?"""
    lin = matrix[:3, :3]
    d_local = np.linalg.solve(lin, direction)
    axis = int(np.argmax(np.abs(d_local)))
    if not hasattr(s.glb, 'bounds'):
        pts = np.concatenate([x.points for x in s.glb.surfaces])
        s.glb.bounds = (pts.min(axis=0), pts.max(axis=0))
    lo, hi = s.glb.bounds
    coords = s.points[s.tris[t], axis]
    return bool(np.any(np.abs(coords - lo[axis]) < 1e-4) or np.any(np.abs(coords - hi[axis]) < 1e-4))


def fix(scene, out_dir, passes=20):
    os.makedirs(out_dir, exist_ok=True)
    fitted = fitted_assets(scene)
    for s in scene.surfaces:
        s.glb.surfaces = [x for x in scene.surfaces if x.glb is s.glb]
    for p in range(passes):
        tri, owner, normal, fights = audit(scene, quiet=p > 0)
        if not fights:
            print(f'pass {p}: clean')
            break
        wants = {}
        skipped = 0

        def want(mover, disp):
            s = scene.surfaces[owner[mover, 0]]
            t = int(owner[mover, 1])
            n = disp / np.linalg.norm(disp)
            key = (s.sid, int(s.tri_island[t]), tuple(np.round(n, 3)), round(float(normal[mover] @ tri[mover][0]), 3))
            if key not in wants or np.linalg.norm(wants[key][0]) < np.linalg.norm(disp):
                wants[key] = (disp, int(owner[mover, 2]), t)

        # Ordinary pairs are layered per plane in one step: the biggest piece stays,
        # each smaller overlapping piece sits one LAYER above everything it covers.
        # Pairwise nudging instead climbs a ladder when three pieces share a plane.
        def node(i):
            s = scene.surfaces[owner[i, 0]]
            isl = int(s.tri_island[owner[i, 1]])
            return (s.sid, isl, int(owner[i, 2]), tuple(np.round(normal[i], 2)))

        def rank(i):
            s = scene.surfaces[owner[i, 0]]
            isl = int(s.tri_island[owner[i, 1]])
            # Glass ranks last: solids come forward over it rather than glass stepping back and forth.
            return (s.blend, s.island_size[isl], s.island_area[isl], s.sid, isl)

        above = defaultdict(set)    # node -> nodes it must sit above
        rep = {}
        for a, b, _ in fights:
            sa, sb = scene.surfaces[owner[a, 0]], scene.surfaces[owner[b, 0]]
            special = (sa.glb.asset_id in fitted) or (sb.glb.asset_id in fitted)
            if not special:
                win, lose = (a, b) if rank(a) <= rank(b) else (b, a)
                if node(win) != node(lose):
                    above[node(win)].add(node(lose))
                    rep.setdefault(node(win), win)
                    continue
            plan = plan_move(scene, owner, normal, tri, a, b, fitted)
            if plan is None:
                skipped += 1
            else:
                want(*plan)
        layers = {}

        def layer(nd, seen=()):
            if nd in layers:
                return layers[nd]
            if nd in seen:
                return 0
            layers[nd] = value = 1 + max((layer(x, seen + (nd,)) for x in above.get(nd, ())), default=-1)
            return value
        for nd, i in rep.items():
            want(i, normal[i] * layer(nd) * LAYER)
        moves = {}
        prepared = set()
        for (sid, island, _, _), (disp, inst, t) in wants.items():
            s = scene.surfaces[sid]
            if sid not in prepared:
                tp = s.points[s.tris]
                tn = np.cross(tp[:, 1] - tp[:, 0], tp[:, 2] - tp[:, 0])
                ln = np.linalg.norm(tn, axis=1)
                tn[ln > 1e-12] /= ln[ln > 1e-12, None]
                s.tri_n, s.tri_p0 = tn, tp[:, 0]
                order = np.argsort(s.tri_island, kind='stable')
                bounds = np.searchsorted(s.tri_island[order], np.arange(len(s.island_size) + 1))
                s.island_tris = (order, bounds)
                prepared.add(sid)
            matrix = scene.instances[inst][2]
            lin = matrix[:3, :3]
            disp_local = np.linalg.solve(lin, disp)
            n_local = s.tri_n[t]
            order, bounds = s.island_tris
            cand = order[bounds[island]:bounds[island + 1]]
            face = cand[(s.tri_n[cand] @ n_local > NORMAL_TOL) &
                        (np.abs((s.tri_p0[cand] - s.tri_p0[t]) @ n_local) < PLANE_TOL)]
            welds = np.unique(s.weld[s.tris[face]])
            # Primitives may share one POSITION accessor; moves accumulate per accessor.
            acc = (s.glb.asset_id, s.pos_index)
            if acc not in moves:
                moves[acc] = np.zeros_like(s.points)
            verts = np.isin(s.weld, welds)
            cur = moves[acc][verts]
            moves[acc][verts] = np.where(np.abs(disp_local) > np.abs(cur), disp_local, cur)
        changed = 0
        for (asset_id, pos_index), delta in moves.items():
            sharing = [x for x in scene.surfaces if x.glb.asset_id == asset_id and x.pos_index == pos_index]
            for x in sharing:
                x.points = x.points + delta
            s = sharing[0]
            local_inv = np.linalg.inv(s.local)
            s.glb.write_positions(pos_index, s.points @ local_inv[:3, :3].T + local_inv[:3, 3])
            # Audit what the file will hold: float32, not this pass's float64 arithmetic.
            stored = s.glb.accessor(pos_index).astype(float)
            for x in sharing:
                x.points = stored @ x.local[:3, :3].T + x.local[:3, 3]
            changed += int(np.count_nonzero(np.abs(delta).sum(axis=1)))
        print(f'pass {p}: {len(fights)} pair(s), moved {len(wants)} face(s) / {changed} vertices, {skipped} unresolvable')
        if not wants:
            break
    tri, owner, normal, fights = audit(scene)
    for glb in scene.glbs.values():
        if glb.dirty:
            path = os.path.join(out_dir, glb.asset_id + '.glb')
            glb.save(path)
            print(f'WROTE {path}')
    return len(fights)


def fetch(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    world = load_world()
    assets = glb_assets(world)
    _, placed = layout(world)
    ids = set(placed) | {d['assetId'] for d in door_records(world)}
    for asset_id in sorted(ids):
        url = assets[asset_id]['url']
        path = os.path.join(out_dir, asset_id + '.glb')
        urllib.request.urlretrieve(url, path)
        print(f'{asset_id}: {url} -> {path}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('command', choices=['audit', 'fix', 'fetch'])
    ap.add_argument('--glbs', default=os.path.join(ROOT, 'build', 'zfight', 'orig'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'build', 'zfight', 'fixed'))
    ap.add_argument('--json')
    args = ap.parse_args()
    if args.command == 'fetch':
        fetch(args.out if args.out != ap.get_default('out') else args.glbs)
        return
    scene = Scene(args.glbs)
    if args.command == 'audit':
        _, _, _, fights = audit(scene, args.json)
        sys.exit(1 if fights else 0)
    sys.exit(1 if fix(scene, args.out) else 0)


if __name__ == '__main__':
    main()
