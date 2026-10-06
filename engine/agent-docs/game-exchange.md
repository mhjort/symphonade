# Game Exchange ("Up next")

The Game Exchange is cross-promotion between published Bitmagic games. A game that joins shows a
small tile for another Bitmagic game beside **Play Again** on its end screen. Showing tiles earns
the creator exchange credits, and those credits get the creator's own game shown in other games.
Nobody uploads anything: the tile's picture, clip and text come from what the other game already
published.

The engine HAS this system. It asks the platform for the tile, draws it, measures whether a
player really saw it, and reports the click. Game code decides only **whether** the game takes
part and, for a game with its own screens, **where** the tile goes. A game that rarely ends (a
tycoon, a sandbox) can also hang other games' pictures in its own world, on posters and TV
screens, and open the tile in the engine's popup when the player clicks one.

## Turning it on

One block in `world.json`, under `worldProfileData`:

```json
"gameExchange": {
  "enabled": true,
  "placements": ["end"]
}
```

| Key | Meaning | When left out |
|-----|---------|---------------|
| `enabled` | This game shows tiles. Required. | (required) |
| `placements` | Which engine screens show the tile: `"end"`, `"pause"` or both. | `["end"]` |
| `formats` | What a tile may play: `"banner"`, `"video"` or both. | both |
| `listed` | This game may be shown in other games. | same as `enabled` |
| `houseOnly` | Show only Bitmagic's own picks, never other creators' games. | `false` |

The declaration takes effect when the game is next published. In a GDK project,
`bitmagic exchange enable` writes this block and `bitmagic exchange status` shows the credits
and what was shown.

A game with no `gameExchange` block, or with `"enabled": false`, shows no tile and makes no request.

## The four placements

| Placement | Where the tile appears | How to get it |
|-----------|------------------------|---------------|
| `end` | Under Play Again on the engine's end screen (`engine.endGame()`, see `end-game.md`) | On by default once `enabled` is true |
| `pause` | Under the controls on the engine's pause screen | Add `"pause"` to `placements` |
| `custom` | Inside a container the game provides | Call `engine.gameExchange.mount(container)` |
| `world` | In the engine's popup, when the player clicks a poster or screen in the game's world | Call `engine.gameExchange.getAds()` (see below) |

`custom` and `world` are used from code and are never listed in `placements`; `enabled: true` is
all they need.

On the engine's own screens the tile is decided while the screen is drawn. If a tile is ready and
fits (it never makes the card taller than the window) it appears with the screen; if not, that
screen has none. It is never added to a screen that
is already open, because that would move Play Again under the player's finger. Play Again stays
first, nothing takes the keyboard focus, and the tile takes no click during its first second on screen.

A game that calls `engine.endGame()` needs no code at all for the `end` placement.

Both engine screens also end with the small "Made with Bitmagic" credit (see `end-game.md`). The
tile always sits **above** it, so the credit stays the last thing on the card. A card that is too
tall for the window loses the tile and keeps the credit.

## A custom end screen: `engine.gameExchange`

A game that draws its own end screen (through `engine.setUIComponent('end', …)` or a screen of
its own) does not get the engine's card, so it mounts the tile itself:

```ts
const handle = this.engine.gameExchange?.mount(container);
// later, when the screen is taken down:
handle?.dispose();
```

- `mount(container)` returns `null` when the exchange is off in this page. Otherwise it returns a
  handle straight away and the tile is appended to `container` as soon as one is ready (at once
  when it already is). The container may be attached to the document after `mount()`: the tile
  starts counting and takes clicks once it is in the page. The container is the game's own, so a
  tile that arrives a moment later is fine there. Give the tile a place where its arrival moves no
  button.
- `isAvailable()` says whether a tile can appear in this page at all. Use it to decide whether to
  leave room for one.
- `handle.dispose()` removes the tile and stops measuring it. Call it when the screen closes.
- The tile is one header line ("Up next" and a small "Promoted" or "Bitmagic pick" marker) above
  a 16:9 picture or clip with the game's name and a play badge over it; the whole tile is the link.
  It is at most 408 px wide and sizes itself to the container's width, so a box about 260 px wide
  gives a tile about 170 px tall. It takes its colours and font from the game's HUD theme.

`gameExchange` is optional on the `EngineLike` type, so call it with `?.`.

Put the tile's box above the "Made with Bitmagic" credit that a custom screen adds with
`mountBitmagicBrand(card)` (from `engine/ui/index.js`, see `end-game.md`), the same order as on
the engine's own screens.

A full custom end screen:

```ts
import type { EngineLike } from 'types/game.js';
import type { IGameHUD } from 'engine/IGameHUD.js';
import { mountBitmagicBrand, type EndGameOptions, type EndScreenComponent } from 'engine/ui/index.js';
import type { GameExchangeMountHandle } from 'engine/exchange/GameExchangeTypes.js';

const END_ID = 'my-end-screen';

export class MyEndScreen implements EndScreenComponent {
    private tile: GameExchangeMountHandle | null = null;

    constructor(private readonly engine: EngineLike) {}

    render(hud: IGameHUD, opts: EndGameOptions): void {
        this.dispose();
        hud.removeElement(END_ID);
        hud.createCustomElement(END_ID, {
            anchor: 'middle-center',
            interactive: true,
            html: `
                <div class="my-end-card">
                    <h2 class="my-end-title"></h2>
                    <button class="my-end-replay" type="button"></button>
                    <div class="my-end-more"></div>
                </div>
            `,
            onCreate: (container) => {
                const title = container.querySelector<HTMLElement>('.my-end-title');
                if (title) title.textContent = opts.title;
                const replay = container.querySelector<HTMLButtonElement>('.my-end-replay');
                if (replay) {
                    replay.textContent = opts.replayLabel;
                    replay.addEventListener('click', () => window.location.reload());
                }
                // The engine fills this box with the tile when one is ready.
                const more = container.querySelector<HTMLElement>('.my-end-more');
                if (more) this.tile = this.engine.gameExchange?.mount(more) ?? null;
                // The "Made with Bitmagic" credit goes last, under the tile's box.
                const card = container.querySelector<HTMLElement>('.my-end-card');
                if (card) mountBitmagicBrand(card);
            },
        });
    }

    dispose(): void {
        this.tile?.dispose();
        this.tile = null;
    }
}
```

Install it from the game's `init()`:

```ts
this.engine.setUIComponent('end', new MyEndScreen(this.engine));
```

## A title menu or lobby

The menu a player comes back to between rounds is a good place for the tile too, **after a round has been played in this visit, never on the screen a player sees first.** Mount it into a box docked at the foot of the menu and put the "Made with Bitmagic" credit under it (`mountBitmagicBrand`, see `end-game.md`):

```ts
const box = document.createElement('div');        // docked at the foot of the menu, about 220–280 px wide
menu.appendChild(box);
// when the menu opens, after the first round:
this.tile = this.engine.gameExchange?.mount(box) ?? null;
mountBitmagicBrand(menu, { placement: 'menu' });   // once, under the box
// when the menu closes: this.tile?.dispose(); this.tile = null;
```

- Make room for the tile when the menu opens, not when the tile arrives, so no button ever moves. A window too short for the menu and the tile gets the credit alone: decide before mounting.
- Keep it clear of the menu's buttons: it must never sit under a control the player is about to press.
- A plain dark plate behind the tile helps it read over a busy scene. Do not dress the plate up as part of the game, and leave the "Up next" and "Promoted" lines as they are.
- The tile plays the other game's short clip (a still when the player asked for less data or less motion). Nothing else in the menu needs to know.
- Mount and dispose each time the menu opens and closes: the same tile is shown again and counted once.
- The declaration still lists the default `end` placement, which the engine asks for when play starts. A game that never calls `engine.endGame()` simply never shows it.

## Posters and screens in the game world

`engine.gameExchange.getAds()` hands the game other games' pictures **without** showing a tile
and without counting anything. The game puts them on its own meshes: a poster on a wall, a TV
that plays a short clip. When the player clicks one, the game calls `ad.open()` and the engine
shows the ad in its popup: the same "Up next" tile as on the end screen, with a Close button.
That popup is the impression, counted exactly like any other tile.

- `getAds({ count, formats })` resolves an array of up to `count` (1 to 6, default 1) ads, each
  a different game. It never rejects: it resolves `[]` wherever the exchange is off, when the
  request fails, or when nothing fits. `formats` defaults to `['banner', 'video']`; leave out
  `'video'` when the game has no screen. Every call is a new request, so call it when the scene
  is built and again before the ads expire, never every frame.
- Each ad is a frozen object the game keeps until the next load:

  | Field | Meaning |
  |-------|---------|
  | `title` | The other game's name |
  | `disclosure` | "Promoted" or "Bitmagic pick" ("Preview" in the Creator). Show it on or beside the poster |
  | `image` | The 16:9 still, `{ url, width, height }`: its small copy, 384 px wide (15–25 KB) |
  | `square` | A square still (its small copy), when the game has one |
  | `video` | A ten-second silent clip for a screen, 320×180 (40–220 KB), when the ad has one and `'video'` was asked for |
  | `expiresAt` | Epoch ms. Get new ads before then: an ad opened later still shows, but is not counted |
  | `open()` | Show the ad in the engine's popup |

- `loadImageTexture(ad)` resolves a three.js texture of `ad.image` (`{ picture: 'square' }` for
  `ad.square`), ready for a `MeshBasicMaterial` or any other material's `map`, on the WebGPU and
  the WebGL renderer alike. It rejects when the picture cannot be loaded: keep the game's own
  art up then. The texture is the game's: dispose it when the poster changes.
- Posters are small on screen, so they get the small copy. Pass `{ size: 'large' }` for the 768 px
  copy (40–60 KB) only for a poster the player can walk right up to, or one that fills much of the
  screen. There is nothing larger: the full-size cover is never used for a texture.
- `createVideoTexture(ad)` returns `{ texture, play(), pause(), dispose() }`, or `null` when the ad
  has no clip or the player asked for reduced motion or less data. The clip is always muted and
  loops; nothing plays until `play()`, which rejects when the clip cannot play (keep the still up
  then). It is downloaded once (40–220 KB) and loops from memory, so a TV costs that once per
  ad, not a stream. Call `dispose()` when the screen changes; the engine also disposes every clip
  at the next load. Pause it while the screen is out of sight. A player who wants a closer look
  clicks the screen: the popup plays the tile's own, larger clip (on a phone held upright that is
  narrower than 360 px, the popup shows the still).
- The popup releases the mouse, freezes the player's controls, and no key press reaches the game
  while it is open, not even a key listener the game added on `window` in the capture phase. The
  game keeps running behind it. Esc, Close or a click outside the card closes it; opening another
  ad replaces it. When the game ends or pauses while it is open, the popup closes and the end or
  pause screen keeps the mouse and the controls. During a trailer recording `open()` shows nothing,
  `getAds()` resolves `[]` and `isAvailable()` is false, so a game can hide its posters then.
- In the Creator and the `bitmagic dev` view, `getAds()` resolves sample ads at once ("Preview",
  inline pictures, no clip), and their popup links nowhere.

One poster and one TV, opened by the game's own click handling:

```ts
import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import type { GameExchangeVideoTexture, GameExchangeWorldAd } from 'engine/exchange/GameExchangeTypes.js';

type Screen = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** What hangs on the wall: which ad each mesh shows, and the TV's clip while one plays. */
export interface WallAds {
    shown: Map<THREE.Object3D, GameExchangeWorldAd>;
    /** Keep it: pause() it while the TV is out of sight, dispose() it when the TV's ad is replaced. */
    clip: GameExchangeVideoTexture | null;
}

/** Put one ad on the poster and the other on the TV. To replace them, call it again with what it returned. */
export async function hangAds(engine: EngineLike, poster: Screen, tv: Screen, hung: WallAds | null = null): Promise<WallAds> {
    const shown = new Map<THREE.Object3D, GameExchangeWorldAd>(hung?.shown);
    let clip = hung?.clip ?? null;
    const exchange = engine.gameExchange;
    if (!exchange) return { shown, clip };
    const [posterAd, tvAd] = await exchange.getAds({ count: 2 });
    if (posterAd) {
        // Rejects when the picture cannot load: the poster keeps what it shows.
        const texture = await exchange.loadImageTexture(posterAd).catch(() => null);
        if (texture) {
            showTexture(poster, texture);
            shown.set(poster, posterAd);
        }
    }
    if (tvAd) {
        const next = exchange.createVideoTexture(tvAd);
        // Null without a clip, or for a player who asked for reduced motion or less data.
        const playing = next ? await next.play().then(() => true, () => false) : false;
        const texture = playing && next ? next.texture : await exchange.loadImageTexture(tvAd).catch(() => null);
        if (!playing) next?.dispose();
        if (texture) {
            showTexture(tv, texture);
            shown.set(tv, tvAd);
            // The TV shows the new ad: the old clip is off the screen. Dispose it through its handle.
            clip?.dispose();
            clip = playing ? next : null;
        }
    }
    return { shown, clip };
}

/** Put `texture` on `mesh` and release the still it replaces. A clip's texture is its handle's to release. */
function showTexture(mesh: Screen, texture: THREE.Texture): void {
    const old = mesh.material.map;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
    if (old && !(old instanceof THREE.VideoTexture)) old.dispose();
}

/** The game's own click handling: a raycast from the pointer, then `open()` on the ad that was hit. */
export function openClickedAd(event: PointerEvent, engine: EngineLike, shown: Map<THREE.Object3D, GameExchangeWorldAd>): void {
    const camera = engine.camera;
    const canvas = engine.renderer?.domElement;
    if (!camera || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects([...shown.keys()], false);
    if (hit) shown.get(hit.object)?.open();
}
```

Keep what `hangAds` returns: `wall = await hangAds(engine, poster, tv, wall)` replaces the ads and
disposes the clip that was on the TV, and `openClickedAd(event, engine, wall.shown)` opens the one
that was clicked. The full version, `samples/game-exchange-wall-ads.ts` (`HallAds`), also
replaces the ads a minute before they expire, takes its listener down, and drops a refresh still
in flight when it is disposed. Build it once the scene is up, from the game's `init()`:

```ts
const hallAds = new HallAds(this.engine, scene);
void hallAds.refresh();
```

Write the ad's `disclosure` on or under the poster (a small label in the game's own style), the
same way the tile carries its marker.

## What NOT to do

- **Do not build your own tile.** No hand-made "more games" card, no hard-coded link to another
  game, no copy of the engine's markup. A hand-made tile earns nothing, is not counted, and can
  get the game removed from the exchange.
- **Do not fake or force impressions.** Do not mount the tile off screen, behind another element,
  at zero size or zero opacity, and do not mount and dispose it in a loop. Call `ad.open()` only
  when the player clicked that ad's poster or screen: never on a timer, at load, when the player
  walks past, or to replace one popup with another. The platform counts an
  impression only when a real player had the tile in view, and it caps what one player and one
  game can earn in a day. Padding the numbers gets the creator's credits frozen.
- **Do not send clicks.** Never call `click()` on the tile, never open its link from code, and
  never put the tile under a control the player is about to press.
- **Do not call the exchange's web routes from game code**, and do not read or change the tile's
  contents. The tile shows another creator's game: its text and link are the platform's.
- **Do not restyle it to hide what it is.** The small marker on the tile ("Promoted", or
  "Bitmagic pick" for Bitmagic's own choices) must stay visible.
- **Do not show it during play.** The end screen, the pause screen, a lobby or a results page
  are the places for it. Never over live gameplay. The one exception is the popup the player
  opens by clicking a poster or screen.
- **Do not build a poster that hides what it is.** No ad picture without its `disclosure`
  nearby, no poster placed where the player clicks for something else (a door, a button, a
  machine they operate), and no hand-made poster of another game: only pictures from `getAds()`.

## Where it does nothing

The tile appears only in a published game running on a Bitmagic host. Everywhere else
`isAvailable()` is `false`, `mount()` returns `null`, `getAds()` resolves `[]`, the engine's
screens look exactly as they do in a game that never joined, and no request is made:

- Poki and iOS packages (`bitmagic publish --target poki`, `bitmagic ios`). These builds must not
  reach any backend, and they do not.
- A game opened on any host that is not Bitmagic's, including `localhost` outside the dev view.
- `bitmagic verify`, automated tests and the Creator's automatic play test.
- While a trailer recording is running (F9 or `bitmagic trailer record`), so another game's tile
  never ends up in the trailer.

## Seeing it before publishing

In the Creator and in the `bitmagic dev` view, a game with `"enabled": true` shows a **sample
tile** marked "Preview" in every placement it turned on, and in every `mount()` container, and
`getAds()` resolves sample ads with inline pictures for the posters. The sample is drawn by the
engine, links nowhere, and makes no request, so it is safe to lay out a screen or a wall around
it. Reach the end screen (or call `engine.endGame()`) to see the `end` placement.

Real tiles appear only in the published game. The first one can take a moment after a publish:
the tile is asked for when play starts, so a round that ends within a second or two may show
none.
