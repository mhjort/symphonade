/**
 * Bake-time GLOW for a `.vxl` asset from a forger-authored `emissiveByColor` map
 * (`#RRGGBB` → strength 1..255): rune inlays, crystal veins, lava seams.
 *
 * The glow is written as named material slots (`glow`, `glow2`, …), one per
 * distinct strength. It used to go into the legacy per-colour emissive block
 * through a hand-rolled re-encode, which had two faults:
 *
 *  - The re-encode rebuilt every leaf from position and colour alone, so it
 *    dropped each voxel's slot, block type and joint. A smart prop stopped
 *    moving, and a `BM_slot_headlights` lost its voxels.
 *  - The per-colour block cannot coexist with block types, a rig or material
 *    classes (from v9 the encoder drops it), so an asset that also got
 *    `materialByColor` could keep only one of the two.
 *
 * Slots carry glow at every LOD and in every format version, next to a material
 * class. The re-encode goes through `decodedToEncodable`, which keeps every
 * per-leaf column and asset-level section.
 *
 * Matching is the level path's rule (`emissiveByColor.ts`): an exact RGB444 cell
 * match in LOD0. A coarser LOD's colour can be an average that appears nowhere in
 * LOD0, so there a leaf takes the glow of the nearest matched cell within one
 * step per channel, the same tolerance `VxlMaterialByColor` uses.
 *
 * What is never touched: voxels already in a slot that is not a material-class
 * slot. A modeller's or editor-authored light keeps its own glow.
 */
import { decodeVxlV3, encodeVxlV3, colorToCell, type DecodedVxlV3, type VxlV3Data } from 'engine/VxlV3Format.js';
import { decodedToEncodable } from 'engine/VoxelExplosionHelpers.js';
import { MAX_VOXEL_SLOTS, type VoxelSlot } from 'engine/VoxelMaterialSlots.js';
import { isVoxelMaterialClassName } from 'engine/VoxelMaterialClass.js';
import { applyEmissiveByColor } from 'engine/vxlscene/emissiveByColor.js';

export interface EmissiveByColorApplied {
    bytes: Uint8Array;
    /** Keys that matched no colour, or could not get a slot. A bake note, never an error. */
    unmatched: string[];
    /** True when nothing matched, so `bytes` is the input unchanged. */
    unchanged: boolean;
}

type Leaf = VxlV3Data['fragments'][number]['leaves'][number];

/** Distinct LOD0 cells in first-seen order. */
function lod0Cells(dec: DecodedVxlV3): number[] {
    const seen = new Set<number>();
    for (const fragment of dec.fragments) {
        const color = fragment.leaves.color;
        for (let i = 0; i < fragment.leaves.count; i++) seen.add(color[i]!);
    }
    return [...seen];
}

function withinOneStep(a: number, b: number): boolean {
    return Math.abs(((a >> 8) & 0xf) - ((b >> 8) & 0xf)) <= 1
        && Math.abs(((a >> 4) & 0xf) - ((b >> 4) & 0xf)) <= 1
        && Math.abs((a & 0xf) - (b & 0xf)) <= 1;
}

function cellDistance(a: number, b: number): number {
    return Math.abs(((a >> 8) & 0xf) - ((b >> 8) & 0xf))
        + Math.abs(((a >> 4) & 0xf) - ((b >> 4) & 0xf))
        + Math.abs((a & 0xf) - (b & 0xf));
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
        return bytes.buffer;
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Apply the map to already-encoded `.vxl` bytes. A map that matches nothing
 * leaves the bytes byte-identical, so an asset's url never churns for a no-op.
 */
export async function applyEmissiveByColorAsSlots(
    vxlBytes: Uint8Array,
    emissiveByColor: Record<string, number>,
): Promise<EmissiveByColorApplied> {
    const dec = await decodeVxlV3(toExactArrayBuffer(vxlBytes));
    const cells = lod0Cells(dec);
    const { emissive, unmatched } = applyEmissiveByColor(cells, emissiveByColor);
    const glowOfCell = new Map<number, number>();
    cells.forEach((cell, i) => { if (emissive[i]! > 0) glowOfCell.set(cell, emissive[i]!); });
    if (glowOfCell.size === 0) return { bytes: vxlBytes, unmatched, unchanged: true };

    const rebuilt = decodedToEncodable(dec);
    const useAtlas = dec.useAtlas;
    const slots: VoxelSlot[] = [...(rebuilt.slots ?? [])];
    // Which slot a glowing leaf moves to, keyed by the slot it was in and its strength:
    // a class slot that glows keeps its class, so classed lava stays lava and glows.
    const glowSlot = new Map<string, number>();
    const names = new Set(slots.map((s) => s.name));
    let budgetHit = false;
    const slotFor = (fromSlot: number, strength: number): number | null => {
        const key = `${fromSlot}:${strength}`;
        const known = glowSlot.get(key);
        if (known !== undefined) return known;
        if (slots.length >= MAX_VOXEL_SLOTS) { budgetHit = true; return null; }
        let name = 'glow';
        for (let n = 2; names.has(name); n++) name = `glow${n}`;
        names.add(name);
        const materialClass = fromSlot > 0 ? slots[fromSlot - 1]!.materialClass : undefined;
        slots.push({ name, emissive: strength, ...(materialClass ? { materialClass } : {}) });
        glowSlot.set(key, slots.length);
        return slots.length;
    };
    // Only the base material and class slots (named after a material class, the
    // material pass's own) are open to glow; any other slot is someone's light.
    const isOpen = (slot: number): boolean => slot === 0 || isVoxelMaterialClassName(slots[slot - 1]?.name ?? '');

    const coarseGlow = new Map<number, number>();
    const strengthOf = (cell: number, exactOnly: boolean): number => {
        const exact = glowOfCell.get(cell);
        if (exact !== undefined || exactOnly) return exact ?? 0;
        const cached = coarseGlow.get(cell);
        if (cached !== undefined) return cached;
        let best = 0;
        let bestDistance = Infinity;
        for (const [matched, strength] of glowOfCell) {
            if (!withinOneStep(matched, cell)) continue;
            const distance = cellDistance(matched, cell);
            if (distance < bestDistance) { bestDistance = distance; best = strength; }
        }
        coarseGlow.set(cell, best);
        return best;
    };
    let lit = 0;
    const applyTo = (leaves: Leaf[], exactOnly: boolean): void => {
        for (const leaf of leaves) {
            const from = leaf.slot ?? 0;
            if (!isOpen(from)) continue;
            const strength = strengthOf(colorToCell(leaf.r, leaf.g, leaf.b, useAtlas), exactOnly);
            if (strength === 0) continue;
            const to = slotFor(from, strength);
            if (to === null) continue;
            leaf.slot = to;
            leaf.emissive = 0;
            lit++;
        }
    };
    for (const fragment of rebuilt.fragments) applyTo(fragment.leaves, true);
    for (const lod of rebuilt.additionalLods ?? []) {
        for (const fragment of lod.fragments) applyTo(fragment.leaves, false);
    }
    if (budgetHit) {
        console.warn(`[emissiveByColor] the asset has no room for more than ${MAX_VOXEL_SLOTS} material slots; some colours stay unlit`);
    }
    if (lit === 0) return { bytes: vxlBytes, unmatched: Object.keys(emissiveByColor), unchanged: true };

    rebuilt.slots = slots;
    return { bytes: await encodeVxlV3(rebuilt), unmatched, unchanged: false };
}
