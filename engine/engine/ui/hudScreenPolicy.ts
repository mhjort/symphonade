import type { WorldProfileData } from 'types/game.js';
import { setBitmagicCreditHidden } from 'engine/ui/bitmagicBranding.js';
import { setPauseButtonHidden } from 'engine/ui/pauseButtonPolicy.js';

/**
 * Apply what a game's `worldProfileData.hud` says about the engine's own buttons and screens.
 * `GameEngine.loadGame` calls it on every load, before the genre module is constructed, so a
 * setting never survives into the next game:
 *
 *   - `pauseButton: 'hidden'`: no touch pause button, and its corner is the game's own to use
 *     (see pauseButtonPolicy.ts);
 *   - `bitmagicCredit: 'hidden'`: no "Made with Bitmagic" link on the pause and end screens or in a
 *     game's own `mountBitmagicBrand` calls (see bitmagicBranding.ts). The creator asks for this.
 */
export function applyHudScreenPolicy(hud: WorldProfileData['hud']): void {
    setPauseButtonHidden(hud?.pauseButton === 'hidden');
    setBitmagicCreditHidden(hud?.bitmagicCredit === 'hidden');
}
