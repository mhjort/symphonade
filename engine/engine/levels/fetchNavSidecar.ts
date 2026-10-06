import { inflateIfGzipped } from 'engine/gzip.js';
import ASSET_MAP from 'bundle/BundledAssetData.js';

/**
 * Fetch a serialized VoxelNavMesh sidecar (see nav/NavSerialization.ts).
 *
 * Nav is an enhancement, not a requirement: unlike `fetchVwldBuffer`, this
 * NEVER throws. Any failure — HTTP error, network throw, empty body —
 * resolves `null` after a single `console.warn` naming the url, so a
 * missing/broken sidecar degrades to "no prebuilt navmesh" instead of
 * aborting boot or a level switch.
 *
 * Sidecars are uploaded as raw binary (never gzipped at rest), but the cheap
 * gzip-magic sniff from `fetchVwldBuffer` is mirrored anyway in case a host
 * ever serves one gzip-encoded without the Content-Encoding header — and
 * because a standalone bundle stores its copy gzipped (see fetchVwld).
 *
 * The ASSET_MAP lookup keeps prebuilt navmeshes working offline in a
 * standalone single-file build; without it every level switch there degraded
 * to "no prebuilt navmesh".
 */
export async function fetchNavSidecar(url: string): Promise<ArrayBuffer | null> {
    try {
        const resp = await fetch(ASSET_MAP.get(url) ?? url);
        if (!resp.ok) {
            console.warn(`[fetchNavSidecar] HTTP ${resp.status} for ${url}`);
            return null;
        }
        const buf = await resp.arrayBuffer();
        if (buf.byteLength === 0) {
            console.warn(`[fetchNavSidecar] empty body for ${url}`);
            return null;
        }
        return await inflateIfGzipped(buf);
    } catch (err) {
        console.warn(`[fetchNavSidecar] fetch failed for ${url}:`, err);
        return null;
    }
}
