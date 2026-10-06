/**
 * Flattens an ImportedVoxelFile into engine-oriented, zero-rebased voxel grids.
 *
 * - merge: all instances stamped into ONE grid (scene layout preserved; later
 *   instances win on overlap).
 * - separate: one grid per source model, authored orientation (instance
 *   transforms ignored — a prop pack's per-model placement is scene layout,
 *   not part of the prop).
 *
 * Axis conversion happens here, once: MagicaVoxel is Z-up right-handed, the
 * engine is Y-up right-handed, so engine = (x, z, -y) (a −90° rotation about X —
 * a plain y/z swap would mirror every model). Qubicle is already Y-up.
 * After conversion the grid is rebased so min = (0,0,0).
 */
import type { ImportedVoxelFile, ImportedVoxelInstance } from 'engine/import/ImportedVoxelModel.js';
import { IDENTITY_ROTATION, MAX_IMPORT_VOXELS } from 'engine/import/ImportedVoxelModel.js';
import { packCell, CELL_KEY_HALF } from 'engine/vxlscene/SurfaceRasterizer.js';

export interface CompiledVoxelModel {
    name: string;
    /** Grid extent in cells (engine axes, after rebase). */
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    /** key = packCell(x, y, z), all coords >= 0; value = 0xRRGGBB (sRGB). */
    cells: Map<number, number>;
    /**
     * Per-cell emissive intensity, keyed exactly like `cells`; value 0..255.
     * Sparse: entries exist only for glowing cells (value > 0). Null when the
     * source file has no emissive materials, or none of its emissive colors is
     * used by a placed voxel (unused palette entries are never ghost-emitted).
     */
    cellsEmissive: Map<number, number> | null;
}

export interface CompileOptions {
    mode: 'merge' | 'separate';
    /** Fallback naming stem (usually the file name without extension). */
    baseName: string;
    /** Cumulative stamped-voxel budget; override only in tests. Default MAX_IMPORT_VOXELS. */
    maxVoxels?: number;
}

/**
 * Stamped voxels in engine axes, as parallel typed arrays rather than one object per
 * voxel: at the 16.7M-voxel import cap, objects (twice, before the axis-conversion copy
 * was dropped) cost gigabytes of heap. Grows by doubling; bounds tracked as voxels land.
 */
class CellBuffer {
    xyz = new Int32Array(3 * 1024);
    rgb = new Uint32Array(1024);
    emissive = new Uint8Array(1024);
    length = 0;
    minX = Infinity; minY = Infinity; minZ = Infinity;
    maxX = -Infinity; maxY = -Infinity; maxZ = -Infinity;

    push(x: number, y: number, z: number, rgb: number, emissive: number): void {
        if (this.length === this.rgb.length) this.grow();
        const i = this.length++;
        this.xyz[i * 3] = x;
        this.xyz[i * 3 + 1] = y;
        this.xyz[i * 3 + 2] = z;
        this.rgb[i] = rgb;
        this.emissive[i] = emissive;
        if (x < this.minX) this.minX = x;
        if (y < this.minY) this.minY = y;
        if (z < this.minZ) this.minZ = z;
        if (x > this.maxX) this.maxX = x;
        if (y > this.maxY) this.maxY = y;
        if (z > this.maxZ) this.maxZ = z;
    }

    private grow(): void {
        const n = this.rgb.length * 2;
        const xyz = new Int32Array(n * 3); xyz.set(this.xyz); this.xyz = xyz;
        const rgb = new Uint32Array(n); rgb.set(this.rgb); this.rgb = rgb;
        const em = new Uint8Array(n); em.set(this.emissive); this.emissive = em;
    }
}

/** Mutable cumulative counter threaded through collectInstance calls (merge: across instances; separate: across grids). */
interface VoxelBudget { remaining: number; limit: number; }

export function compileImportedFile(file: ImportedVoxelFile, options: CompileOptions): CompiledVoxelModel[] {
    const limit = options.maxVoxels ?? MAX_IMPORT_VOXELS;
    const budget: VoxelBudget = { remaining: limit, limit };
    const hasEmissive = file.paletteEmissive !== null;
    if (options.mode === 'merge') {
        const cells = new CellBuffer();
        for (const inst of file.instances) collectInstance(file, inst, cells, budget);
        return [finishModel(cells, options.baseName, hasEmissive)];
    }
    const models: CompiledVoxelModel[] = [];
    for (let i = 0; i < file.grids.length; i++) {
        const identity: ImportedVoxelInstance = {
            gridIndex: i, rotation: IDENTITY_ROTATION, translation: [0, 0, 0], name: null,
        };
        const cells = new CellBuffer();
        collectInstance(file, identity, cells, budget);
        if (cells.length === 0) continue; // fully-transparent grid
        const instName = file.instances.find(inst => inst.gridIndex === i)?.name ?? null;
        const name = instName ?? file.grids[i]!.name ?? `${options.baseName}-${i + 1}`;
        models.push(finishModel(cells, name, hasEmissive));
    }
    if (models.length === 0) throw new Error('No solid voxels found in file');
    return models;
}

function collectInstance(file: ImportedVoxelFile, inst: ImportedVoxelInstance, out: CellBuffer, budget: VoxelBudget): void {
    const grid = file.grids[inst.gridIndex];
    if (!grid) return;
    const m = inst.rotation;
    const t = inst.translation;
    const cx = Math.floor(grid.sizeX / 2);
    const cy = Math.floor(grid.sizeY / 2);
    const cz = Math.floor(grid.sizeZ / 2);
    const pal = file.palette;
    const pe = file.paletteEmissive;
    const v = grid.voxels;
    // Axis conversion to engine Y-up happens as each voxel lands. MagicaVoxel:
    // (x, y, z)src → (x, z, -y)eng. Qubicle is already Y-up.
    const zUp = file.format === 'vox';
    for (let i = 0; i < v.length; i += 4) {
        const ci = v[i + 3]!;
        const pr = pal[ci * 4 + 0];
        if (pr === undefined) continue; // palette index out of range
        const a = pal[ci * 4 + 3]!;
        if (a < 128) continue; // transparent palette entry = air
        const rgb = (pr << 16) | (pal[ci * 4 + 1]! << 8) | pal[ci * 4 + 2]!;
        // paletteEmissive shares the palette's color indexing (1-based for .vox).
        const emissive = pe ? pe[ci] ?? 0 : 0;
        // MagicaVoxel placement: world = R * (p - floor(size/2)) + t
        const lx = v[i]! - cx, ly = v[i + 1]! - cy, lz = v[i + 2]! - cz;
        const x = m[0]! * lx + m[1]! * ly + m[2]! * lz + t[0];
        const y = m[3]! * lx + m[4]! * ly + m[5]! * lz + t[1];
        const z = m[6]! * lx + m[7]! * ly + m[8]! * lz + t[2];
        if (--budget.remaining < 0) {
            throw new Error(`Voxel count exceeds import limit (${budget.limit.toLocaleString('en-US')})`);
        }
        if (zUp) out.push(x, z, -y, rgb, emissive);
        else out.push(x, y, z, rgb, emissive);
    }
}

function finishModel(cells: CellBuffer, name: string, hasEmissive: boolean): CompiledVoxelModel {
    if (cells.length === 0) throw new Error('No solid voxels found in file');
    const { minX, minY, minZ, maxX, maxY, maxZ } = cells;
    if (maxX - minX + 1 > CELL_KEY_HALF || maxY - minY + 1 > CELL_KEY_HALF || maxZ - minZ + 1 > CELL_KEY_HALF) {
        throw new Error(`Model extent exceeds the importable range (${CELL_KEY_HALF} cells per axis)`);
    }
    const out = new Map<number, number>();
    // Sparse: only glowing cells get an entry. Allocated only when the file has
    // emissive at all; the delete keeps later-instance-wins correct when a
    // non-glowing cell overwrites a glowing one.
    const emissive = hasEmissive ? new Map<number, number>() : null;
    const { xyz, rgb, emissive: em } = cells;
    for (let i = 0; i < cells.length; i++) {
        const key = packCell(xyz[i * 3]! - minX, xyz[i * 3 + 1]! - minY, xyz[i * 3 + 2]! - minZ);
        out.set(key, rgb[i]!);
        if (emissive) {
            if (em[i]! > 0) emissive.set(key, em[i]!);
            else emissive.delete(key);
        }
    }
    return {
        name,
        sizeX: maxX - minX + 1,
        sizeY: maxY - minY + 1,
        sizeZ: maxZ - minZ + 1,
        cells: out,
        cellsEmissive: emissive !== null && emissive.size > 0 ? emissive : null,
    };
}
