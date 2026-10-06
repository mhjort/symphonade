/**
 * GameExchangeCard: draws one "Up next" tile and measures it.
 *
 * The tile shows ANOTHER creator's game inside this game's page, so it is
 * built with DOM APIs only: every server string goes in through `textContent`
 * and never through markup. The whole tile is one link to the platform's click
 * route; the engine never opens a window itself.
 *
 * Two things are measured while the tile is on screen, both in visible time
 * (in the viewport, in a visible tab):
 *   - arming: the tile takes no click until it has been visible for `armMs`
 *     in this mount, so a tap aimed at Play Again cannot land on it;
 *   - the impression: reported once per tile after `minViewMs`, counted on the
 *     slot object so a screen that renders again does not start over.
 *
 * The CSS is one head stylesheet themed by the game's HUD tokens. Its id is in
 * ENGINE_HEAD_STYLE_IDS so a trailer recording does not take it for the game's.
 */

import { GAME_EXCHANGE_STYLE_ID, type GameExchangeImage, type GameExchangeSlot } from 'engine/exchange/GameExchangeTypes.js';

/** The class a modal card carries while it holds a tile. */
export const GAME_EXCHANGE_HOST_CLASS = 'gx-host';

/** Below this viewport height the tile is drawn smaller (a landscape phone). */
const COMPACT_QUERY = '(max-height: 480px)';

/**
 * How often visible time is written down while a tile waits to arm or to be
 * counted. A screen can be removed without telling its tile; what was seen
 * since the last write is then lost, so this bounds the loss.
 */
const BANK_INTERVAL_MS = 250;

// One TS template literal: no backticks inside the CSS.
const GAME_EXCHANGE_CSS = `
/* A modal card that holds a tile stays clear of the window's top and bottom edges, where
   the bottom-right corner items sit (the dev Console button; the Bitmagic watermark of
   a game published before it was retired). Touch devices have none of them. */
.ui-modal-card.gx-host {
    margin-top: 48px;
    margin-bottom: 48px;
}
@media (pointer: coarse) {
    .ui-modal-card.gx-host {
        margin-top: 0;
        margin-bottom: 0;
    }
}

.gx-slot {
    display: flex;
    justify-content: center;
    width: 100%;
}
/* On the engine's own screens the tile is as wide as the button column
   (.ui-modal-stack), so it lines up under Resume / Play Again. */
.ui-modal-card.gx-host .gx-tile {
    max-width: 260px;
}
/* In the popup a world ad opens, the tile is what the card is for: full width. */
.ui-modal-card.gx-host.gx-popup .gx-tile {
    max-width: 408px;
}

/* One header line, then the picture with the game's name and a play badge
   laid over it. No frame of its own: the header line and its marker say what
   the tile is, and the whole tile is the link. */
.gx-tile {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    max-width: 408px;
    box-sizing: border-box;
    text-align: left;
    text-decoration: none;
    font-family: var(--hud-font-family, 'Red Hat Display', system-ui, sans-serif);
    color: var(--hud-color-on-surface, var(--hud-color-text, #ffffff));
    cursor: pointer;
    transition: filter 0.12s ease;
    touch-action: manipulation;
}
.gx-tile:hover {
    filter: brightness(1.08);
}
.gx-tile:focus-visible {
    outline: 2px solid var(--hud-color-primary, #ffffff);
    outline-offset: 3px;
    border-radius: calc(var(--hud-radius-card, 8px) * 0.75);
}
.gx-tile[data-gx-armed="false"] {
    pointer-events: none;
}
.gx-tile[data-gx-preview="true"] {
    cursor: default;
}

.gx-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    line-height: 1.2;
    font-size: calc(11px * var(--hud-font-scale, 1));
    text-transform: var(--hud-font-case, uppercase);
    letter-spacing: var(--hud-font-tracking-label, 1.4px);
    color: var(--hud-color-on-surface-muted, var(--hud-color-text-muted, rgba(255, 255, 255, 0.7)));
}
.gx-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--hud-font-weight-heading, 700);
}
.gx-disclosure {
    flex: none;
    padding: 1px 6px;
    border: 1px solid currentColor;
    border-radius: 4px;
    font-size: calc(10px * var(--hud-font-scale, 1));
}

.gx-media {
    position: relative;
    overflow: hidden;
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: clamp(72px, 24vh, 200px);
    border-radius: calc(var(--hud-radius-card, 8px) * 0.75);
    background: rgba(0, 0, 0, 0.35);
}
.gx-picture {
    position: absolute;
    inset: 0;
}
.gx-image,
.gx-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* The name sits on a shade along the bottom of the picture, the play badge
   in its corner. White on the shade whatever the theme: it is over imagery. */
.gx-shade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 60%;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0));
    pointer-events: none;
}
.gx-title {
    position: absolute;
    left: 10px;
    right: 50px;
    bottom: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: calc(15px * var(--hud-font-scale, 1));
    font-weight: var(--hud-font-weight-heading, 700);
    line-height: 1.2;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.gx-play {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--hud-color-primary, #ffffff);
    color: var(--hud-color-on-primary, #111111);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.gx-play svg {
    width: 12px;
    height: 14px;
    margin-left: 2px;
    fill: currentColor;
}

/* A still banner drifts slowly, so every tile has some motion. */
@keyframes gx-zoom {
    from { transform: scale(1); }
    to { transform: scale(1.08); }
}
@media (prefers-reduced-motion: no-preference) {
    .gx-image--zoom {
        animation: gx-zoom 14s ease-in-out infinite alternate;
    }
}

/* Compact (a landscape phone): the same tile, smaller, so the card fits
   without scrolling. */
@media (max-height: 480px) {
    .gx-tile {
        width: auto;
        max-width: 100%;
        gap: 4px;
    }
    .gx-media {
        width: auto;
        height: clamp(64px, 26vh, 112px);
        max-height: none;
    }
    .gx-title {
        left: 8px;
        right: 36px;
        bottom: 6px;
        font-size: calc(12px * var(--hud-font-scale, 1));
    }
    .gx-play {
        right: 6px;
        bottom: 6px;
        width: 24px;
        height: 24px;
    }
    .gx-play svg {
        width: 9px;
        height: 10px;
        margin-left: 1px;
    }
}
`;

/** Inject the tile's stylesheet once per document. */
export function injectGameExchangeStyles(): void {
    if (document.getElementById(GAME_EXCHANGE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = GAME_EXCHANGE_STYLE_ID;
    style.textContent = GAME_EXCHANGE_CSS;
    document.head.appendChild(style);
}

/** What the tile needs to know about the page it is drawn in. */
export interface GameExchangeCardEnv {
    /** The game runs inside a frame, so the link must leave it. */
    framed: boolean;
    /** The player asked the OS for reduced motion. */
    reducedMotion: boolean;
    /** The browser asked for less data (`navigator.connection.saveData`). */
    saveData: boolean;
    /** The viewport is short enough for the one-row tile. */
    compact: boolean;
}

function mediaMatches(query: string): boolean {
    // jsdom and other non-browser hosts have no matchMedia; "cannot tell" is "no".
    return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Whether this window is inside a frame. A parent that cannot be read is a frame. */
export function isFramedWindow(): boolean {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function readGameExchangeCardEnv(): GameExchangeCardEnv {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return {
        framed: isFramedWindow(),
        reducedMotion: mediaMatches('(prefers-reduced-motion: reduce)'),
        saveData: connection?.saveData === true,
        compact: mediaMatches(COMPACT_QUERY),
    };
}

export interface GameExchangeCardOptions {
    /** Called once, when the tile has been visible for its `minViewMs`. */
    onImpression: (slot: GameExchangeSlot) => void;
    env: GameExchangeCardEnv;
}

export interface GameExchangeCard {
    /** The tile's root. Attach it, then call `start()`. */
    readonly element: HTMLElement;
    /** Begin measuring. An element not in the document yet counts nothing until it is attached. */
    start(): void;
    /** Stop measuring, stop the video and take the element out. Idempotent. */
    dispose(): void;
}

/** The link target: a new tab from inside a frame, the same tab when the game is the top window. */
export function resolveTileTarget(openIn: 'auto' | 'new' | 'same', framed: boolean): '_blank' | '_top' | null {
    if (openIn === 'new' || (openIn === 'auto' && framed)) return '_blank';
    // "Same tab" from inside a frame means the tab, not the frame.
    return framed ? '_top' : null;
}

/** What a screen reader says for the tile. */
export function tileAriaLabel(disclosure: string, title: string, cta: string, newTab: boolean): string {
    return `${disclosure}: ${title}. ${cta}${newTab ? ', opens in a new tab' : ''}`;
}

function span(className: string, text: string): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The round play badge in the picture's corner. Decorative: the link's label already says Play. */
function playBadge(): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = 'gx-play';
    badge.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 12 14');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M0 0 L12 7 L0 14 Z');
    svg.appendChild(path);
    badge.appendChild(svg);
    return badge;
}

function percent(fraction: number): string {
    return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

function buildImage(image: GameExchangeImage, sizes: string, zoom: boolean): HTMLImageElement {
    const img = document.createElement('img');
    img.className = zoom ? 'gx-image gx-image--zoom' : 'gx-image';
    // Decorative: the link's label already names the game.
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    if (image.sources.length > 0) {
        img.srcset = image.sources.map((source) => `${source.url} ${Math.round(source.width)}w`).join(', ');
        img.sizes = sizes;
    }
    img.src = image.url;
    if (image.focus) {
        const position = `${percent((image.focus.x0 + image.focus.x1) / 2)} ${percent((image.focus.y0 + image.focus.y1) / 2)}`;
        img.style.objectPosition = position;
        img.style.transformOrigin = position;
    }
    return img;
}

/**
 * Build the tile for `slot`. Nothing is measured until `start()`.
 */
export function createGameExchangeCard(slot: GameExchangeSlot, options: GameExchangeCardOptions): GameExchangeCard {
    injectGameExchangeStyles();
    const { ad } = slot;
    const { env } = options;

    const root = document.createElement('div');
    root.className = 'gx-slot';

    const tile = document.createElement('a');
    tile.className = 'gx-tile';
    const target = slot.preview ? null : resolveTileTarget(ad.openIn, env.framed);
    if (slot.preview) {
        // The sample goes nowhere: no href, so there is nothing to follow.
        tile.setAttribute('role', 'link');
        tile.setAttribute('aria-disabled', 'true');
        tile.dataset.gxPreview = 'true';
    } else {
        tile.href = ad.clickUrl;
        tile.rel = 'noopener noreferrer';
        if (target) tile.target = target;
    }
    tile.setAttribute('aria-label', tileAriaLabel(ad.disclosure, ad.title, ad.cta, target === '_blank'));
    // Inert until armed. The inline style holds even if the stylesheet is missing.
    tile.dataset.gxArmed = 'false';
    tile.tabIndex = -1;
    tile.style.pointerEvents = 'none';

    const head = document.createElement('span');
    head.className = 'gx-head';
    head.append(span('gx-label', ad.label), span('gx-disclosure', ad.disclosure));

    // The picture (video or banner) has its own box, so swapping it never
    // touches the name and the play badge laid over it.
    const media = document.createElement('span');
    media.className = 'gx-media';
    const picture = document.createElement('span');
    picture.className = 'gx-picture';
    const sizes = env.compact ? '200px' : '(max-width: 480px) 80vw, 408px';
    const showStill = (zoom: boolean): void => {
        picture.replaceChildren(buildImage(ad.banner, sizes, zoom));
    };

    let video: HTMLVideoElement | null = null;
    if (ad.video && !env.reducedMotion && !env.saveData) {
        const el = document.createElement('video');
        el.className = 'gx-video';
        el.setAttribute('aria-hidden', 'true');
        // Muted inline autoplay is the only kind browsers allow without a gesture;
        // the attributes are set as well as the properties because iOS reads the attributes.
        el.muted = true;
        el.defaultMuted = true;
        el.autoplay = true;
        el.playsInline = true;
        el.setAttribute('muted', '');
        el.setAttribute('playsinline', '');
        el.preload = 'metadata';
        el.poster = ad.banner.url;
        el.tabIndex = -1;
        el.disablePictureInPicture = true;
        let plays = 0;
        el.addEventListener('ended', () => {
            plays += 1;
            if (plays < ad.videoLoops) {
                el.currentTime = 0;
                // A refused replay leaves the last frame up.
                void Promise.resolve(el.play()).catch(() => undefined);
                return;
            }
            // Done: rest on the banner, still.
            video = null;
            showStill(false);
        });
        el.addEventListener('error', () => {
            video = null;
            showStill(true);
        });
        el.src = ad.video.url;
        picture.appendChild(el);
        video = el;
    } else {
        showStill(!env.reducedMotion);
    }

    const shade = document.createElement('span');
    shade.className = 'gx-shade';
    media.append(picture, shade, span('gx-title', ad.title), playBadge());

    tile.append(head, media);
    root.appendChild(tile);

    // ── Measuring ────────────────────────────────────────────────────────────
    let armed = false;
    let disposed = false;
    let started = false;
    /** The tile has been in the document at least once. Until then it is waiting to be attached, not removed. */
    let everConnected = false;
    /** This card has handed its impression over; the slot's own flag is the client's to set. */
    let reported = false;
    /** Visible time in THIS mount: arming starts over every time the tile is put up. */
    let mountVisibleMs = 0;
    /** When the current visible stretch began, or null while not visible. */
    let visibleSince: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let observer: IntersectionObserver | null = null;
    // Without IntersectionObserver the tile counts as in view while it is attached.
    let inView = typeof IntersectionObserver !== 'function';

    const impressionPending = (): boolean => !slot.preview && !slot.impressionSent;

    const arm = (): void => {
        armed = true;
        tile.dataset.gxArmed = 'true';
        tile.style.pointerEvents = '';
        tile.removeAttribute('tabindex');
    };

    const bank = (now: number): void => {
        if (visibleSince === null) return;
        mountVisibleMs += Math.max(0, now - visibleSince);
        // The slot's clock is wall time: two mounts visible at once count it once.
        slot.visibleMs += Math.max(0, now - Math.max(visibleSince, slot.countedUntil));
        slot.countedUntil = Math.max(slot.countedUntil, now);
        visibleSince = now;
    };

    const clearTimer = (): void => {
        if (timer === null) return;
        clearTimeout(timer);
        timer = null;
    };

    const check = (): void => {
        if (!armed && mountVisibleMs >= slot.armMs) arm();
        if (impressionPending() && !reported && slot.visibleMs >= slot.minViewMs) {
            reported = true;
            options.onImpression(slot);
        }
    };

    const schedule = (): void => {
        clearTimer();
        if (visibleSince === null) return;
        const waits: number[] = [];
        if (!armed) waits.push(slot.armMs - mountVisibleMs);
        if (impressionPending() && !reported) waits.push(slot.minViewMs - slot.visibleMs);
        if (waits.length === 0) return;
        timer = setTimeout(() => {
            timer = null;
            sync();
        }, Math.max(0, Math.min(BANK_INTERVAL_MS, ...waits)));
    };

    /** Stop measuring for good. Time since the last look is counted only when `count` says the tile was still up. */
    const teardown = (count: boolean): void => {
        if (disposed) return;
        if (count) bank(Date.now());
        disposed = true;
        visibleSince = null;
        clearTimer();
        observer?.disconnect();
        observer = null;
        document.removeEventListener('visibilitychange', sync);
        video?.pause();
        video = null;
    };

    const sync = (): void => {
        if (disposed) return;
        // A tile taken out of the document without dispose() (its screen was
        // removed) is finished, and counts nothing past the last moment it was
        // known visible.
        if (!root.isConnected) {
            if (everConnected) {
                teardown(false);
                return;
            }
            // Mounted into a container the game has not attached yet: not
            // visible, nothing counts. The observer reports the attach; without
            // one, look again shortly. teardown() ends the wait.
            clearTimer();
            if (!observer) {
                timer = setTimeout(() => {
                    timer = null;
                    sync();
                }, BANK_INTERVAL_MS);
            }
            return;
        }
        everConnected = true;
        const now = Date.now();
        const visible = inView && document.visibilityState === 'visible';
        const wasVisible = visibleSince !== null;
        bank(now);
        if (!visible) {
            visibleSince = null;
            clearTimer();
            if (wasVisible) check();
            return;
        }
        if (visibleSince === null) visibleSince = now;
        check();
        schedule();
    };

    tile.addEventListener('click', (event) => {
        if (!armed || slot.preview) event.preventDefault();
    });

    return {
        element: root,
        start(): void {
            if (started || disposed) return;
            started = true;
            document.addEventListener('visibilitychange', sync);
            if (typeof IntersectionObserver === 'function') {
                observer = new IntersectionObserver((entries) => {
                    inView = entries.some((entry) => entry.isIntersecting);
                    sync();
                }, { threshold: 0.5 });
                observer.observe(tile);
            }
            sync();
        },
        dispose(): void {
            teardown(root.isConnected);
            root.remove();
        },
    };
}
