# Party Boat — Welcome Aboard

## Pitch
A first-person survival adventure aboard the supplied Silja Symphonade ship model: survive the whole overnight crossing from Helsinki to Stockholm and collect trip points by doing quests. Silja Symphonade is an imaginary ship whose name blends two real Silja Line ferries, Silja Serenade and Silja Symphony; the real-ship photos and tours below are architectural references only.

## The voyage
The ship departs Helsinki at 17:00 Finnish time and arrives in Stockholm at 09:30 Swedish time next morning (17.5 ship hours). The ship clock, top-right in the HUD, starts at 17:00 when the traveler boards and runs about 17.5× real time, so the crossing lasts about 60 real minutes; it stops while paused. At 01:00 Finnish time ship time changes to Swedish time and the clock goes back one hour (00:00). Toasts announce the departure, the clock change and the approach to Stockholm at 09:00. Sleeping in a cabin bed makes ship time pass 12× faster (about 3.5 ship hours per real minute; the clock icon turns to 💤), and dizziness wears off at the same accelerated pace, while energy recovers as before. Waking returns the clock to normal speed.

## Trip points
Quests award trip points (TP), shown under the clock and on the end screen: room key 50, cabin check-in 100, Bon Vivant / Coffee & Co / Sea View Lounge 50 each, dancing at Starlight 100, finishing the welcome tour back at Information 200, drinking your first coffee 25, finishing your first beer 25, completing your first roulette round 100 (win or lose), and hitting the Sea Fortune Silja jackpot 250 (ordinary slot wins pay money only). Each quest pays out once per voyage.

## Bon Vivant reservations
Bon Vivant serves reserved tables only. A host in a navy waistcoat stands at a walnut lectern on the promenade beside the entrance; E / phone interaction opens a reservation card (the voyage pauses) offering the 18:00, 19:30 and 21:00 seatings (Finnish time). Seatings that have started are closed. One reservation per voyage, shown top-right. Arrive and sit at any Bon Vivant table from 15 minutes before to 30 minutes after the seating: dinner is served on the table for 30 mk, eaten over a few seconds, and grants +25% energy and the *Dinner at Bon Vivant* quest (150 TP). Sitting early, or without a reservation, only gets a waiter's reminder; standing before finishing cancels and refunds the meal. Missing the window fails the dinner quest for the voyage and the host takes no new booking. The welcome-tour Bon Vivant stop counts once the host has been consulted.

## Choose your traveler
The game opens directly on the traveler screen, which replaces the engine start screen: choose one of six adult low-poly caricatures in a full-body animated preview, then confirm Board solo, which starts the voyage. A Multiplayer button beside it is marked Coming soon and only says so when pressed. Sari, the family vacationer, starts with 110 mk and 90% energy; Eero, the senior cruise regular, 120 mk / 80%; Milla, the partygoer, 80 mk / 110%; Jari, the tax-free shopper, 130 mk / 70%; Anu, the road traveler, 100 mk / 100%; Timo, the professional driver, 90 mk / 105%. Each has a distinct outfit and personality. The choice stays fixed for the voyage and its retries; a new voyage asks again. Money and energy are the only gameplay differences. Existing prices, energy rules, camera, speed and collision dimensions are shared. Selection pauses gameplay and supports keyboard, mouse and touch. The chosen rig is the actual player avatar, with a stable traveler identity for future multiplayer; gameplay remains first-person and networking is deferred.

## Core loop
Board through the deck 7 side entrance and first visit the Information clerk. Speak to the uniformed clerk behind the counter to receive the key for your randomly assigned cabin on deck 8. Find deck 8 using the stairs or lifts, unlock the numbered door with the key, and walk inside. After checking in, explore Bon Vivant, the cabins, Coffee & Co, Starlight and Sea View Lounge, and return to Information to complete a self-guided welcome tour. No time limit.

## World & look
Retain the supplied ship exterior, silhouette, livery, lifeboats and glazing. Fit a compact passenger interior inside it. Follow Tallink’s deck allocation and venue photographs while retaining an explicitly compressed footprint. This is an interpretation of selected spaces, not a full dimensional replica.

## Art direction
Begin on a short glazed boarding gangway outside the ship, facing the deck 7 entrance. Match the supplied entrance photo: rounded white hull opening, timber SILJA SYMPHONADE plaque, blue Silja welcome mats, metal threshold, paired working glass doors, and a white vestibule leading to the promenade between Fashion and Luxury. The gangway is a compact gameplay interpretation.

Two semicircular glass-fronted cars with polished chrome bands sit at the forward ends of the promenade cabin rows. Their curved glass faces inward across the promenade. Walk around the end of either row into a rear foyer to board. Deck 8 foyers connect through the upper landing, and the starboard foyer opens directly into the cabin corridor. Only the rounded front half projects into the atrium; the rear half and entrances sit behind the side wall. Warm ceiling lights and green illuminated underside panels follow the supplied elevator photograph. Both carry passengers between the currently playable decks 7 and 8, with centre-opening landing doors and a gallery connection. Following the supplied door reference, the paired leaves have glossy burgundy lacquer, polished brass jambs and sill, a split circular medallion, four stacked curved brass lines meeting at the centre seam, and swept brass kickplates. Both halves carry their ornament as they slide into the jambs; the indicators retain the playable deck numbers 7 and 8. E / phone contextual interaction calls or operates the nearest lift. Their placement and dimensions follow the game's compressed layout.

Match the promenade architecture visible in the creator's reference photo: a tall white atrium lined by four stacked rows of projecting warm-white cabin bay windows with rounded bronze frames and blue-green glazing, topped by clerestory windows and a bright skylight. Ground level is a dark timber shopping street with black fascias, illuminated white shop names, fine red light strips, cafe seating and globe lamps. Preserve a clear central walking route. Low-poly authored geometry should capture these proportions and repeated details; avoid a low ceiling, broad blue carpet or decorative balcony railings.

Reference: [Silja Serenade 2016 3](https://commons.wikimedia.org/wiki/File:Silja_Serenade_2016_3.jpg), photograph by Smiley.toerist, CC BY-SA 4.0. Studied as architectural reference; the photograph itself is not included in the game.

## Win / lose
Reaching Stockholm at 09:30 Swedish time is a win, showing trip points, quests completed, ship time and energy. You lose if energy reaches 0% (you pass out; a warning appears at 15%), if a beer would push dizziness past 100% (two quick beers are fine, the dizziness status warns when one more is too many), or if you fall below the safe deck. Finishing the welcome tour no longer ends the game; it awards trip points and the voyage continues.

## Later
More decks, cabins, lifts, passengers and party activities.

## Tallink-based expansion
The playable ship now spans a compressed interpretation of decks 7 and 8. Starlight is a double-height bow showbar with a cyan-lit upper gallery, cream seating, patterned carpet and a curtained stage. Sea View Lounge sits forward on deck 8 with large sea windows and cream seating. An actual stair flight connects deck 7 to the narrower deck 8 cabin corridor. All 18 cabins in the current deck 8 corridor (8401–8418) are furnished and enterable with their matching room keys. They reuse the two original promenade-view and sea-view interiors: pale oak fittings, blue/white striped curtains, bedding, folded berths, TVs and compact bathrooms. The 16 added rooms share two instanced room models and one card-reader door model, with individual numbers and locks. Numbers ascend in odd/even pairs from 8401/8402 at the aft stairs to 8417/8418 at the lift end. Each new game assigns one of the 18 cabins at random. Information gives the matching key; the card, clerk dialogue, door access and check-in objective all use that room number and its sea or promenade view. The assignment stays fixed throughout the playthrough. Information uses a white mosaic-style counter and black illuminated fascia nearer the forward promenade.

The self-guided tour visits Bon Vivant, Coffee & Co, Starlight, Sea View Lounge and your assigned cabin before returning to Information. An onboard directory describes the real deck distribution and marks the playable decks. See [reference notes](SHIP-REFERENCE.md) for sources and deliberate scale approximations. Other decks, cabins beyond the current deck 8 corridor, passengers and activities remain future expansions.

## Sea-window views
All sea-facing windows in the playable cabin, Starlight upper gallery and Sea View Lounge are transparent glazed openings onto one outdoor Baltic scene. The sea sits below the passenger decks, with wavelets and distant pine-covered skerries. No flat sea/sky panels sit behind the glass. The promenade cabin retains its atrium view. Glass remains physically solid.

## Commons photo refinement
Use the newer promenade photographs for white bay fronts, pale blue-green reflections, large tiered crystal chandeliers, pink/violet bay uplights and perpendicular shop signs. Starlight has cream tub chairs oriented towards the show floor, taupe organic-outline carpet, glossy gallery counters, chrome fittings and a blue-lit stocked bar. Sample cabins carry fine blue triangular berth patterns, framed geometric prints and oak ledges. Preserve the existing compressed decks 7–8 and all sea-window sight lines.

## Virtual tour art direction
The supplied [Tallink/Procontent virtual tour](https://procontent-tuurid.s3-eu-central-1.amazonaws.com/tallink/silja-serenade/tour.html) is the leading reference for this pass. Its promenade has broad white fascia with narrow black edging, warm varied timber and white mosaic Information frontage. Coffee & Co has cream octagonal tiles with dark inserts, a tiled pastry counter, charcoal walls and black bistro chairs. Starlight uses bronze ceiling ribbons and blue cove lighting; Sea View uses grey organic carpet, curved pale grey sofas and white round tables. A-class cabins use grey covers, broad navy/white curtain stripes and pale oak ledges. Retain the compact authored deck layout; this is not a measured reconstruction. Corridor finishes are inferred from the adjacent cabins; no dedicated corridor panorama is supplied. All photographs are reference-only.


## Coffee & Co
Match the open cafe frontage and interior in the supplied 360 tour: cream octagonal tiles with dark inserts, white brick-tiled service counters, a sloping multi-shelf food display, digital menu boards, beverage machines, a stocked drinks fridge, pale oak high tables and dark bentwood chairs. Grey walls, round service-partition windows, metal ceiling panels and warm cove lights define the room. Terrace tables sit beside a wide open entrance, clear of the central promenade route. The existing compressed cafe location remains the tour destination.

Bon Vivant adds a sixth explorable destination behind its deck 7 promenade storefront: a compact tour-inspired dining room and wine bar. Navy chairs, dark banquettes, branching metal screens, round sea windows, warm leaf-shaped ceiling fixtures and set oak tables distinguish it from Coffee & Co.

## Private cabins and key inventory
Each cabin door requires its matching key. The clerk gives only the key for the cabin randomly assigned at the start of this game; other cabins remain private. The persistent key card displays the assigned cabin number and view type. The current tour requires five accessible stops: Bon Vivant, Coffee & Co, Starlight, Sea View Lounge and the player's assigned cabin, followed by a return to Information.

Starlight access is permanently open from the deck 7 promenade, the lift landing and the deck 8 cabin corridor. These openings have frames but no door leaves or opening/closing animations. Both entrances from Starlight to Sea View Lounge are also permanently open, with no doors.

## Starlight stage lighting
Use the creator’s nightclub reference: a dim blue-violet room, magenta and blue stage washes, visible soft haze beams from the five existing truss fixtures, and slowly sweeping pink/purple/blue pools on the dance floor. Keep the aisles readable, avoid strobes, and smoothly restore normal ship lighting when leaving Starlight.

## Information acoustic act
A seated low-poly troubadour plays an acoustic guitar on a wooden chair to the left when facing the Information desk. Gentle strumming and a quiet solo acoustic instrumental are localized to this corner of the promenade. Keep the check-in approach and through-route clear.

## Complete promenade venue interiors
The deck-7 shopping street adds walkable Grill House, Happy Lobster, Fast Lane, Sea Pub, Fashion (with Tommy Hilfiger), Desigual, Marimekko, Luxury, Electronics, Gifts (with Moomin), and Kids & Toys. Each is an independently exported venue module with authored furnishings drawn from the supplied virtual tour. Existing Coffee & Co, Bon Vivant and Starlight remain. Keep white retail fittings, stocked displays, clear aisles, readable storefront signs and varied dining finishes. The two aft restaurants are shallow two-table adaptations beside the existing stairwell. The five-stop check-in adventure still works; new venues are free exploration spaces.

## Sitting in chairs
Near an unoccupied chair or cafe stool, press E or tap Sit down to sit. The first-person camera faces the chair's table and lowers to seated eye height; looking around remains free. Press F or tap STAND to stand and return to the approach position. Movement is held while seated. Sitting eases through a turn and lowering motion over 1.15 seconds; standing leans forward, rises and steps clear over 1 second. Look controls remain available, and repeated sit/stand input is ignored during either transition. Chair locations come from the ship's individual furniture colliders because the rendered venue meshes are merged by material. The troubadour's occupied chair is not available.

## Onboard money
Starting Finnish marks (mk) depend on the selected traveler, from 80 to 130 mk. The supplied 100-mark banknote is the wallet symbol at bottom-right, with the current balance above it. Coffee & Co has a female cashier at its checkout; approach and press E or tap the phone interaction prompt to buy coffee for 10 mk. The banknote travels to the checkout and returns with the updated balance; coffee service is confirmed on screen. This first purchase has no buffs or additional shop choices.

## Carrying coffee
Buying coffee now delivers a visible ceramic mug from the cashier into the passenger's hand. The first-person grip stays visible while walking. Sitting with E / phone Sit down places it on the actual tabletop in front of the selected chair, and standing retrieves it. Shared café tables preserve each stool's place; round terrace tables use their real surface height. Seats without a reachable table keep the mug in hand. One mug per passenger; drinking is a later interaction.

Coffee stays hot for 15 gameplay seconds from serving. Soft white steam curls upward from the mug while carried or on a table, fades during the final two seconds, and stops when cool. Pausing also pauses cooling.

## Energy and coffee drinking
Starting energy depends on the selected traveler, from 70% to 110%, and appears in the top-left HUD. It declines by one percentage point per 30 gameplay seconds, with a zero floor and no exhaustion penalty yet. While seated, E / phone Drink coffee lifts, tilts and empties a full coffee mug, adding 10 energy points up to the global 110% energy cap. Cold coffee works too. A seated drink returns the empty mug to its table; standing leaves it behind. Standing with a full cup retrieves it as before. Empty mugs remain visible after later coffee purchases. A carried empty cup may be exchanged when buying another coffee. Pause freezes energy loss and drink animation.

Coffee can only be drunk after sitting down completely. The cashier and rejected standing attempts remind the player to sit. Standing up before a sip is consumed cancels it without granting energy or emptying the mug.

At 90% energy, a six-second reminder suggests coffee for +10% energy. It repeats at most every five gameplay minutes while energy is 90% or lower. Drinking dismisses the reminder and restarts the five-minute wait; pause freezes both timers.


## Sea Fortune slot machine
A red, black and chrome two-screen slot cabinet stands against the blank wall left of the port promenade lift on deck 7. Walk up and face it; E / phone Spin inserts 5 Finnish marks from the same wallet used for coffee. Three reels stop in sequence. Three identical symbols on the gold centre payline awards 20 mk; other results lose the stake. The marquee states the price and payout. Generated coin, reel, stop and payout sounds accompany the visible coin and reels. No real-money transactions, extra paylines or bonus rounds.

The Sea Fortune cabinet also offers a 100 mk jackpot for three Silja ferry symbols on the centre payline. Its fifth symbol depicts a white passenger ship with a blue SILJA hull. Other triples pay 20 mk. A glowing jackpot marquee, pink curved outlines, cyan screen borders and chasing lights evoke the supplied casino photograph; the jackpot triggers an eight-second gold celebration.

Slot win-frequency tuning: each spin independently has a 19% chance of an ordinary 20 mk match, a 1% chance of the 100 mk Silja jackpot, and an 80% chance of no payout. This raises overall wins from 4% to 20% (about one in five spins on average). Stake and payouts stay unchanged. A seeded 100,000-spin simulation and exact probability-boundary checks pass.


## Contextual controls
E is the shared interaction key: talk, buy, open a door, sit, spin (5 mk), or call/use a lift. The nearest eligible target supplies one contextual prompt. While seated, E drinks coffee after the sitting transition; F stands up without requiring a drink. Phone uses the same contextual interaction in a fixed HUD position so it stays reachable regardless of camera direction, and shows Stand only while seated. G, R and L have no action bindings; F no longer sits.


## Gentle ship motion
Inside the ferry, the first-person view rides a gentle swell using the engine's SwellSway: slow irregular roll (up to about 0.66°) and heave (up to 7.5 cm). Motion fades in on boarding and out on returning to the gangway, works while seated, and freezes during pause. Reduced-motion preference fades it out. The deck, furniture and collision geometry remain stable; carried coffee follows the swaying view.

Sea Pub’s entrance follows the supplied shipboard photograph: a broad cream signboard with muted blue SEA / lighthouse / PUB lettering, charcoal timber posts and walnut lower panels, open glass doors with a frosted anchor, paired wood easels with chalk drinks menus, and a curved pale wood inlay across the plank forecourt. Keep the centre passage clear.

Sea Pub’s interior follows the supplied lounge photograph: dark navy framed wall panels, walnut dado with continuous warm light strips, caramel leather booths and banquette, curved upholstered tub chairs, round oak pedestal tables with menu cards, staggered wood flooring, nautical oval window styling and compact aft bar. Maintain a broad central aisle through the lounge.

Sea Pub ambience fades to dim warm amber on entry: low daylight and ambient fill, localized pools on the leather seating and back bar, and a restrained cool accent at the oval window. Restore the promenade lighting when leaving; Starlight keeps its separate nightclub mood.

Sea Pub serves a 20 mk draft beer from the shared wallet. A bartender works in the aisle behind the counter and pours amber beer with foam from an inward-facing tap into the glass, then hands it to the player. Carry it to a pub lounge table or booth, sit with E / phone interaction, drink with the same contextual action, and stand with F / phone Stand. Each finished beer grants +15 energy points, capped at 110% total energy, and temporary dizziness. One active drink at a time; abandoned unserved orders are refunded.

Each beer adds 40% dizziness, capped at 100%. Repeated drinks stack and restart a three-minute gradual recovery. Dizziness slows and gently sways walking, blurs the scene and adds subtle view wobble; status text and controls remain sharp. Recovery pauses with the game. Reduced-motion disables the additional camera oscillation.

Quest completion is celebrated with a six-second central success banner naming the completed task and reward/progress, plus a brief gold-and-blue confetti burst. Key collection, cabin check-in and each new tour destination celebrate once per session; reduced-motion mode keeps the banner and omits confetti.


## Troubadour character refinement
The Information guitarist is a slim man aged 55–60 with a narrow face, grey beard and moustache, a dark brimmed hat, weathered black leather vest over a charcoal T-shirt, silver pendant, black wrist cuff, faded black jeans and black boots. He follows the approved softly blocky style in `src/work/references/troubadour-rock-approved.png`. The model was generated using that actual image through the CLI's reference-image option. The seated hold, hand IK and finger curl preserve his guitar performance and localized music.


## Information clerk appearance
The Information attendant uses a slim, softly blocky low-poly character style with a narrow face and neatly side-parted sandy brown hair. His uniform follows the supplied photo in `src/work/references/information-clerk-uniform.png`: white short-sleeved collared shirt, dark navy epaulettes with pale rank stripes, navy tie, small name badge, dark trousers and black shoes. He remains behind the existing desk and grants the assigned cabin key through the existing desktop and phone check-in interaction.

Coffee & Co and Sea Pub use reference-generated slim, softly blocky NPCs matching `src/work/references/slim-character-approved.png`. The cafe cashier has brown hair in a bun, a cream shirt and forest-green apron; the bartender has swept brown hair and a navy top over a light shirt. Both have narrow faces and gently bevelled shapes. Their rigged arms reach for service and handover targets while preserving the 10 mk coffee and 20 mk beer transactions.


## Starlight dancers
Two generated passengers dance continuously on the main Starlight disco floor: an adult woman with a golden blonde bob, magenta blouse and navy trousers, and a middle-aged man with a large rounded belly, a teal party shirt and dark trousers. Both match the approved softly blocky, gently bevelled NPC style in `src/work/references/slim-character-approved.png`. Their rigged full-body dance loops run at slightly different speeds. Keep the centre dance area and entrances clear, and give these ambient performers no interaction prompt so E / phone Dance remains available to the player.

## Cabin mirrors
All 18 passenger cabins have live mirrors in their existing frames. The mirror reflects the room and the traveler selected for this voyage, including their current position, facing and animated pose. The character remains hidden in the normal first-person view. Only the nearby cabin mirror is active; no extra control is required.

## Phone HUD layout
On touch devices the status corners use compact labels: top-left shows energy (⚡ 100%) and dizziness (🍺 39% · 2:54, ⚠ when one more beer is too many); top-right shows the ship clock (🕐 17:05 FI / SE), trip points (⭐ 250 TP) and the Bon Vivant reservation (🍽 19:30). The traveler name is not repeated on phones. On portrait phones the area and objective lines sit below the corner rows, inset clear of the mute and pause buttons. Desktop keeps the full labels.

## Leaderboard
A persistent, shared leaderboard ranks voyages by trip points. Only a voyage that reaches Stockholm submits its score; passing out or blacking out does not rank. Every end screen shows the top 5 above the replay button, each with the player's verified display name, traveler and trip points. A ranked voyage outside the top 5 shows its position ("#6 of 23"). Names come from the player's Bitmagic profile or a generated guest name; nobody types one in. The board is declared so it can appear on the game's public page.

## Starlight terraced showbar
Use the creator’s starlight.jpg and dancefloor.jpg as architectural references: immediately inside the promenade entrance, a broad red-lit staircase climbs to the upper level. Curved seating terraces descend toward the lower dance floor and curtained stage. Cream tub chairs and small tables face the performance; glass guards with dark rounded rails preserve views. Keep the bronze ceiling, blue side galleries, sea windows and upper connections to the lifts and Sea View Lounge. Fit this into the existing compressed ship footprint.

The Starlight promenade entrance uses a dark illuminated STARLIGHT fascia with a showbar / Sea View Lounge subtitle and small constellation lights. Bronze-and-chrome casings, fluted dark side panels, a burgundy runner and warm ceiling strips frame the open passage. Burgundy stair treads have slim red riser lights, bronze nosings and softly lit handrails; dark bronze-seamed panels line the stairwell.

The paired direct side openings from Starlight’s upper gallery into the lift lobbies are closed with solid walls. Lift and cabin arrivals use the central upper landing to reach Starlight; the main red-lit entrance staircase remains open.

The lower bays beside Starlight's immediate entrance staircase reuse Sea View Lounge's grey organic carpet. Facing inward, the right-hand bay contains a walnut/brass roulette table with green felt; the left contains four cream chairs around a small table. Players may sit and stand using the existing interactions. Roulette uses the same in-game Finnish markka wallet as coffee and slots: select a number or an outside bet, stake 5/10/25 mk, spin a single-zero wheel, and receive the displayed payout. Number bets pay 35:1, even-money bets pay 1:1, zero loses outside bets. A suited croupier stands behind the physical table. Aim at the felt and use E / touch Interact to choose a bet and stake, then the SPIN spot. Chips, the numbered wheel, and a counter-rotating ball are visible in the room; the ball settles in the winning pocket and the felt shows the result. No betting popup. Walking away does not cancel a paid spin.

Roulette rounds last eight gameplay seconds, with chip sounds, a slowing wheel/ball recording, pocket clack and winning payout cue. Audio follows the shared mute control, fades with distance and stops/resumes with voyage pause. The first settled paid round completes First roulette round for 100 TP, once per voyage; rejected or cancelled rounds award nothing.
