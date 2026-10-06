/**
 * VoxelWorld ↔ VXL v3 bridge.
 *
 * VXL v3 is ~30× smaller than the legacy JSON dump and is the format
 * `VoxelWorld.saveToFile` persists. Two kinds of grid go through it:
 *
 * - Saved terrain carries real block types (grass, stone, water). The save
 *   writes each voxel's block id (the v9 column) and names every id it used
 *   (the v13 block name section), and the load maps each name back to the id
 *   this game registered for it — ids depend on registration order, names do
 *   not. Voxels without a block type round-trip as `BlockType.COLOR`.
 * - Collision grids (splat voxelization, `convertVoxelGridToVoxelWorld`) hold a
 *   single block id plus per-voxel colour. A file without block names loads
 *   every voxel as block id 1, as it always has; terrain saved before block
 *   names existed loads that way too, because its types were never written.
 */
import { CHUNK_SIZE, CHUNK_MASK, VoxelChunk } from 'engine/VoxelGeometry.js';
import type { BlockID } from 'engine/VoxelGeometry.js';
import { encodeVxlV3, decodeVxlV3, type VxlV3Data } from 'engine/VxlV3Format.js';
import type { VxlV3BlockName } from 'engine/VxlV3BlockNames.js';
import type { OctreeLeaf } from 'engine/VoxelOctreeRenderer.js';

/**
 * Minimum surface VoxelWorld exposes for its IO helpers. The `Chunk` type is
 * a VoxelWorld-local subclass; we accept any subclass and let the caller
 * inject its factory so we don't have to reach back into VoxelWorld.ts.
 */
export interface VxlIOWorld<TChunk extends VoxelChunk> {
    chunks: Map<string, TChunk>;
    dirtyChunks: Set<TChunk>;
    clear(): void;
}

export interface VoxelWorldSaveOptions {
    voxelSize: number;
    bounds?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
    /**
     * The registered name of a block id, or undefined for an id with none. When
     * given, the save keeps every voxel's block type and names the ids it used.
     */
    blockName?: (id: number) => string | undefined;
}

export interface VoxelWorldLoadResult {
    voxelSize?: number;
    bounds?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

/**
 * Encode every non-air voxel as an OctreeLeaf and emit a gzipped VXL v3
 * buffer. Each voxel becomes one leaf at world position
 * `(cx*CHUNK_SIZE + lx) * voxelSize`, with the chunk-local RGB24 color
 * unpacked into 0-1 floats for the encoder.
 */
/** `BlockType.COLOR` — a voxel that carries its own colour rather than a texture. */
const COLOR_BLOCK_ID = 255;

/** One leaf per solid voxel, plus the box they span. */
export interface ChunkLeafConversion {
    leaves: OctreeLeaf[];
    bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

/**
 * Expand a chunk grid into one `OctreeLeaf` per solid voxel, in WORLD coordinates.
 *
 * Shared by every chunk-backed → VXL3 path so there is ONE definition of where a voxel
 * lands: leaf position is `base + (chunkCoord * CHUNK_SIZE + local) * voxelSize`, and
 * chunk keys are the signed `"cx,cy,cz"` triples the grid is stored under. A second
 * copy of this arithmetic that disagreed by one chunk would silently displace every
 * converted asset, so callers pass their own `base` rather than re-deriving positions.
 *
 * `base` is the world offset the grid's chunk coords are relative to. VoxelWorld numbers
 * its chunks from `bounds.min`, so it passes that; objects centred on their own origin
 * (signed chunk coords) pass zero and let the returned bounds describe them.
 */
export function chunksToOctreeLeaves<TChunk extends VoxelChunk>(
    chunks: Map<string, TChunk>,
    voxelSize: number,
    base: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    /**
     * Carry each voxel's BLOCK TYPE onto its leaf (VXL3 v9). Opt-in because it changes
     * what the encoder writes: a grid of textured blocks becomes a v9 asset instead of a
     * colour-only one. Object and terrain saves want it; a collision grid, which has
     * no types worth keeping, leaves it off and keeps emitting exactly what it did.
     */
    carryBlockTypes = false,
): ChunkLeafConversion {
    const leaves: OctreeLeaf[] = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const [key, chunk] of chunks) {
        const parts = key.split(',');
        if (parts.length !== 3) continue;
        const cx = parseInt(parts[0]!, 10);
        const cy = parseInt(parts[1]!, 10);
        const cz = parseInt(parts[2]!, 10);
        if (isNaN(cx) || isNaN(cy) || isNaN(cz)) continue;
        const baseX = cx * CHUNK_SIZE;
        const baseY = cy * CHUNK_SIZE;
        const baseZ = cz * CHUNK_SIZE;
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    const blockId = chunk.get(lx, ly, lz);
                    if (blockId === 0) continue;
                    const wx = base.x + (baseX + lx) * voxelSize;
                    const wy = base.y + (baseY + ly) * voxelSize;
                    const wz = base.z + (baseZ + lz) * voxelSize;
                    const c24 = chunk.colors.length > 0 ? (chunk.colors.get(lx, ly, lz) >>> 0) : 0xFFFFFF;
                    const r = ((c24 >> 16) & 0xFF) / 255;
                    const g = ((c24 >> 8) & 0xFF) / 255;
                    const b = (c24 & 0xFF) / 255;
                    leaves.push({
                        x: wx, y: wy, z: wz, size: voxelSize, r, g, b,
                        // BlockType.COLOR means "coloured", which the encoder already reads
                        // as no block type — passing it through would address a texture
                        // that does not exist.
                        ...(carryBlockTypes && blockId !== COLOR_BLOCK_ID ? { blockType: blockId } : {}),
                    });
                    if (wx < minX) minX = wx;
                    if (wy < minY) minY = wy;
                    if (wz < minZ) minZ = wz;
                    if (wx + voxelSize > maxX) maxX = wx + voxelSize;
                    if (wy + voxelSize > maxY) maxY = wy + voxelSize;
                    if (wz + voxelSize > maxZ) maxZ = wz + voxelSize;
                }
            }
        }
    }

    // Empty grid → placeholder unit-cube bounds so the encoder still has a
    // well-formed body (it would reject zero-volume bounds).
    if (leaves.length === 0) {
        minX = minY = minZ = 0;
        maxX = maxY = maxZ = voxelSize;
    }
    return { leaves, bounds: { minX, minY, minZ, maxX, maxY, maxZ } };
}

export async function encodeVoxelWorldAsVxlV3<TChunk extends VoxelChunk>(world: VxlIOWorld<TChunk>, opts: VoxelWorldSaveOptions): Promise<Uint8Array> {
    const voxelSize = opts.voxelSize;
    // Leaf positions are emitted in WORLD coordinates so the saved file is
    // self-describing — leaf.x is the same number the loader subtracts
    // bounds.minX from to recover the voxel index. Chunk coords inside
    // VoxelWorld are 0-based offsets from `bounds.minX`, so we add the
    // bounds offset back here. When no bounds are supplied, the offset is
    // 0 and the auto-computed bounds (below) end up at minX=0 — symmetric
    // either way.
    const blockName = opts.blockName;
    const converted = chunksToOctreeLeaves(world.chunks, voxelSize, {
        x: opts.bounds?.minX ?? 0,
        y: opts.bounds?.minY ?? 0,
        z: opts.bounds?.minZ ?? 0,
    }, blockName !== undefined);
    const bounds = opts.bounds ?? converted.bounds;
    const blockNames = blockName ? nameUsedBlocks(converted.leaves, blockName) : [];
    const data: VxlV3Data = {
        minVoxelSize: voxelSize,
        maxVoxelSize: voxelSize,
        physicsGridStep: voxelSize,
        bounds,
        useAtlas: false,
        fragments: [{
            aabbMin: [bounds.minX, bounds.minY, bounds.minZ],
            aabbMax: [bounds.maxX, bounds.maxY, bounds.maxZ],
            leaves: converted.leaves,
        }],
        ...(blockNames.length > 0 ? { blockNames } : {}),
    };
    return encodeVxlV3(data);
}

/**
 * Name every block id the leaves use. A leaf whose id has no registered name
 * cannot be remapped on load, so it is saved as a coloured voxel instead of an
 * id that would mean something else in another game.
 */
function nameUsedBlocks(leaves: OctreeLeaf[], blockName: (id: number) => string | undefined): VxlV3BlockName[] {
    const names = new Map<number, string | undefined>();
    for (const leaf of leaves) {
        const id = leaf.blockType;
        if (!id) continue;
        if (!names.has(id)) names.set(id, blockName(id));
        if (names.get(id) === undefined) delete leaf.blockType;
    }
    const out: VxlV3BlockName[] = [];
    for (const [id, name] of names) if (name !== undefined) out.push({ id, name });
    return out;
}

/**
 * Decode a VXL v3 buffer and populate the world's chunk grid. Clears any
 * existing chunks first; marks every loaded chunk dirty so downstream
 * meshing/physics rebuilds it.
 *
 * A file with block names (saved terrain) gets its block types back through
 * `resolveBlockId`, which maps a name to this game's id for it (registering the
 * block if needed) or returns undefined for a name it does not know; such
 * voxels, and voxels saved without a type, load as coloured blocks. A file
 * without names loads every voxel as block id 1, the single-id contract of
 * `convertVoxelGridToVoxelWorld`.
 */
export async function loadVxlV3IntoVoxelWorld<TChunk extends VoxelChunk>(
    world: VxlIOWorld<TChunk>,
    buffer: ArrayBuffer,
    newChunk: () => TChunk,
    resolveBlockId?: (name: string) => number | undefined,
): Promise<VoxelWorldLoadResult> {
    const data = await decodeVxlV3(buffer);
    const voxelSize = data.minVoxelSize;
    world.clear();

    const COLLISION_BLOCK_ID = 1 as BlockID;
    const remap = data.blockNames && resolveBlockId ? remapBlockIds(data.blockNames, resolveBlockId) : null;
    const inv = 1 / voxelSize;
    const baseX = data.bounds.minX;
    const baseY = data.bounds.minY;
    const baseZ = data.bounds.minZ;

    for (const fragment of data.fragments) {
        const types = fragment.leaves.blockType;
        fragment.leaves.forEach((leaf, i) => {
            const vx = Math.round((leaf.x - baseX) * inv);
            const vy = Math.round((leaf.y - baseY) * inv);
            const vz = Math.round((leaf.z - baseZ) * inv);
            const cx = Math.floor(vx / CHUNK_SIZE);
            const cy = Math.floor(vy / CHUNK_SIZE);
            const cz = Math.floor(vz / CHUNK_SIZE);
            const lx = vx & CHUNK_MASK;
            const ly = vy & CHUNK_MASK;
            const lz = vz & CHUNK_MASK;
            const chunkKey = `${cx},${cy},${cz}`;
            let chunk = world.chunks.get(chunkKey);
            if (!chunk) {
                chunk = newChunk();
                world.chunks.set(chunkKey, chunk);
            }
            const stored = remap && types ? types[i]! : 0;
            const block = remap ? ((stored && remap.get(stored)) || COLOR_BLOCK_ID) as BlockID : COLLISION_BLOCK_ID;
            chunk.set(lx, ly, lz, block);
            const r = Math.max(0, Math.min(255, Math.round(leaf.r * 255)));
            const g = Math.max(0, Math.min(255, Math.round(leaf.g * 255)));
            const b = Math.max(0, Math.min(255, Math.round(leaf.b * 255)));
            chunk.colors.set(lx, ly, lz, (r << 16) | (g << 8) | b);
        });
    }

    for (const chunk of world.chunks.values()) {
        chunk.needsRemesh = true;
        world.dirtyChunks.add(chunk);
    }

    return { voxelSize, bounds: data.bounds };
}

/** Stored block id → this game's id, by name. Unknown names are left out (they load as coloured). */
function remapBlockIds(names: VxlV3BlockName[], resolveBlockId: (name: string) => number | undefined): Map<number, number> {
    const remap = new Map<number, number>();
    for (const { id, name } of names) {
        const current = resolveBlockId(name);
        if (current === undefined || current === 0) {
            console.warn(`[VoxelWorld] Unknown block type '${name}' in saved terrain — loading those voxels as coloured blocks`);
            continue;
        }
        remap.set(id, current);
    }
    return remap;
}
