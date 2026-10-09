# Starlight terraced showbar

The creator's `starlight.jpg` and `dancefloor.jpg` establish the entrance stair,
descending seating terraces and lower dance floor. This remains a compressed
interpretation within the existing 20 × 24 m room, with three seating elevations
(3.4, 2.267 and 1.133 m) above the dance floor at deck-7 height.

Authoring: `starlight_terraces.py`, run from the project root using Blender 4.2+.
Install its helper library with `bitmagic tools install blender-level`. It also
uses the project's existing `tools/level/zfight.py`. Keep the original inputs
immutable under `build/starlight/`:

- `original.glb`: https://bitmagic.ai/worlds/v3/VPCT0XSS4E64/1791301556387-ship-starlight.glb
- `base-original.glb`: https://bitmagic.ai/worlds/v3/VPCT0XSS4E64/1791301706693-ship-base.glb

The script reads the current `src/work/serenade.mesh-level.json`, removes its own
previous records, then rebuilds them. It writes `level.json`, `ship-starlight.glb`,
`ship-base.glb` and review `.blend` files into `build/starlight/`. The base edit
changes only vertices of three gallery guards; all other binary buffers and
materials remain intact. Register with the existing asset IDs, using native
heights 6.655 m for Starlight and 56.619734 m for the base. Apply the level JSON
together with the meshes. No door definitions or spawn positions change.

`audit_starlight_terraces.py` tests the actual multi-height walking routes,
floor sectors and envelope with the full ship collider set. Run in Blender once
normally and once with `-- --closed`. The standard planar-room audit does not
model this stepped floor. Browser regressions are `starlight-terraces.mjs`,
`starlight-seats.mjs` and `starlight-dance.mjs`.

The standalone engine currently has a startup race: it can disable controls
after early traveler selection. These regressions wait for its post-load gate
before boarding. No engine or startup behavior was changed in this design pass.

Entrance finish pass: dark fluted portal panels, bronze/chrome casing, a constellation fascia and subtitle, burgundy treads and runner, bronze nosings, warm rail/ceiling strips and lined stairwell panels. Only the Starlight mesh and one level light change; existing colliders and open Sea View passages are preserved. The two-mesh coplanar audit leaves only the pre-existing exterior rail overlap, outside this entrance.

The later lift-lobby closure adds two solid upper-level infills in the Starlight mesh (dark club faces and ivory lobby faces), removes the obsolete base-mesh signs, and reroutes both upper-lobby walking paths through the central landing. Re-register both meshes for this pass. The audit also checks that both walls block rays from either side.

Lower-bay pass: copy and clip Sea View's `tour_pattern` geometry from the base source, use its carpet colours, and reuse the original cream chairs on the entrance's left (+X). The right bay (-X) uses the separately generated `starlight-roulette-table`, loaded and bounded by `RouletteTable.ts`; betting and settlement are in `RouletteRound.ts`. Both lower-bay routes are covered by the ray audit.
