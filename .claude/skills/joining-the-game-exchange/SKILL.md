---
name: joining-the-game-exchange
description: Join the Game Exchange with bitmagic exchange — free cross-promotion between published Bitmagic games, where this game shows an "Up next" tile for other Bitmagic games and earns exchange credits that get it shown in theirs. Use when asked for cross-promotion, an "Up next", "try another game" or "more games" tile, to show other Bitmagic games, to put other games on posters or TV screens in the game's world, to join or leave the exchange, to earn or check exchange credits, or to get players without paying. Not for paid advertising — buying a promotion on Google Ads is the building-ads skill.
---

# Joining the Game Exchange

The Game Exchange is cross-promotion between published Bitmagic games. A game that joins **shows**
an "Up next" tile (a banner or a short muted video of another Bitmagic game) beside
"Play Again" on its end screen, and is **listed**, which means other games show a tile for it.

- Showing tiles earns **exchange credits**. Being shown in another game spends them, and a click
  that brings a player to the game spends a little more. Better-ranked games earn at a higher rate.
- The balance is one per creator, shared by all of their games. A starter grant arrives after the
  creator's games have shown their first tiles.
- Exchange credits are not sparks and not money: they cannot be bought, cashed out or spent on
  generation, and `bitmagic usage` does not show them. `bitmagic exchange status` does.
- Nothing is uploaded. The tile other games show for this game is made from its cover and, when the
  game page has a trailer, a short clip of it. Captions are the game's name and description.
- Some tiles are games Bitmagic picks. They cost nobody anything and still earn.

This is not paid advertising. `bitmagic ads` (the `building-ads/` skill beside this one) builds
ads the creator pays to run on Google Ads. When the creator says "advertise my game" and it is not
clear which they mean, ask: free cross-promotion inside other Bitmagic games, or a paid campaign.

## The flow

1. **Ask first.** Joining changes what players see on the game's end screen and lists the game in
   other games. Enable it only when the creator asked for it or said yes.
2. **Enable it:**

   ```
   bitmagic exchange enable                          # a tile on the end screen, and listed
   bitmagic exchange enable --placements end,pause   # also on the pause screen
   bitmagic exchange enable --not-listed             # show tiles, but do not appear in other games
   bitmagic exchange enable --house-only             # show only the games Bitmagic picks
   ```

   It writes `worldProfileData.gameExchange` into `src/work/world.json` and enrols the game on the
   server at once; the live game shows a tile once it is published with the declaration. If it
   answers that the engine is too old, run `bitmagic upgrade` (ask first: it replaces `engine/`),
   then enable again.
3. **Verify, then publish.** Enabling edits a tracked file, so the last verify is stale:

   ```
   bitmagic verify
   bitmagic publish
   ```

   The publish enrols the game and says so in one line. The game shows tiles only while it is
   **public**; a private game stays enrolled and shows nothing.
4. **Check it:** `bitmagic exchange status` (below).

## Where the tile appears

| Placement | What it does |
|---|---|
| `end` (default) | Beside "Play Again" on the engine's end screen (win, lose, game over). The tile is there when the screen opens or not at all; it never pops in afterwards. |
| `pause` | The same tile on the engine's pause screen. Opt in with `--placements end,pause`. |
| custom | Anywhere the game's own code mounts it. Needs no flag. A menu the player returns to between rounds is a good place, once a round has been played ("A title menu or lobby" in `engine/agent-docs/game-exchange.md`). |

A game that draws **its own** end screen (anything registered with `setUIComponent('end', ...)`, or
a hand-built overlay) does not get the tile from the declaration alone. Mount it into a container
of that screen with `engine.gameExchange.mount(container)`. Read `engine/agent-docs/game-exchange.md`
first: it has the exact API, when `mount` returns null, and how to dispose the handle. Leave room
for the tile and keep "Play Again" the first, most prominent button.

An **ongoing game** that rarely reaches an end screen (a tycoon, a sandbox) can also hang other
games in its world: `engine.gameExchange.getAds()` gives it pictures and short muted clips for
posters and TV screens, which count nothing on the wall. When the player clicks one, the game
calls `ad.open()` and the engine shows the tile in a popup; that popup is what is counted. It needs
no flag, only the game joined. The section "Posters and screens in the game world" of
`engine/agent-docs/game-exchange.md` has the API, the textures and a full example; read it first.

## Where it shows nothing

This is by design. Do not try to work around any of it.

- **`bitmagic dev` and the Creator** show a tile labelled **Preview** with placeholder art. It makes
  no request, earns nothing and links nowhere. Use it to check the layout of the end screen.
- **`bitmagic verify`**, the publish smoke check, `bitmagic judge` and `bitmagic trailer record`
  show no tile at all, so it never lands in a screenshot, a thumbnail or a trailer. A verify that
  shows no tile is not a failure.
- **Poki and iOS exports** (`bitmagic publish --target poki`, `bitmagic ios`) show no tile and make
  no request. Those stores own their own promotion; the declaration can stay in the project.
- A real tile appears only in the **published** game, when the Game Exchange is switched on in that
  environment and there is a game to show. No tile is a normal outcome, not an error.

## Status

`bitmagic exchange status` (add `--json` to parse it) reports:

- whether the network is on in this environment, what the server has for this game, what the
  project declares, and whether the two differ ("republish to apply");
- the exchange credits balance, and what was earned, spent and granted;
- this game showing tiles: asked for, filled, shown, credited and not credited with the reason
  (daily limits per player and per game stop repeat views from earning), clicks, and the earn rate
  with the game's rank;
- this game listed in other games: times shown, clicks, how many players arrived, started playing
  and stayed, and what it cost;
- the tile itself: whether a banner and a video are ready (no cover means no banner: `bitmagic
  cover`; no trailer means no video: the `making-a-trailer/` skill);
- anything stopping it: not public, not reviewed, blocked, balance too low to stay listed.

Report these numbers as they are. Do not promise players: the exchange shows the game in
proportion to the exchange credits its creator's games earn.

## Leaving

```
bitmagic exchange disable
```

It removes the declaration from `world.json` and switches the live game off on the server at once:
no more tiles, no longer listed. The exchange credits stay with the creator. If it says the live
game could not be switched off, the published game **keeps showing tiles**: say so, and run it
again (or verify and publish, which switches it off too). Like `enable`, it edits a tracked file,
so run `bitmagic verify` before the next publish.

## What not to do

- **Never fake impressions or clicks.** No reloading the end screen in a loop, no scripted browsers,
  no opening the published game to "warm up" the numbers, no clicking tiles to test them. Views are
  counted and capped per player on the server; inflated traffic earns nothing and gets the game
  blocked and the creator's exchange credits frozen.
- **Never build the tile by hand.** No custom "more games" card, no copied banner, no link to
  another game's page. Only the engine's tile is counted, labelled as a promotion and reviewed.
- **Never call the exchange's API from game code**, and never read or forward its tokens. The
  engine owns every request; game code only chooses where the tile mounts and, through
  `engine.gameExchange`, which poster or screen shows which ad.
- Do not restyle the tile so it reads as part of the game, hide its "Promoted" label, cover it, or
  move it over "Play Again". Do not show it during gameplay or on the screen a player sees before
  their first round; the one exception is the popup the player opens by clicking a poster or screen.
- Do not enable it, disable it or change `--not-listed` / `--house-only` without the creator's yes.
- Do not edit `worldProfileData.gameExchange` to a shape the command would not write: publish
  refuses a declaration it cannot read and leaves the enrolment as it was.
