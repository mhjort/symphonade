# Build plan — Party Boat

## Current slice — voyage clock & trip points
Goal: survive the crossing (17:00 FI → 09:30 SE, 17.5 ship hours in ~60 real minutes) and earn trip points from quests.
- `VoyageClock.ts`: ship clock HUD (top-right), pause-aware, Finnish → Swedish time at 01:00 FI, arrival flag.
- `TripPoints.ts`: TP total HUD; `Game.completeQuest()` awards once per quest.
- Outcomes in `Game.checkVoyageOutcome()`: arrival win; energy 0, dizziness overflow and falling are losses.
- Test: `src/work/__tests__/voyage-clock.mjs` (desktop + phone).

- Activity quests: first coffee 25 TP, first beer 25 TP, Silja slot jackpot 250 TP.

- Sleeping in a cabin bed runs the clock and dizziness recovery 12× faster (`SLEEP_TIME_SCALE`).

- Bon Vivant reservations (`BonVivantReservation.ts`): host + lectern, seating dialog, served dinner in the window, 150 TP; missed seating fails the quest. Test: `__tests__/bon-vivant.mjs`.

Deferred: timed events (shows, dinner seating, Mariehamn stop); TP levels/ranks.

## Current slice — working promenade elevators
Refine the two working lifts from the supplied photograph: semicircular chrome/glass fronts projecting from a white end wall, with the rear halves and loading lobby enclosed behind it. This is a compact interpretation serving the two playable decks, 7 and 8. Keep the existing stairs and five-destination tour.

| Space | Centre X,Y,Z | Size X,Y,Z | Connection |
|---|---|---|---|
| Port lift shaft | -6,10.3,33 | 2.4,20.6,2.4 | Rear landing gate toward the outer hull, decks 7 and 8 |
| Starboard lift shaft | 6,10.3,33 | 2.4,20.6,2.4 | Rear landing gate toward the outer hull, decks 7 and 8 |
| Deck 8 lift landing | 0,4.9,35.1 | 11.8,3,2.2 | Upper doorway through Z=36 into Starlight gallery |

Mechanics: engine KinematicPlatform carries riders (no player teleport/carry code); engine DungeonDoor animates landing gates. A custom mechanism controller provides call/travel commands and landing interlocks, with speed and door-clear delay in world.json mechanisms[]. L and mobile LIFT share one registered action. Doors must close before travel, reopen for a blocked threshold, and stay closed at an absent car. HUD shows the car/deck/action. Call either lift from either deck; ride up/down and walk off to the gallery/cabins.

Validation: authored geometry review and open/closed audit; targeted real-controller tests of both lifts, calling an absent car, threshold interlocks and upper exit/return; existing walking tour and fall outcome; desktop/mobile verify and one independent quality verdict. No new playable decks in this slice.

### Completed validation
- Both cars ridden up and down with the real walking controller; empty cars called from both decks; blocked-doorway interlock and upper gallery exit passed with no browser errors.
- Actual phone LIFT taps completed an upward and return ride.
- Full five-destination tour, stairs in both directions, Information completion and fall/retry outcome passed.
- Type check and desktop/mobile browser verification passed (60 fps in the verification captures).
- Open/closed geometry audits passed with the shallow lift pits; runtime/build collider data match (339 static colliders).
- Latest spawn-frame visual review: 6.8/10. Existing reception-card framing and shrub style remain polish items; the lift landmark is reachable from spawn and reviewed in dedicated runtime views.

### Photo correction checks
Rounded-car ride tests passed for both lifts in both directions, including remote calls, the doorway interlock, and the rear lobby/gallery route. Actual phone taps completed an upward and return ride. Open and closed geometry audits passed with 339 static colliders. Final desktop and phone verification passed at 60 fps; the dedicated raised-car screenshot confirms the photo-based form.

### Photo correction geometry
The sketch revision puts the shafts at X=±6, Z=33, at the ends of the cabin rows. The rounded glass faces across the promenade; rear gates face outward at X=±7.2. Each rear foyer spans X=7.2..10 (mirrored to port), Z=30.2..36. Walk around the row at Z=31 to board. Deck 8 has a connecting landing at Z=35.1 and a direct starboard foyer/cabin-corridor opening at X=10, Z=30.8..33.2. The glass radius remains 1.15 m and deck heights remain 0 / 3.4 m. Car geometry, gates, indicators and interaction/interlock checks share the same yaw.

## Genre / archetype
Walking exploration. No matching genre recipe — planned from GAME-DESIGN.md.

## Contract from the recipe
First-person walking controller, authored mesh floors and walls. Retain supplied model and add usable interior where necessary.

## Platform
Desktop primary; engine mobile joystick and look controls. No custom keyboard-only actions.

## Slice 1
- Core verb: walk and discover passenger destinations.
- Win: return to reception after visiting cafe and lounge.
- Lose: fall below the deck; engine retry screen.
- Feedback: current area, destination count, return instruction.
- Controls: WASD/mouse, phone joystick/drag look, engine defaults.
- Systems: MeshLevel (mesh-level.md), PlayerController, GameHUD (HUD_ELEMENTS.md), endGame (end-game.md).
- Assets: supplied GLB, authored interior, generated cover.
- Art style: low-poly, declared in game.json.
- Level: one connected passenger deck, audited collisions.

## Spatial plan (metres, game X,Z)
| Room | Centre | Size | Height | Connections |
|---|---|---|---|---|
| Reception | 0,-18 | 12,12 | 8 | Promenade |
| Promenade | 0,6 | 12,36 | 8 | Reception, cafe, lounge |
| Cafe | -10,4 | 8,12 | 4 | Door in promenade west wall |
| Lounge | 0,30 | 12,12 | 8 | Promenade |

Spawn reception facing +Z. Destinations cafe and lounge; return to reception.

## Deferred — the backlog
1. Enterable cabin interiors.
2. More decks with stairs/lifts.
3. Passengers and conversations.
4. Party activities and soundscape.

## Open questions
First-person assumed. Exact deck-plan fidelity requires creator references.

## Validation notes
Blender open/closed audits pass: 3,264 floor samples, 1,080 route probes, 30 door probes, 4,080 envelope probes. Tall-room route auditing was corrected to probe from waist height rather than atrium centre height. Desktop and mobile browser verification pass. Quality review after the camera fix: 6.5/10; defer shaped plants and more distinctive destination dressing to the next visual pass.

Full live-controller route passed: reception → cafe (automatic door) → promenade → lounge → reception. Forward bulkhead stopped the player at Z=35.46. Win and below-deck lose screens both fired; browser page errors: none. Phone status labels stack without overlap.

## Slice 2 — cabin corridors
A 48 m passenger corridor along the starboard side of the promenade, joined by an automatic door at (6,0,6). Warm ceiling lighting, navy carpet, teak handrails, numbered closed cabin doors and direction signs. Cabin interiors are a later slice.

| Space | Centre X,Y,Z | Size X,Y,Z | Connections |
|---|---|---|---|
| Cabin corridor | 8,1.6,10 | 4,3.2,48 | Promenade via Cabin corridor entrance |

Routes: promenade → doorway → aft corridor end → forward corridor end → promenade. Existing cafe/lounge tour remains unchanged. Validate both collision audit modes, rendered views, real movement along both branches, desktop/mobile verify and one quality review.

Slice 2 geometry and runtime: 60 colliders, 2 automatic doors, 5 named volumes, 8 lights. Open/closed audits passed (4,032 floor rays, 60 doorway probes, 1,278 route probes, 5,040 enclosure probes). Desktop and mobile verify both passed at 60 fps.

Slice 2 live walking test passed: promenade → cabin entrance → aft cabins → forward cabins → entrance → promenade → cafe → lounge → reception. Automatic doors and room label work, the original win and fall retry still fire, and browser page errors are empty. Quality review retained the prior 6.5/10 with only existing promenade decoration suggestions; corridor views were inspected separately in Blender and the live browser.

## Slice 3 — photo-matched promenade
Reference: https://commons.wikimedia.org/wiki/File:Silja_Serenade_2016_3.jpg (Smiley.toerist, CC BY-SA 4.0; reference only, not used as a game texture).
Replace the low hotel corridor with one continuous 21 m tall atrium: four tiers of projecting cream cabin bay windows plus upper glazing, white structural bands and a luminous roof. Dark timber promenade flooring, black storefront fascias, red accent strips, street cafe tables, globe lamps and shop display cases follow the photo. Preserve the ship exterior and existing cabin/cafe access.

Physical volumes: one Promenade atrium at (0,10.5,6), size (12,21,60), Cafe unchanged, Cabin corridor unchanged. Reception and Lounge become named zones within that uninterrupted atrium, rather than separately enclosed rooms; retain their landmarks and tour behavior. Audit the full floor/envelope and both door links; test the full existing walk route. Upper window tiers are architectural dressing, not new playable decks.

Slice 3 validation: 79 colliders, two doors, one continuous atrium plus cafe and cabin corridor. Both geometry audits pass: 4,032 floor rays, 60 door probes, 396 door-route probes and 5,040 envelope probes. Desktop and phone WebGPU verification both pass at 60 fps. Visual review confirms reference proportions/windows/floor/skylight; further shop-detail density and destination markers remain future polish.

Slice 3 full walking regression passed: reception → cabin entrance → both cabin corridor ends → promenade → cafe → lounge → reception. Wall collision, 2/2 tour victory and fall retry all fired correctly. Browser page errors: none.

## Slice 4 — Tallink reference expansion
Official references: https://www.tallink.com/on-board/fleet/silja-serenade and its deck-plan images, accessed 2026-09-09. All decks 2–13 inspected. See SHIP-REFERENCE.md.
Replace the ground-floor cabin corridor with a real elevated accommodation deck. Retain the compressed promenade footprint, extend the bow into Starlight and Sea View Lounge. No new input bindings: stairs and automatic doors use existing desktop/phone movement.

| Space | Centre X,Y,Z | Size X,Y,Z | Route |
|---|---|---|---|
| Promenade deck 7 | 0,10.5,6 | 12,21,60 | Cafe, aft stair lobby, Starlight |
| Aft stair lobby | 9,3.3,-22 | 6,6.6,4 | Promenade door, stair foot |
| Stair shaft | 11,3.3,-16 | 2,6.6,8 | Rise 3.4 m over 8 m into corridor |
| Deck 8 corridor | 11,5.0,11 | 2,3.2,46 | Two sample cabins, forward gallery |
| Promenade cabin 8401 | 8,5.0,14 | 4,3.2,3 | Automatic door, berth/desk/WC, atrium window |
| Sea cabin 8402 | 14,5.0,14 | 4,3.2,3 | Automatic door, berth/desk/WC, sea window |
| Starlight deck 7 | 0,3.3,48 | 20,6.6,24 | Promenade; upper gallery via deck 8 corridor |
| Starlight gallery deck 8 | 0,5.0,37 | 20,3.2,2 | Corridor, side galleries, forward lounge |
| Sea View Lounge deck 8 | 0,5.0,65 | 20,3.2,10 | Both Starlight side galleries |

Tour visits cafe, both cabin types, Starlight and Sea View Lounge, then returns to Information. Physical stairs validated in both directions with actual controller. Keep 8 pooled point lights. Geometry and dimensions are an authored compact interpretation; no claim of a full ship replica. Other decks remain directory entries, not false doors to nowhere.

Slice 4 Blender validation: 231 colliders, 8 automatic doors, 9 volumes, 8 lights. Open audit passes 6,656 floor samples, 174 door probes, 4,032 route probes and 82 stair support/headroom probes. Closed audit passes 8,320 envelope probes. Routes explicitly include turns and elevation changes rather than incorrectly cutting through furniture or gallery voids. Envelope rays follow the union of adjoining declared rooms, so an open stair/corridor boundary is not mistaken for a missing exterior wall. Collision warnings at overlapping floor slabs remain non-fatal; the rendered contact sheet and cabin/club closeups were inspected.

Slice 4 runtime validation: desktop and portrait phone verification pass at 60 fps. Full live-controller route passed: cafe → Starlight lower deck → aft stairs up → both cabin interiors → starboard gallery → Sea View Lounge → port gallery → aft gallery → cabin corridor → stairs down → Information. Both cabin doors and both lounge doors were exercised. Stair arrival/return measured Y=3.42 and Y=0.02. Five-destination victory and fall retry both fired; browser errors were empty. The independent visual review remains 6.8/10, with remaining suggestions about plants, destination markers and framing of the display model. A theme-only label backing addresses contrast in the dark showbar; geometry is unchanged.

## Sea-window correction
Replace the cabin and lounge backdrops, pierce the six Starlight upper-gallery windows, and clear source-shell occlusions along their outward sight lines. Add one shared sea plane and distant island geometry (visual only). Room footprints, spawn, doors and routes remain the same. Validate all ten sea-window groups (cabin; six showbar windows; lounge port/starboard/bow) with rendered views and visual occlusion rays, plus existing open/closed collision audits. Check glass blocks player movement, and verify desktop/mobile rendering.

Sea-view Blender checks: ten window groups now overlook shared outdoor geometry. The original source shell is polygon-clipped along outward viewing cones, preserving UVs on retained fragments; its inward faces no longer render. 513 visual rays at several heights and vertical angles encounter no opaque ship geometry. Both collision audit modes pass (256 colliders, 8 doors). The glass retains invisible pane colliders. Sea scenery adds no playable surface or physics.

Sea-view runtime validation: desktop and portrait mobile WebGPU verification both pass at 60 fps. All ten window groups were inspected in the live game and tested by walking directly toward the glass; every pane stopped the player within its room, and no browser errors occurred. Screenshots are `.bitmagic/sea-*.png`; the focused regression is `.bitmagic/probe-sea-windows.mjs`. The unchanged spawn-frame quality review remains 6.8/10; its plant/wayfinding/display suggestions are separate from this window correction.

## Commons photographic detail pass
Reference-only study of 2019/2024 promenade, 2022 Starlight seating/bar/gallery, 2022 promenade cabin and sun-deck photos. Keep the slice 4 room/door/route table, spawn and tour contract. Change authored finishes and furnishings: white bay fronts and lighter glazing; suspended tiered chandeliers and projecting signs; rounded tub seating facing the stage, organic taupe carpet, gallery counters and a stocked bar; cabin triangular berth motifs and framed prints. Sun-deck green coating, slanted windscreens and timber benches are recorded for a future deck-12 expansion. No new playable volume in this pass. Both geometry audits, sea-view rays, rendered rooms, desktop/mobile verify and the full walking tour must pass.

Commons pass validation: 237 colliders, 8 doors, 9 volumes and 8 lights. Open/closed audits pass (6,656 floor samples; 82 stair checks; 174 door probes; 4,032 route probes; 8,320 envelope probes). All 513 sea-window visual rays remain clear. Full contact sheet reviewed, followed by targeted corrections and renders of mesh normals, capped tub-chair backs, round upholstered bases and blue cabin motifs. The existing overlapping-floor warnings remain non-fatal.

Desktop and portrait iPhone verification both pass at 60 fps (WebGPU). Full live-controller route passes: cafe → Starlight → stairs up → both cabins → starboard gallery → Sea View Lounge → port gallery → corridor → stairs down → Information. Five-destination victory and fall retry fire; page errors empty. Evidence: `.bitmagic/probe-commons.mjs`, `.bitmagic/commons-*.png`; geometry review: `build/level/commons-review/`, targeted corrected renders in `commons-final/` and `commons-chair-solid/`. Independent spawn-frame review: 6.5/10, recognizing the architecture/chandeliers; remaining findings concern earlier cafe wayfinding, shrub style and display-model framing, deferred beyond this photographic-detail pass.

## Virtual-tour interior matching
Use the creator-supplied Tallink/Procontent panorama tour as the leading finish reference. Scope: every existing interior on compressed decks 7–8; room sizes, eight doors, spawn and all routes retain the slice 4 spatial table. No additional decks in this pass. Reference cube views are in build/reference-tour (study only, never bundled).
- Promenade and Information: white fascias with black edging, warmer varied planks, mosaic counter, realistic merchandise displays.
- Coffee & Co: cream/black patterned tiles, charcoal walls, pale bistro tables, bentwood chairs, white tiled pastry/coffee counter, coved ceiling.
- Starlight and gallery: bronze ceiling ribbons, blue cove edges, warmer organic carpet, curved seating and glossy dark tables.
- Sea View Lounge: grey organic carpet, pale grey seating, curved sofas, white tables and menus, ceiling panels and oak window ledges.
- Both A-class sample cabins: grey bed covers, broad navy curtain stripes, oak shelves, paired glazing, mirrors, wardrobe/telephone details.
- Corridor/stairs: matching pale cabin surrounds, ceiling panel joints and floor runner; inferred continuity because the tour has no separate corridor panorama.
Validate rendered contact sheet, open/closed collider audits, sea sight-line rays, desktop/mobile verify and the complete existing walking tour. Run one independent quality review.

Virtual-tour geometry validation: 248 colliders, 8 doors, 9 volumes, 8 lights. Open/closed audits pass 6,656 floor samples, 82 stair checks, 174 door probes, 4,032 route probes and 8,320 enclosure probes. All 513 sea-view rays remain clear. Full room contact sheet inspected; segmented sofa surfaces were replaced with continuous upholstered arcs and reviewed separately. Existing overlapping-floor warnings remain non-fatal. Desktop and portrait iPhone verification both pass at 60 fps using WebGPU. Independent spawn-frame review: 6.8/10; remaining findings concern pre-existing display framing, shrub styling and small cafe signage.

Virtual-tour live regression passed: cafe → Starlight → stairs up → both cabin interiors → starboard gallery → Sea View Lounge → port gallery → cabin corridor → stairs down → Information. All five destination visits, tour victory and fall retry fire; browser page errors are empty. Evidence: .bitmagic/probe-tour.mjs, .bitmagic/tour-*.png; Blender evidence: build/level/tour-review/contact-sheet.png and build/level/tour-sofa-review/shot-1.png. No new decks or venues were added.


## Coffee & Co refinement from the virtual tour
Use scenes a_21_coffe_and_co and a_03_promenade_bar. Keep the existing cafe footprint X=-14..-6, Z=-2..10 on deck 7. Replace the narrow closed doorway with an 8.4 m open storefront centered at Z=4; preserve the six-metre central promenade route. Tiled L-counter and sloping pastry display occupy the port side (X=-12, Z=1..6.5), with service portholes behind it. High seating sits along Z=-1 and Z=7; drinks fridge at Z=9. Two small terrace tables stay west of X=-3.6. Entry-to-counter route remains clear at Z=4. Existing cafe discovery counts toward the five-stop tour; no purchase mechanic in this visual pass.

Coffee & Co validation: both geometry audit modes pass with 355 static colliders and eight doors. The removed cafe door is absent from world.json. Walking tests passed for the open entrance, counter approach, wall-bar aisle and high-table/fridge aisle. Type check and desktop/phone browser verification pass; both captured at 60 fps. The cafe still registers as the first tour destination under its Coffee & Co display name.

Full Coffee & Co regression passed: cafe discovery, all five destinations, stairs both ways, return-to-Information win and fall/retry outcome; no browser errors. Independent spawn-frame review remains 6.8/10 with existing shrub/lift-view findings outside this cafe pass. Dedicated cafe images reviewed at player eye level.

## Bon Vivant restaurant — September 9

Build the existing Bon Vivant storefront into a walkable deck 7 destination, using tour scenes a_25_bon_vivant_restaurant and a_26_bon_vivant_wine_bar. This is a compact adaptation to the game ship, not a surveyed floor plan.

| Space | Bounds / height | Connection and walking route |
|---|---|---|
| Bon Vivant | X 6–16, Z −11–1; floor 0, ceiling 3.15 m | Open 3.2 m entrance at (6,0,−6) from Promenade |
| Wine bar | X 6.5–9.5, Z −10.5–−7.5 | Entrance → (8,0,−6) → counter front (8,0,−7) |
| Dining room | X 9.5–15.8, Z −10.5–0.8 | Entrance → (12.4,0,−6) → central aisle (12.4,0,−1) |

Preserve original spawn and all current stair/lift/cabin routes. Add Bon Vivant as the sixth tour destination. Use navy upholstered chairs, dark banquettes, pale leaf-pattern screens, a fine-line dark carpet, set oak tables, silver ceiling panels with warm sculptural lights, round sea windows and a stocked wine bar. Audit both door states; render frontage/interior; walk entrance, bar, both dining aisles and full tour; verify desktop/mobile and judge once.

Bon Vivant validation: 384 static colliders and the existing eight doors. Both open/closed audits pass (7,260 floor probes; 4,581 link probes; 9,190 envelope probes). Reviewed dining room, wine bar and frontage in Blender and the live game. Desktop and portrait phone verification pass at 60 fps with 441 physics bodies. Independent spawn-view review remains 6.8/10; findings concern existing promenade shrubs/lift visibility and thin lift guard colliders. Restaurant visual review uses the dedicated live screenshots `.bitmagic/bon-vivant.png` and `.bitmagic/bon-vivant-entrance.png`.

Full controller walking regression passed: Bon Vivant entrance, wine-counter approach, both ends of the dining aisle and window barrier; Coffee & Co seating/counter; Starlight; stairs up; both cabins; both lounge galleries; stairs down; six-destination Information victory; fall/retry. Browser page errors: none.

## Deck 7 boarding entrance — September 9

Start the player outside the ship on a short glazed boarding gangway. The supplied deck plan places EXIT between Fashion and Luxury on the port promenade; the photo supplies the rounded white hull opening, timber SILJA SYMPHONADE nameboard, blue mats, metal threshold and paired glass doorways. Adapt the plan to the existing compressed ship at Z=13. Preserve all six tour destinations and the Information completion point.

| Space | Bounds / clear height | Walking route |
|---|---|---|
| Boarding gangway | X −28.4..−16.4, Z 10.1..15.9, floor 0, roof 4.45 | Spawn (−27,.15,14.25), facing +X → ship opening |
| Boarding vestibule | X −16.4..−14.7, same width, height 3.2 | Blue mat → right glass door at (−14.7,0,14.25) |
| Boarding lobby | X −14.7..−6, same width, height 3.2 | Door → (−8,0,14.25) → (−8,0,13) → promenade (0,0,13) |

Two glass leaves use the engine's existing proximity-opening door system and an authored GLB leaf asset. Keep the gangway fully walkable and guarded; its length/glazing are inferred for gameplay. Cut the actual hull and promenade bulkhead; relocate the one street table that blocks the entrance and move the Luxury frontage beside the opening. Check spawn direction, both doors, boarding/return routes, phone movement, six-stop victory and fall/retry.

Boarding validation: 410 static colliders and ten doors. Open/closed geometry audits pass with 7,744 floor probes, 225 door-clearance probes, 5,166 link probes and 9,880 envelope probes. Visual review removed the source lifeboat intersecting the connector and confirmed the rounded entrance and mats. Final spawn is (−27,.15,14.25), facing +X; portrait framing prompted the extra setback. Desktop and portrait-phone WebGPU verification pass at 60 fps with 471 bodies. Actual phone joystick input carries the player through the right automatic glass door into the promenade and advances the boarding instruction. Both glass leaf assets load and both doors are walkable in the desktop test.

Final boarding regression passed: untouched spawn heading moves toward the ship; both glass doors board and return; all six destinations, stairs in both directions and Information victory work; fall/retry restarts at the gangway. Browser page errors: none. Independent entrance-frame review confirms readable route and reference details; score 6.8/10, with existing lift guard collider warnings outside this change.

## Current slice — check in before exploring
Core verb: speak to the Information clerk to receive room 8402's key, then unlock and enter that cabin on deck 8. Existing first-person movement, boarding, lifts and stairs remain. Desktop E / engine phone interaction handles clerk and locked door. Use engine NpcIdleBehavior with the local block factory, DoorSystem keyring, and the existing cabin door. HUD shows the first objective, key held, route guidance and room arrival; then resumes the six-stop tour. Falling retains the existing retry outcome. No generated assets needed: creator requested a block clerk. Deferred: further passenger conversations and room activities. Validate locked entry, clerk interaction, repeat interaction, key unlock and room entry with real controls, plus desktop/mobile verify and quality review.

Check-in validation: the real desktop walking route passed from the boarding gangway to the clerk, up the aft stairs, through the keyed door and into room 8402. E interaction granted the key, repeat interaction retained it, and room entry completed the objective without browser errors. A separate phone probe confirmed the closed door rejects interaction without a key and physically blocks forward movement. LIFT now uses declareMobileActions with its own reserved slot. Phone interaction uses the engine’s tappable Talk/Unlock prompt above the target; its legacy Interact button is intentionally hidden. The independent spawn-frame review remains 6.8/10; its existing thin decorative collider findings are outside this gameplay change.

Final checks: type checking, desktop verification and portrait-phone verification pass. Actual touchscreen taps on the floating clerk and Unlock prompts grant the key and open 8402; the cabin prompt requires looking upward at its world anchor. The relocated LIFT button completes both upward and return rides. No browser errors in the check-in walkthrough or phone interaction tests.

## Cabin access correction and key inventory
Require a matching room key for both numbered cabin doors. Clerk still grants only 8402; 8401 remains private. Remove the inaccessible promenade cabin from required tour destinations so victory remains reachable. Add a persistent HUD key inventory showing no keys initially and Room 8402 once granted, including after cabin entry and return to exploring. Validate neither door opens with no key, 8402 key cannot open 8401, its own door unlocks, key HUD survives entry, and the five-stop tour can finish.

Cabin-key regression passed: both cabins reject entry without a key; room 8402's key leaves 8401 locked and physically blocks attempted entry, but unlocks 8402. The inventory retains the key after entering the cabin and resuming exploration. Visiting the five accessible stops and returning to Information still wins.

HUD layout: inventory is anchored bottom-center so the world-anchored clerk prompt cannot cover it on portrait phones. Desktop/mobile browser verification and the actual phone clerk-to-key-HUD interaction pass; no extra inventory action is needed.

## Promenade completion — virtual-tour venue pass
Build all missing deck-7 promenade shops and dining spaces from the supplied Tallink/Procontent tour. Preserve the current five-stop welcome quest, boarding, troubadour and lifts. This is authored compressed geometry, not measured reconstruction. No purchase mechanic requested.

| New module / room | X bounds | Z bounds | Entrance Z |
|---|---|---|---|
| Sea Pub | -6..6 | -34..-24 | aft opening at X=0, Z=-24 |
| Grill House | 6..9.8 | -20..-15.5 | -17.75 |
| Happy Lobster | 6..9.8 | -15.5..-11 | -13.25 |
| Fast Lane | 6..16 | 1..11.5 | 6 |
| Fashion / Tommy Hilfiger | -16..-6 | -24..-14 | -19 |
| Desigual | -16..-6 | -14..-8 | -11 |
| Marimekko | -16..-6 | -8..-2 | -5 |
| Luxury | -16..-6 | 16..20.5 | 18.25 |
| Electronics | -16..-6 | 20.5..24.5 | 22.5 |
| Gifts / Moomin | -16..-6 | 24.5..30 | 27.25 |
| Kids & Toys | 6..16 | 23..30 | 26.5 |

Rooms have 3.1m clear ceilings; Sea Pub 3.8m. Shared promenade walls get real openings while retaining their upper floors. Each venue owns a separate CDN GLB; physics/volumes/lighting remain in combined metadata. Every room has a clear entry-to-inner-aisle route and solid furniture envelopes. Keep the stair foyer at Z=-24..-20 and lift foyers at Z>=30.2.

Reference details: Grill House cognac leather, dark ceiling beams and framed barrel graphics; Happy Lobster blue carpet, burgundy banquettes, white tablecloths and seafood display; Fast Lane lime/white service line and ceiling grid; Sea Pub blue/wood bar, beer taps, brown seating. Shops use white fixtures with recognizable clothing rails, handbags, glass watch cases, headphone/camera displays, souvenir mugs and toys; Luxury adds ring chandeliers, Desigual colorful patterned garments, Marimekko bold floral housewares.

Validate room renders, both collider audit modes, all entrances and return routes with actual walking, existing quest/key/lift regression, desktop/mobile verify and one quality review. Deck-6 Tavolata, Grande Buffet and Tax Free are outside this promenade request.

The existing rising stairs occupy X=10..12 behind the aft restaurant bays. Grill House and Happy Lobster therefore use shallow 3.8m-deep, two-table dining rooms to preserve stair headroom and access.

Promenade geometry validation: 592 static colliders, seven existing doors. Open/closed audits pass 10,758 floor probes, 82 stair probes, 141 doorway probes, 13,482 route probes and 13,950 enclosure probes. Interior contact sheet and representative storefronts reviewed. The existing ship-model pedestal stays in place with an explicit approach around it; two street tables move beside Fast Lane and a planter moves clear of Desigual.

Promenade runtime validation: all eleven new venues passed real-controller entrance, inner-aisle and return paths, room labels and floor support. Original stairs pass both directions; reception grants the room key; retail shelving blocks walking. Existing Coffee & Co, Bon Vivant, Starlight, Sea View and cabin access pass, along with music/lighting transitions and module disposal, failed-download cleanup and cancellation cleanup. The cleanup test now pauses simulation before removing the deck so a falling actor cannot alter its physics baseline. Desktop and portrait-phone verification pass at 60 fps with 654 bodies. The independent judge remains 6.8/10 on the unchanged boarding capture; its findings concern the pre-existing lift pit guards and unseen lifts. New venue visuals were reviewed in the dedicated Blender and runtime contact sheets.

## Finnish marks and coffee purchases
Start each game with 100 mk; show the supplied Finnish banknote at bottom-right with the balance above it. Add a female block cashier behind Coffee & Co's existing counter, using the existing NPC interaction on desktop E and the phone's floating prompt. Coffee costs 10 mk (initial tuning choice). Animate the banknote to the cashier and back using gameplay time, deduct once at payment, and confirm coffee served. Reject purchases without funds and ignore repeated interaction during payment. Preserve the welcome quest. Check actual desktop/phone purchases, insufficient funds, pause/resume, HUD image loading and existing key-card inventory. No other purchases or saving between sessions in this slice.

Money validation: desktop E and actual phone prompt taps buy coffee and change 100 mk to 90 mk; repeated input during payment charges only once. Ten purchases reach zero and the eleventh is rejected. Pausing freezes payment and balance; resume completes it. Walking from the cafe entrance to checkout and back passes, and reception still grants its animated key while preserving the wallet. Desktop and portrait-phone verification pass; independent review confirms the money HUD reads clearly, with existing lift-collider findings outside this addition. Phone screenshot review moved the temporary receipt to the center so it cannot overlap the banknote or joystick.

## Coffee mug handover and seating
Extend the existing 10 mk purchase with one visible low-poly ceramic mug, coffee surface and handle. Animate delivery from the cashier into a visible first-person hand; carry it while walking. Use ChairSeating's existing F / phone SIT / STAND action to place the mug on the nearby tabletop after sitting, and retrieve it when standing. Resolve tabletop height and placement from the furniture collider data, keeping mugs away from edges. Seats without a reachable table retain the held mug. One mug at a time prevents paying for invisible duplicates. Keep pause, mobile, cabin-card and seating behavior; dispose all mug resources. Validate purchase -> hand -> real walking -> sit -> tabletop -> stand on desktop and phone, rectangular/shared and round/terrace tables, no-table fallback and pause. Drinking and additional orders are deferred.

Mug validation: real desktop E/F and phone purchase tap, joystick walking and SIT / STAND complete payment, handover, carrying, shared-table placement and retrieval; balance stays 90 mk. Repeat purchase is not charged. Round terrace placement rests at y=.829 inside the table edge; shared-table placement rests at y=1.129 in front of the chosen stool. Looking around leaves the placed mug fixed. Pause freezes set-down animation; a lounge chair without a table retains the hand grip. Disposal removes the model. Inspected desktop/phone handover, grip and tabletop screenshots.

Coffee heat: added curling translucent steam for 15 gameplay seconds from serving, fading over the final two seconds. Real desktop/phone purchase and seating tests confirm animated steam in hand and on the table, paused cooling, expiry at zero, and no restart after retrieving the cold mug. Type check and mobile WebGPU verification pass. Dedicated held/table steam screenshots reviewed; the independent spawn-frame review retains the existing lift findings.

## Energy and drinking coffee
Start each session at 100% energy, shown top-left. Drain one percentage point per 30 gameplay seconds, stopping at zero; no new loss condition or movement penalty. Coffee adds exactly 10 points with no upper cap. R / phone DRINK consumes the cup once via a lift/tilt/lower animation, standing or seated; remove coffee and steam on consumption. Return a seated cup to its table, then leave it there when standing empty. Keep full mugs retrievable. Empty mugs remain visible after new purchases; drinking twice cannot award twice. One held mug at a time, with an empty carried mug exchanged at the cashier for a new paid cup. Pause freezes drain, drink motion and cooling. Validate above-100 HUD, desktop/mobile input, seated/standing drinks, repeat input, empty-table abandonment, new purchases without deleting old cups and existing full-mug behavior.

Energy validation: native desktop R and actual phone DRINK taps award one +10 boost, display 110% and allow a second paid cup to exceed 110%. Both standing and seated drinks remove liquid/steam; standing leaves each emptied mug on its table, and later purchases preserve those mugs. Empty/no-cup taps do nothing. Mobile taps are consumed so a tap before buying cannot drink a future cup. Energy stays 100 before Play, drains exactly one point per 30 gameplay seconds, stops at zero, and freezes with drinking when paused. Full-mug retrieval and cooled-coffee drinking pass. Desktop/mobile screenshots reviewed; compact energy text avoids phone route-label overlap and sits above desktop controls. Typecheck and desktop/mobile WebGPU verify pass.

Seated-only drinking correction: coffee can be drunk only once the chair transition has finished. The purchase confirmation and blocked attempts say “Sit down to drink your coffee.” Standing before consumption interrupts the sip, preserving coffee and awarding no energy. A sip already consumed while seated keeps its normal empty-cup result.


## Playable promenade slot machine
Add one red/black/chrome cabinet beside the deck-7 lift, based on the supplied photo. First-person exploration and desktop/mobile platform support remain. No matching genre recipe; planned from GAME-DESIGN.md. Core verb: pay 5 mk and spin three reels using desktop G / phone SPIN while nearby and facing the machine. Three identical symbols on the center payline pays 20 mk; otherwise lose the 5 mk stake. Display stake, paytable, moving reels, result and shared wallet balance. Reuse the existing Finnish-mark wallet for coffee and slots, guarding pending coffee payments, insufficient funds and repeat spins. Generate coin/start, reel spin, reel stop and win sounds through the engine SFX bus. Pause freezes reel progression. Cabinet has a solid collider and leaves the lift approach clear. Validate win/loss, debit/credit once, insufficient money, distance, repeat input, pause and desktop/mobile controls; inspect the actual cabinet screenshot, then verify and judge. Deferred: bonus rounds, multiple paylines, additional machines, saved balances.

Slot validation: real desktop G and phone SPIN taps insert the visible coin and deduct 5 mk once. Forced test outcomes confirm three matching symbols credit exactly 20 mk and mixed symbols pay nothing. Repeated input, insufficient funds, facing away and distant input cannot charge; pause freezes the spin. Coffee still spends from the same displayed wallet. Audio event capture confirms coin, reel motion, three stops per spin and one win jingle. Cabinet collider blocks walking through it. The cabinet backs onto the forward wall at (-3.8, .02, 35.48), facing aft, clear of the port lift lobby approach. Desktop and portrait-phone WebGPU verification and typecheck pass. Dedicated machine screenshots reviewed on both platforms; phone SPIN moved above the wallet. The independent boarding-frame review remains 6.8/10, with existing lift pit-guard warnings outside this feature.


## Silja jackpot and casino lighting
Add a fifth reel symbol: a white-and-blue Silja ferry. Three boats on the gold centre row pay 100 mk; other triples still pay 20 mk, with the existing 5 mk stake. Upgrade the marquee to advertise the jackpot and paytable, add pink curved edge lights, cyan screen trim and independent chasing lamps. Wins pulse gold; a jackpot celebrates for eight gameplay seconds with margin sparkles. Preserve pause, wallet, mobile controls and cabinet clearance; respect reduced-motion preference. Check boat jackpot pays once, ordinary triples retain their payout, misses and insufficient funds behave as before, and desktop/phone views remain readable.

Jackpot validation: forced three-boat outcomes change the wallet from 100 to 95 to 195 mk, awarding exactly 100 once. Ordinary three-bell outcomes still credit 20 mk; misses, repeated input, insufficient funds, pause and shared coffee payments pass. Desktop and phone WebGPU verification and typecheck pass. Reviewed the gold celebration screenshot with three clearly labeled SILJA boats.

Slot win-frequency tuning: each spin independently has a 19% chance of an ordinary 20 mk match, a 1% chance of the 100 mk Silja jackpot, and an 80% chance of no payout. This raises overall wins from 4% to 20% (about one in five spins on average). Stake and payouts stay unchanged. A seeded 100,000-spin simulation and exact probability-boundary checks pass.


## Contextual controls — E interact, F stand
Replace separate sit/spin/lift/drink bindings with engine Interactable components for nearby chairs, slots and lifts. Preserve eligibility checks and let the engine select the nearest eligible target. E talks, buys, opens doors, sits, spins and operates lifts; seated E drinks, F stands. Phone shows one contextual action plus Stand only while seated. Preserve movement and animation behavior, suppress surrounding interactions while seated, and consume each press once. Validate desktop/mobile actions, overlap arbitration, held inputs, pause, coffee interruptions and old-key removal; check, reload, verify both platforms and review screenshots.

Context-control validation: real desktop keys and iPhone taps pass coffee buying, E sitting/drinking, F standing, full-cup retrieval, interrupted sips, exactly one +10 energy award, empty-cup abandonment, slot debit once/held E/facing restrictions, lift travel both directions, pause and stale-input rejection. Information-clerk and cabin-card interaction pass on both platforms. Phone contextual prompts use the engine's fixed HUD position so targets beside/behind the camera remain tappable; Stand is visible and interactive only while settled seated. Old G/R/L bindings and F-to-sit are removed. Regression script: `src/work/__tests__/context-controls.mjs`.
Phone screenshot review: Stand uses the higher right action slot and a rectangle-intersection assertion confirms it does not overlap Drink. Typecheck, desktop and phone interaction regressions pass; desktop WebGPU verification passes at 60 fps.
Final desktop/mobile WebGPU verification passes at 60 fps. Independent mobile review: 7/10; remaining findings concern existing thin foyer pit-guard colliders and crowded objective banner, outside this controls change.


## Gentle ship swell
Single-mechanic immersion pass using engine sailing/SwellSway, per mechanic-sailing.md. Half-strength default swell, smoothly gated by authored ship volumes (exclude boarding gangway) and reduced-motion preference. Apply after the first-person camera update and before held-mug positioning; advance only during PLAYING. No helm, voyage, additional controls or physics transforms. Validate temporal camera changes, bounded/nonaccumulating offsets, gangway/boarding, pause, seated view, reduced motion and desktop/mobile runtime.
Swell validation: desktop and iPhone temporal tests pass actual rendered roll/heave, half-strength bounds, stationary physics, nonaccumulating camera offsets, pause, seated camera, live reduced-motion preference and gangway fade-out. Typecheck and desktop/mobile WebGPU verification pass at 60 fps. Screenshots reviewed; independent boarding-frame review remains 7/10 with existing pit-guard/banner findings, unrelated to sway.


## Sea Pub beer service
Initial slice; energy and intoxication behavior is superseded by the next milestone below.
Extend the existing first-person exploration and shared Finnish-mark wallet; no new genre recipe. Core verb: buy one 20 mk beer from the bartender with E / phone contextual interaction. Show an empty glass under an inward-facing tap, visible pouring and rising beer/foam, then hand that same glass to the player. Reuse the existing carry, table placement, seated E drinking and F standing behavior. Beer is a separate drink with no coffee energy bonus; prevent simultaneous coffee/beer orders and duplicate charges. Refuse insufficient funds and distant requests, freeze serving with gameplay pause, refund an interrupted unserved order on teardown. Add explicit pub chair/booth seating and tabletop support. Rebuild the pub bar with a staff aisle behind the counter, counter-mounted tap tower, inward spout and drip tray; preserve the central route and room lighting. Validate desktop/mobile purchase, pour/handover, one debit, seating/table support, interrupted drinking, no energy reward, coffee regression, pause and disposal. Deferred: drink choices, intoxication effects, new audio and saved orders.

Beer-service validation: desktop E and iPhone prompt taps complete the 20 mk purchase, visible rising beer/foam, handover, lounge-table and booth placement, seated drinking and empty-glass abandonment. Duplicate orders, insufficient funds, cross-drink orders, pause and walk-away refunds pass. Interrupted sips preserve beer; beer grants no energy, and the coffee regression still grants +10. Corrected standing’s inherited 0.4-second teleport interaction lock so the next phone Sit tap is accepted immediately. Blender open/closed audits and typecheck pass.


## Beer energy and temporary dizziness
Each completed seated beer gives +15 percentage points of energy exactly once, capped at 110% total energy. Each beer adds 0.4 dizziness, capped at 1; a fresh drink resets a three-minute gameplay-time recovery window, with linear fade from the new severity. Dizziness adds bounded walking weave and up to 25% slower movement through the existing controller direction calculation, never movement while idle. Apply subtle nonaccumulating camera sway after ship swell and blur only the game canvas (HUD remains sharp). Reduced-motion skips added camera oscillation; walking and static blur still communicate the status. Display severity and remaining recovery. Pause freezes recovery and sway. Validate actual beer completion versus interruption, stacking/cap, 180-second recovery, real walking versus idle, pause, reduced motion, camera bounds, disposal and desktop/mobile. Existing coffee +10 and beer purchase flow remain.

Dizziness validation: desktop keyboard and iPhone touch-joystick checks pass stacking, maximum severity, actual slower/weaving movement, stationary idle, camera changes, pause, reduced motion, full 180-second recovery, restored walking and filter disposal. Beer-service regression passes both platforms, including exactly +15 energy and dizziness on completed beer, interrupted sips and coffee +10. Typecheck and desktop/mobile WebGPU verification pass at 60 fps. Both dizziness screenshots reviewed: scene blur is visible and status remains sharp.

Energy cap correction: all energy gains, including repeated coffee and beer, clamp the stored value and HUD to a maximum of 110%. This supersedes earlier uncapped behavior.

Quest completion feedback: show a six-second success toast in the center with trophy, completed task and progress/reward. Add a 2.8-second gold/blue confetti burst, suppressed under reduced motion. Celebrate the first room-key handover, cabin check-in, and each new tour destination once; retain the existing final victory screen. Validate desktop and phone interactions, revisit deduplication, dismissal and reduced motion.
Quest feedback validation: desktop E and iPhone contextual taps pass real key collection, cabin entry, new destination completion, repeat-interaction/revisit suppression, reduced-motion confetti suppression and automatic banner dismissal. Desktop and phone celebration screenshots reviewed; the success banner is bold, centered and readable.

Lift-floor seam repair: reproduced coplanar flicker with and without mesh shadows. Removed 77 overlapping horizontal render faces in the base module around both lift foyers and corridor/gallery joins; preserved runtime colliders. Cleanup rerun reports zero changes. Blender close views reviewed; open/closed audits with runtime door sidecar pass. Desktop keyboard and iPhone joystick cross both foyers on decks 7/8 with level support; browser floor screenshots are clean. Typecheck and desktop/mobile runtime verification pass.


## Rear elevator staircase
Photo-inspired return stair behind the port elevator, connecting its deck 7 and deck 8 foyers. Retain both existing elevators. Two flights rise 1.7 m each, with a half landing, blue-grey patterned carpet, luminous nosings, stainless rails, wooden handrails, a round sea-view window, wall waves and deck signs. Open the existing port foyer wall at both floors; preserve the hull and other venues. Authoring: src/work/art/lift_stairs.py. The model is registered as a hosted asset.
Validation: open/closed collider audits and typecheck pass. Real keyboard and iPhone joystick traversal passes upward and downward through both flights and the foyer joins, with correct final deck heights and clear interior views. Desktop/mobile WebGPU verification passes at 60 fps. Screenshots reviewed. Regression: src/work/__tests__/lift-stairs.mjs.


## Twin rear stairs and deck 8 cabin access
Mirror the photo-inspired return staircase behind the starboard elevator, retaining both lifts. Split the former starboard cabin corridor around the stairwell and open a direct cabin passage at its upper landing. Port arrivals cross the existing deck 8 gallery to this passage. Preserve the forward corridor and Starlight access via the gallery. Remove the displaced decorative cabin door and trim new render joins while retaining overlapping floor colliders. Authoring: src/work/art/twin_lift_stairs.py, after lift_stairs.py. Both stairs, the gallery route, cabin doors and return routes are covered by src/work/__tests__/lift-stairs.mjs.
Validation: open and closed collider audits pass. Desktop keyboard and iPhone joystick tests pass both staircases up and down, each upper-foyer route to cabin doors 8401/8402 and back, landing heights and shell visibility. Typecheck and desktop/mobile WebGPU verification pass at 60 fps. Blender landing/stair views and runtime cabin/stair screenshots reviewed. Hosted registration was completed during the subsequent open-access pass.


## Open stair access to deck 8 destinations
Remove the obsolete approved decorative leaves for cabins 8419/8420 from the stairwell, clip corridor wall finishes out of the stair footprint, and open 1.9 m passages from both upper foyers into the Starlight upper gallery. The existing cabin-corridor passage stays open; individual cabin doors remain keyed. Update both the base and Starlight meshes and the shared colliders together. Authoring: src/work/art/open_stair_access.py, after twin_lift_stairs.py. Extend real desktop/mobile walking coverage to visit and return from both destinations after each staircase.
Validation: both full stair-to-destination routes pass on desktop keyboard and iPhone joystick, including return walks, cabin-corridor access and Starlight deck 8 height. Open/closed geometry audits pass. Removed six redundant corridor-wall colliders and split overlapping entrance reveal surfaces; reviewed the corrected sign and open passages in Blender. Both updated modules are registered as hosted assets. Independent boarding-frame review is 7/10; remaining mascot rigging and navigation findings are outside this access change.
Final validation after the reveal/sign cleanup: both open entrances pass real walking at deck 8 height; desktop/mobile WebGPU verification passes at 60 fps. Final entrance and stair-landing screenshots reviewed with no obsolete door leaf or overlapping reveal surfaces.


## Remove obsolete corridor pocket
The gold-framed former Starlight gallery doorway led only into a leftover forward cabin-corridor section. Remove its frame, panels, rails, floor, roof and outer/bow walls, remove the retired room and route from metadata, and restore the continuous Starlight side wall. The two direct stair-foyer entrances and cabin access remain the active routes. Implemented in open_stair_access.py; this supersedes the earlier retained forward-corridor branch.
Validation: open/closed geometry audits and typecheck pass. Final browser checks walk through both stair-to-Starlight entrances and confirm that the retired doorway is solid at deck 8 height. Reviewed Blender and runtime views; desktop/mobile WebGPU verification passes at 60 fps. Updated base and Starlight assets are hosted and the preview is reloaded.


## Stair landing surface cleanup
Trim overlapping horizontal render faces at stair flights, half/upper landings and foyer thresholds on both sides. Floors take precedence over hidden wall tops; venue geometry and runtime colliders stay unchanged. Rebuild the existing straight rails with closed eight-sided tubes to remove their uncapped ends. Authoring: src/work/art/stair_surface_cleanup.py after open_stair_access.py. The initial cleanup removes 43 overlapping faces and caps 84 rail/post meshes; a second pass removes zero faces.
Validation: close Blender renders and runtime views from three nearby camera positions on both landings show clean surfaces and capped rails. Desktop keyboard and iPhone joystick cross both cleaned thresholds at deck 8 height. Typecheck and desktop/mobile WebGPU verification pass at 60 fps. Base asset is hosted; collision metadata is unchanged. Boarding-frame judge remains 7/10 with the existing mascot/navigation findings outside this repair.


## Clothing-shop threshold surfaces
Remove the coplanar shared promenade/cafe floor faces beneath Fashion, Desigual and Marimekko, plus the hidden wall bottoms in the same footprints. Preserve the shop floor finish, existing shop modules and physics. Authoring: src/work/art/shop_surface_cleanup.py after the current assembly repairs. Initial pass trims 12 base faces; a second pass changes nothing. All three close threshold renders and open/closed geometry audits pass.
Final validation: hosted base module loaded; close game views show clean joins at all three entrances, and real desktop keyboard/mobile joystick walks enter and exit each shop. Typecheck and desktop/mobile WebGPU verification pass at 60 fps. Shop GLBs and collider metadata are byte-identical. Boarding-frame judge remains 7/10 with unchanged mascot/navigation findings outside this repair.


## Restaurant entrance surface audit
Check floors, jambs, lintels and folding doorframes at Coffee & Co., Bon Vivant, Grill House, Happy Lobster, Fast Lane, Sea Pub and Starlight. Trim coplanar render faces only within the entrance bounds; preserve winding, material/UV mapping and all physics. Authoring: src/work/art/restaurant_surface_cleanup.py after the existing assembly repairs. Initial cleanup trims 126 faces on 73 objects across base and six venue modules; a second pass changes nothing. All entrance renders, close Grill House/Sea Pub frames and open/closed geometry audits pass.
Final validation: all seven entrances pass real desktop keyboard and iPhone joystick entry/exit checks at the correct floor height with no browser errors. Reviewed runtime frame, header and threshold views; desktop/mobile WebGPU verification passes at 60 fps. All seven changed modules are hosted; collider metadata is byte-identical. Boarding-frame judge stays 7/10 with the prior mascot/navigation findings outside this repair.

## Complete the existing deck 8 cabin row

Implement 8403–8418 by reusing the furnished 8401/8402 interiors. Keep the former 8419/8420 positions as stair access. Two shared GLBs use eight GPU instances each; added doors share the approved leaf with individual number textures and keyed locks. Cut structural bulkheads and handrails at each door and add translated room colliders, volumes, landmarks and routes. Information continues to issue the 8402 card. Source and room table: `src/work/art/complete_deck8_cabins.py` and `src/work/art/deck8-cabins.md`.

Validation: typecheck and full open/closed geometry audits pass (908 colliders; all cabin routes and room envelopes checked). Browser regression walks through each of the 16 added doors, tests closed-door blocking and wrong-card rejection, then checks floors and exit; original 8401/8402 regression also passes. Shared room meshes are asserted to use eight instances each. Desktop and iPhone WebGPU verification pass at 59/60 fps. Blender interiors and runtime promenade/sea views reviewed. Independent boarding-frame review remains 7/10, with existing mascot and entrance-decal findings outside this cabin change.

## Sequential deck 8 cabin numbers
Renumber all existing stations in ascending odd/even pairs from the aft stairs: 8401/8402 at Z=-9 through 8417/8418 at Z=27. Original geometry at Z=14 becomes 8411/8412. Reuse the shared numbered door for every room, remove stale fixed plaques, and move the 8402 check-in volume, landmark and proximity hints with its room number.

Numbering validation: all 18 door numbers agree with their keys, volumes, landmarks and routes. Desktop and phone key handover/check-in regressions pass at the new 8402 location. Final WebGPU verify passes at 60 fps; corrected 8402 and 8412 plaques reviewed in the running game.

## Random passenger cabin assignment
Pick one of the 18 playable keyed cabins once when creating a new game, independently of the fixed ship seed. Keep that assignment for the playthrough. Use the same assignment for the clerk handover, key card artwork/view label, keyring, door-reader feedback, proximity hints, check-in room and tour objective. Both promenade and sea-view cabins are eligible, and entering another cabin must not complete check-in.

Assignment verification: selector coverage reaches all 18 rooms with matching keys, room volumes and view types. Door regression passes. Desktop/mobile WebGPU verification passes at 60 fps with reserved port 3100 excluded (verification range 3103–3199; gameplay preview 3150/3151).
# Traveler selection milestone

Status: COMPLETE (2026-09-25). All six custom rigged travelers are registered and playable: Sari (family), Eero (senior), Milla (party), Jari (shopper), Anu (road traveler), and Timo (professional driver).

The themed responsive chooser appears after Play and shows the actual animated avatar, role, description, starting money and energy. Gameplay stays paused until confirmation. The selected model and stable TravelerId transfer into the game once per voyage. The existing movement capsule, first-person camera, prices, energy cap and abilities are preserved. Networking and third-person gameplay remain future work.

Validation: all six real models pass desktop and phone preview/boarding tests (12 paths), including finite moving skeletal poses, exact model URL and identity transfer, starting traits, unchanged collision dimensions, paused selection, rapid selection, first-person visibility and pause/resume. Failed-download retry, duplicate confirmation and fresh-voyage tests pass. Type checking and full desktop/mobile WebGPU verification pass at 60 fps. Verification stops at the intentionally paused chooser; dedicated tests confirm that boarding resumes gameplay.

The completed cast has been visually reviewed in the running chooser. Independent mobile review: 7.3/10, with clear traveler labels, stats and boarding control. Its paused-state concern is covered by the successful boarding tests. The pre-existing seal mascot rig warning and optional card-depth styling are outside this character milestone. Previous cabin, stairs, dance, and drinks/seating regressions passed during implementation; the new road-traveler model is also checked against drinks and seating.

Generation recovered after earlier service failures; the final three models arrived successfully on 2026-09-25. Earlier failed job IDs remain in .bitmagic/travelers/recovery.json for diagnostics and must not be regenerated now that all six assets exist. No publication was performed.

## Cabin mirror reflection
Implemented planar reflections over the existing authored mirror faces in both cabin templates and all 16 repeated cabins. WebGPU uses the Three.js reflector node; WebGL uses its Reflector counterpart. A reflection-only skeleton clone shares the selected avatar assets and follows its pose, without changing first-person visibility. One nearby mirror is active at a time, and render targets and cloned skeletons are disposed with the game.

Validation: real-browser desktop and phone checks pass in WebGPU and WebGL. Both original and repeated cabins activate correctly, the reflected traveler identity matches the selected character, movement and bone poses stay synchronized, and leaving the cabin disables reflection rendering. Anu and Eero reflections were visually reviewed. Type checking passes.

Full desktop/mobile WebGPU verify passes. The required independent judge reviewed the default chooser frame (7/10), not the cabin scene; its pause finding refers to the intentional selection gate already covered by boarding tests. Mirror evidence is in .bitmagic/mirrors/ with reviewed desktop and phone screenshots from both backends.

Cabin wall correction: raised both existing framed prints by 0.7 m in each room template (and all repeated cabins), leaving a 0.21 m gap above the mirror frame. The mirror remains in its original usable position, away from the shower fitting. Original artwork and frame geometry are retained. Desktop and phone layout screenshots are captured by the mirror regression.

Cabin threshold correction: the blue corridor slab extended over both oak cabin floor edges at y=3.4. Its visual width is now 1.85 m, meeting x=10.075 and x=11.925 without overlapping faces. The existing floor colliders remain level. The authored corridor script uses the same width for future exports.

## Starlight terraced showbar — implementation
Rebuild the existing 20 × 24 m Starlight module from its registered GLB. Preserve the shell, stage, windows and upper side passages. Entrance stair: 3 m wide, from y=0 to 3.4, z=38.4–43.8. Upper rear seating wraps around it; three broad curved tiers descend from y=3.4 via 2.267 and 1.133 to the y=0 dance floor. Paired side aisles provide short stair flights; guard all drops. Keep the y=3.4 side gallery routes to Sea View and both lift foyers. Move lower chairs onto the tiers and maintain seating interactions. Keep dancers and dancing on the lowest floor.
Routes to check: promenade entrance → upper seating → both descending aisles → dance floor, in both directions; upper seating → both lift foyers and Sea View. Update mesh and collision data together, review entrance and stage-facing renders, run open/closed geometry audits, desktop/mobile walking and interaction regressions, typecheck, full verify and independent judge.

Validation: all entrance, terrace descent/return and upper-gallery connection routes pass with actual desktop keyboard and iPhone joystick input. All three seating tiers pass sit/stand and stage-facing checks on both platforms; dancing is unavailable upstairs, and the lower-floor dance quest, toggling and energy tests pass on both. The full collider BVH passes 14,390 checks in each door mode. Starlight has no detected coplanar overlaps; one unchanged exterior railing pair remains outside this pass. The independent judge graded the default mobile boarding frame (7.3/10), not Starlight; its mascot/boarding-HUD findings remain outside this layout change.

Final hosted-mesh validation: typecheck and full desktop/mobile WebGPU verify pass. The final isolated desktop run reports 44 FPS on the host; phone emulation reports 60 FPS (not a physical-phone benchmark). No visual detail was removed for performance. Final reviewed game views are in `.bitmagic/starlight-terraces/`; the corrected readable entrance sign is also reviewed in `build/starlight/sign-review/`. Dev preview reloaded; no game publication performed.

### Close the paired Starlight lift-lobby shortcuts
Per the creator’s screenshot, close both direct side passages on the upper level (the visible lift indicator reads 7). Lower passages were already solid. Add matching visual wall infills and colliders, remove obsolete lobby signs, and reroute upper-lobby access through the central landing. This supersedes the earlier direct-foyer entrance design.

### Starlight lower lounge and roulette — playable slice
Keep the immediate central stair and the terraced showbar. Dress both ground-level bays beneath the rear platforms in Sea View Lounge's grey organic carpet. Facing into Starlight (+Z), the player's right is -X: place one roulette table in that bay; add four sit-able cream chairs and small tables in the +X bay. Preserve a clear path around the stair foot and headroom below the upper platforms.
Use the existing low-poly Blender venue workflow for floors/seating; generate one roulette-table model. Reuse the wallet and InteractableComponent (E / phone Interact). Roulette opens an accessible touch-friendly betting board: select a number 0–36 or red/black, odd/even, low/high, select a 5/10/25 mk stake, then spin. Single zero; straight-up returns 36× stake, even-money bets return 2×; zero loses outside bets. Clear outcome and balance, one charge/settlement per spin, insufficient funds rejected, no real money. Allow closing during a spin without losing settlement; pause when the voyage is paused; clean up on disposal. No extra casino games or roulette quests in this slice.
Validation: deterministic odds and wallet tests; desktop/mobile interaction, outcomes, affordability, pause/close safety, both bay routes and chair sit/stand; geometry audits, screenshots, check, verify and one quality review.

Roulette slice implemented: generated hosted roulette table; exact Sea View carpet pattern reused in both lower bays; four existing cream chairs reused with wider approaches; wallet-backed single-zero roulette board with 0–36 and six outside bets, 5/10/25 mk stakes, five-second wheel animation, single settlement, close/pause handling and cleanup. Deterministic payout/wallet checks and real desktop/iPhone interaction checks pass, including all four chairs.

### Physical roulette and dealer
Replace the popup with camera-aimed tabletop bets, stake chips and a physical spin control, using the existing E / touch interaction. Keep all existing bets and payouts. Repair the generated tabletop with a readable felt layout and moving 37-pocket wheel, ball and chip marker. Add a suited stationary croupier behind the wheel, reaching to launch each round. Ball settles in the actual winning pocket; result remains on a table display. Walking away leaves the paid round running; pause and disposal retain existing guarantees. Validate desktop and phone input, wheel/result agreement, dealer, funds and pause behavior.

Physical roulette validation: desktop keyboard and iPhone touch tests pass for number/outside bets, stakes, single charge and settlement, zero payout, insufficient funds, pause, walking away, floor isolation and all four lounge chairs. The winning ball aligns with the settled wheel; the croupier spawns behind the wheel. Typecheck, all-outcome odds tests and full desktop/mobile verify pass (42 FPS desktop, 60 FPS phone emulation on host, not physical-phone performance). Independent judge again reviewed only the boarding frame, 7.3/10; its unchanged boarding overlay/bench findings are outside this roulette change. Table views reviewed separately in .bitmagic/roulette/.

### Roulette pacing, sound and quest
Extend the paid round from five to eight gameplay seconds, sharing one duration constant between settlement and wheel animation. Add roulette roll audio, chip placement, pocket stop and winning payout sounds through the engine audio bus, with pause/resume and disposal cleanup. Complete First roulette round for 100 TP after the first settled paid round, win or lose; use existing once-per-voyage quest celebration. Show the objective in the table guidance. Test delayed settlement, pause/audio, rejected payments and no duplicate quest awards on desktop/touch.

Roulette pacing/audio/quest validation: pure odds tests confirm a round is still pending at five seconds and settles at eight. Desktop and iPhone touch gameplay tests pass, checking active audio during spin, stopped audio while paused/settled, first-round 100 TP and no additional TP across subsequent wins/losses, existing payouts and insufficient funds.

### Deck 9 cabins — current slice
Add a second 18-cabin row above deck 8, rooms 9401–9418, using the approved furnished sea/promenade templates. Keep the compressed ship footprint, exterior and tall atrium. New floor at y=7.05 clears the existing deck 8 ceilings. Corridor: x=11, z=-12.05–30.1, 2 m clear width; rooms: x=8/14, same nine Z stations, 4 × 3.2 × 3 m. Each numbered door connects the corridor to its matching room and key. Extend both rear return stairs and lift foyers; upper cross-landing joins port access to the starboard cabin corridor. Preserve deck 7/8 routes. Spawn and voyage rules unchanged.
Extend lift service to deck 9 with closed landing gates when absent. Cabin assignment, clerk guidance, key card, deck label, beds and mirrors must work on both cabin decks. Reuse assets, no new generation. Review geometry, audit open/closed routes, walk stairs and cabins on desktop/touch, test lift travel and locks, check, full verify and independent quality review.

Deck 9 implemented: 18 new furnished cabins (36 assignable total), matching card access, deck-aware directions/check-in, sleep and mirrors; both rear staircases and panoramic lifts serve deck 9. Geometry audits pass 38,134 open-door and 16,096 closed-door checks, including old rear stair routes and the full lift shaft. All 18 new cabins pass desktop lock/rejection/entry/floor/exit checks. Four end cabins pass actual touch card scanning and walking. Both stairs and both lifts pass desktop/touch travel, and both cabin types pass sleeping/waking and mirror activation on both platforms.

With creator approval, the reviewed mesh was uploaded and registered as `ship-base` at https://bitmagic.ai/worlds/v3/VPCT0XSS4E64/1791645861927-ship-base.glb, preserving GLB format and native target height 56.619734. The temporary local mesh was removed.

Final local verification: typecheck and full desktop/mobile WebGPU verify pass (1,821 physics bodies). Desktop measured 27 FPS on this host, with a performance advisory; phone emulation measured 60 FPS and is not a physical-phone benchmark. No visual detail was removed. New cabin window views were reviewed in `.bitmagic/deck9-cabins/`. No game publication performed.

Independent review graded the default boarding/entrance frame at 7.3/10, not the new cabin deck. It repeated the existing clipped coffee-tip finding. The CLI also warned about screenshot staleness after the design-note update; no further model calls were made. The new deck was reviewed separately through Blender renders and the passing gameplay screenshots.
