# Deck 9 cabin floor

18 rooms, 9401–9418; floor y=7.05, ceiling underside y=10.25. Nine promenade and nine sea rooms at the deck 8 Z stations. Shared cabin GLBs are instanced across both decks. The two original deck 8 rooms stay in the base mesh.

Both rear return stairs extend from y=3.4 to 7.05 with sloping soffits to preserve the deck 7 flights below. An upper cross-landing connects the port and starboard foyers; the corridor is on starboard. The panoramic lifts serve 7–8–9–8–7 using the existing E/touch contextual action. Calls keep every absent-floor gate closed.

## Authoring

`deck9.py` consumes immutable `build/deck9/source-components.blend` and `source-level.json`, captured before the expansion, and stages `deck9.blend` and `level.json`. `deck9_export.py` batches the reviewed scene by material to `ship-base.glb`. `audit_deck9.py` tests the explicit walking routes and lift shaft rather than straight room-centre routes; the original ship has nonplanar floors and indirect passageways. Run it both normally and with `-- --closed`.

Cabin placements: `deck9-cabins.json`; physics/room data: `serenade.mesh-level.json`; lock definitions: `world.json`. Cabin assignment derives the deck and floor from those doors.

## Registered asset

The reviewed mesh is registered as `ship-base`, keeping GLB format and target height `56.619734`. Asset URL: https://bitmagic.ai/worlds/v3/VPCT0XSS4E64/1791645861927-ship-base.glb. The temporary local preview mesh has been removed. The original asset record is saved in `build/deck9/original-asset.json`.
