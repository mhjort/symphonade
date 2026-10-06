# Runtime: older engines, the A/B preview and per-device variants

## A game-side decoder shim, for an engine without the decoder or the KTX2 wait

SKILL.md step 5 greps the vendored engine for each half. An engine whose `GltfLoaderSupport.ts`
has no `setMeshoptDecoder` cannot load `EXT_meshopt_compression`. One with no
`expectGltfLoaderSupport` attaches the KTX2 loader on WebGPU only after the renderer's `init()`: a
KTX2 GLB whose parse starts before that fails with `setKTX2Loader must be called before loading
KTX2 textures`, and an optimized file, being smaller, arrives sooner. An engine with both does
this in `createGltfLoader`. First choice: `bitmagic upgrade`, then grep again. Second:
`--meshopt=off`, and non-KTX2 textures. Third, when the game must ship now: add this file and
import it first thing in the game's entry module, before anything loads a GLB.

- **A shim already in `src/`** counts only for the half it has. Squall Riders' `GltfDecoders.ts`
  sets the decoder and waits for KTX2. Trick or Roll's sets only the decoder, so KTX2 assets there
  need the wait below added to it, or non-KTX2 slot specs (`--base=webp:1024:90`).
- **No `engine/engine/loaders/GltfLoaderSupport.ts`** (engines from before September 2026): the
  engine reads no KTX2 anywhere, and the `gltfLoaderSupportsKtx2` import below does not compile.
  Keep the decoder half: drop that import, `needsKtx2` and the wait, and call `parse` directly.
  Give every asset non-KTX2 slots.

```ts
// src/work/GltfDecoderShim.ts: delete it once an upgrade passes SKILL.md step 5's engine greps.
// Wraps GLTFLoader.prototype.parse once, so it covers every loader, including the ones the engine
// builds, which game code cannot reach. It never replaces a decoder or KTX2 loader already set.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';   // the engine's exact specifier
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gltfLoaderSupportsKtx2 } from 'engine/loaders/GltfLoaderSupport.js';

type Parse = GLTFLoader['parse'];
type Fields = { meshoptDecoder: unknown; ktx2Loader: unknown };
const proto = GLTFLoader.prototype as unknown as { parse: Parse; decoderNotice?: string };

/** Does this GLB (or glTF JSON) use KHR_texture_basisu? Reads the JSON chunk only. */
function needsKtx2(data: unknown): boolean {
    if (typeof data === 'string') return data.includes('"KHR_texture_basisu"');
    if (!(data instanceof ArrayBuffer) || data.byteLength < 20) return false;
    const view = new DataView(data);
    const isGlb = view.getUint32(0, true) === 0x46546c67;
    const start = isGlb ? 20 : 0, length = isGlb ? view.getUint32(12, true) : data.byteLength;
    const json = new TextDecoder().decode(new Uint8Array(data, start, Math.min(length, data.byteLength - start)));
    return json.includes('"KHR_texture_basisu"');
}

if (!proto.decoderNotice) {
    // Kept as a string: minifiers strip the decoder's licence comment, and MIT asks for the notice.
    proto.decoderNotice = 'meshoptimizer decoder, MIT License, Copyright (c) Arseny Kapoulkine';
    const parse = proto.parse;
    proto.parse = function (this: GLTFLoader, ...args: Parameters<Parse>): void {
        const self = this as unknown as Fields;
        self.meshoptDecoder ??= MeshoptDecoder;   // GLTFLoader reads it when it parses, not when built
        if (self.ktx2Loader || gltfLoaderSupportsKtx2() || !needsKtx2(args[0])) return parse.apply(this, args);
        // A KTX2 file that beat the renderer's init: wait (up to 20 s) for the engine to attach KTX2.
        const started = performance.now();
        const tick = (): void => {
            if (!self.ktx2Loader && !gltfLoaderSupportsKtx2() && performance.now() - started < 20000) {
                setTimeout(tick, 30);
                return;
            }
            try {
                parse.apply(this, args);
            } catch (err) {   // a deferred throw must still reach the caller's onError
                const onError = args[3];
                if (onError) onError(err as ErrorEvent); else console.error(err);
            }
        };
        setTimeout(tick, 30);
    } as Parse;
}
```

The decoder module embeds its WebAssembly, so it needs no second file. It is still a module: in the
CDN lane, whose import map points `three/addons/` at esm.sh, it is one more request (~8 KB gzip);
single-file builds inline it. Squall Riders and Trick or Roll vendored a copy into `src/`, so
their CDN-lane publish bundles it instead of fetching it. Squall Riders shipped both halves before
the engine took them over. Run `bitmagic check`, then decode the asset in the game as in
[verification](verification.md): the dev asset panel does not load game code, so it cannot open
meshopt files under this shim.

## Previewing a candidate without uploading it (A/B)

`bitmagic dev` serves the project folder, so a candidate in `.bitmagic/optimize/<asset>/` is at
`/.bitmagic/optimize/<asset>/out.glb`. This temporary module swaps it in for the original URL on
`?preview=1`, for every engine loader, without touching world.json. Import it first in the game's
entry module, run the A/B, then delete the file and its import.

```ts
// src/work/AssetPreview.ts: TEMPORARY, for an A/B under `bitmagic dev`. Delete it after the A/B.
import * as THREE from 'three';

/** The row's `url` -> the candidate in its work directory. */
const PREVIEW: Record<string, string> = {
    'https://<the original url>.glb': '/.bitmagic/optimize/<asset>/out.glb',
};

if (new URLSearchParams(window.location.search).has('preview')) {
    // Every GLTFLoader and TextureLoader the engine builds fetches through this manager.
    const manager = THREE.DefaultLoadingManager;
    const resolve = manager.resolveURL.bind(manager);
    const swapped = new Set<string>();
    manager.resolveURL = (url: string): string => {
        const candidate = PREVIEW[url];
        if (candidate && !swapped.has(url)) {   // logged on a real hit only, never at boot
            swapped.add(url);
            console.info('[preview] swapped', url, '->', candidate);
        }
        return resolve(candidate ?? url);
    };
}
```

- **Confirm the swap before capturing.** The `[preview] swapped` line appears only when the engine
  asks for a mapped URL, and the network panel must show the `/.bitmagic/optimize/…` request. With
  neither, the key differs from the URL the engine fetches (a query string, another encoding, a
  variant), the "candidate" capture is the original, and the A/B passes at the noise floor.
- **A game that rewrites asset URLs itself** (`grep -rlE "resolveURL|setURLModifier" src/`, such
  as the variant map below) wraps the same function later, at game start, so its rewrite runs
  first: the original URL becomes its variant before this module sees it. The candidate never
  loads, and both sides show the variant. Capture both sides with that game's originals override
  (Squall Riders: `?preview=1&assets=orig` against `?assets=orig`). That also makes the original,
  not a variant, the baseline.
- The published bundle has no `/.bitmagic/` folder, which is one more reason the module must go
  before a publish.

## Per-device variants (optional)

One optimized set, swapped in, is usually enough. Squall Riders' creator saw no difference and
moved every device to the phone set. Reach for variants when the phone set is visibly worse on a
large screen, or when the asset is a `character` or other non-`glb` row, which cannot be replaced
in place. The pattern, not a framework:

- **Rows:** keep the original rows byte-identical. Add each variant as its own row, named after the
  original with a suffix (`bitmagic assets add <file> --keep-glb --name <name>_mobile`). A new row
  gets a new id, and nothing places it.
- **The map:** a small module in `src/work/` maps each original asset id or URL to
  `{ hq, mobile }` variant URLs.
- **The decision:** make it once per page load from the device quality tier, the engine's answer
  to what a device can afford (the engine's `DeviceQuality.ts`). `activeDeviceQualityTier()` of
  `low` or `minimal` gets the small set, and so does a phone-sized screen
  (`min(screen.width, screen.height) < 600` CSS px), which cannot show the difference anyway.
  Everything else gets hq. Do not decide by `isMobileRuntime()`: it answers the UI question (a
  small touch screen), not capability, so a Steam Deck would get the phone set and a slow Chromebook
  the hq one. The auto-tuner can lower the tier later, but by then the assets are loaded. Log the
  decision once at boot.
- **Override:** `?assets=orig|hq|mobile|auto` on the URL, for A/B captures and a one-page rollback.
  It wins over the tier, including a tier pinned with `?quality=`.
- **Loads the engine owns** (placed props, the player character): rewrite the URL at fetch time,
  as the preview module above does: wrap `THREE.DefaultLoadingManager.resolveURL` so it maps
  original → variant for registered URLs only. **Never write variant URLs into `world.json` or its
  in-memory copy.** The editor would save them back.
- **Fallback:** if a variant fails to load, retry the original once, then report the error as
  before.
- **Rollback:** make the decision function return `orig`, or empty the map.

The same device decision can drive non-asset savings too. SR skipped music on phones (−1.04 MiB)
and capped a code-painted livery canvas at 512.
