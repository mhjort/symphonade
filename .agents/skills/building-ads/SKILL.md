---
name: building-ads
description: Build an ad package for this game with bitmagic ads — videos in 16:9, 9:16 and 1:1, three stills, and the headlines and descriptions — upload it to Bitmagic, and, only if the creator wants to pay, open the page where they buy a promotion that the Bitmagic team runs on Google Ads. Use when asked to build ads, make an ad, run a campaign, or pay to advertise or promote the game. Not for free cross-promotion between Bitmagic games (an "Up next" tile, exchange credits) — that is the joining-the-game-exchange skill.
---

# Building ads

`bitmagic ads` turns the game's trailer into everything an ad campaign needs, and uploads it to
Bitmagic. Building and uploading costs nothing and advertises nothing. Running the ads is a
separate choice the creator makes and pays for on a web page; the Bitmagic team then runs the
campaign on Google Ads and sends the players to the game's page.

This is the paid lane. Showing the game inside other Bitmagic games for free, in exchange for
showing theirs, is the Game Exchange: `bitmagic exchange`, the `joining-the-game-exchange/` skill
beside this one. When "promote my game" could mean either, ask which.

## The flow

0. **Check that promotion is open:** `bitmagic ads status`. If it answers that game promotion is
   not available yet, stop and tell the creator so; there is nothing to build for yet.
1. **The game has to be public before anyone can pay to advertise it**: an ad sends people to its
   page. You can build and upload the package first, but say so if `bitmagic publish
   --visibility public` has not happened yet. Never change the game's visibility without the
   creator's yes.
2. **You need a trailer.** `bitmagic ads render` cuts the ads from the newest `bitmagic trailer`
   render. With no trailer, make one first: the `making-a-trailer/` skill beside this one. A
   trailer recorded in portrait (`bitmagic trailer record --resolution 1080x1920`, then
   `bitmagic trailer make`) makes the best 9:16 ad, which is what phone feeds show. Pass it as
   `--portrait <file>`.
3. **Render the media:**

   ```
   bitmagic ads render                       # 15 s from the start of the newest trailer
   bitmagic ads render --start 8 --seconds 20
   bitmagic ads render --portrait .bitmagic/trailer/<dir>/<portrait-trailer>.mp4
   ```

   This writes `.bitmagic/ads/`: `video-16x9.mp4`, `video-9x16.mp4`, `video-1x1.mp4` (6 to 60 s, an
   end card with the game's name and "Play now in your browser" fades in at the end), and
   `image-1.91x1.jpg`, `image-1x1.jpg`, `image-4x5.jpg` (from the cover, `.bitmagic/cover.webp`,
   when there is one). A source of another shape is fitted by blurring a copy of it behind it, so
   nothing is cut off. The first ad seconds are the ones that matter: if the trailer opens slowly,
   use `--start` to begin at the action.
4. **Look at what you made.** Read the stills. For the videos, take a few frames and look at them
   too, the end card included:

   ```
   ffmpeg -v error -ss 3 -i .bitmagic/ads/video-9x16.mp4 -frames:v 1 -vf scale=360:-2 /tmp/ad-frame.png
   ```

   Re-render rather than ship an ad that opens on a menu, a loading screen or a black frame.
5. **Write the copy** in `.bitmagic/ads/ads.json` (`render` starts an empty one):

   ```json
   {
     "headlines": ["Ride the storm swell", "Jet-ski racing on big waves"],
     "longHeadlines": ["Launch off storm waves and race rivals to the lighthouse"],
     "descriptions": ["Carve down each swell for speed, then launch off the crest."]
   }
   ```

   Write it from `GAME-DESIGN.md` and from what the game really does. The rules are below.
6. **Check it:** `bitmagic ads check` names every problem the server would refuse. Fix them and run
   it again until it passes.
7. **Upload it:** `bitmagic ads publish`. Nothing is advertised. It prints the page where a
   promotion can be bought. Re-running it after a change uploads only what changed.
8. **Ask the creator** whether they want to pay to advertise the game. Tell them what that means:
   they choose a budget (from $10), how many days it runs and who sees it; the page shows an
   estimate of how many people it may bring, which is an estimate, not a promise; the Bitmagic team
   starts the campaign as soon as possible, usually within a day. Show them the stills first.
9. **Only if they say yes:** `bitmagic ads buy`. It opens that page in their browser, where they
   choose and pay. You never choose a budget for them, and you never pay. `--wait` waits for the
   payment and reports it.
10. **Afterwards:** `bitmagic ads status` shows every promotion, its state, and how many people
    the ads brought to the game's page and how many of them started playing.

## The copy rules

`bitmagic ads check` enforces the hard limits. Google refuses ads for the rest, so follow them too.

| Field | How many | Longest |
|---|---|---|
| `headlines` | 1 to 5 (write at least 3) | 40 characters |
| `longHeadlines` | 1 to 5 | 90 characters |
| `descriptions` | 1 to 5 (write at least 2) | 90 characters |

- **Every line must be true of this game.** Name what the player does, not what you wish it did. No
  "best", "#1" or "most popular" claims, which Google requires proof of.
- **No other game or brand names.** Not "like Fortnite", not "Minecraft-style".
- **No emoji, no "!!", no exclamation mark in a headline, no words in capitals** (RPG and 3D are
  fine; GREAT is not). No URLs or prices: Google shows the link itself.
- **Each line must stand on its own.** Google mixes headlines and descriptions in any order, so
  none of them can lean on another.
- Say "free" only when anyone can play the game without paying, which is true of a public
  bitmagic.ai game unless the creator gated it.

## What not to do

- Do not run `bitmagic ads buy` because the package is ready. It is the creator's money: ask, and
  run it only on a clear yes.
- Do not promise a number of players. Point to the estimate on the page and say it is an estimate.
- Do not edit `.bitmagic/ads/published.json`; it is how `publish` knows what is already uploaded.
