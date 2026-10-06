# Deck 8 cabin row

The existing corridor contains 18 cabins. The old 8419/8420 positions at Z=31
were removed for the rear stair foyer and must remain open circulation space.

| Rooms | Door Z | Promenade room X | Sea room X | Floor Y | Room size |
|---|---:|---:|---:|---:|---|
| 8401 / 8402 | -9 | 8 | 14 | 3.4 | 4 × 3.2 × 3 m |
| 8403 / 8404 | -5 | 8 | 14 | 3.4 | same |
| 8405 / 8406 | -1 | 8 | 14 | 3.4 | same |
| 8407 / 8408 | 3 | 8 | 14 | 3.4 | same |
| 8409 / 8410 | 7 | 8 | 14 | 3.4 | same |
| 8411 / 8412 (original geometry) | 14 | 8 | 14 | 3.4 | same |
| 8413 / 8414 | 19 | 8 | 14 | 3.4 | same |
| 8415 / 8416 | 23 | 8 | 14 | 3.4 | same |
| 8417 / 8418 | 27 | 8 | 14 | 3.4 | same |

Each room connects to `Deck 8 cabins` through a 1.1 m doorway at X=10 or 12.
Every doorway uses the existing card-reader interaction and inward swing, with
an independent `room-<number>` key. Information issues a card for the player's randomly assigned cabin. Inside handles always allow exit. Spawn and public routes are unchanged.

`complete_deck8_cabins.py` extracts the existing furnished rooms into two GLBs,
each downloaded once and drawn with eight instances per material by
`ShipAssembly`. Furniture, wet rooms, windows, bedding and materials are reused.
All 18 doors share a numberless copy of the approved leaf, with small unique
number textures attached to the moving pivots. Collision volumes and route
metadata are translated from the original cabins. No new generation is needed.

The script saves its initial assembly and metadata in
`build/level/deck8-cabins/source.*` so reruns do not duplicate cabins. Review the
full `review.blend` and audit `deck8.mesh-level.json` in both door modes before
using `--apply` and registering the exported base, templates and shared leaf.

Numbering follows consecutive odd/even pairs from the aft stairs toward the rear lift foyer. `renumber_deck8_cabins.py` updates door IDs, keys, room names and routes together; the build script calls it automatically. The original rooms at Z=14 are now 8411/8412. Their redundant fixed number signs are removed by `remove_old_cabin_plaques.py`. Cabin 8402 is at Z=-9; each new game randomly assigns any one of the 18 cabins.
