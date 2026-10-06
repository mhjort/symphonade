# Verifying an optimized asset

An optimization is done when three separate verdicts agree: the numbers went down, the engine loads
the file, and a player cannot tell the difference at the distance they see it. Report all three
separately. A strong SSIM does not approve a look, and a pretty sheet does not prove a download got
smaller.

## Numbers

- **Per asset:** the script's report gives transfer bytes, triangles and estimated GPU memory for
  textures and geometry. The GPU estimate assumes KTX2 at 1 byte per pixel (BC7 or ASTC) and other
  images at 4 (RGBA8), plus mips. JPEG, PNG and WebP always upload uncompressed.
- **Whole game:** run `bitmagic dev`, open the browser's network panel with the cache disabled,
  and load to the start screen, then into the first level or race. Record the total transferred
  before and after, and name the few largest requests. Remember one-off costs: the first KTX2 file
  pulls the Basis transcoder (~0.25 MB).
- **Phones:** if the game picks assets per device, measure the phone set with a phone viewport and
  a mobile user agent. Squall Riders' phone download was 13.5 MiB against 21.2 on desktop.
- **Report MiB or MB, not both mixed.** SR reported MiB and TOR reported MB. 45.4 MB is 43.3 MiB.
  Say what the "before" was: the original file, not an earlier optimized variant.

## Decode in the engine's own loader

- Play the scene that uses the asset. The console must show no `setMeshoptDecoder must be called`,
  `setKTX2Loader must be called` or `createRenderPipeline` errors. The last one is WebGPU rejecting
  a vertex format, which an interleaved or int16 layout causes. Load it cold as well (cache
  disabled, then a reload with the cache on): a KTX2 file that arrives before WebGPU is ready is the
  failure an older engine shows (SKILL.md step 5).
- The dev asset panel builds its loader with the vendored engine's own factory, so it is a decode
  check only when that engine attaches the decoder. Under a game-side shim the panel fails on
  meshopt files that the game loads fine. After a `glb` swap it previews `sourceGlbUrl`, which is
  the original: open `/asset-preview?kind=glb&url=<the new URL, encoded>` on the dev view instead.
- Run `bitmagic verify` (its `--help` lists the platform and renderer choices). Check WebGPU, the
  default, and the WebGL fallback when the game supports it: the interleaved-buffer crash is
  WebGPU-only.
- Check what code reads, not only what renders: lamps and anchors at the right place, animations
  playing, IK grips on the handles, liveries and masks recolouring, colliders unchanged. Collider
  GLBs are separate rows or files: never optimize or redirect them with the visual mesh.
- If the game parses GLB bytes itself (the script names such files), exercise that path too:
  TOR's collision meshes come from its own reader, not from GLTFLoader.

## Look: A/B in the real game, before the swap

1. **Show both from one build.** The candidate stays in its work directory, which `bitmagic dev`
   serves at `/.bitmagic/optimize/<asset>/…`. Add the temporary preview module from
   [runtime](runtime.md): the page loads the original normally and the candidate with
   `?preview=1`. Nothing is uploaded, and world.json is untouched. Delete the module after the A/B.
   - If `src/` already rewrites asset URLs (`grep -rlE "resolveURL|setURLModifier" src/`, a
     per-device variant map), its rewrite runs before the preview's, so `?preview=1` shows the
     game's variant, not the candidate. Capture both sides with that game's originals override
     (Squall Riders: `&assets=orig`).
   - Before the first capture, confirm that the console printed `[preview] swapped <url>` and that
     the network panel fetched `/.bitmagic/optimize/<asset>/…`. Without both, the candidate never
     loaded and the A/B compares the baseline with itself.
2. **Pin everything that is not the asset.** Use the same build, camera position and direction,
   time of day and weather, the same viewport and devicePixelRatio, and `?quality=<rung>` so the
   engine's auto-tuner cannot drop a tier mid-run on a busy machine. If the game has a debug hook
   to freeze time or the simulation, use it. Particles and water move between two runs.
3. **Capture PNGs** with whatever drives the browser here (the agent's browser tool, or Playwright
   when the project has it). For each view, also capture a **plate**: the same view with the asset
   out of shot or hidden, when the game allows it. The plate gives the silhouette ratio and an SSIM
   on the object's own pixels.
   - **Characters: freeze the pose.** Capture both sides in the bind pose, or with the clip
     stopped at one keyframe time, so SSIM scores textures and geometry, not where the animation
     happened to be. Check the pose on its own: the world positions of a few bones or grip points
     at two or three keyframe times must match. The default keeps every key (the croc rider's
     bones matched to 0.1 mm); `--resample=on` moved its hands by up to 1.2 mm, which alone
     dropped its face view at 1 m to 0.962 object SSIM.
4. **Measure the noise floor:** capture the original twice and compare the two. A difference smaller
   than that is not caused by the asset. SR's floor was 0.967–0.970 SSIM on a chase camera and
   0.986–0.989 on a still sky.
5. **Views:**
   - the closest distance a player can reach, which is the one that fails;
   - the usual gameplay distance;
   - for props, three azimuths;
   - for characters, the gameplay camera and the closest menu or select-screen view.
   - If the game has golden and dark or storm lighting, capture both: baked AO and dropped ORM
     maps show up in dark scenes.
6. **Viewports:** a desktop one (1920×1080 or 2560×1440) and a phone one (e.g. 1688×780
   landscape or 390×844 portrait). Distant props also shrink on a phone, which hides more.
7. **Score each view** with the shipped script, on a crop around the asset:

   ```sh
   A=.agents/skills/optimizing-assets/scripts/ab-compare.mjs
   node $A orig.png orig-again.png --crop=640,300,700,480                  # the noise floor
   node $A orig.png new.png --crop=640,300,700,480 --plate=plate.png --sheet=ab-close.png
   ```

   It prints luma SSIM on the crop (and on the object with `--plate`), the mean-luminance ratio,
   the silhouette ratio (with `--plate`) and the share of changed pixels; `--json` for a table.
   PNG needs nothing installed. Targets SR used, and the number each one reads:
   - characters: `SSIM (luma, object)` 0.985 on desktop and 0.975 on phones, and `SSIM (luma,
     crop)` 0.992 or more with no `--crop` (the whole frame);
   - distant props: `luminance ratio` 0.96–1.10 in every lighting, and `silhouette ratio`
     0.99–1.01 on the brightest capture, or on a mask capture (the asset unlit white on black,
     `--threshold=128`). In a dark or storm capture, dark parts of the object barely clear the
     plate, so the ratio counts shading: ab-compare prints `low contrast` there. SR's beacon read
     0.89 and 1.01 in storm light with an outline that a mask capture put at 0.999;
   - hero props: `SSIM (luma, object)` 0.984 or more at the closest approach.
8. **Look at the sheets** (original | candidate | difference ×4, at 100%) yourself for seams,
   banding, blotches, facets or a changed silhouette. Then show them to the creator: the look is
   their call, and "no visible difference at race distance" is the verdict to ask for.
9. **After the swap,** capture the same views again without the preview module and compare them
   with the original captures. That proves the game now loads what you tested. Keep captures lean:
   PNG crops, not full-resolution sets, and delete what you no longer need.

## When it fails

- For a character, first rule out the pose: score a frozen pose and compare bone positions (step 3
  above). A pose shift fails the gate with every texture untouched.
- Change **one** variable and rebuild. Order of likelihood: a bigger texture edge on the slot that
  shows the defect; a different format (UASTC instead of ETC1S for chroma blotches, JPEG 4:4:4
  instead of lossy WebP for normal maps); a smaller simplification error; `--normals=exact`; the
  next closer class.
- If the closer class passes, ship that. A smaller download that the creator notices is a worse
  game, not an optimization.
- Record what failed and the numbers in the asset's work directory, so the next agent does not
  repeat it.
