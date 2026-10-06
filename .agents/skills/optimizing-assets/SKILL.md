---
name: optimizing-assets
description: Make this game's models and textures smaller and faster to load with no visible change. Measure the download, GPU memory and triangles; classify each asset by how close the player gets; compress its textures (KTX2, WebP, JPEG) and vertex buffers (meshopt, quantization) with the shipped optimize-glb.mjs presets; A/B it in the game, then swap it in. Use when the creator asks to optimize, compress, shrink or slim assets, cut the download size or load time, reduce memory, fix a slow first load on phones, or prepare a mobile game for publishing.
---

# Optimizing assets

A shipped game's download is mostly a handful of GLBs, and most of their bytes are things the player
never sees: 2048² maps on a rock seen from 40 m, float32 normals, a second rig nobody animates. Two
games shipped with this recipe. Squall Riders' phone download went 43.3 → 13.5 MiB; Trick or Roll's
stages went 92 → 28 MB and its animals 17.9 → 1.7 MB. Both results passed an in-game A/B.
You measure first, then choose one preset per asset class from one script. The script enforces the
safety rules, and nothing ships until the player's view says so.

The scripts are in `.agents/skills/optimizing-assets/scripts/`: `optimize-glb.mjs` encodes and
`ab-compare.mjs` scores an A/B. Run them from the project root with `node`: the encoder reads
`src/` and `engine/` for the node names code uses, and refuses to run where neither exists. They
never edit `world.json` and never overwrite their input. Optimizing is the last step (see 6.4).

## 1. Measure before touching anything

```sh
O=.agents/skills/optimizing-assets/scripts/optimize-glb.mjs
node $O --audit src/work/world.json   # every asset row by bytes, cumulative %, and what refers to it
node $O --report big.glb              # triangles, textures (format, size, bytes), estimated GPU memory
```

- **Fetch each GLB into a work directory**, e.g. `.bitmagic/optimize/<asset>/` (git ignores
  `.bitmagic/`). Get it from its row's `url`, record its SHA-256, and never edit the only copy.
  Keep per-asset work out of this skill folder, because `bitmagic upgrade` rewrites it.
- **Start from the original, never from a variant.** Rows marked `(variant?)`, and files whose
  report says `already EXT_meshopt_compression`, are earlier optimized copies. Re-encoding one
  stacks the losses, so find the original row or URL first.
- **Rank by what players actually download.** A row without a recorded size is sized by a HEAD
  request (marked `~`) or listed first as `unknown`. `used` says what names the row: world.json,
  code, or nothing. Neither proves a fetch, so confirm in `bitmagic dev`'s network panel. In Squall
  Riders, 12 assets were 38.5 of 43 MiB.
- **Write down the baseline for each candidate:** transfer bytes, estimated GPU memory, triangles,
  and the total first download. Every later claim is measured against these numbers.
- **Out of scope:** voxel (`vxl`) rows (`bitmagic assets revoxelize` changes those) and audio.
  For images, see the end of [recipes](references/recipes.md).

## 2. Classify each asset by how the player sees it

Pick the class from the **closest distance a player can reach**, not the usual one. When you are
unsure, take the closer, less lossy class. Recipes, rejected alternatives and when to override are
in [recipes](references/recipes.md). "Measured" is this script's default on the original file.

| Class (preset) | What it is | What the preset does | Measured |
|---|---|---|---|
| `distant-prop` | landmarks, scenery, ~30 m or more away | simplifies (normal-weighted, bounds locked); one 512 ETC1S base map with AO baked in; normal and ORM maps dropped; 14-bit positions | beacon 4.45 MiB → 180 KiB, 61k → 10k triangles (bytes only: riders reach its rocks, see recipes) |
| `hero-prop` | sculpts and buildings passed at ~10–20 m | no simplification; 1024 JPEG 4:4:4 base and normal maps; 512 UASTC ORM; float positions | rock islet 4.93 → 1.71 MiB, SSIM ≥ 0.984 at 12 m |
| `character` | skinned or animated, fills the screen | float positions; exact int8 normals; every animation key kept; 1024 UASTC (RDO) atlas, a UASTC source kept as it is | penguin rider 2.43 → 1.58 MiB (0.69 at 512) |
| `code-driven` | vehicles, anything whose vertices, node positions or pixels code reads | float positions; base maps kept, the ORM/mask slot as lossless WebP (same pixels); never KTX2 | jet ski 1.26 → 0.70 MiB (0.40 at 512) |
| `level` | stages and level meshes | float positions and triangle order kept; normals int8, UVs 16-bit; textures untouched | a Trick or Roll stage 2.26 → 1.01 MiB |

**Phone variants differ per class.** For `character`, `code-driven` and `level`, add
`--max-texture=512`: a kept texture is resized in its own format, and a base map stays paired with
its mask. `distant-prop` is already 512. `hero-prop`'s default already is Squall Riders' phone set:
at 512 the islet scored 0.906–0.940 at 12 m, so do not go lower without passing that A/B.

**Check what code reads before you choose.** The script scans `src/` and the vendored engine for the
node names code compares. It also warns about game files that parse GLB bytes themselves (collision
read from a stage file, `bufferViews`), because the engine's decoder never reaches them. Give such a
parser the meshopt decoder and normalized-int handling, or use `--meshopt=off` and still check that
it reads int8 normals.

## 3. Tools: check first, ask before installing

```sh
ls ~/.bitmagic/tools/gltf/node_modules/@gltf-transform/core ~/.bitmagic/tools/ktx/bin/ktx
```

If both exist, go on. If not, installing them downloads about 70 MB. **Ask the creator first**, then
follow [tools](references/tools.md): pinned versions, no-sudo steps for macOS, Linux and Windows,
and the shared README. Never run the plain `gltf-transform meshopt` or `etc1s` commands on game
assets, whatever an older `~/.bitmagic/tools/README.md` suggests: they quantize skinned and named
meshes and encode normal maps as ETC1S. The script warns when the installed versions differ from
the ones it was tested with. On Windows, [tools](references/tools.md) has PowerShell equivalents.

## 4. Run the script

```sh
node $O in.glb out.glb --preset=distant-prop
node $O in.glb out-mobile.glb --preset=character --max-texture=512   # a phone variant
```

`--help` lists the overrides. Change **one variable at a time** and keep each output. These rules
hold on every run, and no flag turns them off:

- The vertex layout is SEPARATE, and normals and tangents are int8.
- Skinned or morphed files keep float32 positions.
- Mesh nodes that code reads keep float positions and their exact TRS, and are not simplified:
  `BM_*` engine nodes, names that `src/` or `engine/` compares node names against (literals,
  `startsWith`/`includes` arguments, regex words), and anything given with `--keep-float`.
- Empty nodes are never pruned, nodes and materials are never renamed, and no texture is folded
  into a material colour (a solid-white mask is still a texture code paints into).
- Simplification locks the bounding box.

The script prints before and after numbers, every texture's format and size, notes and checks:
node names, texture slots, paired sizes (`code-driven`), layout, kept nodes, skinned positions,
bounds drift, smaller, and the Khronos validator. **Exit code 1 means do not ship this output.**
Read every note; each is a decision:

- **`kept exact`** names the file and string that matched. A false match only costs bytes. To drop
  one, rerun with `--code=none --keep-float=<the nodes code really reads>`.
- **`positions quantized: … a different transform`** lists named nodes whose origin moved. If code
  reads the position of one (a lamp, an anchor), add it with `--keep-float`.
- **`AO not baked`** (the occlusion map uses other UVs or a texture transform), a metalness warning,
  or `already EXT_meshopt_compression` (you started from a variant).
- **`KTX2 kept as it is`**: a library atlas already in the slot's encoding is not encoded twice.
  An explicit slot spec re-encodes it for fewer bytes; that output must pass the A/B on its own.
- **`names the clip`**: code plays a clip `--only-default-scene` or `--drop-animations` removed.
- `TEXCOORD_0 leaves 0-1` is harmless: tiling UVs stay float. glTF-Transform prints it as
  `quantize: Skipping TEXCOORD_0; out of [0,1] range.`

## 5. The engine must decode what the script writes

Check the vendored engine's source, not its version: a build number does not say which fixes it
carries. A grep that prints 0 (or a missing file) is a gap:

```sh
ls engine/engine/loaders/GltfLoaderSupport.ts                            # missing: no KTX2 at all
grep -c setMeshoptDecoder engine/engine/loaders/GltfLoaderSupport.ts     # meshopt decodes
grep -c expectGltfLoaderSupport engine/engine/loaders/GltfLoaderSupport.ts   # KTX2 waits for WebGPU
grep -c packedFloats engine/engine/GLBVoxelizer.ts                       # voxelizes quantized files
grep -rlE "setMeshoptDecoder|meshoptDecoder" src/                        # a game-side decoder
grep -rlE "gltfLoaderSupportsKtx2|KHR_texture_basisu" src/               # a game-side KTX2 wait
```

- **meshopt** (every preset): with no decoder, a meshopt GLB fails with `setMeshoptDecoder must
  be called`. A game-side decoder in `src/` covers it.
- **KTX2 on WebGPU** (`character`, `hero-prop`, `distant-prop`): without the wait, a KTX2 GLB that
  arrives before the renderer's `init()` (a smaller file arrives sooner) fails with `setKTX2Loader
  must be called`. A `src/` shim covers it only if the last grep finds it: Squall Riders' waits,
  Trick or Roll's does not. With no `GltfLoaderSupport.ts` (before September 2026), no loader
  reads KTX2 at all. Without `packedFloats`, `bitmagic assets revoxelize` misreads quantized files.

When a check fails, pick one:

1. `bitmagic upgrade`. Read its `--help` first: it refuses a dirty working tree. Then grep again.
2. `--meshopt=off` (quantization only, which three reads natively; 20–60% larger) and, where KTX2
   fails, no KTX2: `--base=webp:1024:90`, plus `--orm=webp-lossless:512` where the preset writes
   UASTC. With no `GltfLoaderSupport.ts` that is every asset, not only those loaded during boot.
3. The game-side shim in [runtime](references/runtime.md), or the half an existing `src/` shim
   lacks. Its KTX2 wait needs `GltfLoaderSupport.ts`. Delete it once an upgrade passes the greps.
   The dev asset panel runs no game code, so it cannot open meshopt files: verify in the game.

## 6. A/B, then swap it in

1. **A/B before anything is uploaded.** Under `bitmagic dev` the candidate is served from its work
   directory (`/.bitmagic/optimize/<asset>/out.glb`), and the preview module in
   [runtime](references/runtime.md) loads it in place of the original on `?preview=1`: one build
   shows both. A game that already rewrites asset URLs needs its originals override on both sides
   (runtime says how to tell). Confirm the swap happened, capture the views in
   [verification](references/verification.md), score them with `ab-compare.mjs`, and show the
   creator the sheet. Delete the preview module afterwards.
2. **Re-read `src/work/world.json`.** Note the row's `id`, `name`, `type` and `targetHeight`, and
   every reference to its id **and** its URL: `grep -rn "<id>\|<file name>" src/`. The player's
   model is `worldProfileData.characterUrl`, a URL, and skies and code often load by URL too.
3. **Swap it in, by the row's type:**
   - **`glb`:** `bitmagic assets add out.glb --keep-glb --asset-id <id> --name <its name> --height <its targetHeight>`.
     The new record wins field by field: leaving out `--name` renames the asset to the file name,
     and leaving out `--height` resets it to 2 m. Then edit the row's `sourceGlbUrl` back to the
     original URL, because the replace points it at the optimized file. Placements follow the id;
     every URL reference from step 2 needs the new URL.
   - **Any other type** (`character`, `polygon-mesh`, `gltf`): not in place. `--keep-glb` would turn
     the row into a 2 m `glb`: refused under id references without `--force`, silent otherwise.
     Add a new row with `bitmagic assets add out.glb --keep-glb --name <name>_opt` and point each
     reference from step 2 at it: `characterUrl` gets the new URL, code the new id or URL. For many
     rows, or per-device sets, use the variant map in [runtime](references/runtime.md) instead.
4. **Optimization is the last step, so keep the original importable.** Blender cannot import
   meshopt or KTX2, a voxel bake wants full detail, and an engine without `packedFloats` (step 5)
   misreads quantized attributes when it voxelizes. Rigging, skin authoring, Blender edits and
   `bitmagic assets revoxelize` start from the original file or URL; then re-run the preset on
   their result. Record the original URL and SHA-256 next to the new URL in the work directory,
   so a rollback is one command.

## 7. Verify after the swap: all three verdicts

1. **Numbers:** the script's report per asset, then the game's total first download before and
   after, from the network panel with the cache disabled.
2. **Decode:** play the scene that uses the asset. The console must show no `setMeshoptDecoder`,
   `KTX2` or WebGPU pipeline errors. Run `bitmagic verify`. After a `glb` swap the dev asset panel
   shows `sourceGlbUrl`, the original, so it proves nothing about the new file. Open
   `/asset-preview?kind=glb&url=<new URL, encoded>` on the dev view: the vendored engine's loader.
3. **Look:** capture the step 6.1 views again, with the swapped asset and no preview, and compare
   them with the original captures. That proves the game loads what you tested.

Keep the numbers verdict and the visual verdict separate. A good SSIM does not approve a look. Show
the creator the A/B sheet; the look is theirs to call.

## Pitfalls, and why each one bites

- **Interleaved quantized vertex buffers** crash WebGPU pipeline creation (`unorm32x4 is not a
  valid enum`).
- **int16 normals with tangents** drew camouflage blotches on WebGPU, on both desktop and phone.
- **Quantized positions on a skinned mesh** rewrite its inverse bind matrices, so code that reads
  the bind pose silently mis-poses the character.
- **Quantized positions on a named mesh node** move its origin (lamp centres, anchors) or push the
  mesh onto an unnamed child.
- **Quantized positions under `positionLocal` or noise materials, or merged batches,** make the
  pattern swim and reopen coplanar seams. Use `level` or `--pos-bits=0`.
- **`prune()` with default options** deletes empty marker nodes (spawns, items, goals) and folds a
  solid-colour texture into its material colour, which deletes a mask code paints into.
- **ETC1S up close** blotches colour, and on a hero prop it came out larger than the JPEG.
- **Lossy WebP for normal maps** is always 4:2:0. Use JPEG 4:4:4 or UASTC.
- **KTX2 on pixels code reads** (`getImageData`, livery masks) makes them unreadable. That is what
  `code-driven` is for.
- **The game's first KTX2 texture** adds the Basis transcoder download (~0.25 MB). For a lone small
  atlas, `--base=webp:512:90` avoids it.
- **Simplifying a sculpt** loses the detail that lives in its vertex normals. Every attempt on the
  hero props failed the A/B.
- **A shrunken bounding box** makes the engine rescale and re-centre the prop to its targetHeight.
- **Downsizing an atlas without filling its gutters** bleeds dark seams. The script fills them.
- **Baking AO and dropping the ORM map** shifts brightness by up to about 5–10%. Check luminance in
  the A/B.
- **The octahedral normal filter** is about 1° off and also filters animation. Characters stay exact.
- **A loaded machine** auto-drops the quality tier mid-capture. Pin it with `?quality=<rung>`.
- **Quantized attributes are padded to a 4-byte stride** (int8 normals to 4 bytes, int16 positions
  to 8), with or without meshopt. Code reading attribute arrays directly then gets an
  `InterleavedBufferAttribute`: read values through `getX()`, which also denormalizes them.
