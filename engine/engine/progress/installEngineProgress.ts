/**
 * Wires the play-progress subsystem to the engine's own identity + toast.
 *
 * Lives here rather than inline in GameEngine so the three collaborators
 * (PlayerIdentity, AchievementToast, PlayProgressClient) are bound together in
 * the module that owns them — and so GameEngine stays under its line budget.
 * The Game Exchange is installed and stopped from here for the same reason.
 */

import { buildAchievementDefMap, getPlayProgress, installPlayProgress } from 'engine/progress/PlaySessionClient.js';
import { installGameExchange, stopGameExchange } from 'engine/exchange/installGameExchange.js';
import { getPlayerIdentity } from 'engine/identity/PlayerIdentity.js';
import type { AchievementToast } from 'engine/progress/AchievementToast.js';

/**
 * Install the subsystem once per engine. `startEngineProgress()` drives
 * `configure()` / `startSession()` per game load from GameEngine.loadGame().
 */
export function installEngineProgress(toast: AchievementToast): void {
    installPlayProgress({
        getPlayerToken: () => getPlayerIdentity().getPlayerToken(),
        // The ENGINE renders unlocks, not the genre HUD: `hud` is optional on
        // GenreGameInterface, so routing through it made unlocks invisible in
        // every genre that does not expose one.
        showUnlock: (entry) => toast.show(entry),
        // Signed-out unlocks go through the portal bridge, which owns the browser
        // session id the anonymous XP lane is keyed on.
        reportGuestUnlock: (achievementId) => getPlayerIdentity().reportGuestUnlock(achievementId),
        // And so do signed-out play sessions: the bridge opens and keeps the
        // anonymous session this bundle cannot open itself.
        sendGuestHeartbeat: (beat) => getPlayerIdentity().sendGuestHeartbeat(beat),
    });
    installGameExchange();
}

/**
 * Play-session lifecycle + achievement definitions for a freshly loaded game.
 * configure() stops any prior session and resets the per-session unlock dedup;
 * startSession() opens the session and its heartbeat loop (guests get the loop
 * too, so signing in mid-session starts crediting; unlock toasts work either way).
 */
export function startEngineProgress(
    gameId: string,
    achievements: Parameters<typeof buildAchievementDefMap>[0],
): void {
    const playProgress = getPlayProgress();
    if (!playProgress) return;
    playProgress.configure(gameId, buildAchievementDefMap(achievements));
    playProgress.startSession();
}

/** Stop what this module installed. Called from GameEngine.dispose(). Idempotent; safe if never started. */
export function stopEngineProgress(): void {
    getPlayProgress()?.stop();
    stopGameExchange();
}
