/**
 * VXL3 v13: the BLOCK NAME section — which block type each stored block id was.
 *
 * v9 stores a block type per palette entry as a bare number. Block ids are handed
 * out by registration order (`VoxelTextureAtlas.getNextBlockId`), so a number is
 * only meaningful in an engine that registered the same blocks in the same order.
 * Assets live with that (see `CUSTOM_BLOCK_ID_BASE`); a saved TERRAIN cannot,
 * because it is reloaded into whatever game it belongs to, and a game that
 * registers water before stone would read every stone voxel back as water. This
 * section names each id the file uses, so the loader remaps by name — what the
 * legacy JSON terrain format did with `metadata.blockTypes`.
 *
 * A distinct version rather than a new bit under v12, so a v12 reader rejects the
 * file by version instead of loading it and then dropping the names on its next
 * save (the same reason v12 exists).
 *
 * ── Layout ───────────────────────────────────────────────────────────────────
 *
 * Appended after the v12 parts section, announced by `VXL3_SECTION_BLOCK_NAMES`
 * in header byte 46:
 *
 *   uint16   entryCount
 *   per entry:
 *     uint16   blockId           (the number the v9 block-type column stores)
 *     uint8    nameLength
 *     bytes    name              (UTF-8, <= VOXEL_BLOCK_NAME_MAX)
 */

/** The v13 block name section is present. Bits 0-4 are taken by v11 and v12. */
export const VXL3_SECTION_BLOCK_NAMES = 1 << 5;

/** Longest block name the file stores. */
export const VOXEL_BLOCK_NAME_MAX = 64;

/** One stored block id and the block type it was. */
export interface VxlV3BlockName {
    id: number;
    name: string;
}

const encoder = new TextEncoder();

function encodedName(name: string): Uint8Array {
    const bytes = encoder.encode(name);
    if (bytes.byteLength > VOXEL_BLOCK_NAME_MAX) {
        throw new Error(`[VXL3] block name "${name}" is longer than ${VOXEL_BLOCK_NAME_MAX} bytes`);
    }
    return bytes;
}

/** Why `names` cannot be written, or null when it can. */
export function validateBlockNames(names: readonly VxlV3BlockName[]): string | null {
    if (names.length > 0xFFFF) return `${names.length} entries (max 65535)`;
    const seen = new Set<number>();
    for (const { id, name } of names) {
        if (!Number.isInteger(id) || id < 1 || id > 0xFFFF) return `block id ${id} is not 1..65535`;
        if (seen.has(id)) return `block id ${id} is named twice`;
        seen.add(id);
        if (name.length === 0) return `block id ${id} has an empty name`;
    }
    return null;
}

/** Bytes the section takes. */
export function blockNamesSectionBytes(names: readonly VxlV3BlockName[]): number {
    let total = 2;
    for (const { name } of names) total += 2 + 1 + encodedName(name).byteLength;
    return total;
}

/** Write the section at `cursor`. Returns the new cursor. */
export function writeBlockNamesSection(
    view: DataView,
    bytes: Uint8Array,
    cursorIn: number,
    names: readonly VxlV3BlockName[],
): number {
    let cursor = cursorIn;
    view.setUint16(cursor, names.length, true);
    cursor += 2;
    for (const { id, name } of names) {
        const encoded = encodedName(name);
        view.setUint16(cursor, id, true);
        cursor += 2;
        bytes[cursor] = encoded.byteLength;
        cursor += 1;
        bytes.set(encoded, cursor);
        cursor += encoded.byteLength;
    }
    return cursor;
}

/** Read the section at `cursor`. */
export function readBlockNamesSection(
    view: DataView,
    bytes: Uint8Array,
    cursorIn: number,
): { cursor: number; names: VxlV3BlockName[] } {
    let cursor = cursorIn;
    const decoder = new TextDecoder();
    const need = (n: number, what: string): void => {
        if (cursor + n > bytes.byteLength) throw new Error(`VXL13 block name section truncated reading ${what}`);
    };
    need(2, 'entry count');
    const count = view.getUint16(cursor, true);
    cursor += 2;
    const names: VxlV3BlockName[] = [];
    for (let i = 0; i < count; i++) {
        need(3, `entry ${i + 1}`);
        const id = view.getUint16(cursor, true);
        const length = bytes[cursor + 2]!;
        cursor += 3;
        need(length, `entry ${i + 1} name`);
        names.push({ id, name: decoder.decode(bytes.subarray(cursor, cursor + length)) });
        cursor += length;
    }
    return { cursor, names };
}
