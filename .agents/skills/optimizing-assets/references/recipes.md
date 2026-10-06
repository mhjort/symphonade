# Recipes per asset class

Each preset below is what held up in a shipped game, with the numbers that justified it and the
alternatives that were measured and rejected. Override a preset only for a reason you can name, and
A/B the override the same way. "SR" is Squall Riders, a photoreal WebGPU racer. "TOR" is Trick or
Roll, a stylised ball game. SSIM is luma SSIM on the object (`ab-compare.mjs`'s `SSIM (luma,
object)`), original against new, at the stated view. "This script" numbers are `optimize-glb.mjs`
with the preset's defaults on the original file.

## distant-prop: seen from about 30 m or more

These read as silhouettes: landmarks, background ships, scenery. With this script, SR's beacon went
4.45 MiB → 180 KiB (61,487 → 10,349 triangles) and its trawler 4.02 MiB → 329 KiB (74,577 → 20,637).
SR's shipped set, four landmarks, went from 15.0 MB of originals to 0.84 MB and 8–12k triangles each,
with no visible change at race distance. That set also had per-region budgets and a Blender re-bake
on the trawler; its earlier phone set was 4.32 MB.

**The beacon shows the bytes, not a clean pass.** Riders can reach its rock ring (SR's collision
hulls stop a ski on the awash rocks), so by the closest-distance rule it is a `hero-prop`: 1.26 MiB,
SSIM 0.999 at 40 m in golden and storm light, and 0.958 (0.981 on the crop) at 15 m. As
`distant-prop`, in a neutral viewer at 40 m it scored 0.70–0.74 on the object and 0.875–0.887 on the
crop, its storm luminance ratio fell to 0.94 at one azimuth, and the rock visibly lost its
normal-map relief. Shipping it as a distant prop takes the extra work below.

- **Texture:** one base-colour map, 512² (256² for a "lite" tier), as KTX2 ETC1S at qlevel 255 with
  full mips.
  - AO from the ORM map is baked into it in linear light: `base × (1 − w·(1 − ao))`, w = 0.6. The
    bake needs both maps on the same UV set with no `KHR_texture_transform`; otherwise the script
    skips it and says so, and the dark-scene A/B decides.
  - The normal map, the ORM map and TANGENT are dropped. Roughness and metalness become constants,
    the ORM map's own means; the script prints them.
  - If metalness comes out above 0.1, the prop has painted metal. Keep the ORM map with
    `--orm=uastc:512` instead of flattening it.
  - Crisp high-contrast graphics (stripes, signage) blotch less as UASTC: `--base=uastc:512:2`.
    One SR beacon shipped that way.
- **Geometry:** meshopt `simplifyWithAttributes`. The error bound is 0.2% of the model's largest
  dimension, and normals are weighted 0.1, so shading survives and not just the outline.
  - UV seams are kept, and vertices on the bounding box are locked.
  - Plain geometric simplification left soft shading gradients. Weights of 0.25–0.5 with
    re-derived normals were needed once, on a rusty wreck: A/B before reaching for them.
- **If the player can get close to one side** (a rider could touch SR's trawler), that side needs
  its own budget. One global error bound erased the nets and cables at 6k triangles. SR fixed it
  with per-region budgets and a Blender re-bake, which is beyond this script. Classify such an asset
  as `hero-prop` unless the creator wants the extra work.
- **Vertex data:** 14-bit positions, int8 octahedral normals, 12-bit UVs (enough for 512²).
- **Gate:** views at 40, 80 and 150 m from 3 azimuths, golden and storm lighting, desktop and
  portrait. The mean-luminance ratio should stay within 0.96–1.10 in both lights. The silhouette
  pixel ratio, within 0.99–1.01, is read on the golden or a mask capture: in storm light the dark
  rock barely clears the background, and the beacon's unchanged outline read 0.89–1.01. Look at the
  40 m view yourself at 100%: there SSIM runs lower (0.91–0.96 for the trawler in a neutral viewer,
  with the luminance ratio up to 1.09; the beacon's numbers are above) and shading on thin parts
  such as booms and nets can change. If it shows, try the closer class.

## hero-prop: closest approach about 10–20 m

Sculpted rocks, a lighthouse, anything the course passes close to. With this script the rock islet
went 4.93 → 1.71 MiB, SSIM 0.984–0.988 at 12 m. SR's shipped set: the sea stack 10.90 → 2.34 MiB,
the islet 4.93 → 1.69 and the lighthouse 4.70 → 1.53, SSIM 0.986–0.987 on phones at 12–20 m.

- **Textures:**
  - Base colour and normal map: 1024 JPEG, q90–92, 4:4:4, mozjpeg.
  - ORM: 512 KTX2 UASTC, RDO λ2, zstd, linear.
  - TANGENT is kept.
  - Where strata-like detail is the point, use `--normal=jpeg:2048:92`. The stack at 12 m scored
    only 0.954–0.973 with a 1024 normal map on desktop.
- **This default is already SR's phone set.** `--max-texture=512` took the islet to 1.19 MiB but
  scored 0.906–0.940 at 12 m, with visibly softer lichen and normal detail. Go below the default
  only when the 12 m A/B passes.
- **Rejected, with the numbers:**
  - An ETC1S base colour blotched at 10 m and came out larger than the JPEG (732 vs 653 KB).
  - A UASTC normal map is 4.4 MB at 2048².
  - A lossy WebP normal map scored 0.960.
  - A 256² set passed the course views and failed at 12 m (0.895–0.925). Gate at the closest
    approach.
- **No simplification.** Every attempt failed, down to 0.873 on the islet, because a sculpt keeps
  its detail in its vertex normals. The only path left is a Blender normal bake onto a decimated
  mesh.
- **Vertex data:** float32 positions, int8 normals and tangents, 14-bit UVs.
- **The trade-off:** a JPEG uploads as RGBA8. At 2048², one map is 21 MiB of GPU memory.

## character: skinned or animated

With this script, SR's penguin rider went 2.43 → 1.58 MiB, and 0.69 MiB with `--max-texture=512`.
The croc rider went 4.88 → 1.77 MiB with `--only-default-scene`, at SSIM 0.999 or more at 1 m and
3.4 m, posed and in the bind pose. SR's five riders shipped at 15.94 → 6.98 MiB at 1024 and
3.66 MiB at 512 (atlases re-encoded), with SSIM ≥ 0.985, IK grip misses of 0.0000 m and exact bind
positions. In TOR, 4 animals went 17.9 → 1.73 MB.

- **Texture:** 1024 KTX2 UASTC, RDO λ4, zstd 18, sRGB with mips. Use `--max-texture=512` for
  phones.
  - A source that is already UASTC at 1024 or less (library characters ship one) is kept as it is.
    Re-encoding it is a second lossy generation: it saves about 18% of the atlas (the croc's
    1.13 MiB → 830 KiB) and cost the croc 0.986 against 0.9996 at 3.4 m in the bind pose. An
    explicit `--base=uastc:1024:4` does it anyway; A/B that output on its own.
  - A larger or different KTX2 source is transcoded to RGBA and re-encoded. If the re-encode is
    not smaller than the source at the same size, the source is kept.
  - ETC1S was rejected: 0.983 at the chase view, and banding on flat panels at 512.
  - RDO λ10 saved only 25 KB.
  - TOR's alternative was `--base=webp:512:90`: 7.1 → 0.23 MB of atlases, and no Basis transcoder
    download, because they were the game's only KTX2 files.
- **Vertex data:** positions ALWAYS float32. The script enforces this for skins and morphs.
  Normals are exact int8, UVs 16-bit (float where outside 0–1), joints uint8 and weights unorm8.
- **No simplification.** At 8–11k triangles a character fills the screen. SR's decimated "lite"
  riders scored 0.87–0.91.
- **Opt-in clean-up, only after checking the code:**
  - `--only-default-scene`: library characters carry a second "static eyes" rig and scene. The
    flag drops that scene with every node, mesh, skin and clip only it used, and names them: the
    croc lost five of its ten clips (`NewIdle_Static`, `HandsGrip_Skin2`, …). First check that
    nothing reads `gltf.scenes` or those node names, and grep the clip names. The script warns
    when code names a clip it dropped.
  - `--drop-animations`: TOR's game poses the bones itself; SR kept every clip. First grep for
    the clip names.
  - Duplicate textures (two library atlases stored the same 1024² image) are always merged.
- **Animation:** every key is kept, never quantized or resampled. `--resample=on` drops keys the
  neighbouring keys reproduce within 1e-4: it saved 1–2% of the file (croc 20 KB,
  penguin 36 KB) and moved the croc's hands by up to 1.2 mm, enough to fail the 1 m face view
  (0.962). The `octahedral` normals mode would also filter the clips.
- **Replacing one:** a character row is not a `glb` row. Swap it in as a new row and repoint its
  references (SKILL.md step 6), never in place.

## code-driven: code reads its vertices, node positions or pixels

This covers vehicles and props that code rebuilds from raw geometry, reads node world positions
from, or samples pixels from (a livery mask read through `getImageData`). With this script SR's
jet ski went 1.26 → 0.70 MiB, and 0.40 MiB with `--max-texture=512`. Of the saving at full size,
0.14 MiB is the mask stored as lossless WebP instead of PNG, and the rest is the vertex buffers.

- **Positions stay float32.** Quantized positions drew SR's skis as black tubes.
- **Textures stay readable images.** The preset refuses KTX2. Base maps are kept as they are; the
  ORM slot, where SR's jet ski keeps its livery mask, becomes lossless WebP with the exact pixels
  (colour under transparent texels, and every alpha value, included). It stays a PNG or JPEG when
  that is smaller, and a 16-bit PNG stays as it is: WebP has 8 bits per channel.
- **A base map and the mask the code pairs with it must stay the same size**, or every racer falls
  back to the stock livery. The script fails the `paired sizes` check when textures of one
  material that matched in the input no longer do. `--max-texture=512` resizes both; overriding
  one slot alone (`--base=jpeg:512:90`) fails.
- **Halving the triangles failed** (0.965–0.977).

## level: stages and level geometry

Positions are float32, triangle order is untouched (coplanar overlaps resolve by draw order),
vertices are renumbered by first use, and textures and animation clips are untouched. Normals and
tangents are stored as int8 and in-range UVs as 16-bit, which no stage has shown. One TOR stage went
2.26 → 1.01 MiB.

- **Positions must not be quantized.** TOR's painterly materials sample `positionLocal` noise, so
  quantizing shifts the pattern. Its batching merges identity transforms and would break.
  Quantizing also reopens coplanar seam ties.
- **Never delete "hidden" faces.** three draws shadow casters from their back faces, so the
  undersides nobody sees are what cast the shadows.
- **Empty marker nodes** carry spawn, item and goal data. The script never prunes them.
- **It can save nothing.** Most of the saving is meshopt. With `--meshopt=off`, a TOR stage whose
  export was already int8 came out 2% larger; the script then fails its `smaller` check, and the
  original is what ships.
- **A stage built by `building-levels-in-blender` is rebuilt from its script.** Every rebuild writes
  an unoptimized GLB: run the preset on each new build before registering it.
- **TOR went further, to 92 → 28 MB for 30 stages,** by dropping flat-shaded normals and rebuilding
  them at load in game code. That is game-specific; do it only with the creator, as its own change.
  TOR's own collision reader parses the stage GLBs directly, and it needed the meshopt decoder too.

## Images outside GLBs (skies, backgrounds)

The script handles GLBs only. SR's three skies went 0.81 → 0.17 MiB as 2048×1024 WebP at q97, and
0.07 MiB at 1024×512 for phones, with no visible change. The shared tools include sharp:

```sh
node -e "import('$HOME/.bitmagic/tools/gltf/node_modules/sharp/dist/index.mjs').then(({default: s}) => s('sky.png').webp({ quality: 97 }).toFile('sky.webp'))"
```

A smaller sky blurs differently. SR gave each sky slot `lodBias = log2(2048 / width)` so a 1024 sky
matched.
