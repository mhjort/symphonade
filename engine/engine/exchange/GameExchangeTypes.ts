/**
 * The Game Exchange: an "Up next" tile for another published Bitmagic
 * game, shown beside Play Again on the end screen, optionally on the pause
 * screen, or wherever a game mounts it through `engine.gameExchange`. A game
 * can also hang ads in its own scene (posters, a TV) and open the tile in the
 * engine's popup when the player clicks one.
 *
 * This file holds the types and the few ids the rest of the module shares. It
 * imports nothing at runtime, so any engine module can read the ids without a
 * cycle. The wire shapes repeat `@bitmagic/asset-core/game-exchange` by hand:
 * the engine cannot import that package. See game/agent-docs/game-exchange.md.
 */

import type { Texture, VideoTexture } from 'three';
import type { WorldProfileData } from 'types/game.js';

/**
 * The tile's revision, sent as `cv` on every serve request. The platform can
 * stop serving a revision that turns out to be broken, so bump this when the
 * tile's behaviour changes in a way the server would need to tell apart.
 */
export const GAME_EXCHANGE_CARD_REV = 1;

/** The version of the request bodies (`v`). */
export const GAME_EXCHANGE_WIRE_VERSION = 1;

/** The id of the head `<style>` the tile's CSS lives in. */
export const GAME_EXCHANGE_STYLE_ID = 'bm-game-exchange-styles';

/**
 * Where a tile can appear. `custom` is wherever the game mounts it; `world` is
 * an ad the game draws into its own scene and opens in the engine's popup.
 */
export type GameExchangePlacement = 'end' | 'pause' | 'custom' | 'world';

export type GameExchangeFormat = 'banner' | 'video';

/** The world.json declaration (`worldProfileData.gameExchange`). */
export type GameExchangeConfig = NonNullable<WorldProfileData['gameExchange']>;

/**
 * What the exchange does in this page. `preview` draws a built-in sample tile
 * and makes no request (the Creator and `bitmagic dev`); `live` is a published
 * game on a Bitmagic host.
 */
export type GameExchangeMode = 'off' | 'preview' | 'live';

export interface GameExchangeImageSource {
    url: string;
    width: number;
}

export interface GameExchangeImage {
    url: string;
    width: number;
    height: number;
    sources: GameExchangeImageSource[];
    /** The box that must stay in view when the image is cropped, as fractions of its size. */
    focus?: { x0: number; y0: number; x1: number; y1: number };
}

export interface GameExchangeVideo {
    url: string;
    width: number;
    height: number;
    durationMs: number;
}

/** One tile, as the server describes it. */
export interface GameExchangeAd {
    token: string;
    kind: 'exchange' | 'house';
    gameId: string;
    title: string;
    tagline?: string;
    banner: GameExchangeImage;
    square?: GameExchangeImage;
    /** The tile's clip (512×288): for the tile and the popup, never a texture. */
    video?: GameExchangeVideo;
    /** Only on `world` answers: the small clip (320×180) a texture is made from. */
    worldVideo?: GameExchangeVideo;
    clickUrl: string;
    label: string;
    cta: string;
    disclosure: string;
    openIn: 'auto' | 'new' | 'same';
    videoLoops: number;
}

export interface GameExchangeDevice {
    mobile: boolean;
    width: number;
    height: number;
    /** The game runs inside a frame (the portal's play page), not as the top window. */
    framed: boolean;
}

/**
 * The current tile of one placement. One object per placement per load: a
 * screen that renders again mounts the same object, so the visible time and
 * the impression flag live here and not on the DOM.
 */
export interface GameExchangeSlot {
    ad: GameExchangeAd;
    /** The built-in sample (preview mode): an inert link, nothing is ever reported. */
    preview: boolean;
    /** Visible time before the impression counts, ms. */
    minViewMs: number;
    /** Visible time before the tile takes a click, ms. */
    armMs: number;
    /** `now()` after which the tile must not be shown. */
    staleAt: number;
    /** Visible time accumulated over every mount, ms. */
    visibleMs: number;
    /** `now()` up to which visible time has been counted, so mounts visible together count it once. */
    countedUntil: number;
    impressionSent: boolean;
}

export interface GameExchangeMountOptions {
    /** The only placement game code can mount. */
    placement: 'custom';
}

export const DEFAULT_GAME_EXCHANGE_MOUNT_OPTIONS: GameExchangeMountOptions = {
    placement: 'custom',
};

export interface GameExchangeMountHandle {
    /** Take the tile out and stop measuring it. Safe to call twice. */
    dispose(): void;
}

/** The most ads one `getAds` call returns; a larger `count` is clamped to it. */
export const GAME_EXCHANGE_MAX_ADS = 6;

/** What `engine.gameExchange.getAds()` asks for. */
export interface GameExchangeAdsOptions {
    /** How many different games, 1 to GAME_EXCHANGE_MAX_ADS. Anything else is clamped. */
    count: number;
    /**
     * What the ads may carry. Every ad has its still; `video` also asks for a
     * clip, which comes only when world.json allows video too.
     */
    formats: GameExchangeFormat[];
}

export const DEFAULT_GAME_EXCHANGE_ADS_OPTIONS: GameExchangeAdsOptions = {
    count: 1,
    formats: ['banner', 'video'],
};

/**
 * The widest copy of a still a texture is made from: the platform's 768 px
 * copy at most, never the full cover (a 1920 px image for a poster on a wall
 * is bytes and GPU memory for nothing). Kept in step with
 * GAME_EXCHANGE_WORLD_IMAGE_MAX_WIDTH in shared/asset-core/src/game-exchange.ts.
 */
export const GAME_EXCHANGE_WORLD_IMAGE_MAX_WIDTH = 768;

/** One picture of an ad, sized for a texture. */
export interface GameExchangeWorldImage {
    readonly url: string;
    readonly width: number;
    readonly height: number;
}

export interface GameExchangeWorldVideo extends GameExchangeWorldImage {
    readonly durationMs: number;
}

/**
 * An ad for the game's own scene: its pictures, to put on a poster or a TV,
 * and `open()`, which shows the ad in the engine's popup. Showing the pictures
 * counts nothing; the popup is the impression. A frozen object, the game's to
 * keep until the next load.
 */
export interface GameExchangeWorldAd {
    readonly gameId: string;
    readonly title: string;
    /** "Promoted" or "Bitmagic pick" (or "Preview"): show it near the poster. */
    readonly disclosure: string;
    /**
     * The 16:9 still a poster shows: its small copy (384 px wide, 15–25 KB).
     * `loadImageTexture(ad, { size: 'large' })` loads the 768 px copy instead.
     */
    readonly image: GameExchangeWorldImage;
    /** A square still (its small copy), when the game has one. */
    readonly square?: GameExchangeWorldImage;
    /**
     * A short silent clip sized for a screen in a scene (320×180, 40–220 KB
     * for its ten-second loop), when the ad has one and video was asked
     * for. The popup's tile plays its own, larger clip (none on a phone held
     * upright that is narrower than 360 px, where it shows the still).
     */
    readonly video?: GameExchangeWorldVideo;
    /** Epoch ms after which open() would show a tile that can no longer be counted; fetch again before. */
    readonly expiresAt: number;
    /** Show this ad in the engine's popup. The popup is the impression. */
    open(): void;
}

/** What `loadImageTexture()` loads. */
export interface GameExchangeImageTextureOptions {
    /** `image` is the 16:9 still, `square` the square one (rejected when the ad has none). */
    picture: 'image' | 'square';
    /**
     * `small`: the 384 px copy, for a poster seen across a room (most of
     * them). `large`: the 768 px copy, for one the player can walk right up
     * to; the small one when there is no larger. Never the full image.
     */
    size: 'small' | 'large';
}

export const DEFAULT_GAME_EXCHANGE_IMAGE_TEXTURE_OPTIONS: GameExchangeImageTextureOptions = {
    picture: 'image',
    size: 'small',
};

/** An ad's clip as a texture, from `createVideoTexture()`. Always muted, always looping. */
export interface GameExchangeVideoTexture {
    readonly texture: VideoTexture;
    /**
     * Start (or resume) the clip. Resolves once it plays; rejects when it cannot
     * (the clip did not load, the browser refused, or the texture was disposed):
     * keep the still up then.
     */
    play(): Promise<void>;
    pause(): void;
    /** Stop the clip and release the element and the texture. Idempotent. */
    dispose(): void;
}

/** `engine.gameExchange`. */
export interface GameExchangeApi {
    /**
     * Whether a tile can appear in this page at all: the game declared
     * `worldProfileData.gameExchange.enabled` and the page is a published game
     * on a Bitmagic host, or a preview in the Creator or `bitmagic dev`.
     */
    isAvailable(): boolean;
    /**
     * Put the tile into `container`. Returns null when the exchange is off
     * here; otherwise a handle, and the tile appears in the container once one
     * is ready (at once when it already is). The container may be attached to
     * the document after this call: the tile starts counting and takes clicks
     * once it is in the page. The engine draws the tile and
     * reports the impression and the click itself.
     */
    mount(container: HTMLElement, options?: Partial<GameExchangeMountOptions>): GameExchangeMountHandle | null;
    /**
     * Ads for the game's own scene (placement `world`). Resolves `[]`, never
     * rejects, when the exchange is off here or nothing came. Each call is a new
     * request: call it when the scene is built and again before the ads expire,
     * not every frame. The Creator and `bitmagic dev` get sample ads at once.
     */
    getAds(options?: Partial<GameExchangeAdsOptions>): Promise<GameExchangeWorldAd[]>;
    /**
     * A texture of the ad's still (sRGB, mipmapped), for either renderer.
     * Rejects when it cannot load: keep the game's own art up then.
     */
    loadImageTexture(ad: GameExchangeWorldAd, options?: Partial<GameExchangeImageTextureOptions>): Promise<Texture>;
    /**
     * A muted looping texture of the ad's small clip, or null when the ad has
     * none or the player asked for reduced motion or less data. The clip is
     * downloaded once and loops from memory. Nothing plays until `play()`. The
     * engine disposes it at the next load.
     */
    createVideoTexture(ad: GameExchangeWorldAd): GameExchangeVideoTexture | null;
}
