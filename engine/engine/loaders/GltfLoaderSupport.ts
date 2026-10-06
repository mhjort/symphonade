/**
 * One place that knows how to build a GLTFLoader, so every GLB in the engine decodes the
 * same set of formats.
 *
 * WHY THIS EXISTS. `new GLTFLoader()` appeared at a dozen call sites — environment objects,
 * animals, splat overlays, the voxelizer, the editor's preview panes — and each one decoded
 * whatever the bare loader happens to support. That was invisible while every GLB carried
 * plain PNG textures. It stops being invisible the moment one carries a KTX2 texture: the
 * loader throws on the `KHR_texture_basisu` extension unless a KTX2Loader is attached, so
 * "does this asset load" would depend on which call site happened to fetch it. A shared
 * factory makes that one decision instead of thirteen.
 *
 * WHY KTX2. A base colour map is the largest thing most assets own, and PNG says nothing
 * about what the GPU stores: a 2048² map is ~16 MB of video memory however small the file
 * was. KTX2 with Basis Universal transcodes to whatever compressed format the device
 * actually has, which is roughly a quarter of that, and carries its own mip chain. This
 * module is only the READ side — nothing here encodes — but nothing downstream (per-asset
 * texture variants, a resolution the player or the device tier can change) can be built
 * until the engine can load the format at all.
 *
 * THE TRANSCODER IS FETCHED FROM A CDN, and it has to be. `KTX2Loader` otherwise resolves it
 * through `new URL('../libs/basis/…', import.meta.url)`, which this file used to claim every
 * bundler here follows into its own asset graph. Nothing in this repository has ever served
 * those two files, in any lane — the claim was never exercised, because until the character
 * catalogue shipped, no asset used the format.
 *
 * In a CLI project it cannot work even in principle. The scaffold's import map points
 * `three/examples/jsm/` at esm.sh (`cli/src/scaffold/project-files.ts`), so `import.meta.url`
 * is an esm.sh URL and the relative path lands on
 * `https://esm.sh/*three@x/es2022/examples/jsm/libs/basis/basis_transcoder.js`, which answers
 * `408 timeout, the module is waiting to be built` for good: esm.sh transforms ES modules, and
 * this is an emscripten UMD blob it can never build. `KTX2Loader` fetches the file as TEXT and
 * splices it into a Blob worker, so the error surfaces as a SyntaxError inside `blob:` —
 * outside any caller's try/catch, which is how one unreadable NPC took the whole boot down.
 *
 * jsDelivr serves package files verbatim, which is exactly what is needed. The version comes
 * from three's own `REVISION`, so the transcoder cannot drift from the runtime that uses it.
 * This does trade the "no CDN to be down" property the old comment claimed — but that property
 * was imaginary, and a published single-file bundle has nowhere local to read these from
 * anyway. `setGltfTranscoderPath` exists for a deployment that would rather self-host.
 *
 * ORDERING, AND WHY IT IS NOT THE CALLER'S PROBLEM. `detectSupport` asks the renderer which
 * compressed formats exist, so it needs a live device. On WebGL that is true the moment the
 * renderer is constructed; on WebGPU only after `init()` resolves, which is why `GameEngine`
 * calls this from inside that same async block.
 *
 * `GameEngine` builds its shared loader in the CONSTRUCTOR, long before either. Attaching
 * KTX2 only at construction therefore left `engine.loader` — the loader every NPC, prop and
 * animal goes through — permanently unable to read the extension, however late the asset was
 * fetched. It surfaced as `setKTX2Loader must be called before loading KTX2 textures` on the
 * first catalogue character, an asset class that is REQUIRED to be KTX2, and was silent
 * before that only because nothing shipped the format.
 *
 * So loaders handed out early are remembered and wired up when the device appears. Three
 * reads `ktx2Loader` at parse time, not at construction — which fixes every file parsed after
 * the device exists, and none parsed before it.
 *
 * THE BOOT RACE. This file used to claim the retrofit above was enough. It is not: on WebGPU
 * the device arrives an `await init()` after `createRenderer` returns, while the game is
 * already fetching its assets through `engine.loader`. A KTX2 GLB that finishes downloading
 * first (a small optimised file, the HTTP cache) is parsed by a loader that has no KTX2Loader
 * yet and fails with the same `setKTX2Loader must be called` error. Squall Riders hit it with
 * an optimised rider and shipped a game-side wait. So a loader built before the device HOLDS a
 * parse that needs `KHR_texture_basisu` while a device is on its way (`GameEngine` announces it
 * with `expectGltfLoaderSupport`), and parses exactly as before once it lands. Every path —
 * `load`, `loadAsync`, `parse`, `parseAsync` — goes through `parse`, so every path waits.
 *
 * MESHOPT GEOMETRY. `EXT_meshopt_compression` is the vertex/index counterpart of KTX2: the
 * optimised GLBs the `optimizing-assets` skill writes carry it, and GLTFLoader throws
 * `setMeshoptDecoder must be called before loading compressed files` on any file that requires
 * it. The decoder is three's own copy of meshoptimizer's (`libs/meshopt_decoder.module.js`,
 * MIT): its WASM is embedded in the module as a string, so unlike the Basis transcoder no
 * second file is fetched and no path can be wrong. It needs no GPU device either, so every
 * loader gets it the moment it is built, with no queue. `KHR_mesh_quantization` needs no
 * decoder at all; three reads it natively.
 *
 * The decoder is IMPORTED ON FIRST USE, not at boot. Evaluating that module unpacks and
 * compiles its WASM, which measured 3.7 ms of main thread in Chromium on an M-series Mac and
 * ~11 ms at 6x CPU throttle, plus a 7.7 KB (gzip) esm.sh request in the CDN lanes — paid by
 * every game, including the ones that ship no meshopt asset. Three makes laziness cheap: the
 * parser reads only `supported` synchronously and then calls `decodeGltfBufferAsync`, a
 * promise, so the stand-in below imports the real decoder inside that promise. Standalone and
 * `--single-file` builds still evaluate it at startup: Rollup's `inlineDynamicImports` runs an
 * inlined module immediately.
 */

import { REVISION } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { MeshoptDecoder as ThreeMeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { hosting } from 'engine/hosting.js';

/**
 * Where `basis_transcoder.js` and `.wasm` are read from when the hosting provider names no
 * copy of its own (`hosting.basisTranscoderPath` is null — the Bitmagic CDN preset).
 *
 * Derived from the running three's own `REVISION` ('185' -> `three@0.185`), so a three upgrade
 * carries its matching transcoder with it and the two cannot fall out of step. jsDelivr
 * resolves the range to the newest matching patch.
 */
function defaultTranscoderPath(): string {
    const revision = String(REVISION).replace(/\D+.*$/, '');
    return `https://cdn.jsdelivr.net/npm/three@0.${revision}/examples/jsm/libs/basis/`;
}

let transcoderPath = hosting.basisTranscoderPath ?? defaultTranscoderPath();

/**
 * Point the transcoder somewhere else — a self-hosted copy, or a test.
 *
 * Must be called before the first `initGltfLoaderSupport`; after that the shared loader has
 * already been told. The path is a DIRECTORY: three appends `basis_transcoder.js` and
 * `basis_transcoder.wasm` to it.
 */
export function setGltfTranscoderPath(path: string): void {
    transcoderPath = path;
    sharedKtx2?.setTranscoderPath(path);
}

/** Where the transcoder will be read from — for tests and diagnostics. */
export function gltfTranscoderPath(): string {
    return transcoderPath;
}

/**
 * Minimal shape of the renderers `KTX2Loader.detectSupport` accepts.
 *
 * `dispose` is here to give the type a REQUIRED member. Both backends have one, and without
 * it an all-optional interface structurally matches nothing — TypeScript rejects a concrete
 * `WebGLRenderer` for having "no properties in common".
 */
export interface KtxCapableRenderer {
    /** Present on WebGPURenderer only; `detectSupport` branches on it. */
    readonly isWebGPURenderer?: boolean;
    dispose(): void;
}

/**
 * Shared across every loader this module hands out.
 *
 * One instance, because it owns a worker pool and a compiled transcoder: a per-call-site
 * loader would spawn a pool each and re-fetch the wasm each.
 */
let sharedKtx2: KTX2Loader | null = null;

/** Guards against a second `detectSupport` on the same renderer (recreate is legitimate). */
let detectedFor: KtxCapableRenderer | null = null;

/**
 * Loaders handed out before the device existed, waiting to be told about KTX2.
 *
 * `GameEngine` builds its shared loader in the constructor and only reaches
 * `initGltfLoaderSupport` once the renderer is up — on WebGPU, an `await init()`
 * later. Attaching only at construction left that loader permanently unable to
 * read the extension, which is every NPC and every other GLB that goes through
 * `engine.loader`. Populated only during that window and cleared when it closes,
 * so this holds nothing after boot.
 */
const awaitingKtx2 = new Set<GLTFLoader>();

/**
 * Settles once the device `GameEngine` announced exists (or failed to appear). Null while no
 * device is on its way — before any renderer, and after the last one landed.
 */
let pendingDevice: Promise<void> | null = null;

const KTX2_EXTENSION = 'KHR_texture_basisu';
/** How the extension appears in glTF JSON text: as a quoted name. */
const KTX2_EXTENSION_JSON = `"${KTX2_EXTENSION}"`;

/**
 * Teach the shared loader what this renderer can decompress. Idempotent per renderer.
 *
 * Call once the GPU device exists. Safe to call again after the renderer is recreated —
 * switching backend changes the answer, and the transcoder itself is kept.
 */
export function initGltfLoaderSupport(renderer: KtxCapableRenderer): void {
    if (detectedFor === renderer) return;
    if (sharedKtx2 === null) {
        sharedKtx2 = new KTX2Loader();
        // Before detectSupport and before any load: the path is read when the transcoder is
        // first fetched, and that can be triggered by the very next GLB.
        sharedKtx2.setTranscoderPath(transcoderPath);
    }
    // Typed loosely on purpose: three types this as WebGPURenderer|WebGLRenderer, and the
    // engine's own renderer field is a union that does not narrow to either.
    (sharedKtx2 as unknown as { detectSupport(r: unknown): unknown }).detectSupport(renderer);
    detectedFor = renderer;
    // Retrofit the boot-time loaders. Three reads `ktx2Loader` when it parses a
    // file, not when the loader is built, so a loader handed out minutes ago
    // starts decoding KTX2 from its next load.
    for (const loader of awaitingKtx2) loader.setKTX2Loader(sharedKtx2);
    awaitingKtx2.clear();
}

/**
 * Announce a renderer whose device is on its way: `ready` settles once
 * `initGltfLoaderSupport` has run for it, or once it has failed to.
 *
 * Until then, a loader built before the device holds any file that uses `KHR_texture_basisu`
 * instead of failing it with `setKTX2Loader must be called before loading KTX2 textures`
 * (see THE BOOT RACE above). Every other file parses at once. If `ready` rejects, held files
 * parse anyway and fail with three's own error, as they did before this existed. Without an
 * announcement nothing is held, so a caller that never builds a renderer (the voxelizer in a
 * tool, a test) gets the immediate error rather than a load that never finishes.
 */
export function expectGltfLoaderSupport(ready: Promise<unknown>): void {
    const settled: Promise<void> = ready.then(release, release);
    function release(): void {
        // A later announcement (a renderer recreated mid-init) keeps its own hold.
        if (pendingDevice === settled) pendingDevice = null;
    }
    pendingDevice = settled;
}

type MeshoptDecoderApi = typeof ThreeMeshoptDecoder;

/** three's decoder, once the first compressed file has imported it and its WASM is compiled. */
let meshoptDecoder: MeshoptDecoderApi | null = null;
let meshoptDecoderLoading: Promise<MeshoptDecoderApi> | null = null;

function loadMeshoptDecoder(): Promise<MeshoptDecoderApi> {
    meshoptDecoderLoading ??= import('three/addons/libs/meshopt_decoder.module.js').then(
        async ({ MeshoptDecoder }) => {
            await MeshoptDecoder.ready;
            meshoptDecoder = MeshoptDecoder;
            return MeshoptDecoder;
        },
    ).catch((err: unknown) => {
        // A failed fetch (the CDN lanes) must not fail every later file too: the next one retries.
        meshoptDecoderLoading = null;
        throw err;
    });
    return meshoptDecoderLoading;
}

function loadedMeshoptDecoder(): MeshoptDecoderApi {
    if (meshoptDecoder === null) throw new Error('meshopt decoder is not loaded yet; await its `ready` first');
    return meshoptDecoder;
}

/**
 * Stand-in for three's `MeshoptDecoder` that imports the real one on first use (see the
 * header). GLTFLoader reads `supported` when it meets a compressed buffer view and then calls
 * `decodeGltfBufferAsync`, so the import happens inside that promise. `ready` loads it too,
 * and the synchronous decoders work after `ready`, as with the real decoder.
 */
const lazyMeshoptDecoder: MeshoptDecoderApi = {
    // What the real module reports when it cannot run; three reads this before decoding.
    supported: typeof WebAssembly === 'object',
    get ready(): Promise<void> {
        return loadMeshoptDecoder().then(() => undefined);
    },
    decodeGltfBufferAsync: (count, size, source, mode, filter) =>
        loadMeshoptDecoder().then((decoder) => decoder.decodeGltfBufferAsync(count, size, source, mode, filter)),
    useWorkers: (count) => {
        loadMeshoptDecoder().then((decoder) => decoder.useWorkers(count), (err: unknown) => console.error(err));
    },
    decodeVertexBuffer: (...args) => loadedMeshoptDecoder().decodeVertexBuffer(...args),
    decodeIndexBuffer: (...args) => loadedMeshoptDecoder().decodeIndexBuffer(...args),
    decodeIndexSequence: (...args) => loadedMeshoptDecoder().decodeIndexSequence(...args),
    decodeGltfBuffer: (...args) => loadedMeshoptDecoder().decodeGltfBuffer(...args),
};

/**
 * A GLTFLoader that decodes everything this engine supports.
 *
 * Use this instead of `new GLTFLoader()`. A loader built before the device
 * exists is remembered and wired up by `initGltfLoaderSupport`, and holds a KTX2
 * file that arrives before the device, so boot order cannot decide whether an
 * asset is readable — which it did, silently, for anything holding
 * `engine.loader` across startup.
 */
export function createGltfLoader(): GLTFLoader {
    const loader = new GLTFLoader();
    // Device-independent, so attached now rather than queued like KTX2 below.
    loader.setMeshoptDecoder(lazyMeshoptDecoder);
    if (sharedKtx2) {
        loader.setKTX2Loader(sharedKtx2);
    } else {
        awaitingKtx2.add(loader);
        holdKtx2UntilDevice(loader);
    }
    return loader;
}

/**
 * Make an early loader wait for the device before parsing a file that needs KTX2.
 *
 * `load` and `loadAsync` reach `parse` through `this`, and `parseAsync` calls it too, so
 * shadowing `parse` on the instance covers them all. The prototype's `parse` is looked up at
 * call time, so a game-side patch of `GLTFLoader.prototype.parse` still runs.
 */
function holdKtx2UntilDevice(loader: GLTFLoader): void {
    loader.parse = function (data, path, onLoad, onError) {
        const parse = (): void => GLTFLoader.prototype.parse.call(loader, data, path, onLoad, onError);
        if (loader.ktx2Loader !== null || pendingDevice === null || !usesKtx2(data)) {
            parse();
            return;
        }
        void untilDeviceSettles(loader).then(() => {
            // GLTFLoader.load's try/catch is gone by now, so a synchronous throw is routed here.
            try {
                parse();
            } catch (err) {
                if (onError) onError(err as ErrorEvent);
                else console.error(err);
            }
        });
    };
}

async function untilDeviceSettles(loader: GLTFLoader): Promise<void> {
    while (loader.ktx2Loader === null && pendingDevice !== null) await pendingDevice;
}

/**
 * Does this glTF use `KHR_texture_basisu`? Reads only the JSON chunk of a GLB.
 *
 * A plain substring test: a false positive (a node named after the extension) costs only a
 * wait for the device.
 */
function usesKtx2(data: unknown): boolean {
    if (typeof data === 'string') return data.includes(KTX2_EXTENSION_JSON);
    if (data instanceof ArrayBuffer) return gltfJsonText(data).includes(KTX2_EXTENSION_JSON);
    // Three also accepts an already-parsed JSON object.
    const used = (data as { extensionsUsed?: unknown } | null)?.extensionsUsed;
    return Array.isArray(used) && used.includes(KTX2_EXTENSION);
}

const GLB_MAGIC = 0x46546c67; // 'glTF'
const GLB_CHUNK_JSON = 0x4e4f534a; // 'JSON'

function gltfJsonText(data: ArrayBuffer): string {
    const view = new DataView(data);
    const isGlb = data.byteLength >= 20
        && view.getUint32(0, true) === GLB_MAGIC
        && view.getUint32(16, true) === GLB_CHUNK_JSON;
    const bytes = isGlb
        ? new Uint8Array(data, 20, Math.min(view.getUint32(12, true), data.byteLength - 20))
        : new Uint8Array(data);
    return new TextDecoder().decode(bytes);
}

/** True once a renderer has reported its formats — for tests and diagnostics. */
export function gltfLoaderSupportsKtx2(): boolean {
    // `detectedFor` alone is the answer: it is only ever set after `sharedKtx2` exists, and
    // dispose clears the two together.
    return detectedFor !== null;
}

/**
 * How many handed-out loaders are still waiting to be told about KTX2 — for tests
 * and diagnostics.
 *
 * The attachment itself cannot be asserted under Jest (see this module's test),
 * but the queue that drives it can: non-zero before a renderer is seen, zero
 * after. A regression in either direction changes this number.
 */
export function gltfLoadersAwaitingKtx2(): number {
    return awaitingKtx2.size;
}

/** True once a meshopt file has made the loaders import the decoder — for tests and diagnostics. */
export function gltfMeshoptDecoderLoaded(): boolean {
    return meshoptDecoder !== null;
}

/**
 * Drop the worker pool. Called when the engine tears down; the next
 * `initGltfLoaderSupport` builds a fresh one.
 */
export function disposeGltfLoaderSupport(): void {
    sharedKtx2?.dispose();
    sharedKtx2 = null;
    detectedFor = null;
    awaitingKtx2.clear();
    // Holds nothing new. A parse already held goes ahead when its device settles.
    pendingDevice = null;
}
