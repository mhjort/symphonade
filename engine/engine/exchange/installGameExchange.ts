/**
 * The engine's Game Exchange subsystem: one module-level instance, installed
 * once per engine (from installEngineProgress) and bound to a game on every
 * load.
 *
 *   - `configureGameExchange()` runs synchronously EARLY in GameEngine.loadGame,
 *     before any game code, so `engine.gameExchange` answers for THIS load from
 *     the game's first line and nothing of the previous load survives.
 *   - The tile is asked for when gameplay starts, and an open popup closes when
 *     the game ends or pauses (one state listener, attached again on every load
 *     because the runtime controller clears them).
 *   - The engine's end and pause screens call `mountGameExchangePlacement()`
 *     while they render. The decision is made there and then: a tile that is
 *     ready and fresh is drawn with the screen, otherwise the screen has none.
 *     A tile is never added to a screen the player is already looking at,
 *     because it would move the button under their finger.
 *   - Game code reaches the same tile through `engine.gameExchange.mount()`.
 *   - A game that hangs ads in its own scene asks for them with `getAds()`
 *     (placement `world`, a new request every call), draws their pictures with
 *     the texture helpers, and calls `ad.open()` on a click: the engine's popup
 *     (GameExchangePopup) shows the tile, and that is the impression. The
 *     popup's key guard goes up at install, before any game code, and stays.
 *
 * Where the exchange is off (see GameExchangeGate) nothing here makes a request
 * or touches the DOM; the key guard still listens, and with no popup open it
 * lets every key through.
 */

import { ENGINE_VERSION, isReleasedEngineVersion } from 'engine/version.js';
import type { Texture } from 'three';
import { getApiServerBaseUrl } from 'engine/config.js';
import { GameState, type GameStateChangeListener, type GameStateManager } from 'engine/GameStateManager.js';
import type { IGameHUD } from 'engine/IGameHUD.js';
import { isMobileRuntime } from 'engine/isMobileRuntime.js';
import { getGameEventLog } from 'engine/recording/GameEventLog.js';
import {
    createGameExchangeCard,
    GAME_EXCHANGE_HOST_CLASS,
    isFramedWindow,
    readGameExchangeCardEnv,
    type GameExchangeCard,
    type GameExchangeCardEnv,
} from 'engine/exchange/GameExchangeCard.js';
import { clampGameExchangeAdCount, GameExchangeClient, type GameExchangeClientDeps } from 'engine/exchange/GameExchangeClient.js';
import {
    gameExchangeModeAtRender,
    readGameExchangeGateInputs,
    resolveGameExchangeMode,
    type GameExchangeGateInputs,
} from 'engine/exchange/GameExchangeGate.js';
import { GameExchangePopup } from 'engine/exchange/GameExchangePopup.js';
import {
    createGameExchangeVideoTexture,
    defaultGameExchangeTextureDeps,
    loadGameExchangeImageTexture,
    pickGameExchangeTextureImage,
    type GameExchangeTextureDeps,
} from 'engine/exchange/GameExchangeTextures.js';
import {
    DEFAULT_GAME_EXCHANGE_ADS_OPTIONS,
    DEFAULT_GAME_EXCHANGE_IMAGE_TEXTURE_OPTIONS,
    DEFAULT_GAME_EXCHANGE_MOUNT_OPTIONS,
    type GameExchangeAdsOptions,
    type GameExchangeApi,
    type GameExchangeConfig,
    type GameExchangeFormat,
    type GameExchangeImage,
    type GameExchangeImageTextureOptions,
    type GameExchangeMode,
    type GameExchangeMountHandle,
    type GameExchangeMountOptions,
    type GameExchangePlacement,
    type GameExchangeSlot,
    type GameExchangeVideoTexture,
    type GameExchangeWorldAd,
    type GameExchangeWorldImage,
    type GameExchangeWorldVideo,
} from 'engine/exchange/GameExchangeTypes.js';

export type { GameExchangeApi } from 'engine/exchange/GameExchangeTypes.js';

/** The screens the engine draws itself and a game can turn on in world.json. */
export type GameExchangeScreenPlacement = 'end' | 'pause';

const SCREEN_PLACEMENTS: readonly GameExchangeScreenPlacement[] = ['end', 'pause'];
const DEFAULT_PLACEMENTS: readonly GameExchangeScreenPlacement[] = ['end'];
const FORMATS: readonly GameExchangeFormat[] = ['banner', 'video'];

/** What the subsystem needs from the engine that loaded the game. */
export interface GameExchangeEngine {
    gameStateManager?: GameStateManager;
    /** Read when a popup opens: its HUD holds the popup. */
    genreModule: { hud?: IGameHUD } | null;
    isRecordingFrames(): boolean;
    /** Release the mouse and freeze the player's controls while a popup opened during play is open. */
    enterInteractiveUI(): void;
    exitInteractiveUI(): void;
}

/** Everything the subsystem reads from the page, injectable so tests need no browser. */
export interface GameExchangeInstallDeps {
    client: GameExchangeClientDeps;
    readGateInputs: (config: GameExchangeConfig | undefined) => GameExchangeGateInputs;
    readCardEnv: () => GameExchangeCardEnv;
    textures: GameExchangeTextureDeps;
}

function defaultDeps(): GameExchangeInstallDeps {
    return {
        client: {
            baseUrl: getApiServerBaseUrl(),
            fetch: (url, init) => fetch(url, init),
            getDevice: () => ({
                mobile: isMobileRuntime(),
                width: window.innerWidth,
                height: window.innerHeight,
                framed: isFramedWindow(),
            }),
            getStorage: () => {
                // Reading the property itself throws where storage is blocked.
                try {
                    return window.sessionStorage;
                } catch {
                    return null;
                }
            },
            // A local build has no release version to report.
            engineVersion: isReleasedEngineVersion() ? ENGINE_VERSION : null,
        },
        readGateInputs: readGameExchangeGateInputs,
        readCardEnv: readGameExchangeCardEnv,
        textures: defaultGameExchangeTextureDeps(),
    };
}

/** The sample ads' colours: one gradient each, so sample posters side by side differ. */
const PREVIEW_PALETTES: readonly (readonly [string, string])[] = [
    ['#2b3a55', '#a0dab9'],
    ['#4a2b55', '#f0b37e'],
    ['#1f4a4f', '#e8d27a'],
    ['#552b33', '#9cc3f0'],
    ['#2f3f24', '#f2a0c4'],
    ['#3a3355', '#b4f0a0'],
];

/**
 * A sample picture, drawn inline so the preview requests nothing. It carries
 * its own size: a texture is drawn from it, and an SVG without one has none.
 */
function previewArt(width: number, height: number, variant: number): string {
    const [from, to] = PREVIEW_PALETTES[variant % PREVIEW_PALETTES.length] ?? ['#2b3a55', '#a0dab9'];
    const ground = `M0 ${height} L0 ${height * 0.69} L${width * 0.23} ${height * 0.42} L${width * 0.42} ${height * 0.67}`
        + ` L${width * 0.59} ${height * 0.47} L${width} ${height * 0.83} L${width} ${height} Z`;
    return 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
        + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`
        + `<rect width="${width}" height="${height}" fill="url(#g)"/>`
        + `<circle cx="${width * 0.73}" cy="${height * 0.31}" r="${height * 0.13}" fill="rgba(255,255,255,0.55)"/>`
        + `<path d="${ground}" fill="rgba(20,30,48,0.45)"/></svg>`,
    );
}

/** A sample tile: the screens' (`variant` 0) or one of the sample world ads. */
function createPreviewSlot(variant = 0, square = false): GameExchangeSlot {
    const now = Date.now();
    return {
        ad: {
            token: '',
            kind: 'house',
            gameId: variant === 0 ? 'preview' : `preview-${variant}`,
            title: 'Another Bitmagic game',
            tagline: 'Published games show a real game here.',
            // Sized like a real cover's copies: a sample poster costs what a real one does.
            banner: {
                url: previewArt(768, 432, variant),
                width: 768,
                height: 432,
                sources: [{ url: previewArt(384, 216, variant), width: 384 }],
            },
            ...(square
                ? { square: { url: previewArt(768, 768, variant), width: 768, height: 768, sources: [{ url: previewArt(384, 384, variant), width: 384 }] } }
                : {}),
            clickUrl: '',
            label: 'Up next',
            cta: 'Play',
            disclosure: 'Preview',
            openIn: 'auto',
            videoLoops: 1,
        },
        preview: true,
        minViewMs: 0,
        armMs: 0,
        staleAt: Number.POSITIVE_INFINITY,
        visibleMs: 0,
        countedUntil: 0,
        impressionSent: false,
    };
}

let deps: GameExchangeInstallDeps | null = null;
let client: GameExchangeClient | null = null;
let engine: GameExchangeEngine | null = null;
let mode: GameExchangeMode = 'off';
let placements: ReadonlySet<GameExchangeScreenPlacement> = new Set();
let previewSlot: GameExchangeSlot | null = null;
let stateManager: GameStateManager | null = null;
const screenCards = new Map<GameExchangeScreenPlacement, GameExchangeCard>();
const customMounts = new Set<GameExchangeMountHandle>();
const popup = new GameExchangePopup();
/** Bumped by every reset, so an ad, a popup or an answer of an earlier load does nothing. */
let loadGeneration = 0;

/** What the engine keeps of a world ad it handed out. Looked up by the frozen object, so a hand-made one is unknown. */
interface WorldAdRecord {
    /** The popup's tile: one slot per ad, so opening it again does not count it again. */
    slot: GameExchangeSlot;
    load: number;
    image: WorldStill;
    square: WorldStill | null;
    video: GameExchangeWorldVideo | null;
}

/** A still's two texture copies (the same one when the cover has only one small enough). */
interface WorldStill {
    small: GameExchangeWorldImage;
    large: GameExchangeWorldImage;
}

function worldStill(image: GameExchangeImage): WorldStill | null {
    const small = pickGameExchangeTextureImage(image, 'small');
    const large = pickGameExchangeTextureImage(image, 'large');
    return small && large ? { small, large } : null;
}
const worldAds = new WeakMap<GameExchangeWorldAd, WorldAdRecord>();
/** The clips created this load; the next load disposes them. */
const videoTextures = new Set<GameExchangeVideoTexture>();

const onStateChange: GameStateChangeListener = (newState) => {
    if (newState === GameState.PLAYING) requestScreenTiles();
    // The end or pause screen takes over; the popup goes without handing the
    // player's controls back (the state is no longer PLAYING).
    if (newState === GameState.END || newState === GameState.PAUSED) popup.close();
};

function requestScreenTiles(): void {
    if (mode !== 'live' || !client) return;
    for (const placement of placements) client.request(placement);
}

/** Take down everything that belongs to the current load. */
function resetLoad(): void {
    loadGeneration += 1;
    stateManager?.removeListener(onStateChange);
    stateManager = null;
    for (const card of screenCards.values()) card.dispose();
    screenCards.clear();
    for (const handle of [...customMounts]) handle.dispose();
    popup.close(false);
    for (const video of [...videoTextures]) video.dispose();
    client?.stop();
    previewSlot = null;
    placements = new Set();
    mode = 'off';
}

/** The declared ids that are known, or the default when none is. */
function knownIds<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
    const ids = Array.isArray(value) ? allowed.filter((id) => value.includes(id)) : [];
    return ids.length > 0 ? ids : [...fallback];
}

/** The mode right now: the load's mode, switched off while a recording runs. */
function currentMode(): GameExchangeMode {
    return gameExchangeModeAtRender(mode, {
        eventLogOwner: getGameEventLog().getOwner(),
        recordingFrames: engine?.isRecordingFrames() ?? false,
    });
}

function readySlot(at: GameExchangeMode, placement: GameExchangePlacement): GameExchangeSlot | null {
    if (at === 'preview') {
        previewSlot ??= createPreviewSlot();
        return previewSlot;
    }
    return at === 'live' ? (client?.getSlot(placement) ?? null) : null;
}

function buildCard(slot: GameExchangeSlot): GameExchangeCard | null {
    if (!deps) return null;
    return createGameExchangeCard(slot, {
        env: deps.readCardEnv(),
        onImpression: (seen) => client?.reportImpression(seen),
    });
}

/**
 * @internal Install the subsystem. Called once per engine by installEngineProgress
 * (from the GameEngine constructor, before any game code); tests pass their own
 * page readers and fetch.
 */
export function installGameExchange(overrides: Partial<GameExchangeInstallDeps> = {}): void {
    resetLoad();
    engine = null;
    deps = { ...defaultDeps(), ...overrides };
    client = new GameExchangeClient(deps.client);
    // Before any game code, so it runs ahead of the game's own key listeners. Once per page.
    popup.guardKeys(window);
}

/**
 * @internal Bind the subsystem to the game being loaded. Synchronous, and
 * called by GameEngine.loadGame before any game code runs. Drops the previous
 * load's tiles, mounts and listener first.
 */
export function configureGameExchange(
    loadingEngine: GameExchangeEngine,
    gameId: string,
    config: GameExchangeConfig | undefined,
): void {
    resetLoad();
    engine = loadingEngine;
    if (!deps || !client) return;
    mode = resolveGameExchangeMode(deps.readGateInputs(config));
    if (mode === 'off') return;
    placements = new Set(knownIds(config?.placements, SCREEN_PLACEMENTS, DEFAULT_PLACEMENTS));
    // In preview too: a sample ad's popup closes when the game ends or pauses.
    stateManager = loadingEngine.gameStateManager ?? null;
    stateManager?.addListener(onStateChange);
    if (mode !== 'live') return;
    client.configure(gameId, knownIds(config?.formats, FORMATS, FORMATS));
    // Ask when gameplay starts, not at load: a player who never presses Play
    // was never going to reach an end screen.
    if (stateManager?.getCurrentState() === GameState.PLAYING) requestScreenTiles();
}

/** @internal Stop the subsystem. Called from GameEngine.dispose. Idempotent. */
export function stopGameExchange(): void {
    resetLoad();
    engine = null;
}

/**
 * @internal Draw the placement's tile into an engine screen's card, if there is
 * one to draw RIGHT NOW. Call it while the screen renders (inside `onCreate`).
 * Returns whether a tile was added; when it was not, the card is untouched.
 * The tile is inserted before `before`, or last.
 */
export function mountGameExchangePlacement(
    placement: GameExchangeScreenPlacement,
    card: HTMLElement,
    before: Node | null = null,
): boolean {
    screenCards.get(placement)?.dispose();
    screenCards.delete(placement);
    if (!placements.has(placement)) return false;
    const at = currentMode();
    const slot = readySlot(at, placement);
    const tile = slot ? buildCard(slot) : null;
    if (!slot || !tile) return false;
    card.classList.add(GAME_EXCHANGE_HOST_CLASS);
    card.insertBefore(tile.element, before);
    // A tile must never push the screen's own content off the screen (a short
    // landscape phone with a tall card): then this screen goes without one.
    if (overflowsViewport(card)) {
        tile.dispose();
        card.classList.remove(GAME_EXCHANGE_HOST_CLASS);
        return false;
    }
    tile.start();
    client?.markShown(slot);
    screenCards.set(placement, tile);
    return true;
}

/**
 * Room a card keeps for what grows it after it is drawn: web fonts that arrive
 * later make it a few pixels taller than when the tile was measured.
 */
const FIT_MARGIN_PX = 12;

/**
 * Whether a laid-out card (nearly) fills the window. A card with no layout yet
 * (height 0) does not. Layout height, not the box on screen: the card's entry
 * animation starts it scaled down, which would make it look shorter than it is.
 */
function overflowsViewport(card: HTMLElement): boolean {
    const height = card.offsetHeight;
    return height > 0 && height + FIT_MARGIN_PX > window.innerHeight;
}

function mountCustom(container: HTMLElement, options: Partial<GameExchangeMountOptions> = {}): GameExchangeMountHandle | null {
    const { placement }: GameExchangeMountOptions = { ...DEFAULT_GAME_EXCHANGE_MOUNT_OPTIONS, ...options };
    if (currentMode() === 'off') return null;
    // Held in an object: `fill` runs later, from the client, and assigns it.
    const mounted: { tile: GameExchangeCard | null } = { tile: null };
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    // The container is the game's own, so a tile that arrives late may still go in.
    const fill = (): void => {
        if (disposed || mounted.tile) return;
        const slot = readySlot(currentMode(), placement);
        const tile = slot ? buildCard(slot) : null;
        if (!slot || !tile) return;
        mounted.tile = tile;
        container.appendChild(tile.element);
        tile.start();
        client?.markShown(slot);
        unsubscribe?.();
        unsubscribe = null;
    };

    fill();
    if (!mounted.tile && mode === 'live' && client) {
        unsubscribe = client.onSlot(placement, fill);
        client.request(placement);
    }

    const handle: GameExchangeMountHandle = {
        dispose(): void {
            if (disposed) return;
            disposed = true;
            unsubscribe?.();
            unsubscribe = null;
            mounted.tile?.dispose();
            mounted.tile = null;
            customMounts.delete(handle);
        },
    };
    customMounts.add(handle);
    return handle;
}

// ════════════════════════════════════════════════════════════════════════════
// World ads: posters and screens in the game's own scene
// ════════════════════════════════════════════════════════════════════════════

/** How long a sample world ad lasts: about as long as a live one's token. */
const PREVIEW_WORLD_AD_TTL_MS = 24 * 3_600_000;

function frozenImage(image: GameExchangeWorldImage): GameExchangeWorldImage {
    return Object.freeze({ url: image.url, width: image.width, height: image.height });
}

/**
 * Hand a slot to the game as a world ad, and remember what the engine needs of
 * it. Null for an ad without a still small enough for a texture (the server
 * sends none for `world`). Its clip is only ever the small world clip.
 */
function createWorldAd(slot: GameExchangeSlot, load: number): GameExchangeWorldAd | null {
    const { ad } = slot;
    const image = worldStill(ad.banner);
    if (!image) return null;
    const record: WorldAdRecord = {
        slot,
        load,
        image,
        square: ad.square ? worldStill(ad.square) : null,
        video: ad.worldVideo ? { ...ad.worldVideo } : null,
    };
    const worldAd: GameExchangeWorldAd = Object.freeze({
        gameId: ad.gameId,
        title: ad.title,
        disclosure: ad.disclosure,
        image: frozenImage(record.image.small),
        ...(record.square ? { square: frozenImage(record.square.small) } : {}),
        ...(record.video ? { video: Object.freeze({ ...record.video }) } : {}),
        expiresAt: slot.staleAt,
        open: () => openWorldAd(record),
    });
    worldAds.set(worldAd, record);
    return worldAd;
}

/** The record of an ad this load handed out, while the exchange may show it; else null. */
function usableRecord(ad: GameExchangeWorldAd): WorldAdRecord | null {
    const record = worldAds.get(ad);
    return record && record.load === loadGeneration && currentMode() !== 'off' ? record : null;
}

async function getAds(options: Partial<GameExchangeAdsOptions> = {}): Promise<GameExchangeWorldAd[]> {
    try {
        const { count, formats }: GameExchangeAdsOptions = { ...DEFAULT_GAME_EXCHANGE_ADS_OPTIONS, ...options };
        const wanted = clampGameExchangeAdCount(count);
        const load = loadGeneration;
        const at = currentMode();
        if (at === 'preview') {
            // A finite expiry, as a live ad has: a game schedules its refresh from it.
            const staleAt = Date.now() + PREVIEW_WORLD_AD_TTL_MS;
            return Array.from({ length: wanted }, (_, index) => createWorldAd({ ...createPreviewSlot(index + 1, true), staleAt }, load))
                .filter((ad): ad is GameExchangeWorldAd => ad !== null);
        }
        if (at !== 'live' || !client) return [];
        const batch = await client.requestAds(wanted, Array.isArray(formats) ? formats : []);
        if (!batch || load !== loadGeneration) return [];
        const now = Date.now();
        const ads = batch.ads.map((ad) => createWorldAd({
            ad,
            preview: false,
            minViewMs: batch.minViewMs,
            armMs: batch.armMs,
            staleAt: now + batch.expiresInMs,
            visibleMs: 0,
            countedUntil: 0,
            impressionSent: false,
        }, load));
        return ads.filter((ad): ad is GameExchangeWorldAd => ad !== null);
    } catch {
        // The exchange never disturbs the game: no ads is an answer.
        return [];
    }
}

function openWorldAd(record: WorldAdRecord): void {
    if (record.load !== loadGeneration || currentMode() === 'off' || !engine || !deps) return;
    const hud = engine.genreModule?.hud;
    if (!hud) return;
    const host = engine;
    const tile = createGameExchangeCard(record.slot, {
        env: deps.readCardEnv(),
        // An ad past its time still opens (the player asked), but its token would be refused.
        onImpression: (seen) => {
            if (Date.now() < seen.staleAt) client?.reportImpression(seen);
        },
    });
    const shown = popup.show(tile, {
        hud,
        // An engine with no state manager has no end or pause screen to defer to.
        isPlaying: () => host.gameStateManager?.isState(GameState.PLAYING) ?? true,
        enterInteractiveUI: () => host.enterInteractiveUI(),
        exitInteractiveUI: () => host.exitInteractiveUI(),
    });
    if (shown) client?.markShown(record.slot);
}

function loadImageTexture(ad: GameExchangeWorldAd, options: Partial<GameExchangeImageTextureOptions> = {}): Promise<Texture> {
    const { picture, size }: GameExchangeImageTextureOptions = { ...DEFAULT_GAME_EXCHANGE_IMAGE_TEXTURE_OPTIONS, ...options };
    const record = usableRecord(ad);
    if (!record || !deps) return Promise.reject(new Error('This Game Exchange ad cannot be shown here any more.'));
    const still = picture === 'square' ? record.square : record.image;
    if (!still) return Promise.reject(new Error('This Game Exchange ad has no square picture.'));
    return loadGameExchangeImageTexture(size === 'large' ? still.large : still.small, `gx:${ad.gameId}`, deps.textures);
}

function createVideoTexture(ad: GameExchangeWorldAd): GameExchangeVideoTexture | null {
    const record = usableRecord(ad);
    if (!record?.video || !deps) return null;
    const env = deps.readCardEnv();
    if (env.reducedMotion || env.saveData) return null;
    const video = createGameExchangeVideoTexture(record.video, `gx:${ad.gameId}:video`, deps.textures, (disposed) => {
        videoTextures.delete(disposed);
    });
    videoTextures.add(video);
    return video;
}

const api: GameExchangeApi = {
    isAvailable: () => currentMode() !== 'off',
    mount: mountCustom,
    getAds,
    loadImageTexture,
    createVideoTexture,
};

/** `engine.gameExchange`: the same object for the life of the page. */
export function getGameExchange(): GameExchangeApi {
    return api;
}
