/**
 * Where the engine's own files come from: the default character rig, the built-in animation
 * library, the animal packs and the Basis transcoder. One provider answers for all of them, so a
 * game can run from the Bitmagic CDN, from its creator's own static host, or from a GitHub Pages
 * asset site without editing a URL anywhere else. See game/docs/hosting.md.
 *
 * Keep this module dependency-free: AnimationAssets imports it, and Node's standalone manifest
 * builder (`scripts/generate-asset-manifest.mjs`) and the CLI's packaging lanes import
 * AnimationAssets.
 */

export interface EngineHosting {
    id: 'bitmagic-cdn' | 'self-hosted';
    /** The default character rig. `primary` is tried first, `fallback` after two failed attempts. */
    characterRig: { primary: string; fallback: string };
    /** The original imported Mixamo library (`activeLibrary: 'cdn'`), for engines pinned before `'generated'`. */
    legacyAnimationBaseUrl: string;
    /** The hand-authored library and its packs (see docs/authoring-animations.md). */
    generatedAnimationBaseUrl: string;
    /** Motion-capture Walk and Run (`Walking.glb`, `Running.glb`). */
    capturedLocomotionBaseUrl: string;
    /** Motion-capture directional set (`Jog_*`, `Run_*`, `Sidestep_*`). */
    capturedDirectionalBaseUrl: string;
    /** The one melee clip of the legacy `'cdn'` library. */
    legacyMeleeClipUrl: string;
    /** @deprecated Skeleton animal rigs: nothing loads them, and the files are gone (see `AnimationAssets.animalBaseUrl`). */
    animalSkeletonBaseUrl: string;
    /** Voxel animal bodies (`VOXEL_ANIMAL_FILES`). */
    voxelAnimalBaseUrl: string;
    /** Voxel fish bodies (`VOXEL_FISH_FILES`). */
    voxelFishBaseUrl: string;
    /**
     * Directory holding `basis_transcoder.js` and `.wasm`, or `null` for the engine's default:
     * jsDelivr's copy for the running three revision (see GltfLoaderSupport).
     */
    basisTranscoderPath: string | null;
}

/**
 * Bitmagic's CDN. Every value is one complete literal on purpose: the iOS and Poki packaging
 * lanes find these base URLs as string literals in the bundled HTML and rewrite them to vendored
 * copies (cli/src/package/transform.ts), and published games' bundled-asset maps are keyed by
 * these exact strings.
 *
 * The brotli copies (`-br.glb`, `*_brotli/`) depend on the CDN answering with
 * `Content-Encoding: br`, which only a configured CDN can do. Paths are immutable: a new upload
 * goes to a new folder and the one line here changes.
 */
export const BITMAGIC_CDN_HOSTING: EngineHosting = {
    id: 'bitmagic-cdn',
    // DEFAULT CHARACTER RIG — NEVER DELETE OR OVERWRITE THESE FILES. Hosted with the other default
    // template assets in prod-v3-portal-website-bucket, uploaded with a one-year cache: ship a
    // change as -v3 and repoint both (portal/README.md, "Default template assets"). v2 is the
    // original v1 (kept beside it, unreferenced) run through the optimizing-assets skill's
    // optimize-glb.mjs --preset=character: EXT_meshopt_compression (decoded by createGltfLoader),
    // with positions, skeleton and every animation key left exact. Both are the same rig;
    // `primary` is the brotli copy.
    characterRig: {
        primary: 'https://bitmagic.ai/external-assets/characters/base-character-v2-br.glb',
        fallback: 'https://bitmagic.ai/external-assets/characters/base-character-v2.glb',
    },
    // Mirrored brotli-compressed; the uncompressed originals remain at worlds/v3/animations/.
    legacyAnimationBaseUrl: 'https://mini.bitmagic.ai/worlds/v3/animations_brotli',
    // Published by `tools/upload-generated-animations.mjs`. Every publish creates a NEW
    // datetime-stamped folder uploaded `immutable` with a one-year max-age, so nothing inside a
    // folder ever changes and no clip can be stale beside a fresh one. Iterating means: rebuild,
    // re-upload, change ONLY this line. Brotli, served with Content-Encoding: br (a curl built
    // without brotli shows garbage; that is curl, not the asset). To serve from the repo while
    // iterating, set this to '/animations/generated' — it sits under the dev server's root.
    generatedAnimationBaseUrl: 'https://mini.bitmagic.ai/worlds/v3/code_generated_animations/20260909-062358',
    capturedLocomotionBaseUrl: 'https://mini.bitmagic.ai/worlds/v3/captured_locomotion/20260909-094403',
    capturedDirectionalBaseUrl: 'https://mini.bitmagic.ai/worlds/v3/captured_locomotion/20260914-directional-v1',
    legacyMeleeClipUrl: 'https://magic-mesh-gen.sandbox.dev.bitmagic.cloud/worlds/v3/675J6VJ53GIO/animations/1773229936741-Standing Melee Attack Downward.glb',
    animalSkeletonBaseUrl: 'https://mini.bitmagic.ai/worlds/v3/animations/animals',
    // Voxel bodies for GlbAnimalBody, in prod-mini-cloudsave-bucket (uploaded by
    // tools/upload-voxel-animals.js), brotli with Content-Encoding: br. Fish have their own
    // folder so they are managed apart from land animals.
    voxelAnimalBaseUrl: 'https://mini.bitmagic.ai/worlds/v3/voxel_animals',
    voxelFishBaseUrl: 'https://mini.bitmagic.ai/worlds/v3/fishes_voxel_brotli',
    basisTranscoderPath: null,
};

/**
 * The file layout of a self-hosted asset site, relative to its root. The mirror script
 * (`scripts/mirror-engine-assets.mjs`) writes exactly this, with every file stored decoded, so
 * the host needs no special response headers — a plain static host or GitHub Pages serves it.
 */
export const SELF_HOSTED_LAYOUT = {
    characterRig: 'characters/base-character-v2.glb',
    legacyAnimations: 'animations/legacy',
    generatedAnimations: 'animations/generated',
    capturedLocomotion: 'animations/captured-locomotion',
    capturedDirectional: 'animations/captured-directional',
    legacyMeleeClip: 'animations/legacy-melee/standing-melee-attack-downward.glb',
    animalSkeletons: 'animals/skeleton',
    voxelAnimals: 'animals/voxel',
    voxelFish: 'animals/fish',
    basisTranscoder: 'basis/',
} as const;

/** Every engine file under `root` (any static host; absolute, or relative to the page), in {@link SELF_HOSTED_LAYOUT}. */
export function selfHostedHosting(root: string): EngineHosting {
    const base = root.endsWith('/') ? root : `${root}/`;
    const at = (path: string): string => `${base}${path}`;
    const rig = at(SELF_HOSTED_LAYOUT.characterRig);
    return {
        id: 'self-hosted',
        characterRig: { primary: rig, fallback: rig },
        legacyAnimationBaseUrl: at(SELF_HOSTED_LAYOUT.legacyAnimations),
        generatedAnimationBaseUrl: at(SELF_HOSTED_LAYOUT.generatedAnimations),
        capturedLocomotionBaseUrl: at(SELF_HOSTED_LAYOUT.capturedLocomotion),
        capturedDirectionalBaseUrl: at(SELF_HOSTED_LAYOUT.capturedDirectional),
        legacyMeleeClipUrl: at(SELF_HOSTED_LAYOUT.legacyMeleeClip),
        animalSkeletonBaseUrl: at(SELF_HOSTED_LAYOUT.animalSkeletons),
        voxelAnimalBaseUrl: at(SELF_HOSTED_LAYOUT.voxelAnimals),
        voxelFishBaseUrl: at(SELF_HOSTED_LAYOUT.voxelFish),
        basisTranscoderPath: at(SELF_HOSTED_LAYOUT.basisTranscoder),
    };
}

/**
 * A GitHub Pages asset site (e.g. `https://<org>.github.io/engine-assets`). Releases live under
 * versioned paths that never change in place, because Pages cannot send long cache headers.
 */
export function githubPagesHosting(siteUrl: string, version: string): EngineHosting {
    return selfHostedHosting(`${siteUrl.replace(/\/+$/, '')}/${version}/`);
}

export const DEFAULT_HOSTING: EngineHosting = BITMAGIC_CDN_HOSTING;

/** The `<meta name="bm:asset-host">` value that selects the Bitmagic CDN explicitly. */
export const BITMAGIC_CDN_HOST_ID = 'bitmagic-cdn';

/**
 * The provider a page asks for. `meta` is the content of `<meta name="bm:asset-host">` (`null`
 * when absent): absent or `bitmagic-cdn` is the default; anything else is the root of a
 * self-hosted asset site, resolved against `pageUrl` when relative.
 */
export function resolveHosting(meta: string | null, pageUrl: string | null): EngineHosting {
    const value = meta?.trim() ?? '';
    if (value === '' || value === BITMAGIC_CDN_HOST_ID) return DEFAULT_HOSTING;
    return selfHostedHosting(pageUrl === null ? value : new URL(value, pageUrl).href);
}

function readPageHosting(): EngineHosting {
    if (typeof document === 'undefined') return DEFAULT_HOSTING;
    const meta = document.querySelector('meta[name="bm:asset-host"]')?.getAttribute('content') ?? null;
    return resolveHosting(meta, document.baseURI);
}

/**
 * The provider in effect, read once when this module is evaluated. The page's meta tag is parsed
 * before any module runs, so every module-level URL constant derived from it (AnimationPacks,
 * CharacterConfig) agrees. Node — the manifest builder, the CLI — always sees the default.
 */
export const hosting: EngineHosting = readPageHosting();
