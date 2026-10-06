# Engine-level End Game (with Replay)

`engine.endGame(options?)` is the canonical way to end a game session. It transitions the engine into `GameState.END`, freezes physics / NPCs / genre `update()` (same gating PAUSED uses), and renders a themed default overlay with a "Play Again" button. Reports `gameplayStop()` to PokiSDK automatically.

**Do NOT roll your own game-over modal.** Use `engine.endGame()`. The default overlay matches the rest of the HUD theme, handles mouse unlock + input freeze for free, and gets PokiSDK integration that hand-rolled overlays would miss.

## When to call

From any place in a genre's game logic where a win/lose/draw condition fires. Examples:

- Player health drops to 0 → `endGame({ outcome: 'lose' })`
- Goal reached / boss defeated → `endGame({ outcome: 'win' })`
- Timer expires → `endGame({ outcome: 'lose', message: 'Time ran out!' })`

Call it once from the genre when the game session is over. Subsequent calls are safe — the overlay is rebuilt and the state listener early-returns when already in END.

## Signature

```ts
engine.endGame(options?: Partial<EndGameOptions>): void

interface EndGameOptions {
    outcome: 'win' | 'lose' | 'draw' | 'neutral';  // default: 'neutral'
    title: string;                                  // default: 'Game Over'
    message: string | null;                         // default: null
    stats: Array<{ label: string; value: string | number }>;  // default: []
    replayLabel: string;                            // default: 'Play Again'
}
```

`outcome` determines the accent color (success / danger / primary). All other fields are pass-through to the overlay.

## Examples

Minimal:

```ts
this.engine.endGame({ outcome: 'win' });
// → Title: "Game Over" in success-green, "Play Again" button.
```

With title + message:

```ts
this.engine.endGame({
    outcome: 'lose',
    title: 'You Died',
    message: 'The dragon got the best of you.',
});
```

With stats:

```ts
this.engine.endGame({
    outcome: 'win',
    title: 'Victory!',
    stats: [
        { label: 'Score', value: 1240 },
        { label: 'Time', value: '02:17' },
        { label: 'Enemies', value: 12 },
    ],
});
```

## What "Replay" does

The Replay button calls `window.location.reload()`. The iframe fully reloads, the game re-fetches its config, and starts in `LOADING → MENU → PLAYING` as on first open. World generation is deterministic from `worldProfileData.worldSeed`, so the world layout is identical on replay.

If a genre needs a faster in-place reset, that's not in the engine yet — full reload is the only path today.

## Up next (Game Exchange)

A game that joined the Game Exchange (`worldProfileData.gameExchange` with `"enabled": true` in `world.json`) gets a small "Up next" tile under the Play Again button: one header line, then another published Bitmagic game's picture or short clip with its name and a play badge over it. The whole tile is the link; the engine draws and reports it. `endGame()` needs no extra code for it.

- Play Again stays first and nothing takes the keyboard focus. The tile takes no click during its first second on screen.
- The tile is there when the end screen opens or not at all. Nothing is added to an open screen.
- With no tile (the game did not join, none was ready, a Poki or iOS package, a trailer recording), the end screen is exactly the one described above.
- In the Creator and the `bitmagic dev` view the tile is a sample marked "Preview".
- A custom end screen installed with `engine.setUIComponent('end', ...)` does not get the tile on its own. Mount it with `engine.gameExchange.mount(container)`.

Never build a "more games" card by hand. See `game-exchange.md` for the `world.json` block, the pause-screen and custom placements, and the rules.

## "Made with Bitmagic"

The end screen, like the engine's pause screen, ends with a small "Made with" credit and the Bitmagic wordmark. It is one link to `https://bitmagic.ai/` that opens in a new tab and leaves the game as it was. It is part of the engine: `endGame()` needs no code for it, and a game gets it with the next engine upgrade and publish.

- It is the last thing on the card: under Play Again, and under the "Up next" tile when there is one. It uses the card's font and the theme's muted text colour on every device, and needs no request and no image file.
- It takes no click during its first 0.7 s on screen and nothing focuses it, so a tap or a key meant for the game cannot open the page.
- In a published game the link carries `utm_` tags (source `bitmagic-game`, the game's id, and where the credit sits: `pause`, `end`, or the `placement` a game passes), so Bitmagic can see how many visits games send. In `bitmagic dev` and the Creator it is the plain address.
- It is not shown in a packaged build (Poki, iOS, Steam: a `bm:distribution` meta tag, or `window.PokiSDK`).
- A custom end screen installed with `engine.setUIComponent('end', ...)`, or any other screen of the game's own (a title menu, a results panel, a game-over card), does not get it on its own. Add the engine's credit with `mountBitmagicBrand(container)` from `engine/ui/index.js`: the container is the card or a row at its foot, below the buttons and below the exchange tile. It returns `null` where the credit is not shown, so the game needs no check of its own.

```ts
import { mountBitmagicBrand } from 'engine/ui/index.js';

const credit = mountBitmagicBrand(card, { placement: 'menu' });   // null in a packaged build
// when the screen is taken down: credit?.remove();
```

`placement` names where the credit sits (`'menu'`, `'result'`...: lowercase letters, digits, `-` and `_`); `before` inserts the link before a node instead of at the end. `bitmagicBrandHtml({ placement, className })` gives the same link as markup for a screen built from an HTML string. Never write a "Made with Bitmagic" link of your own: the engine's one carries the right address and tags, the wordmark and the arming delay.

A screen that treats a tap or click anywhere as "continue" (a `pointerdown` or `click` listener on `window` or `document`) must keep that listener from seeing a tap on the credit, or one tap both continues the game and opens bitmagic.ai:

```ts
mountBitmagicBrand(card)?.addEventListener('pointerdown', (e) => e.stopPropagation());   // the event your listener uses
```

### Removing it: only when the creator asks

The credit is on by default and stays on. **Do not remove it on your own, to tidy a screen, or because it looks like clutter.** If the creator has said, in so many words, that they want "Made with Bitmagic" gone, set this in `src/work/world.json`:

```json
"worldProfileData": { "hud": { "bitmagicCredit": "hidden" } }
```

That removes it from the engine's pause and end screens and from every `mountBitmagicBrand` call. Delete the key (or set `"auto"`) to bring it back. It takes effect on the next publish. The engine also honours `<meta name="bm:branding" content="off">`, which Bitmagic's own publishing writes for a creator who turned the option off there.

## Screen transitions

The start, pause and end screens animate: the backdrop fades while the card rises into place. Change it or switch it off from game code, usually in `init()`:

```ts
this.engine.setScreenTransition({ style: 'none' });              // instant screens
this.engine.setScreenTransition({ style: 'fade' });              // fade only, no rise
this.engine.setScreenTransition({ enterMs: 400, leaveMs: 250 }); // slower
```

- Fields you leave out take their values from `DEFAULT_SCREEN_TRANSITION`: `'fade-rise'`, 200 ms in, 140 ms out.
- The setting resets on every game load.
- Players whose OS asks for reduced motion always get instant screens.
- A custom screen installed with `engine.setUIComponent(...)` gets the same enter animation if it uses the `ui-modal-overlay ui-modal-overlay--animated` markup.
- Game CSS can also restyle `.ui-modal-overlay--animated` directly.
