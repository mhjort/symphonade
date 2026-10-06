// The Bitmagic credit of a game: "Made with <Bitmagic wordmark>", a link to bitmagic.ai.
//
// The engine's own pause and end screens carry it (PauseScreen, EndScreen), and a game that draws its
// own screens mounts the very same credit with `mountBitmagicBrand(container)`. It belongs to the card
// it sits on: it takes that card's font and the text colour of its theme (the wordmark is painted
// through a mask, so it works on a dark card as well as a light one), it needs no request and no node
// injected by the host page, and it is a plain link: bitmagic.ai opens in a new tab and the game keeps
// running behind it. The Game Exchange tile, when a game has one, sits above it.
//
// WHEN IT SHOWS. Wherever a Bitmagic game runs (a published game, `bitmagic dev`, the Creator), except
//   - in a packaged build (Poki, iOS, Steam: `<meta name="bm:distribution">`, or `window.PokiSDK`),
//     where the store owns the player's way out of the game, as with the exchange tile;
//   - when the creator asked for it to be removed. There are two ways to ask, and both are deliberate:
//     the game's world.json says `hud.bitmagicCredit: "hidden"` (read on every load, see
//     {@link setBitmagicCreditHidden}), or the web Creator's publish step wrote
//     `<meta name="bm:branding" content="off">` because the creator turned the option off.
//     Nothing else removes it. It is on by default, and no game code or agent switches it off on its own.
//
// WHERE IT LEADS. In a published game the link carries utm tags, so analytics can tell the visits that
// games send apart from every other and see which game sent them (see {@link bitmagicCreditUrl}). A
// page with no published game id (`bitmagic dev`, the Creator) links to the plain address.
//
// WHAT IT REPLACES. The pause card used to show a Bitmagic logo only on touch devices, and only when
// publishing had injected `#bitmagic-branding` into the page (the web Creator's publish step did;
// `bitmagic publish` never did, so no CLI-published game had a logo anywhere). That corner watermark is
// retired: it sat on the game's own HUD. The dialogs' credit depends on nothing in the page.

import { BITMAGIC_WORDMARK_ASPECT, BITMAGIC_WORDMARK_MASK_URL } from 'engine/ui/bitmagicLogoMask.js';

/** Destination of the Bitmagic credit, before any utm tags. */
export const BITMAGIC_URL = 'https://bitmagic.ai/';

/**
 * URL of the retired corner watermark's logo in a page published before it was retired, or `null` (every
 * other page: a CLI publish, the Creator preview, the dev server, a game published since). The dialogs'
 * credit does not use it.
 * @deprecated Nothing in the engine reads it any more; kept so game code that imported it still builds.
 */
export function getBitmagicLogoUrl(): string | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLImageElement>('#bitmagic-branding img')?.getAttribute('src') || null;
}

let hiddenByGame = false;

/**
 * Remove the credit from, or restore it to, the game being loaded. The engine calls this on every load
 * from `worldProfileData.hud.bitmagicCredit` (`"hidden"` hides it; absent or `"auto"` shows it), so the
 * answer never leaks from one game to the next. It is for the creator to ask for: see end-game.md.
 */
export function setBitmagicCreditHidden(hidden: boolean): void {
    hiddenByGame = hidden;
}

/** What the page says about the credit. A parameter of {@link isBitmagicBrandShown} so the policy is testable without a browser. */
export interface BitmagicBrandEnv {
    /** A `meta[name="bm:distribution"]` tag exists: a packaged build (Poki, iOS, Steam). */
    packaged: boolean;
    /** `window.PokiSDK` is defined. */
    pokiSdk: boolean;
    /** Content of `meta[name="bm:branding"]`, or `null` when the tag is absent. */
    brandingMeta: string | null;
    /** The game's world.json asked for the credit to be removed ({@link setBitmagicCreditHidden}). */
    hiddenByGame: boolean;
    /** The published game's id (`meta[name="game-id"]` or `bm:game-id`), or `null` outside a published page. */
    gameId: string | null;
}

/** What a game id may look like in a utm tag: the platform's ids, nothing a page could smuggle into a URL. */
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Read the page. `null` outside a browser. */
export function readBitmagicBrandEnv(): BitmagicBrandEnv | null {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;
    const id = document.querySelector('meta[name="game-id"], meta[name="bm:game-id"]')?.getAttribute('content')?.trim() ?? '';
    return {
        packaged: document.querySelector('meta[name="bm:distribution"]') !== null,
        pokiSdk: (window as Window & { PokiSDK?: unknown }).PokiSDK != null,
        brandingMeta: document.querySelector('meta[name="bm:branding"]')?.getAttribute('content') ?? null,
        hiddenByGame,
        gameId: GAME_ID_RE.test(id) ? id : null,
    };
}

/** Whether this page shows the credit. Absent anything saying otherwise: yes. */
export function isBitmagicBrandShown(env: BitmagicBrandEnv | null = readBitmagicBrandEnv()): boolean {
    if (!env || env.packaged || env.pokiSdk || env.hiddenByGame) return false;
    return env.brandingMeta?.trim().toLowerCase() !== 'off';
}

/** Where a credit sits, as the utm term names it: lowercase letters, digits, `-` and `_`, short. */
const PLACEMENT_RE = /^[a-z0-9_-]{1,24}$/;

/**
 * The address the credit opens. For a published game (`gameId` known) it is bitmagic.ai with the tags
 * analytics reads on arrival:
 *   utm_source=bitmagic-game     visits that games send, against every other source
 *   utm_medium=referral          so they group with referrals and do not land under "unassigned"
 *   utm_campaign=made-with-bitmagic
 *   utm_content=<game id>        which game sent the visit
 *   utm_term=<placement>         where in the game: `pause`, `end`, `menu`, `result`...
 * Without a game id (dev, the Creator, an unpublished copy) it is the plain address, so a creator
 * trying the link never counts as traffic.
 */
export function bitmagicCreditUrl(placement: string, gameId: string | null): string {
    if (!gameId) return BITMAGIC_URL;
    const url = new URL(BITMAGIC_URL);
    url.searchParams.set('utm_source', 'bitmagic-game');
    url.searchParams.set('utm_medium', 'referral');
    url.searchParams.set('utm_campaign', 'made-with-bitmagic');
    url.searchParams.set('utm_content', gameId);
    url.searchParams.set('utm_term', PLACEMENT_RE.test(placement) ? placement : 'custom');
    return url.href;
}

export const BITMAGIC_BRAND_STYLE_ID = 'ui-bitmagic-brand-styles';

// NOTE: no backticks inside this block. It is a template literal.
const BRAND_CSS = `
/* "Made with Bitmagic": a quiet credit at the foot of a card. All values come from the HUD theme tokens,
   with fallbacks for a card that has none. The wordmark is a mask painted in the text colour. */
.ui-modal-brand {
    --ui-brand-mask: url("${BITMAGIC_WORDMARK_MASK_URL}");
    display: inline-flex;
    align-items: center;
    gap: 7px;
    /* A bigger target than the glyphs, which are small on purpose. */
    padding: 6px 10px;
    font-family: inherit;
    font-size: calc(11px * var(--hud-font-scale, 1));
    font-weight: var(--hud-font-weight-body, 400);
    line-height: 1;
    text-decoration: none;
    text-transform: var(--hud-font-case, uppercase);
    letter-spacing: var(--hud-font-tracking-label, 1.4px);
    white-space: nowrap;
    color: var(--hud-color-text-muted, rgba(255, 255, 255, 0.7));
    opacity: 0.85;
    border-radius: var(--hud-radius-card, 8px);
    /* A link from the start. The arming animation below holds it off for its first 0.7 s; this is what keeps it a link where a browser does
       not animate pointer-events, or where a game mounts it inside a host that ignores pointer events (a HUD element, say). */
    pointer-events: auto;
    transition: opacity 0.12s ease, transform 0.12s ease;
    -webkit-tap-highlight-color: transparent;
    /* A link is not armed for its first 0.7 s on screen: a thumb still tapping for the game cannot open
       bitmagic.ai through a card that has just appeared. Without animation support it is live at once. */
    animation: ui-modal-brand-arm 1ms linear 700ms both;
}
.ui-modal-brand:hover,
.ui-modal-brand:focus-visible { opacity: 1; }
.ui-modal-brand:focus-visible { outline: 2px solid var(--hud-color-primary, currentColor); outline-offset: 1px; }
.ui-modal-brand:active { transform: scale(0.97); }
.ui-modal-brand-logo {
    display: block;
    height: calc(15px * var(--hud-font-scale, 1));
    aspect-ratio: ${BITMAGIC_WORDMARK_ASPECT};
    /* High-contrast mode repaints backgrounds with the system canvas colour, which would blank a mask
       painted as a background. The wordmark keeps the link's text colour instead. */
    forced-color-adjust: none;
    background-color: currentColor;
    -webkit-mask-image: var(--ui-brand-mask);
    mask-image: var(--ui-brand-mask);
    -webkit-mask-size: contain;
    mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
}
@keyframes ui-modal-brand-arm { from { pointer-events: none; } to { pointer-events: auto; } }
@media (forced-colors: active) {
    .ui-modal-brand-logo { background-color: LinkText; }
}
/* A window this short (a phone on its side) leaves a card no height to spare: the credit moves up
   against the row above it and into the card's bottom padding. It is never hidden for lack of room. */
@media (max-height: 460px) {
    .ui-modal-brand { margin: -8px 0 -10px; padding-top: 3px; padding-bottom: 3px; }
}
`;

/** Add the credit's styles to the page once. The engine's screens call this themselves. */
export function injectBitmagicBrandStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(BITMAGIC_BRAND_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = BITMAGIC_BRAND_STYLE_ID;
    style.textContent = BRAND_CSS;
    document.head.appendChild(style);
}

export interface BitmagicBrandOptions {
    /** Where the credit sits, for the link's utm term: `pause`, `end`, `menu`, `result`... Default `custom`. */
    placement?: string;
    /** Added next to `ui-modal-brand`: it names the credit on that screen. */
    className?: string;
}

/** An attribute value: the characters that would end it or open markup. */
function attr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The credit as markup, for a screen built as an HTML string (the engine's pause and end screens do this).
 * Returns '' when this page does not show the credit, so the result can always be interpolated.
 */
export function bitmagicBrandHtml(options: BitmagicBrandOptions = {}): string {
    const env = readBitmagicBrandEnv();
    if (!isBitmagicBrandShown(env)) return '';
    injectBitmagicBrandStyles();
    const classes = options.className ? `ui-modal-brand ${options.className}` : 'ui-modal-brand';
    const href = bitmagicCreditUrl(options.placement ?? 'custom', env?.gameId ?? null);
    return `<a class="${attr(classes)}" href="${attr(href)}" target="_blank" rel="noopener noreferrer" aria-label="Made with Bitmagic" title="Made with Bitmagic">`
        + '<span class="ui-modal-brand-text">Made with</span><span class="ui-modal-brand-logo" aria-hidden="true"></span></a>';
}

/** The credit as an element, or `null` when this page does not show it. */
export function createBitmagicBrand(options: BitmagicBrandOptions = {}): HTMLAnchorElement | null {
    const html = bitmagicBrandHtml(options);
    if (!html) return null;
    const holder = document.createElement('div');
    holder.innerHTML = html;
    return holder.firstElementChild as HTMLAnchorElement;
}

export interface BitmagicBrandMountOptions extends BitmagicBrandOptions {
    /** Insert the credit before this node of the container instead of at its end. */
    before?: Node | null;
}

/**
 * Put the credit into a screen of the game's own, the way `engine.gameExchange.mount(container)` puts the
 * tile there: `container` is a card or a row of it, ideally at the foot, below the screen's buttons and the
 * exchange tile. Name where it sits with `placement` (`'menu'`, `'result'`...): it goes into the link's
 * utm tags. Returns the link (call `.remove()` on it to take it away), or `null` when this page does not
 * show the credit, so a game needs no check of its own.
 */
export function mountBitmagicBrand(container: HTMLElement, options: BitmagicBrandMountOptions = {}): HTMLAnchorElement | null {
    const link = createBitmagicBrand(options);
    if (!link) return null;
    container.insertBefore(link, options.before ?? null);
    return link;
}
