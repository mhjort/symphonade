import { gzipSync, gunzipSync } from 'fflate';

/**
 * Gzip / gunzip helpers with a pure-JS fallback.
 *
 * The native Compression Streams API (`CompressionStream` /
 * `DecompressionStream`) is fast and streaming, but only shipped in iOS Safari
 * / WebKit 16.4. Older iOS devices (and some embedded WebViews) throw
 * `ReferenceError: Can't find variable: DecompressionStream` when loading a
 * gzipped VXL / VWLD / scene blob, which makes every compressed asset fail to
 * load. We feature-detect and fall back to fflate's synchronous codec, which
 * runs everywhere. fflate is bundled (not externalized) so it works offline
 * and without an import map.
 *
 * Inputs are typed-array views (often a subarray over a larger ArrayBuffer);
 * both the native and fflate paths honour the view's offset/length.
 */
export async function gzip(input: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return gzipSync(input);
}

export async function gunzip(input: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return gunzipSync(input);
}

/** True when `bytes` start with the gzip magic (`1f 8b`). No engine binary format does. */
export function isGzipped(bytes: Uint8Array): boolean {
    return bytes.byteLength > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Inflate a fetched body that a host served as its stored gzip bytes.
 *
 * Gzipped assets (`.vxl`, `.vwld`) rely on the CDN answering with `Content-Encoding: gzip`,
 * which makes the browser inflate them transparently. A host that cannot set response headers
 * — GitHub Pages, any plain static host (see game/docs/hosting.md) — hands over the gzip bytes
 * as they are, and a standalone bundle stores its copies gzipped too. Every loader of those
 * formats passes its body through here, so either way it receives the container. Bytes that are
 * not gzip come back unchanged (the same buffer); inflated bytes come back in a buffer of their
 * own, never a view into a larger one.
 */
export async function inflateIfGzipped(buf: ArrayBuffer): Promise<ArrayBuffer> {
    const bytes = new Uint8Array(buf);
    if (!isGzipped(bytes)) return buf;
    return (await gunzip(bytes)).slice().buffer;
}
