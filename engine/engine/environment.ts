/**
 * Which environment the game runs in, and which backend it talks to.
 *
 * Two answers, kept apart on purpose:
 *
 * - The PAGE environment (`getEnvironment()`): where this page is served from. Resolved
 *   once, in this order: `window.__BM_RUNTIME_CONFIG__.environment` (an embedder that
 *   writes it before the engine loads), a `<meta name="bm:environment">` baked at
 *   publish, then the host:
 *     - `bitmagic.ai` and its subdomains → 'production'
 *     - `bitmagic.cloud` and its subdomains → 'development'
 *     - localhost, loopback, `.local` and private-network addresses → 'local'
 *     - anything else — a Poki page, an iOS or desktop app shell, a creator's own site —
 *       → 'production'. Such a game is published, so it must reach the live services;
 *       it used to read as 'local' and quietly talk to the DEV cluster.
 *
 * - Whether the page is BITMAGIC'S OWN (`isBitmagicHost()`): the portal, the Creator, a play
 *   page. A published game on Poki or a creator's site is production, but it is not Bitmagic's
 *   site: the play-auth bridge cannot reach a first-party session there, and the Game Exchange
 *   must not cross-promote on someone else's page. Those two ask this, not the environment.
 *
 * - The SERVICE environment (`getServiceEnvironment()`): whose game-server the
 *   multiplayer, game-data and runtime-AI calls use. It is the page environment unless
 *   the embedder says otherwise at run time: the `bitmagic dev` shell serves every
 *   project from localhost but knows which environment the project is pinned to, and
 *   sends it in LOAD_GAME (`serviceEnvironment`).
 */

export type Environment = 'production' | 'development' | 'local';

interface RuntimeConfigGlobal {
    __BM_RUNTIME_CONFIG__?: { environment?: unknown };
}

function isEnvironment(value: unknown): value is Environment {
    return value === 'production' || value === 'development' || value === 'local';
}

const PRIVATE_IPV4 = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|127\.\d+\.\d+\.\d+)$/;

/**
 * The environment a page at this location belongs to, from the host alone. Exported for
 * its tests; the engine reads `getEnvironment()`.
 */
export function environmentForLocation(location: { protocol: string; hostname: string }): Environment {
    const { protocol, hostname } = location;
    // An app shell (iOS, desktop) or a file opened from disk is a packaged game.
    if (protocol !== 'http:' && protocol !== 'https:') return 'production';
    if (hostname === 'bitmagic.ai' || hostname.endsWith('.bitmagic.ai')) return 'production';
    if (hostname === 'bitmagic.cloud' || hostname.endsWith('.bitmagic.cloud')) return 'development';
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
        || hostname === '::1' || hostname === '[::1]' || PRIVATE_IPV4.test(hostname)) {
        return 'local';
    }
    return 'production';
}

function detectEnvironment(): Environment {
    if (typeof window === 'undefined') return 'local';
    const injected = (window as RuntimeConfigGlobal).__BM_RUNTIME_CONFIG__?.environment;
    if (isEnvironment(injected)) return injected;
    const meta = typeof document !== 'undefined'
        ? document.querySelector('meta[name="bm:environment"]')?.getAttribute('content')
        : null;
    if (isEnvironment(meta)) return meta;
    return environmentForLocation(window.location);
}

/** Cached: neither the host nor what was baked into the page changes at run time. */
const ENV = detectEnvironment();

let serviceOverride: Environment | null = null;

export function getEnvironment(): Environment {
    return ENV;
}

export function isProduction(): boolean {
    return ENV === 'production';
}

export function isDevelopment(): boolean {
    return ENV === 'development';
}

export function isLocal(): boolean {
    return ENV === 'local';
}

/** Whether this page is served by Bitmagic itself (see the file header). */
export function isBitmagicHost(location: { hostname: string } | null = typeof window === 'undefined' ? null : window.location): boolean {
    if (!location) return false;
    const { hostname } = location;
    return hostname === 'bitmagic.ai' || hostname.endsWith('.bitmagic.ai')
        || hostname === 'bitmagic.cloud' || hostname.endsWith('.bitmagic.cloud');
}

/** Whose game-server the online services use: the embedder's choice, else the page's. */
export function getServiceEnvironment(): Environment {
    return serviceOverride ?? ENV;
}

/**
 * Point the game-server endpoints at another environment's services. Called from LOAD_GAME
 * when the embedder knows better than the host (see the file header). Null restores the
 * page's own. Ignores anything that is not an environment name.
 */
export function setServiceEnvironment(environment: unknown): void {
    serviceOverride = environment === null ? null : isEnvironment(environment) ? environment : serviceOverride;
}
