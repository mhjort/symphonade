# Hero characters (experimental, opt-in)

`engine/hero/HeroCharacter.ts` is a new adapter for reconstructed game characters. It does not
modify the voxel/low-poly paths, infer skin from material names, or import MetaHuman DNA.
It currently provides explicitly assigned PBR materials, approximate skin backscatter on both
renderer paths, semantic morph controls, temporal smoothing and multiplicative correctives.
This is an experimental feature, not a claim of MetaHuman feature or visual parity.

Use the existing skinned `characterUrl` path to load the package's `character.glb`. Keep the
existing player/controller setup and body animation. Once loaded, adopt its actual root:

```ts
import { HeroCharacter } from 'engine/hero/HeroCharacter.js';
import type { HeroCharacterDefinition } from 'engine/hero/HeroCharacterDefinition.js';

// definition is the package's hero.json, decoded/validated by the caller.
// Receive definition: HeroCharacterDefinition as a parameter to the setup method.
const root = this.playerLoader.getSkinnedSkeletonRoot();
if (!root) throw new Error('Hero character requires the loaded skinned model');
const hero = new HeroCharacter(root, definition);

// Supply a complete expression frame, then apply after body/mixer animation each frame.
hero.face.setFrame({ jawOpen: 0.4, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 });
hero.face.advance(deltaTime, 0.06);

// At character teardown, before disposing the engine-loaded model:
hero.dispose();
```

The definition has `type: 'hero-character'`, `version: 1`, a stable `id`, `surfaces`, `controls`
and `correctives`. This is a package discriminator, **not a new accepted world.json character
type**. Explicit adoption is required; no default loader recognizes the sidecar automatically.
If loading a standalone GLB, use `createGltfLoader()` as for every other engine asset.

Surface entries name each unique material, assign its kind (`skin`, `cloth`, `hair`, `eye`,
`teeth`, `leather`, `fur`, `metal`, `other`), roughness, specular intensity and scatter `{color, strength}`.
Color is `#rrggbb`; scalar values are finite [0,1]. Only skin has nonzero scatter. Texture maps,
alpha behavior, normals, UV transforms and vertex colors are preserved from the loaded source.
Roughness is the usual glTF multiplier of its authored roughness map. Eyes receive a clearcoat;
cloth/fur receive sheen; hair receives anisotropy. These are physical surface approximations,
not a dedicated strand-scattering model.

Controls map semantic names to arrays of `{mesh, target, gain}`. Exact, unambiguous mesh and
target names are required. A control may drive several meshes; multiple controls may sum into
one slot. Correctives contain `drivers` and one `binding`, with weight equal to the product of
their normalized driver values. Bound outputs are clamped to 1 and added to the captured neutral
weights. Bind in the neutral pose. This is a compact morph evaluator, not a general rig graph.

`setFrame` replaces the complete expression frame and resets omitted controls to zero. Invalid
names/NaNs/out-of-range values reject the frame before changing state. Merge speech, blink and
expression upstream; there is no audio/viseme generation or automatic blink scheduler yet.
`advance(dt, responseSeconds)` is deterministic and takes engine time; zero response applies
the target exactly. It does not alter body bones or unbound morph slots.

The adapter validates all bindings/material assignments before mutating the scene. It prevents
adopting the same root twice and creates separate material instances. `dispose()` is idempotent,
restores original materials and neutral bound morph values, and disposes only materials it owns.
Textures, geometry and skeletons remain caller-owned. Do not call the face controller after
teardown. Separate characters need separate cloned skinned roots and morph influence arrays.

## Current limits and quality gate

The adapter assumes a prepared package: a skinned `character.glb` with named facial morph
targets, separate materials per surface, and a `hero.json` definition naming them. Nothing in
the engine builds that package. Assets need per-anatomy review: there is no automatic face
retopology, groom, dynamic wrinkle system, LOD chain or audio lip-sync, and extreme combined
morphs may need artist correction.

The SSS term is a low-cost backscatter approximation, not a diffusion profile. It uses a uniform
strength per skin material, with no per-texel thickness or dynamic wrinkles. The WebGPU node
implementation and the WebGL shader adapter use the same tint and exponent. The WebGL adapter
asserts its Three.js light-chunk hook, so a dependency change fails visibly.

Run `pnpm run check`, the hero Jest tests and `node scripts/hero-material-smoke.mjs` from `game/`.
The smoke test compiles and renders a synthetic skinned, morphed sphere on real browser backends
and records which backend ran; a fallback is not counted as WebGPU coverage. It is not character
QA. Before using a character in a game, reimport the exported GLB, test facial combinations and
body clips on both backends, and record image evidence and performance for that exact package.

## Registered skin renderer

A second opt-in path uses `CharacterSurfaceMaterials`, `SkinAtlasDetail`,
`SkinDiffusionKernel`, `SkinDiffusionPass`, `SkinTransmissionPass` and
`SkinAppearanceState`. It is separate from the `HeroSurface` profile adapter described
above; [character-surfaces.md](character-surfaces.md) covers its asset contract.

Load the GLTF material's `skinAtlasTexture` and `skinExpressionTexture` extras through
its parser, then call `createCharacterSurfaceMaterial(source, atlas, transmissionPass,
expressionAtlas, appearanceState)`. The geometry must supply `_face_uv` and
`_face_weight` (GLTF custom attributes `_FACE_UV`, `_FACE_WEIGHT`). Atlas data are
linear, not sRGB. Set an explicit material environment map and intensity for the second
IBL lobe. Keep shared environment textures alive when disposing a character; dispose its
owned detail textures separately.

Render `transmissionPass.render(renderer, scene, character, keyDirectionalLight)`
before beauty/SSS. Coordinates are metres. `SkinDiffusionPass.radiusMm` is the support
radius in millimetres, default 3. The pass has a single RGB profile per instance.
Specular stays outside the diffusion filter. Expression material state can be driven
with the same named control frame as a facial rig, but does not itself move geometry.

Release cached extraction materials when source material properties change, and
dispose both passes at teardown. This is not yet a frame-budgeted multi-character
renderer, and makes no claim of MetaHuman parity.
