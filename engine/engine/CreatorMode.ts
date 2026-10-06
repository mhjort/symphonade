// Centralized detection of whether the game is running inside the Aitopia creator.
// The creator passes ?creatorId=xxx when loading the game iframe.
// Third-party embedders (e.g., Poki) do not set this parameter.

// Guard for non-browser module loading (node-environment unit tests import
// engine modules that transitively reach this file); browsers are unchanged.
const urlParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

/** True when running inside the Aitopia creator iframe */
export const isCreatorMode: boolean = urlParams.get('source') === 'creator';

/** True when running as a standalone game (not in creator) — covers both top-level and third-party iframes like Poki */
export const isStandaloneMode: boolean = !isCreatorMode;

/**
 * True when the embedder asked to skip the StartScreen and enter gameplay as soon
 * as the world is loaded and warmed (?autostart=1 — the portal's instant-play path).
 * Honoured on DESKTOP only: on mobile, gameplay start requires fullscreen, and the
 * fullscreen request needs a user gesture INSIDE this frame (activation cannot be
 * delegated cross-origin), so the StartScreen tap remains the start gesture there.
 */
/**
 * True when the Creator loaded this page as a hidden automatic play test after an
 * AI edit (?playtest=1). The page plays itself with no input, reports what it saw
 * to the parent (engine/playtest/PlaytestProbe), and must not touch anything the
 * user owns — engine/playtest/PlaytestGuard cuts it off from storage, network
 * writes, pointer lock and audio. See game/docs/playtest-mode.md.
 */
export const isPlaytestMode: boolean = isStandaloneMode && urlParams.get('playtest') === '1';

export const isAutostartRequested: boolean = isStandaloneMode && (urlParams.get('autostart') === '1' || isPlaytestMode);

/**
 * True in a published build: every publish config (the web lane, standalone and the CLI's
 * vendored config) defines `__BUNDLED__ = true`. Live-edit serving — the dev servers and the
 * deployed Creator's raw dist — does no define substitution, hence the typeof guard.
 */
export const isPublishedBuild: boolean = typeof __BUNDLED__ !== 'undefined' && __BUNDLED__;

/**
 * Debug hotkeys and frame capture (N, F3, F5–F9, backquote) are creator tools. They work in the
 * Creator and in `bitmagic dev` (both load the game with ?source=creator) and in every unbundled
 * dev build, and never for players in a published build: there N hid every NPC, F5 swallowed the
 * browser's refresh, F7 spawned test enemies and F9 buffered frames until the tab ran out of memory.
 */
export const areDebugHotkeysEnabled: boolean = isCreatorMode || !isPublishedBuild;

/** Creator deployments that may embed the game. Any localhost port passes, for clones on shifted ports. */
const EDITOR_HOSTNAMES: readonly string[] = [
    'alpha.creator.bitmagic.cloud',
    'creator.bitmagic.cloud',
    'backend.creator.bitmagic.cloud',
    'beta.creator.bitmagic.cloud',
    'creator.bitmagic.ai',
];

/** Whether `origin` is a host allowed to drive the game: the Creator, `bitmagic dev`, or this page's own host. */
export function isEditorHostOrigin(origin: string): boolean {
    let url: URL;
    try {
        url = new URL(origin);
    } catch {
        return false;
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    const defaultPort = url.port === '' || url.port === '80' || url.port === '443';
    return defaultPort && (url.hostname === window.location.hostname || EDITOR_HOSTNAMES.includes(url.hostname));
}

/**
 * Whether a `message` event comes from whoever may drive this game: the embedding editor
 * (the parent frame, on an editor-host origin) or a script running in this frame itself
 * (`bitmagic trailer record` posts that way). Any other window that holds a reference to
 * the game frame is ignored, whatever it sends.
 */
export function isFromEditorHost(event: MessageEvent): boolean {
    if (event.source === window) return event.origin === window.location.origin;
    return window.parent !== window && event.source === window.parent && isEditorHostOrigin(event.origin);
}

/**
 * Safely post a message to the creator parent window.
 * No-ops when not in creator mode.
 */
export function safePostMessageToCreator(message: any): void {
    if (isCreatorMode) {
        try {
            window.parent.postMessage(message, '*');
        } catch (error) {
            console.warn('Failed to send message to creator parent:', error);
        }
    }
}
