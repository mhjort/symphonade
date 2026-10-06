/**
 * GameExchangeClient: asks the platform for a tile and reports that it was seen.
 *
 * Two requests, both to the api-server and both without a credential (a
 * published bundle has none to send, and most players are guests):
 *   - `POST /api/play/exchange/serve`: one tile for one placement, or several
 *     different games at once for the game's own scene (`world`).
 *   - `POST /api/play/exchange/impression`: the tile was on screen long enough.
 * The click is not reported from here: the tile's link is a platform URL that
 * records it and redirects.
 *
 * Bodies are JSON sent as `text/plain`, which keeps the request CORS-simple
 * (no preflight from a play origin).
 *
 * Every network path swallows its errors and nothing is retried or logged: the
 * exchange must NEVER disturb gameplay, and a tile that fails to arrive is
 * simply not shown.
 *
 * The client holds ONE current tile per placement per load. It is asked for
 * when gameplay starts, replaced on a timer before its token runs out, and
 * never handed out once stale. Ads for the game's scene are
 * not held: every `requestAds()` is a new request and its answer is handed
 * straight back. The parsing and storage helpers are pure and unit-tested.
 */

import {
    GAME_EXCHANGE_CARD_REV,
    GAME_EXCHANGE_MAX_ADS,
    GAME_EXCHANGE_WIRE_VERSION,
    type GameExchangeAd,
    type GameExchangeDevice,
    type GameExchangeFormat,
    type GameExchangeImage,
    type GameExchangeImageSource,
    type GameExchangePlacement,
    type GameExchangeSlot,
    type GameExchangeVideo,
} from 'engine/exchange/GameExchangeTypes.js';

export const GAME_EXCHANGE_SERVE_PATH = '/api/play/exchange/serve';
export const GAME_EXCHANGE_IMPRESSION_PATH = '/api/play/exchange/impression';
export const GAME_EXCHANGE_CLICK_PATH = '/api/play/exchange/click';

/** A request that has not answered by then is given up on. */
export const GAME_EXCHANGE_REQUEST_TIMEOUT_MS = 4_000;

/** A tile is replaced once this share of its lifetime (`expiresInMs`) has passed. */
export const GAME_EXCHANGE_REFRESH_AT = 0.7;

/** sessionStorage key: the listed games this tab showed lately. Survives Play Again's reload. */
export const GAME_EXCHANGE_SEEN_KEY = 'bm-gx-seen';

/** How many recent ids are kept and sent; the server honours no more. */
export const GAME_EXCHANGE_SEEN_MAX = 5;

const DEFAULT_MIN_VIEW_MS = 1_000;
const DEFAULT_ARM_MS = 1_000;
const DEFAULT_VIDEO_LOOPS = 2;
const DEFAULT_LABEL = 'Up next';
const DEFAULT_CTA = 'Play';
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ════════════════════════════════════════════════════════════════════════════
// Pure helpers (unit-tested)
// ════════════════════════════════════════════════════════════════════════════

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

function positive(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function fraction(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** A server string for display: trimmed and capped. Null when there is nothing to show. */
function displayText(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text === '' ? null : text.slice(0, maxLength);
}

/** The URL in its normalised form when it is an https URL, else null. */
export function httpsUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

function parseImage(raw: unknown): GameExchangeImage | null {
    if (!isRecord(raw)) return null;
    const url = httpsUrl(raw.url);
    const width = positive(raw.width);
    const height = positive(raw.height);
    if (!url || !width || !height) return null;
    const sources: GameExchangeImageSource[] = [];
    if (raw.sources !== undefined) {
        if (!Array.isArray(raw.sources)) return null;
        for (const entry of raw.sources.slice(0, 8)) {
            const sourceUrl = isRecord(entry) ? httpsUrl(entry.url) : null;
            const sourceWidth = isRecord(entry) ? positive(entry.width) : null;
            if (!sourceUrl || !sourceWidth) return null;
            sources.push({ url: sourceUrl, width: sourceWidth });
        }
    }
    const image: GameExchangeImage = { url, width, height, sources };
    const focus = raw.focus;
    if (isRecord(focus)) {
        const x0 = fraction(focus.x0);
        const y0 = fraction(focus.y0);
        const x1 = fraction(focus.x1);
        const y1 = fraction(focus.y1);
        if (x0 !== null && y0 !== null && x1 !== null && y1 !== null) image.focus = { x0, y0, x1, y1 };
    }
    return image;
}

function parseVideo(raw: unknown): GameExchangeVideo | null {
    if (!isRecord(raw)) return null;
    const url = httpsUrl(raw.url);
    const width = positive(raw.width);
    const height = positive(raw.height);
    if (!url || !width || !height) return null;
    return { url, width, height, durationMs: clampNumber(raw.durationMs, 0, 600_000, 0) };
}

/**
 * Check a served tile before anything of it reaches the page. The tile is
 * another creator's game drawn inside this game's origin, so nothing is taken
 * on trust: the link must be the platform's own click route on this build's
 * api-server, every media URL must be https, and a tile that fails either is
 * dropped whole (null) rather than shown in part.
 */
export function parseGameExchangeAd(raw: unknown, baseUrl: string): GameExchangeAd | null {
    if (!isRecord(raw)) return null;
    const { token, gameId, clickUrl, kind } = raw;
    if (typeof token !== 'string' || token === '' || token.length > 4096) return null;
    if (typeof gameId !== 'string' || !GAME_ID_RE.test(gameId)) return null;
    if (kind !== 'exchange' && kind !== 'house') return null;
    if (typeof clickUrl !== 'string' || clickUrl.length > 8192 || !clickUrl.startsWith(`${baseUrl}${GAME_EXCHANGE_CLICK_PATH}?`)) return null;
    const title = displayText(raw.title, 120);
    const banner = parseImage(raw.banner);
    if (!title || !banner) return null;

    const ad: GameExchangeAd = {
        token,
        kind,
        gameId,
        title,
        banner,
        clickUrl,
        label: displayText(raw.label, 40) ?? DEFAULT_LABEL,
        cta: displayText(raw.cta, 24) ?? DEFAULT_CTA,
        disclosure: displayText(raw.disclosure, 32) ?? (kind === 'house' ? 'Bitmagic pick' : 'Promoted'),
        openIn: raw.openIn === 'new' || raw.openIn === 'same' ? raw.openIn : 'auto',
        videoLoops: Math.round(clampNumber(raw.videoLoops, 1, 5, DEFAULT_VIDEO_LOOPS)),
    };
    const tagline = displayText(raw.tagline, 160);
    if (tagline) ad.tagline = tagline;
    if (raw.square !== undefined && raw.square !== null) {
        const square = parseImage(raw.square);
        if (!square) return null;
        ad.square = square;
    }
    if (raw.video !== undefined && raw.video !== null) {
        const video = parseVideo(raw.video);
        if (!video) return null;
        ad.video = video;
    }
    if (raw.worldVideo !== undefined && raw.worldVideo !== null) {
        const worldVideo = parseVideo(raw.worldVideo);
        if (!worldVideo) return null;
        ad.worldVideo = worldVideo;
    }
    return ad;
}

/**
 * Every valid ad in a serve answer, in order: an invalid one is dropped on its
 * own, and so is a second ad for a game already in the list. At most
 * GAME_EXCHANGE_MAX_ADS.
 */
export function parseGameExchangeAds(raw: readonly unknown[], baseUrl: string): GameExchangeAd[] {
    const ads: GameExchangeAd[] = [];
    for (const entry of raw) {
        if (ads.length >= GAME_EXCHANGE_MAX_ADS) break;
        const ad = parseGameExchangeAd(entry, baseUrl);
        if (ad && !ads.some((kept) => kept.gameId === ad.gameId || kept.token === ad.token)) ads.push(ad);
    }
    return ads;
}

export type GameExchangeServeResult =
    | { enabled: false }
    | {
        enabled: true;
        minViewMs: number;
        armMs: number;
        expiresInMs: number;
        /** The first valid ad: the tile of a one-tile placement. */
        ad: GameExchangeAd | null;
        ads: GameExchangeAd[];
    };

/**
 * Read a serve response. Null means it is not one (treated like a failed
 * request). `enabled: false` is the platform saying this game shows no tiles.
 */
export function parseGameExchangeServeResponse(raw: unknown, baseUrl: string): GameExchangeServeResult | null {
    if (!isRecord(raw) || typeof raw.enabled !== 'boolean') return null;
    if (!raw.enabled) return { enabled: false };
    const expiresInMs = positive(raw.expiresInMs);
    if (!expiresInMs || !Array.isArray(raw.ads)) return null;
    const ads = parseGameExchangeAds(raw.ads, baseUrl);
    return {
        enabled: true,
        minViewMs: clampNumber(raw.minViewMs, 0, 60_000, DEFAULT_MIN_VIEW_MS),
        armMs: clampNumber(raw.armMs, 0, 60_000, DEFAULT_ARM_MS),
        expiresInMs,
        ad: ads[0] ?? null,
        ads,
    };
}

export type GameExchangeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The recently shown listed games, newest first. Anything unreadable is an empty list. */
export function readSeenGameIds(storage: GameExchangeStorage | null): string[] {
    if (!storage) return [];
    try {
        const parsed: unknown = JSON.parse(storage.getItem(GAME_EXCHANGE_SEEN_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((id): id is string => typeof id === 'string' && GAME_ID_RE.test(id))
            .slice(0, GAME_EXCHANGE_SEEN_MAX);
    } catch {
        return [];
    }
}

/** Put `gameId` at the front of the recently shown list. A storage that refuses is ignored. */
export function rememberSeenGameId(storage: GameExchangeStorage | null, gameId: string): void {
    if (!storage) return;
    const next = [gameId, ...readSeenGameIds(storage).filter((id) => id !== gameId)].slice(0, GAME_EXCHANGE_SEEN_MAX);
    try {
        storage.setItem(GAME_EXCHANGE_SEEN_KEY, JSON.stringify(next));
    } catch {
        // A full or blocked store only costs the hint.
    }
}

// ════════════════════════════════════════════════════════════════════════════
// Client
// ════════════════════════════════════════════════════════════════════════════

export interface GameExchangeClientDeps {
    /** The api-server origin (`getApiServerBaseUrl()`), without a trailing slash. */
    baseUrl: string;
    fetch: (url: string, init: RequestInit) => Promise<Response>;
    getDevice: () => GameExchangeDevice;
    /** The tab's session store, or null where there is none (or it is blocked). */
    getStorage: () => GameExchangeStorage | null;
    /** Sent as `ev` when the build knows its engine version. */
    engineVersion: string | null;
}

/** The ads one `requestAds()` brought, with the terms the serve answer set for them. */
export interface GameExchangeAdBatch {
    ads: GameExchangeAd[];
    minViewMs: number;
    armMs: number;
    expiresInMs: number;
}

/** A requested ad count as the server takes it: a whole number from 1 to GAME_EXCHANGE_MAX_ADS. */
export function clampGameExchangeAdCount(count: unknown): number {
    if (typeof count !== 'number' || !Number.isFinite(count)) return 1;
    return Math.min(GAME_EXCHANGE_MAX_ADS, Math.max(1, Math.floor(count)));
}

/**
 * One instance per engine, bound to a game by `configure()` on every load.
 */
export class GameExchangeClient {
    private gameId: string | null = null;
    private formats: GameExchangeFormat[] = [];
    /** Bumped by configure() and stop(), so a late answer for an earlier load is dropped. */
    private generation = 0;
    /** The platform answered `enabled: false`: ask for nothing more this load. */
    private refused = false;
    private readonly slots = new Map<GameExchangePlacement, GameExchangeSlot>();
    /** Placements already asked for this load. A failed request is not repeated. */
    private readonly requested = new Set<GameExchangePlacement>();
    private readonly refreshTimers = new Map<GameExchangePlacement, ReturnType<typeof setTimeout>>();
    private readonly waiting = new Map<GameExchangePlacement, Set<() => void>>();

    constructor(private readonly deps: GameExchangeClientDeps) {}

    /** Bind to a freshly loaded game, dropping everything the previous load held. */
    configure(gameId: string, formats: readonly GameExchangeFormat[]): void {
        this.stop();
        this.gameId = gameId;
        this.formats = [...formats];
    }

    /** Drop every tile, timer and waiter. In-flight answers are ignored. Idempotent. */
    stop(): void {
        this.generation += 1;
        this.gameId = null;
        this.refused = false;
        this.slots.clear();
        this.requested.clear();
        for (const timer of this.refreshTimers.values()) clearTimeout(timer);
        this.refreshTimers.clear();
        this.waiting.clear();
    }

    /** Ask for this placement's tile, once per load. */
    request(placement: GameExchangePlacement): void {
        if (!this.gameId || this.refused || this.requested.has(placement)) return;
        this.requested.add(placement);
        void this.serve(placement);
    }

    /** The placement's tile when one is ready and still fresh, else null. A stale tile is never returned. */
    getSlot(placement: GameExchangePlacement): GameExchangeSlot | null {
        const slot = this.slots.get(placement);
        return slot && Date.now() < slot.staleAt ? slot : null;
    }

    /** Call `listener` each time a tile arrives for `placement`. Returns the unsubscribe. */
    onSlot(placement: GameExchangePlacement, listener: () => void): () => void {
        const set = this.waiting.get(placement) ?? new Set<() => void>();
        this.waiting.set(placement, set);
        set.add(listener);
        return () => { set.delete(listener); };
    }

    /** Note that this tile was put on screen, so the next request can ask for a different game. */
    markShown(slot: GameExchangeSlot): void {
        if (slot.preview) return;
        rememberSeenGameId(this.deps.getStorage(), slot.ad.gameId);
    }

    /** Report the tile's impression: once per tile, fire and forget. */
    reportImpression(slot: GameExchangeSlot): void {
        if (slot.preview || slot.impressionSent) return;
        // Set before the send: a lost request is not repeated.
        slot.impressionSent = true;
        void this.post(GAME_EXCHANGE_IMPRESSION_PATH, {
            v: GAME_EXCHANGE_WIRE_VERSION,
            token: slot.ad.token,
            visibleMs: Math.round(slot.visibleMs),
        }, false);
    }

    /**
     * Ask for up to `count` different games for the game's own scene. A new
     * request every call, within the formats the game declared. Null when
     * nothing came: not configured, refused, failed, or a newer load began
     * while it was out. Never rejects.
     */
    async requestAds(count: number, formats: readonly GameExchangeFormat[]): Promise<GameExchangeAdBatch | null> {
        if (!this.gameId || this.refused) return null;
        const generation = this.generation;
        const wanted = clampGameExchangeAdCount(count);
        const result = await this.fetchServe(this.serveBody('world', this.formats.filter((format) => formats.includes(format)), wanted));
        if (generation !== this.generation || !result) return null;
        return {
            ads: result.ads.slice(0, wanted),
            minViewMs: result.minViewMs,
            armMs: result.armMs,
            expiresInMs: result.expiresInMs,
        };
    }

    private serveBody(placement: GameExchangePlacement, formats: readonly GameExchangeFormat[], count: number | null): Record<string, unknown> {
        const seen = readSeenGameIds(this.deps.getStorage());
        return {
            v: GAME_EXCHANGE_WIRE_VERSION,
            cv: GAME_EXCHANGE_CARD_REV,
            ...(this.deps.engineVersion ? { ev: this.deps.engineVersion } : {}),
            gameId: this.gameId,
            placement,
            formats: [...formats],
            device: this.deps.getDevice(),
            ...(seen.length > 0 ? { seen } : {}),
            ...(count !== null ? { count } : {}),
        };
    }

    /**
     * Send a serve request and read its answer. Null for a failed request, for
     * an answer that is not one, for the platform's refusal (which also stops
     * every later request this load) and for an answer that arrived after
     * configure() or stop().
     */
    private async fetchServe(body: Record<string, unknown>): Promise<Extract<GameExchangeServeResult, { enabled: true }> | null> {
        const generation = this.generation;
        const raw = await this.post(GAME_EXCHANGE_SERVE_PATH, body, true);
        // configure() or stop() ran while the request was out: this answer belongs to a load that is gone.
        if (generation !== this.generation) return null;
        const result = parseGameExchangeServeResponse(raw, this.deps.baseUrl);
        if (!result) return null;
        if (!result.enabled) {
            this.refused = true;
            return null;
        }
        return result;
    }

    private async serve(placement: GameExchangePlacement): Promise<void> {
        const generation = this.generation;
        const result = await this.fetchServe(this.serveBody(placement, this.formats, null));
        if (!result) return;
        const now = Date.now();
        if (result.ad) {
            this.slots.set(placement, {
                ad: result.ad,
                preview: false,
                minViewMs: result.minViewMs,
                armMs: result.armMs,
                staleAt: now + result.expiresInMs,
                visibleMs: 0,
                countedUntil: 0,
                impressionSent: false,
            });
        }
        // Replace the tile before its token runs out, so a long session still has a
        // usable one when the end screen opens. A tile that could not be replaced
        // simply goes stale.
        this.refreshTimers.set(placement, setTimeout(() => {
            this.refreshTimers.delete(placement);
            if (generation === this.generation && !this.refused) void this.serve(placement);
        }, result.expiresInMs * GAME_EXCHANGE_REFRESH_AT));
        if (result.ad) {
            for (const listener of [...(this.waiting.get(placement) ?? [])]) listener();
        }
    }

    /**
     * POST a JSON body as text/plain. Resolves to the parsed answer (`read`), or
     * null for anything else: a thrown fetch, a non-2xx status, an unparsable
     * body or no answer within the timeout. Never rejects.
     */
    private post(path: string, body: Record<string, unknown>, read: boolean): Promise<unknown> {
        return new Promise((resolve) => {
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            let settled = false;
            const finish = (value: unknown): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            };
            const timer = setTimeout(() => {
                controller?.abort();
                finish(null);
            }, GAME_EXCHANGE_REQUEST_TIMEOUT_MS);
            const run = async (): Promise<unknown> => {
                const res = await this.deps.fetch(`${this.deps.baseUrl}${path}`, {
                    method: 'POST',
                    // keepalive: an impression sent as the player leaves has to outlive the page.
                    keepalive: true,
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(body),
                    ...(controller ? { signal: controller.signal } : {}),
                });
                return read && res.ok ? await res.json() : null;
            };
            run().then(finish, () => finish(null));
        });
    }
}
