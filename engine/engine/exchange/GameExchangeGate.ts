/**
 * Decides whether the Game Exchange runs in this page.
 *
 * The decision is a pure function of its inputs so every branch is unit-tested
 * without a browser; `readGameExchangeGateInputs` is the one place that reads
 * the page. Only a published game on a Bitmagic host is `live`. Packaged
 * builds (Poki, iOS), automated runs, the hidden play test and any other host
 * get `off`: no request and no tile. The Creator and `bitmagic dev` get
 * `preview`: a sample tile and no request.
 */

import { isCreatorMode, isPlaytestMode } from 'engine/CreatorMode.js';
import { getEnvironment, isBitmagicHost, type Environment } from 'engine/environment.js';
import type { EventLogOwner } from 'engine/recording/GameEventLog.js';
import type { GameExchangeMode } from 'engine/exchange/GameExchangeTypes.js';

export interface GameExchangeGateInputs {
    /** `worldProfileData.gameExchange`, as loaded. */
    config: { enabled?: unknown } | null | undefined;
    /** The Creator's hidden automatic play test (`?playtest=1`). */
    playtest: boolean;
    /** A `meta[name="bm:distribution"]` tag exists: a packaged build (Poki, iOS). */
    packaged: boolean;
    /** `window.PokiSDK` is defined. */
    pokiSdk: boolean;
    /** `navigator.webdriver === true`: verify, smoke tests, trailer recording. */
    webdriver: boolean;
    /** `?source=creator`: the web Creator and the `bitmagic dev` view. */
    creatorMode: boolean;
    environment: Environment;
    /** The page is Bitmagic's own (portal, play page), not a self-hosted copy or another site. */
    bitmagicHost: boolean;
    /** The page carries a `game-id` or `bm:game-id` meta tag: a published game. */
    hasGameIdMeta: boolean;
}

/** The mode for one game load. Order matters: see the file header. */
export function resolveGameExchangeMode(inputs: GameExchangeGateInputs): GameExchangeMode {
    if (!inputs.config || inputs.config.enabled !== true) return 'off';
    if (inputs.playtest || inputs.packaged || inputs.pokiSdk || inputs.webdriver) return 'off';
    if (inputs.creatorMode) return 'preview';
    // A developer's machine and any host that is not Bitmagic's (a self-hosted copy,
    // another site) may not reach the platform. A self-hosted game resolves to the
    // PRODUCTION environment (engine/environment.ts), so the host is asked directly.
    if (inputs.environment === 'local' || !inputs.bitmagicHost || !inputs.hasGameIdMeta) return 'off';
    return 'live';
}

export interface GameExchangeRecordingInputs {
    /** `getGameEventLog().getOwner()`. */
    eventLogOwner: EventLogOwner | null;
    /** `engine.isRecordingFrames()`. */
    recordingFrames: boolean;
}

/**
 * The mode at the moment a tile would be drawn. A recording can start long
 * after the load (F9), and whatever a screen draws while it runs goes into the
 * creator's trailer, so no tile is drawn then.
 */
export function gameExchangeModeAtRender(mode: GameExchangeMode, recording: GameExchangeRecordingInputs): GameExchangeMode {
    if (recording.eventLogOwner === 'recorder' || recording.recordingFrames) return 'off';
    return mode;
}

/** Read the gate's inputs from the page. Everything is `off` outside a browser. */
export function readGameExchangeGateInputs(config: GameExchangeGateInputs['config']): GameExchangeGateInputs {
    const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined';
    return {
        config,
        playtest: isPlaytestMode,
        packaged: hasDom && document.querySelector('meta[name="bm:distribution"]') !== null,
        // The same test PokiIntegration uses to know it is a Poki build.
        pokiSdk: hasDom && (window as Window & { PokiSDK?: unknown }).PokiSDK != null,
        // Without a navigator nothing can be shown; treat it like an automated run.
        webdriver: typeof navigator === 'undefined' || navigator.webdriver === true,
        creatorMode: isCreatorMode,
        environment: getEnvironment(),
        bitmagicHost: isBitmagicHost(),
        hasGameIdMeta: hasDom && document.querySelector('meta[name="game-id"], meta[name="bm:game-id"]') !== null,
    };
}
